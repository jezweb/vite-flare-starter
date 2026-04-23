/**
 * Tool Renderer Registry.
 *
 * Add a new renderer: import it here and append to TOOL_RENDERERS. First
 * match wins — keep specific renderers (exact tool name) before generic
 * duck-typed matchers.
 *
 * Renderers ship per domain (gmail.tsx, drive.tsx, ...). To add a new
 * domain, create a new file, export renderer objects, and register them
 * here.
 */
import {
  gmailSearchRenderer,
  gmailGetMessageRenderer,
  gmailListLabelsRenderer,
  gmailDraftRenderer,
  gmailReplyRenderer,
  gmailSendRenderer,
} from './gmail'
import { driveSearchRenderer } from './drive'
import {
  calendarUpcomingRenderer,
  calendarListEventsRenderer,
  calendarGetEventRenderer,
  calendarFindFreeSlotRenderer,
  calendarCreateRenderer,
  calendarUpdateEventRenderer,
  calendarDeleteEventRenderer,
} from './calendar'
import { webSearchRenderer } from './search'
import { matchesRenderer, type ToolRenderer } from './_shared'

export const TOOL_RENDERERS: ToolRenderer[] = [
  // Google Workspace — Gmail
  gmailSearchRenderer,
  gmailGetMessageRenderer,
  gmailListLabelsRenderer,
  gmailDraftRenderer,
  gmailReplyRenderer,
  gmailSendRenderer,
  // Google Workspace — Drive
  driveSearchRenderer,
  // Google Workspace — Calendar
  calendarUpcomingRenderer,
  calendarListEventsRenderer,
  calendarGetEventRenderer,
  calendarFindFreeSlotRenderer,
  calendarCreateRenderer,
  calendarUpdateEventRenderer,
  calendarDeleteEventRenderer,
  // Search
  webSearchRenderer,
]

export function findRenderer(
  toolName: string,
  output: unknown,
): ToolRenderer | null {
  for (const r of TOOL_RENDERERS) {
    if (matchesRenderer(r, toolName, output)) return r
  }
  return null
}

export { ToolCard, prettyToolName } from './_shared'
export type { ToolRenderer, ToolState } from './_shared'
