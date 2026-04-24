/**
 * Tool names that do something destructive or outbound — sending email,
 * creating calendar events, writing files, posting to Slack. Two places
 * read this:
 *
 *   1. `src/server/lib/ai/prepare-step.ts` — gates these tools per turn
 *      so the agent only gets access when the latest user message
 *      references them (or when the agent already used a related tool
 *      earlier in the conversation).
 *   2. `src/client/modules/connectors/components/ManageToolsDialog.tsx`
 *      — renders a "Destructive" badge next to these tools so the user
 *      understands what they're toggling on.
 *
 * Keep this in sync with the matching `UNLOCK_KEYWORDS` entry in
 * prepare-step.ts — every entry here needs a regex there.
 */
export const PRIVILEGED_TOOL_NAMES = [
  // Google Workspace
  'gmail_send',
  'gmail_reply',
  'gmail_delete',
  'calendar_create',
  'calendar_update_event',
  'calendar_delete_event',
  'docs_create',
  'docs_append',
  'sheets_append_row',
  'sheets_write_range',
  'drive_create_folder',
  'tasks_create',
  'drive_delete',
  // Microsoft 365
  'outlook_send',
  'msoffice_calendar_create',
  // Slack
  'slack_post_message',
  // Notion
  'notion_create_page',
  'notion_append_blocks',
  // Atlassian
  'jira_create_issue',
  'jira_add_comment',
  'jira_transition_issue',
  'confluence_create_page',
  // Agent runtime
  'fs_delete',
  'fs_write',
  'run_shell',
] as const

export type PrivilegedToolName = (typeof PRIVILEGED_TOOL_NAMES)[number]

export function isPrivilegedTool(name: string): boolean {
  return (PRIVILEGED_TOOL_NAMES as readonly string[]).includes(name)
}
