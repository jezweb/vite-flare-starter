/**
 * Code Execution Tools — Cloudflare Sandbox.
 *
 * Run Python, shell, and JavaScript in isolated Linux containers, plus
 * `generate_document` (markdown → docx/xlsx/pptx via python-docx /
 * openpyxl / python-pptx baked into the project Dockerfile).
 *
 * Wiring (all four pieces required — see wrangler.jsonc):
 *   1. `containers` block (class_name "Sandbox", image "./Dockerfile",
 *      instance_type "lite")
 *   2. Durable Object binding { name: "SANDBOX", class_name: "Sandbox" }
 *   3. Migration tag with new_sqlite_classes: ["Sandbox"]
 *   4. `export { Sandbox } from '@cloudflare/sandbox'` in src/server/index.ts
 *
 * Tools self-omit when the SANDBOX binding is missing (Workers Paid plan
 * required), and when VITE_FEATURE_SANDBOX='false' is set as a worker var.
 *
 * COST NOTE: containers bill active CPU + memory while the sandbox is awake
 * (it sleeps after ~10 min idle). needsApproval stays false because this is
 * pure compute inside the user's own isolated container, but a 50KB code cap
 * guards against pathological payloads.
 *
 * Sandbox identity: one container per (user, conversation) —
 * `user-<userId>-conv-<conversationId>` — so interpreter state (variables,
 * pip installs, files) persists across run_python calls within a chat while
 * the container is warm, and conversations never share a filesystem.
 * Contexts without a conversation (routines, autonomous agents) fall back
 * to a per-user sandbox.
 *
 * @cloudflare/sandbox 0.12 notes:
 *  - keep the Dockerfile base image tag in sync with the npm version
 *    (0.12.3 ↔ docker.io/cloudflare/sandbox:0.12.3-python)
 *  - since 0.12.2 `exec()` calls do NOT share shell state (cwd/env) unless
 *    a Session-Id is passed — use absolute paths in shell commands
 *  - `runCode` interpreter state persists per sandbox independent of that.
 *
 * @see https://developers.cloudflare.com/sandbox/
 */
import { z } from 'zod'
import { Terminal, FileCode, FileDoc } from '@phosphor-icons/react'
import { drizzle } from 'drizzle-orm/d1'
import { getSandbox, type ExecutionResult, type ExecResult } from '@cloudflare/sandbox'
import { isOwnedR2Key } from '@/server/lib/r2-keys'
import { sandboxIdFor } from '@/server/lib/sandbox-id'
import { bytesToBase64, base64ToBytes } from '@/server/lib/base64'
import { files as filesTable } from '@/server/modules/files/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

// ─── Limits ────────────────────────────────────────────────────────────

/** Refuse code / markdown payloads above this (≈50KB). */
const MAX_CODE_CHARS = 50 * 1024
const MAX_STAGE_FILES = 10
const MAX_OUTPUT_PATHS = 10
/** Per-file cap for staged inputs and harvested artifacts (base64 round-trips in memory). */
const MAX_TRANSFER_BYTES = 25 * 1024 * 1024

// ─── Result normalisers ────────────────────────────────────────────────

function normalizeCodeResult(result: ExecutionResult) {
  return {
    stdout: (result.logs?.stdout || []).join(''),
    stderr: (result.logs?.stderr || []).join(''),
    exitCode: result.error ? 1 : 0,
    error: result.error ? `${result.error.name}: ${result.error.message}` : undefined,
  }
}

function normalizeShellResult(result: ExecResult) {
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode ?? 0,
    success: result.success,
  }
}

// ─── Bindings + availability ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSandboxBinding(ctx: AgentContext): any {
  return (ctx.env as unknown as { SANDBOX?: unknown }).SANDBOX
}

function getFilesBucket(ctx: AgentContext): R2Bucket | undefined {
  return (ctx.env as unknown as { FILES?: R2Bucket }).FILES
}

const sandboxAvailable = (ctx: AgentContext) => {
  if ((ctx.env as Record<string, unknown>)['VITE_FEATURE_SANDBOX'] === 'false') return false
  return !!getSandboxBinding(ctx)
}

