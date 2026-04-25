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
import {
  driveSearchRenderer,
  driveGetFileRenderer,
  driveCreateFolderRenderer,
} from './drive'
import { tasksListRenderer, tasksCreateRenderer } from './tasks'
import {
  calendarUpcomingRenderer,
  calendarListEventsRenderer,
  calendarGetEventRenderer,
  calendarFindFreeSlotRenderer,
  calendarCreateRenderer,
  calendarUpdateEventRenderer,
  calendarDeleteEventRenderer,
} from './calendar'
import {
  docsSearchRenderer,
  docsGetRenderer,
  docsCreateRenderer,
  docsAppendRenderer,
} from './docs'
import {
  sheetsListTabsRenderer,
  sheetsReadRangeRenderer,
  sheetsAppendRowRenderer,
  sheetsWriteRangeRenderer,
} from './sheets'
import { webSearchRenderer } from './search'
import {
  slackSearchMessagesRenderer,
  slackListChannelsRenderer,
  slackGetChannelHistoryRenderer,
  slackGetUserRenderer,
  slackPostMessageRenderer,
} from './slack'
import {
  notionSearchRenderer,
  notionGetPageRenderer,
  notionGetDatabaseRenderer,
  notionQueryDatabaseRenderer,
  notionCreatePageRenderer,
  notionAppendBlocksRenderer,
} from './notion'
import {
  generateImageRenderer,
  editImageRenderer,
  analyzeImageRenderer,
} from './image'
import {
  jiraSearchRenderer,
  jiraGetIssueRenderer,
  jiraCreateRenderer,
  jiraCommentRenderer,
  jiraTransitionRenderer,
  confluenceSearchRenderer,
  confluenceGetRenderer,
  confluenceCreateRenderer,
} from './atlassian'
import { proposePatchRenderer } from './propose-patch'
import { defaultRenderers } from './defaults'
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
  driveGetFileRenderer,
  driveCreateFolderRenderer,
  // Google Workspace — Calendar
  calendarUpcomingRenderer,
  calendarListEventsRenderer,
  calendarGetEventRenderer,
  calendarFindFreeSlotRenderer,
  calendarCreateRenderer,
  calendarUpdateEventRenderer,
  calendarDeleteEventRenderer,
  // Google Workspace — Docs
  docsSearchRenderer,
  docsGetRenderer,
  docsCreateRenderer,
  docsAppendRenderer,
  // Google Workspace — Sheets
  sheetsListTabsRenderer,
  sheetsReadRangeRenderer,
  sheetsAppendRowRenderer,
  sheetsWriteRangeRenderer,
  // Google Workspace — Tasks
  tasksListRenderer,
  tasksCreateRenderer,
  // Image — generate / edit / analyze
  generateImageRenderer,
  editImageRenderer,
  analyzeImageRenderer,
  // Search
  webSearchRenderer,
  // Slack
  slackSearchMessagesRenderer,
  slackListChannelsRenderer,
  slackGetChannelHistoryRenderer,
  slackGetUserRenderer,
  slackPostMessageRenderer,
  // Notion
  notionSearchRenderer,
  notionGetPageRenderer,
  notionGetDatabaseRenderer,
  notionQueryDatabaseRenderer,
  notionCreatePageRenderer,
  notionAppendBlocksRenderer,
  // Atlassian (Jira + Confluence)
  jiraSearchRenderer,
  jiraGetIssueRenderer,
  jiraCreateRenderer,
  jiraCommentRenderer,
  jiraTransitionRenderer,
  confluenceSearchRenderer,
  confluenceGetRenderer,
  confluenceCreateRenderer,
  // Config-diff (propose_patch tool) — inline ApprovalCard in chat
  proposePatchRenderer,
  // Default renderers for tools without a custom expanded view — icon +
  // displayName only, falls back to JSON body. Kept LAST so custom
  // renderers above win. See defaults.tsx for the metadata table.
  ...defaultRenderers,
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
