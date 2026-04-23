/**
 * File Tools — R2 as an agent-scoped filesystem.
 *
 * All paths are scoped to the user's folder (users/<userId>/). Agents
 * can't read or write outside their scope. Requires the FILES R2 bucket.
 */
import { z } from 'zod'
import { FolderTree, FileCheck, FilePlus, FileX } from 'lucide-react'
import { drizzle } from 'drizzle-orm/d1'
import { eq, inArray, and } from 'drizzle-orm'
import { files as filesTable } from '@/server/modules/files/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

function getFiles(ctx: AgentContext): R2Bucket | undefined {
  return (ctx.env as unknown as { FILES?: R2Bucket }).FILES
}

const filesAvailable = (ctx: AgentContext) => !!getFiles(ctx)

function scopedPath(userId: string, path: string): string {
  const clean = path.replace(/^\/+/, '').replace(/\.\.\//g, '')
  return `users/${userId}/${clean}`
}

function inferContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    csv: 'text/csv',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    ts: 'text/typescript',
    py: 'text/x-python',
    sh: 'text/x-shellscript',
  }
  return map[ext || ''] || 'text/plain'
}

const FsListOutput = z.union([
  z.object({
    path: z.string(),
    files: z.array(
      z.object({
        path: z.string(),
        /** Friendly filename (from D1 metadata) — prefer over path when rendering. */
        name: z.string().optional(),
        size: z.number(),
        modified: z.string(),
      }),
    ),
    count: z.number(),
    truncated: z.boolean(),
  }),
  z.object({ path: z.string(), error: z.string() }),
])