/** generate_document also needs FILES to harvest the produced file. */
const docgenAvailable = (ctx: AgentContext) => sandboxAvailable(ctx) && !!getFilesBucket(ctx)

/**
 * Sandbox scope: per (user, conversation) so interpreter/file state
 * persists across calls within one chat and never leaks between
 * conversations. Id derivation lives in server/lib/sandbox-id.ts — the
 * SDK caps ids at 63 DNS-shaped chars, so raw `user-…-conv-…` throws.
 */
async function sandboxFor(ctx: AgentContext) {
  const binding = getSandboxBinding(ctx)
  if (!binding) throw new Error('Cloudflare Sandbox not configured — SANDBOX binding missing.')
  return getSandbox(binding, await sandboxIdFor(ctx.userId, ctx.conversationId))
}

// ─── Path + key helpers ────────────────────────────────────────────────

/**
 * Constrain a model-supplied sandbox path to the /workspace subtree.
 * Relative paths resolve under /workspace; absolute paths must already be
 * inside it. Rejects traversal / empty segments / backslashes.
 */
function resolveSandboxPath(p: string | undefined | null): string | null {
  if (!p) return null
  let candidate = p.trim()
  if (!candidate || candidate.includes('\\')) return null
  if (candidate.startsWith('/')) {
    if (!candidate.startsWith('/workspace/')) return null
    candidate = candidate.slice(1)
  }
  if (!candidate.startsWith('workspace/')) candidate = `workspace/${candidate}`
  if (candidate.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return null
  return `/${candidate}`
}

/**
 * Resolve a model-supplied R2 key to one the caller owns. Accepts a full
 * scoped key (`users/<id>/...`) or a path relative to the user's folder
 * (matching what `fs_list` returns). Returns null if the key belongs to
 * another tenant or is malformed.
 */
function resolveOwnedKey(raw: string, userId: string): string | null {
  const key = raw.trim()
  if (!key) return null
  if (/^(users|generated|files)\//.test(key)) return isOwnedR2Key(key, userId) ? key : null
  const scoped = `users/${userId}/${key.replace(/^\/+/, '')}`
  return isOwnedR2Key(scoped, userId) ? scoped : null
}

const ARTIFACT_MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  zip: 'application/zip',
}

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return ARTIFACT_MIME[ext] || 'application/octet-stream'
}

/** Best-effort D1 registration so artifacts show up on the Files page. */
async function registerFileRow(
  ctx: AgentContext,
  key: string,
  name: string,
  mimeType: string,
  size: number
): Promise<void> {
  try {
    const db = (ctx.env as unknown as { DB?: D1Database }).DB
    if (!db) return
    await drizzle(db).insert(filesTable).values({ userId: ctx.userId, name, key, mimeType, size })
  } catch {
    /* registration is a nicety — never fail the tool call over it */
  }
}

type Artifact = { name: string; r2Key: string; size: number }

/**
 * Pull one file out of the sandbox (base64 over the default HTTP transport)
 * and persist it to FILES under the caller's key prefix.
 */
async function harvestArtifact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sandbox: any,
  ctx: AgentContext,
  sandboxPath: string
): Promise<Artifact | { harvestError: string }> {
  const bucket = getFilesBucket(ctx)
  if (!bucket) return { harvestError: 'FILES R2 bucket not bound — cannot save artifacts.' }
  let content: string
  try {
    const file = await sandbox.readFile(sandboxPath, { encoding: 'base64' })
    content = file?.content
    if (typeof content !== 'string' || content.length === 0) throw new Error('empty read')
  } catch {
    return { harvestError: `Output file not found in sandbox: ${sandboxPath}` }
  }
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(content)
  } catch {
    return { harvestError: `Could not decode sandbox file: ${sandboxPath}` }
  }
  if (bytes.length > MAX_TRANSFER_BYTES) {
    return {
      harvestError: `Output ${sandboxPath} is too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB > 25MB).`,
    }
  }
  const rawName = sandboxPath.split('/').pop() || 'artifact'
  const name = rawName.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const mime = mimeFor(name)
  const r2Key = `users/${ctx.userId}/sandbox/${Date.now()}-${name}`
  await bucket.put(r2Key, bytes, { httpMetadata: { contentType: mime } })
  await registerFileRow(ctx, r2Key, name, mime, bytes.length)
  return { name, r2Key, size: bytes.length }
}

