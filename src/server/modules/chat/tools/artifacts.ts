/**
 * Artifact Tools — AI-generated visual content (HTML, SVG, Mermaid)
 *
 * Creates interactive artifacts rendered in sandboxed iframes inline in chat.
 * The AI generates the code as a tool result — no separate sub-agent needed.
 *
 * Supports: HTML (dashboards, calculators, interactive pages), SVG (graphics,
 * icons, diagrams), Mermaid (flowcharts, sequence diagrams, ER diagrams).
 *
 * For complex artifacts (>4K tokens), consider using delegate + a
 * specialist code-gen model for higher quality output.
 */
import { tool } from 'ai'
import { z } from 'zod'

export const artifactTools = {
  create_artifact: tool({
    description: `Create a visual artifact rendered inline in chat. Use for dashboards, charts, diagrams, interactive calculators, process flows, or any visual content. The artifact is displayed in a sandboxed iframe.

Types:
- html: Full interactive pages with CSS + JS (dashboards, calculators, forms, data viz). Use Tailwind-style utility classes. Dark theme by default.
- svg: Vector graphics (icons, logos, infographics, simple diagrams). Self-contained SVG with viewBox.
- mermaid: Diagrams (flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap).

IMPORTANT: Output the COMPLETE code as the 'code' parameter — no markdown fences, no explanation. For HTML, include inline CSS and JS. Make it visually polished.`,
    inputSchema: z.object({
      type: z.enum(['html', 'svg', 'mermaid']).describe('Artifact type'),
      title: z.string().describe('Short display title'),
      code: z.string().describe('The complete HTML/SVG/Mermaid code. No markdown fences. Self-contained.'),
      height: z.number().optional().describe('Display height in pixels (default: 400)'),
    }),
    execute: async ({ type, title, code, height = 400 }) => {
      // Clean up code — strip markdown fences if the model included them
      let cleanCode = code.trim()
      cleanCode = cleanCode.replace(/^```(?:html|svg|mermaid)?\n?/, '').replace(/\n?```$/, '')

      return {
        _artifact: true,
        type,
        title,
        code: cleanCode,
        height,
      }
    },
  }),

  edit_artifact: tool({
    description: 'Edit an existing artifact by describing what to change. Provide the artifact ID and the change instruction. The AI will output the complete updated code.',
    inputSchema: z.object({
      artifactId: z.string().describe('The artifact ID from a previous create_artifact result'),
      type: z.enum(['html', 'svg', 'mermaid']).describe('Artifact type (same as original)'),
      title: z.string().describe('Updated title'),
      code: z.string().describe('The COMPLETE updated code (not a diff — the full artifact)'),
      height: z.number().optional().describe('Display height in pixels'),
    }),
    execute: async ({ artifactId, type, title, code, height = 400 }) => {
      let cleanCode = code.trim()
      cleanCode = cleanCode.replace(/^```(?:html|svg|mermaid)?\n?/, '').replace(/\n?```$/, '')

      return {
        _artifact: true,
        artifactId,
        type,
        title,
        code: cleanCode,
        height,
      }
    },
  }),
}
