/**
 * Artifact Tools — AI-generated visual content (HTML, SVG, Mermaid)
 *
 * Creates interactive artifacts rendered in sandboxed iframes inline in chat.
 * The AI generates the code as a tool result — no separate sub-agent needed.
 *
 * Output shape is a `_artifact: true` marker intercepted by
 * `MessageRenderer.isArtifact()` and rendered by `ArtifactViewer`.
 */
import { z } from 'zod'
import { Sparkles, Wand2 } from 'lucide-react'
import type { ToolDefinition } from '@/shared/agent'

const ArtifactType = z.enum(['html', 'svg', 'mermaid'])

const CreateArtifactInput = z.object({
  type: ArtifactType.describe('Artifact type'),
  title: z.string().describe('Short display title'),
  code: z.string().describe('The complete HTML/SVG/Mermaid code. No markdown fences. Self-contained.'),
  height: z.number().optional().describe('Display height in pixels (default: 400)'),
})

const EditArtifactInput = z.object({
  artifactId: z.string().describe('The artifact ID from a previous create_artifact result'),
  type: ArtifactType.describe('Artifact type (same as original)'),
  title: z.string().describe('Updated title'),
  code: z.string().describe('The COMPLETE updated code (not a diff — the full artifact)'),
  height: z.number().optional().describe('Display height in pixels'),
})

function cleanFences(code: string): string {
  return code.trim().replace(/^```(?:html|svg|mermaid)?\n?/, '').replace(/\n?```$/, '')
}

const CreateArtifactOutput = z.object({
  _artifact: z.literal(true),
  type: ArtifactType,
  title: z.string(),
  code: z.string(),
  height: z.number(),
})

export const createArtifactDefinition: ToolDefinition<
  z.infer<typeof CreateArtifactInput>,
  z.infer<typeof CreateArtifactOutput>
> = {
  name: 'create_artifact',
  description: `Create a visual artifact rendered inline in chat. Use for dashboards, charts, diagrams, interactive calculators, reports, or any visual content. Displayed in a sandboxed iframe with code/preview toggle.

Types:
- html: Full interactive pages with CSS + JS. For charts, use Chart.js via CDN: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>. For formatted documents/reports, use marked.js: <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script> and render markdown to HTML. Dark theme (#0f1117 bg, light text). Include all CSS inline.
- svg: Vector graphics. Self-contained SVG with viewBox.
- mermaid: Diagrams (flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap).

CDN libraries available in HTML artifacts:
- Chart.js: charts (bar, line, pie, doughnut, radar, scatter, bubble)
- Marked.js: markdown to HTML (for formatted reports/documents)
- Mermaid: diagrams (if you need a diagram inside an HTML artifact)
- D3.js: advanced data visualisation
- Leaflet: maps
- Three.js: 3D graphics

IMPORTANT: Output the COMPLETE code as the 'code' parameter — no markdown fences, no explanation. Make it visually polished with dark theme.`,
  inputSchema: CreateArtifactInput,
  outputSchema: CreateArtifactOutput,
  execute: async ({ type, title, code, height = 400 }) => ({
    _artifact: true,
    type,
    title,
    code: cleanFences(code),
    height,
  }),
  render: {
    icon: Sparkles,
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
  description: 'Edit an existing artifact by describing what to change. Provide the artifact ID and the change instruction. The AI will output the complete updated code.',
  inputSchema: EditArtifactInput,
  outputSchema: EditArtifactOutput,
  execute: async ({ artifactId, type, title, code, height = 400 }) => ({
    _artifact: true,
    artifactId,
    type,
    title,
    code: cleanFences(code),
    height,
  }),
  render: {
    icon: Wand2,
    displayName: 'Edit Artifact',
    summary: (output) => {
      const o = output as { type?: string; title?: string }
      return o?.title ? `${o.title} (${o.type})` : (o?.type ?? null)
    },
  },
}

export const artifactDefinitions = [
  createArtifactDefinition,
  editArtifactDefinition,
] as ToolDefinition<unknown, unknown>[]