// ─── run_python ────────────────────────────────────────────────────────

const ArtifactSchema = z.object({
  name: z.string(),
  r2Key: z.string(),
  size: z.number(),
})

const RunPythonOutput = z.union([
  z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    error: z.string().optional(),
    /** Input files staged from R2 before the run. */
    staged: z.array(z.object({ r2Key: z.string(), path: z.string() })).optional(),
    /** Output files harvested to the user's FILES storage after the run. */
    artifacts: z.array(ArtifactSchema).optional(),
    warnings: z.array(z.string()).optional(),
  }),
  z.object({ error: z.string() }),
])

type RunPythonInput = {
  code: string
  timeout?: number
  files?: { r2Key: string; path?: string }[]
  outputs?: string[]
}

export const runPythonDefinition: ToolDefinition<RunPythonInput, z.infer<typeof RunPythonOutput>> =
  {
    name: 'run_python',
    description:
      'Execute Python code in an isolated sandbox container. Common packages preinstalled (numpy, pandas, matplotlib) — pip install others. Interpreter state persists across calls in this conversation while the sandbox is warm. Optionally stage input files from your file storage (`files`) and harvest output files back into it (`outputs`) — harvested files are returned as artifacts. Use for data analysis, calculations, file transforms, or chart generation.',
    inputSchema: z.object({
      code: z.string().describe('Python code to execute (max 50KB)'),
      timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
      files: z
        .array(
          z.object({
            r2Key: z
              .string()
              .describe(
                'Key or path of one of YOUR stored files (as returned by fs_list or file uploads), e.g. "reports/data.csv" or "users/<userId>/data.csv"'
              ),
            path: z
              .string()
              .optional()
              .describe('Sandbox destination path (default: /workspace/inputs/<filename>)'),
          })
        )
        .optional()
        .describe('Files to stage from your file storage into the sandbox before the code runs'),
      outputs: z
        .array(z.string())
        .optional()
        .describe(
          'Sandbox paths (under /workspace) to save back to your file storage after the run, e.g. ["/workspace/chart.png"]. Returned as artifacts.'
        ),
    }),
    outputSchema: RunPythonOutput,
    isAvailable: sandboxAvailable,
    execute: async ({ code, timeout = 30, files = [], outputs = [] }, ctx) => {
      try {
        if (code.length > MAX_CODE_CHARS) {
          return {
            error: `Code too large (${code.length} chars > 50KB limit). Split the work into smaller runs, or stage data via the files parameter instead of inlining it.`,
          }
        }
        if (files.length > MAX_STAGE_FILES) {
          return { error: `Too many input files (${files.length} > ${MAX_STAGE_FILES}).` }
        }
        if (outputs.length > MAX_OUTPUT_PATHS) {
          return { error: `Too many output paths (${outputs.length} > ${MAX_OUTPUT_PATHS}).` }
        }

        // Validate every key/path BEFORE touching the sandbox or R2.
        const stagePlan: { r2Key: string; path: string }[] = []
        for (const f of files) {
          const key = resolveOwnedKey(f.r2Key, ctx.userId)
          if (!key) {
            return {
              error: `Not allowed to read "${f.r2Key}" — input files must live under your own storage prefix.`,
            }
          }
          const target = resolveSandboxPath(
            f.path ?? `inputs/${key.split('/').pop() || 'input.dat'}`
          )
          if (!target) {
            return { error: `Invalid sandbox path "${f.path}" — must resolve under /workspace.` }
          }
          stagePlan.push({ r2Key: key, path: target })
        }
        const harvestPlan: string[] = []
        for (const o of outputs) {
          const p = resolveSandboxPath(o)
          if (!p) return { error: `Invalid output path "${o}" — must resolve under /workspace.` }
          harvestPlan.push(p)
        }

        const sandbox = await sandboxFor(ctx)

        // Stage inputs from R2.
        const staged: { r2Key: string; path: string }[] = []
        if (stagePlan.length > 0) {
          const bucket = getFilesBucket(ctx)
          if (!bucket) return { error: 'FILES R2 bucket not bound — cannot stage input files.' }
          for (const { r2Key, path } of stagePlan) {
            const obj = await bucket.get(r2Key)
            if (!obj) return { error: `Stored file not found: ${r2Key}` }
            if (obj.size > MAX_TRANSFER_BYTES) {
              return {
                error: `Input ${r2Key} is too large (${(obj.size / 1024 / 1024).toFixed(1)}MB > 25MB).`,
              }
            }
            const bytes = new Uint8Array(await obj.arrayBuffer())
            const dir = path.slice(0, path.lastIndexOf('/'))
            if (dir && dir !== '/workspace') await sandbox.mkdir(dir, { recursive: true })
            await sandbox.writeFile(path, bytesToBase64(bytes), { encoding: 'base64' })
            staged.push({ r2Key, path })
          }
        }

        const result = await sandbox.runCode(code, { language: 'python', timeout: timeout * 1000 })
        const base = normalizeCodeResult(result)

        // Harvest outputs back to FILES.
        const artifacts: Artifact[] = []
        const warnings: string[] = []
        for (const path of harvestPlan) {
          const h = await harvestArtifact(sandbox, ctx, path)
          if ('harvestError' in h) warnings.push(h.harvestError)
          else artifacts.push(h)
        }

        return {
          ...base,
          ...(staged.length > 0 ? { staged } : {}),
          ...(artifacts.length > 0 ? { artifacts } : {}),
          ...(warnings.length > 0 ? { warnings } : {}),
        }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    },
    render: { icon: FileCode, displayName: 'Run Python' },
  }

// ─── run_shell ─────────────────────────────────────────────────────────

const ShellExecOutput = z.union([
  z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    success: z.boolean(),
  }),
  z.object({ error: z.string() }),
])