export const fsListDefinition: ToolDefinition<{ path?: string }, z.infer<typeof FsListOutput>> = {
  name: 'fs_list',
  description: 'List files at a given path in your filesystem. Use to discover what files exist before reading.',
  inputSchema: z.object({
    path: z.string().optional().describe('Folder path (default: root). Example: "reports/" or "" for root'),
  }),
  outputSchema: FsListOutput,
  isAvailable: filesAvailable,
  execute: async ({ path = '' }, ctx) => {
    const bucket = getFiles(ctx)!
    try {
      const prefix = scopedPath(ctx.userId, path.endsWith('/') || path === '' ? path : `${path}/`)
      const list = await bucket.list({ prefix, limit: 100 })

      // Look up friendly names from the files D1 table so the agent can
      // reference "invoice.pdf" instead of the UUID-mangled R2 key. Keys
      // that aren't in the D1 table (e.g. raw agent writes via fs_write)
      // fall back to the bare path.
      const r2Keys = list.objects.map((o) => o.key)
      const metaRows =
        r2Keys.length > 0
          ? await drizzle((ctx.env as unknown as { DB: D1Database }).DB)
              .select({ key: filesTable.key, name: filesTable.name })
              .from(filesTable)
              .where(
                and(eq(filesTable.userId, ctx.userId), inArray(filesTable.key, r2Keys)),
              )
              .catch(() => [])
          : []
      const nameByKey = new Map(metaRows.map((r) => [r.key, r.name]))

      const files = list.objects.map((obj) => ({
        path: obj.key.replace(`users/${ctx.userId}/`, ''),
        name: nameByKey.get(obj.key),
        size: obj.size,
        modified: obj.uploaded.toISOString(),
      }))
      return { path, files, count: files.length, truncated: list.truncated }
    } catch (error) {
      return { path, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: FolderTree, displayName: 'List Files' },
}

const FsReadOutput = z.union([
  z.object({
    path: z.string(),
    content: z.string(),
    contentType: z.string(),
    size: z.number(),
  }),
  z.object({
    path: z.string(),
    error: z.string(),
    contentType: z.string().optional(),
    size: z.number().optional(),
  }),
])

export const fsReadDefinition: ToolDefinition<{ path: string }, z.infer<typeof FsReadOutput>> = {
  name: 'fs_read',
  description:
    'Read the contents of a file. Returns text content for text files, or a message for binary files. Max 1MB.',
  inputSchema: z.object({
    path: z.string().describe('File path to read (e.g. "report.md", "data/users.json")'),
  }),
  outputSchema: FsReadOutput,
  isAvailable: filesAvailable,
  execute: async ({ path }, ctx) => {
    const bucket = getFiles(ctx)!
    try {
      const key = scopedPath(ctx.userId, path)
      const obj = await bucket.get(key)
      if (!obj) return { path, error: 'File not found' }

      if (obj.size > 1024 * 1024) {
        return { path, error: `File too large (${(obj.size / 1024 / 1024).toFixed(1)}MB). Max 1MB.`, size: obj.size }
      }

      const contentType = obj.httpMetadata?.contentType || 'text/plain'
      const isText =
        contentType.startsWith('text/') ||
        contentType.includes('json') ||
        contentType.includes('xml') ||
        path.match(/\.(md|txt|json|yaml|yml|csv|ts|tsx|js|jsx|py|sh|html|css)$/i)

      if (isText) {
        const content = await obj.text()
        return { path, content, contentType, size: obj.size }
      }

      return {
        path,
        error: `Binary file (${contentType}). Use fs_read_binary if you need raw bytes.`,
        contentType,
        size: obj.size,
      }
    } catch (error) {
      return { path, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: FileCheck, displayName: 'Read File' },
}

const FsWriteOutput = z.union([
  z.object({
    path: z.string(),
    size: z.number(),
    contentType: z.string(),
    action: z.literal('written'),
  }),
  z.object({ path: z.string(), error: z.string() }),
])

export const fsWriteDefinition: ToolDefinition<
  { path: string; content: string; contentType?: string },
  z.infer<typeof FsWriteOutput>
> = {
  name: 'fs_write',
  description:
    "Write a text file. Creates the file if it doesn't exist, overwrites if it does. Use for saving reports, notes, code, or any text content.",
  inputSchema: z.object({
    path: z.string().describe('File path (e.g. "report.md", "notes/2026-04-14.md")'),
    content: z.string().describe('Text content to write'),
    contentType: z.string().optional().describe('MIME type (default: text/plain for .txt, text/markdown for .md, etc.)'),
  }),
  outputSchema: FsWriteOutput,
  isAvailable: filesAvailable,
  execute: async ({ path, content, contentType }, ctx) => {
    const bucket = getFiles(ctx)!
    try {
      const key = scopedPath(ctx.userId, path)
      const mime = contentType || inferContentType(path)
      await bucket.put(key, content, { httpMetadata: { contentType: mime } })
      return { path, size: content.length, contentType: mime, action: 'written' }
    } catch (error) {
      return { path, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: FilePlus, displayName: 'Write File' },
}

const FsDeleteOutput = z.union([
  z.object({ path: z.string(), deleted: z.literal(true) }),
  z.object({ path: z.string(), error: z.string() }),
])

export const fsDeleteDefinition: ToolDefinition<{ path: string }, z.infer<typeof FsDeleteOutput>> = {
  name: 'fs_delete',
  description: 'Delete a file from the filesystem. Cannot be undone. Requires user approval.',
  inputSchema: z.object({
    path: z.string().describe('File path to delete'),
  }),
  outputSchema: FsDeleteOutput,
  needsApproval: true,
  isAvailable: filesAvailable,
  execute: async ({ path }, ctx) => {
    const bucket = getFiles(ctx)!
    try {
      const key = scopedPath(ctx.userId, path)
      await bucket.delete(key)
      return { path, deleted: true }
    } catch (error) {
      return { path, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: FileX, displayName: 'Delete File' },
}

export const fileDefinitions = [
  fsListDefinition,
  fsReadDefinition,
  fsWriteDefinition,
  fsDeleteDefinition,
] as ToolDefinition<unknown, unknown>[]
