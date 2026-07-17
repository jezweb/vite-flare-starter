/**
 * Artifact Tools — AI-generated documents and visuals (HTML, SVG,
 * Mermaid, Markdown)
 *
 * The tool result streams into the transcript (`_artifact: true` marker
 * → rendered inline AND in the WorkspacePanel), and every create/edit
 * is ALSO indexed into the artifacts tables (see
 * `server/modules/artifacts/`) so artifacts get durable identity,
 * a version chain, and publishability via share tokens. Persistence is
 * best-effort — a D1 hiccup degrades to an unpersisted artifact, never
 * a failed tool call.
 */
import { z } from 'zod'
import { Sparkle, MagicWand } from '@phosphor-icons/react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'
import { createArtifact, addArtifactVersion, type ArtifactEnv } from '@/server/modules/artifacts/store'

const ArtifactType = z.enum(['html', 'svg', 'mermaid', 'markdown'])

const CreateArtifactInput = z.object({
  type: ArtifactType.describe('Artifact type'),
  title: z.string().max(300).describe('Short display title'),
  code: z
    .string()
    .max(300_000)
    .describe('The complete HTML/SVG/Mermaid/Markdown content. No outer markdown fences. Self-contained.'),
  height: z.number().optional().describe('Display height in pixels (default: 400)'),
})

const EditArtifactInput = z.object({
  artifactId: z.string().describe('The artifact ID from a previous create_artifact result'),
  type: ArtifactType.describe('Artifact type (same as original — a chain keeps its original type)'),
  title: z.string().max(300).describe('Updated title'),
  code: z
    .string()
    .max(300_000)
    .describe('The COMPLETE updated content (not a diff — the full artifact)'),
  height: z.number().optional().describe('Display height in pixels'),
})

function cleanFences(code: string): string {
  return code
    .trim()
    .replace(/^```(?:html|svg|mermaid|markdown|md)?\n?/, '')
    .replace(/\n?```$/, '')
}

const persistEnv = (ctx: AgentContext): ArtifactEnv => ctx.env as unknown as ArtifactEnv

const CreateArtifactOutput = z.object({
  _artifact: z.literal(true),
  artifactId: z.string().optional(),
  version: z.number().optional(),
  type: ArtifactType,
  title: z.string(),
  code: z.string(),
  height: z.number(),
  /** Model-facing steering — keeps revisions on the same version chain. */
  next: z.string().optional(),
})

export const createArtifactDefinition: ToolDefinition<
  z.infer<typeof CreateArtifactInput>,
  z.infer<typeof CreateArtifactOutput>
> = {
  name: 'create_artifact',
  description: `Create an artifact — a document or visual shown in the workspace panel beside the chat, with versions the user can step through. Use for dashboards, charts, diagrams, interactive calculators, reports, drafted documents, or any content the user will keep, iterate on, or share.

Types:
- markdown: written documents — reports, plans, drafts, briefs, specs. Preferred for prose the user will edit or reuse.
- html: Full interactive pages with CSS + JS. For charts, use Chart.js via CDN: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>. Dark theme (#0f1117 bg, light text). Include all CSS inline.
- svg: Vector graphics. Self-contained SVG with viewBox.
- mermaid: Diagrams (flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap).

CDN libraries available in HTML artifacts: Chart.js, Marked.js, Mermaid, D3.js, Leaflet, Three.js.

The result includes an artifactId — reuse it with edit_artifact to produce the next version instead of a separate copy.

IMPORTANT: Output the COMPLETE content as the 'code' parameter — no outer markdown fences, no explanation. Make it polished.`,
  inputSchema: CreateArtifactInput,
  outputSchema: CreateArtifactOutput,
  execute: async ({ type, title, code, height = 400 }, ctx) => {
    const cleaned = cleanFences(code)
    let persisted: { artifactId: string; version: number } | null = null
    try {
      persisted = await createArtifact(persistEnv(ctx), {
        userId: ctx.userId,
        conversationId: ctx.conversationId ?? null,
        type,
        title,
        code: cleaned,
        height,
      })
    } catch (err) {
      console.warn(JSON.stringify({ event: 'artifact_persist_failed', error: String(err) }))
    }
    return {
      _artifact: true,
      ...(persisted
        ? {
            artifactId: persisted.artifactId,
            version: persisted.version,
            // Output-embedded steering: models reliably act on the tool
            // result they just read, far more than on tool descriptions
            // discovered earlier — without this, revisions tend to call
            // create_artifact again and fork a duplicate instead of v2.
            next: `To revise this artifact, call edit_artifact with artifactId "${persisted.artifactId}" — do NOT call create_artifact again for the same document.`,
          }
        : {}),
      type,
      title,
      code: cleaned,
      height,
    }
  },
  render: {
    icon: Sparkle,
    displayName: 'Create Artifact',
    summary: (output) => {
      const o = output as { type?: string; title?: string }
      return o?.title ? `${o.title} (${o.type})` : (o?.type ?? null)
    },
  },
}

const EditArtifactOutput = z.object({
  _artifact: z.literal(true),
  artifactId: z.string(),
  version: z.number().optional(),
  /** True when the id was unknown/out-of-scope and a fresh artifact was created instead. */
  forked: z.boolean().optional(),
  type: ArtifactType,
  title: z.string(),
  code: z.string(),
  height: z.number(),
})

export const editArtifactDefinition: ToolDefinition<
  z.infer<typeof EditArtifactInput>,
  z.infer<typeof EditArtifactOutput>
> = {
  name: 'edit_artifact',
  description:
    'Produce the next version of an existing artifact. Provide the artifact ID from the earlier create_artifact result and the COMPLETE updated content. The workspace panel groups versions so the user can step between them.',
  inputSchema: EditArtifactInput,
  outputSchema: EditArtifactOutput,
  execute: async ({ artifactId, type, title, code, height = 400 }, ctx) => {
    const cleaned = cleanFences(code)
    let persisted: { artifactId: string; version: number; forked?: boolean } | null = null
    try {
      persisted = await addArtifactVersion(persistEnv(ctx), {
        artifactId,
        userId: ctx.userId,
        conversationId: ctx.conversationId ?? null,
        type,
        title,
        code: cleaned,
        height,
      })
    } catch (err) {
      console.warn(JSON.stringify({ event: 'artifact_persist_failed', error: String(err) }))
    }
    return {
      _artifact: true,
      // addArtifactVersion may have forked a fresh artifact (unknown /
      // out-of-scope id) — echo the id it actually landed on, and say
      // so, rather than letting the caller believe the chain advanced.
      artifactId: persisted?.artifactId ?? artifactId,
      ...(persisted ? { version: persisted.version } : {}),
      ...(persisted?.forked ? { forked: true } : {}),
      type,
      title,
      code: cleaned,
      height,
    }
  },
  render: {
    icon: MagicWand,
    displayName: 'Edit Artifact',
    summary: (output) => {
      const o = output as { type?: string; title?: string; version?: number }
      return o?.title ? `${o.title}${o.version ? ` v${o.version}` : ''}` : (o?.type ?? null)
    },
  },
}

export const artifactDefinitions = [
  createArtifactDefinition,
  editArtifactDefinition,
] as ToolDefinition<unknown, unknown>[]