export const runShellDefinition: ToolDefinition<
  { command: string; cwd?: string; timeout?: number },
  z.infer<typeof ShellExecOutput>
> = {
  name: 'run_shell',
  description:
    'Run a shell command in an isolated sandbox container. Use for file operations, package management, or any shell task. Runs inside an isolated Linux container, NOT on the host. Shell state (cwd, exports) does NOT persist between calls — use absolute paths.',
  inputSchema: z.object({
    command: z.string().describe('Shell command to run (e.g. "ls -la", "pip install requests")'),
    cwd: z.string().optional().describe('Working directory (default: /workspace)'),
    timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
  }),
  outputSchema: ShellExecOutput,
  isAvailable: sandboxAvailable,
  execute: async ({ command, cwd, timeout = 30 }, ctx) => {
    try {
      if (command.length > MAX_CODE_CHARS) {
        return { error: `Command too large (${command.length} chars > 50KB limit).` }
      }
      const sandbox = await sandboxFor(ctx)
      const result = await sandbox.exec(command, { cwd, timeout: timeout * 1000 })
      return normalizeShellResult(result)
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Terminal, displayName: 'Run Shell' },
}

// ─── run_js ────────────────────────────────────────────────────────────

const CodeExecOutput = z.union([
  z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    error: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export const runJsDefinition: ToolDefinition<
  { code: string; timeout?: number },
  z.infer<typeof CodeExecOutput>
> = {
  name: 'run_js',
  description:
    'Execute JavaScript/TypeScript code in an isolated sandbox (Node.js runtime). Use for scripting, npm packages, or quick data transformation.',
  inputSchema: z.object({
    code: z.string().describe('JavaScript or TypeScript code to execute (max 50KB)'),
    timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
  }),
  outputSchema: CodeExecOutput,
  isAvailable: sandboxAvailable,
  execute: async ({ code, timeout = 30 }, ctx) => {
    try {
      if (code.length > MAX_CODE_CHARS) {
        return { error: `Code too large (${code.length} chars > 50KB limit).` }
      }
      const sandbox = await sandboxFor(ctx)
      const result = await sandbox.runCode(code, {
        language: 'javascript',
        timeout: timeout * 1000,
      })
      return normalizeCodeResult(result)
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: FileCode, displayName: 'Run JavaScript' },
}

// ─── generate_document ─────────────────────────────────────────────────

/**
 * Markdown → docx/xlsx/pptx renderer, executed in-sandbox with python-docx /
 * openpyxl / python-pptx (baked into the project Dockerfile). Deliberately
 * pragmatic markdown coverage: headings, paragraphs, bullet/numbered lists,
 * tables, code blocks, and **bold** / *italic* / `code` inline runs.
 *
 * Backticks are expressed as \x60 escapes so this can live in a String.raw
 * template without fighting TS escaping.
 */
const DOCGEN_SCRIPT = String.raw`"""Markdown -> docx/xlsx/pptx. Written by generate_document each call."""
import os
import re
import sys

INLINE = re.compile(r'(\*\*.+?\*\*|\*.+?\*|\x60.+?\x60)')


def strip_inline(text):
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    return re.sub('\x60(.+?)\x60', r'\1', text)


def parse_blocks(md):
    """Yield (kind, payload): heading/para/bullets/numbers/code/table."""
    lines = md.replace('\r\n', '\n').split('\n')
    i, n = 0, len(lines)
    fence = '\x60\x60\x60'
    while i < n:
        line = lines[i]
        if line.strip().startswith(fence):
            j = i + 1
            buf = []
            while j < n and not lines[j].strip().startswith(fence):
                buf.append(lines[j])
                j += 1
            yield 'code', '\n'.join(buf)
            i = j + 1
            continue
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            yield 'heading', (len(m.group(1)), m.group(2).strip())
            i += 1
            continue
        if line.strip().startswith('|'):
            rows = []
            while i < n and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-{2,}:?', c) for c in cells):
                    rows.append(cells)
                i += 1
            if rows:
                yield 'table', rows
            continue
        m = re.match(r'^\s*[-*+]\s+(.*)$', line)
        if m:
            items = []
            while i < n:
                m2 = re.match(r'^\s*[-*+]\s+(.*)$', lines[i])
                if not m2:
                    break
                items.append(m2.group(1))
                i += 1
            yield 'bullets', items
            continue
        m = re.match(r'^\s*\d+[.)]\s+(.*)$', line)
        if m:
            items = []
            while i < n:
                m2 = re.match(r'^\s*\d+[.)]\s+(.*)$', lines[i])
                if not m2:
                    break
                items.append(m2.group(1))
                i += 1
            yield 'numbers', items
            continue
        if line.strip() == '' or line.strip() == '---':
            i += 1
            continue
        buf = [line.strip()]
        i += 1
        stop = re.compile(r'^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||---$)')
        while i < n and lines[i].strip() and not stop.match(lines[i].strip()) \
                and not lines[i].strip().startswith(fence):
            buf.append(lines[i].strip())
            i += 1
        yield 'para', ' '.join(buf)


def add_runs(paragraph, text):
    for token in INLINE.split(text):
        if not token:
            continue
        if token.startswith('**') and token.endswith('**') and len(token) > 4:
            run = paragraph.add_run(token[2:-2])
            run.bold = True
        elif token.startswith('\x60') and token.endswith('\x60') and len(token) > 2:
            run = paragraph.add_run(token[1:-1])
            run.font.name = 'Consolas'
        elif token.startswith('*') and token.endswith('*') and len(token) > 2:
            run = paragraph.add_run(token[1:-1])
            run.italic = True
        else:
            paragraph.add_run(token)


def build_docx(md, out):
    from docx import Document
    doc = Document()
    for kind, payload in parse_blocks(md):
        if kind == 'heading':
            level, text = payload
            doc.add_heading(strip_inline(text), level=min(level, 4))
        elif kind == 'para':
            add_runs(doc.add_paragraph(), payload)
        elif kind == 'bullets':
            for item in payload:
                add_runs(doc.add_paragraph(style='List Bullet'), item)
        elif kind == 'numbers':
            for item in payload:
                add_runs(doc.add_paragraph(style='List Number'), item)
        elif kind == 'code':
            run = doc.add_paragraph().add_run(payload)
            run.font.name = 'Consolas'
        elif kind == 'table' and payload:
            cols = max(len(r) for r in payload)
            table = doc.add_table(rows=len(payload), cols=cols)
            table.style = 'Table Grid'
            for ri, row in enumerate(payload):
                for ci in range(cols):
                    table.cell(ri, ci).text = strip_inline(row[ci]) if ci < len(row) else ''
            for cell in table.rows[0].cells:
                for p in cell.paragraphs:
                    for run in p.runs:
                        run.bold = True
    doc.save(out)


def sheet_name(base, used):
    name = re.sub(r'[\\/*?:\[\]]', ' ', base).strip()[:31] or 'Sheet'
    candidate, k = name, 2
    while candidate in used:
        suffix = ' %d' % k
        candidate = name[:31 - len(suffix)] + suffix
        k += 1
    used.add(candidate)
    return candidate


def cell_value(raw):
    if re.fullmatch(r'-?\d+', raw):
        return int(raw)
    if re.fullmatch(r'-?\d+\.\d+', raw):
        return float(raw)
    return raw


def build_xlsx(md, out):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    wb.remove(wb.active)
    used = set()
    heading = 'Sheet'
    notes = []
    for kind, payload in parse_blocks(md):
        if kind == 'heading':
            heading = strip_inline(payload[1])
        elif kind == 'table' and payload:
            ws = wb.create_sheet(sheet_name(heading, used))
            for ri, row in enumerate(payload, start=1):
                for ci, cell in enumerate(row, start=1):
                    c = ws.cell(row=ri, column=ci, value=cell_value(strip_inline(cell)))
                    if ri == 1:
                        c.font = Font(bold=True)
            for col in ws.columns:
                width = max((len(str(c.value)) for c in col if c.value is not None), default=0)
                ws.column_dimensions[col[0].column_letter].width = min(max(width + 2, 10), 60)
        elif kind == 'para':
            notes.append(strip_inline(payload))
        elif kind in ('bullets', 'numbers'):
            notes.extend(strip_inline(item) for item in payload)
    if not used:
        ws = wb.create_sheet(sheet_name(heading, used))
        for ri, line in enumerate(notes or ['(empty document)'], start=1):
            ws.cell(row=ri, column=1, value=line)
    elif notes:
        ws = wb.create_sheet(sheet_name('Notes', used))
        for ri, line in enumerate(notes, start=1):
            ws.cell(row=ri, column=1, value=line)
    wb.save(out)


def build_pptx(md, out):
    from pptx import Presentation
    from pptx.util import Pt
    prs = Presentation()
    slides = []
    current = None
    for kind, payload in parse_blocks(md):
        if kind == 'heading' and payload[0] <= 2:
            current = (strip_inline(payload[1]), [])
            slides.append(current)
            continue
        if current is None:
            current = ('Untitled', [])
            slides.append(current)
        if kind == 'heading':
            current[1].append((0, strip_inline(payload[1])))
        elif kind == 'para':
            current[1].append((0, strip_inline(payload)))
        elif kind in ('bullets', 'numbers'):
            for item in payload:
                current[1].append((1, strip_inline(item)))
        elif kind == 'code':
            for line in payload.split('\n'):
                current[1].append((1, line))
        elif kind == 'table':
            for row in payload:
                current[1].append((1, ' | '.join(strip_inline(c) for c in row)))
    if not slides:
        slides = [('Document', [])]
    for title, items in slides:
        slide = prs.slides.add_slide(prs.slide_layouts[1 if items else 0])
        if slide.shapes.title is not None:
            slide.shapes.title.text = title
        if items and len(slide.placeholders) > 1:
            body = slide.placeholders[1].text_frame
            first = True
            for level, text in items:
                p = body.paragraphs[0] if first else body.add_paragraph()
                first = False
                p.text = text
                p.level = min(level, 4)
                for run in p.runs:
                    run.font.size = Pt(18)
    prs.save(out)


def main():
    fmt, inp, out = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(inp, encoding='utf-8') as f:
        md = f.read()
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    if fmt == 'docx':
        build_docx(md, out)
    elif fmt == 'xlsx':
        build_xlsx(md, out)
    elif fmt == 'pptx':
        build_pptx(md, out)
    else:
        raise SystemExit('unknown format: %s' % fmt)
    print('wrote %s (%d bytes)' % (out, os.path.getsize(out)))


if __name__ == '__main__':
    main()
`

const DOCUMENT_FORMATS = ['docx', 'xlsx', 'pptx'] as const
type DocumentFormat = (typeof DOCUMENT_FORMATS)[number]

const GenerateDocumentOutput = z.union([
  z.object({
    format: z.enum(DOCUMENT_FORMATS),
    artifacts: z.array(ArtifactSchema),
    summary: z.string(),
  }),
  z.object({ error: z.string(), stderr: z.string().optional() }),
])

export const generateDocumentDefinition: ToolDefinition<
  { markdown: string; format: DocumentFormat; filename?: string },
  z.infer<typeof GenerateDocumentOutput>
> = {
  name: 'generate_document',
  description:
    'Generate a Word (docx), Excel (xlsx) or PowerPoint (pptx) file from markdown content and save it to the user\'s Files storage. Renders headings, paragraphs, bullet/numbered lists, tables and code blocks. For xlsx, each markdown table becomes a worksheet named from the preceding heading; for pptx, each H1/H2 starts a new slide. Use when the user asks for a downloadable document, spreadsheet, report, or slide deck.',
  inputSchema: z.object({
    markdown: z.string().describe('Document content as markdown (max 50KB)'),
    format: z.enum(DOCUMENT_FORMATS).describe('Output format: docx, xlsx, or pptx'),
    filename: z
      .string()
      .optional()
      .describe('Output filename without extension (default: "document")'),
  }),
  outputSchema: GenerateDocumentOutput,
  isAvailable: docgenAvailable,
  execute: async ({ markdown, format, filename }, ctx) => {
    try {
      if (markdown.length > MAX_CODE_CHARS) {
        return {
          error: `Markdown too large (${markdown.length} chars > 50KB limit). Split into multiple documents.`,
        }
      }
      const safeName =
        (filename || 'document')
          .replace(/\.(docx|xlsx|pptx)$/i, '')
          .replace(/[^a-zA-Z0-9._-]+/g, '-')
          .replace(/^[-.]+|[-.]+$/g, '')
          .slice(0, 80) || 'document'
      const outPath = `/workspace/.docgen/out/${safeName}.${format}`

      const sandbox = await sandboxFor(ctx)
      await sandbox.mkdir('/workspace/.docgen/out', { recursive: true })
      await sandbox.writeFile('/workspace/.docgen/input.md', markdown)
      await sandbox.writeFile('/workspace/.docgen/generate.py', DOCGEN_SCRIPT)
      const result = await sandbox.exec(
        `python3 /workspace/.docgen/generate.py ${format} /workspace/.docgen/input.md ${outPath}`,
        { timeout: 120_000 }
      )
      if ((result.exitCode ?? 0) !== 0) {
        return {
          error: `Document generation failed (exit ${result.exitCode}). Are python-docx/openpyxl/python-pptx baked into the Dockerfile?`,
          stderr: (result.stderr || '').slice(-2000),
        }
      }
      const artifact = await harvestArtifact(sandbox, ctx, outPath)
      if ('harvestError' in artifact) return { error: artifact.harvestError }
      return {
        format,
        artifacts: [artifact],
        summary: `Generated ${artifact.name} (${(artifact.size / 1024).toFixed(1)} KB) — saved to your Files as ${artifact.r2Key}.`,
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: {
    icon: FileDoc,
    displayName: 'Generate Document',
    summary: (output) =>
      'artifacts' in output && output.artifacts[0]
        ? `${output.artifacts[0].name} (${(output.artifacts[0].size / 1024).toFixed(1)} KB)`
        : 'error' in output
          ? 'failed'
          : null,
  },
}

export const codeDefinitions = [
  runPythonDefinition,
  runShellDefinition,
  runJsDefinition,
  generateDocumentDefinition,
] as ToolDefinition<unknown, unknown>[]
