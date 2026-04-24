/**
 * Group agent tool names by product area for the ManageToolsDialog.
 *
 * Pure function — no provider coupling. The mapping is intentionally
 * flat: any tool name maps to a label based on its prefix or a named
 * override. Unknown tools bucket under "Other".
 */
const GROUP_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  drive: 'Drive',
  calendar: 'Calendar',
  docs: 'Docs',
  sheets: 'Sheets',
  tasks: 'Tasks',
  outlook: 'Outlook',
  onedrive: 'OneDrive',
  msoffice_calendar: 'Calendar (Microsoft)',
  slack: 'Slack',
  notion: 'Notion',
  jira: 'Jira',
  confluence: 'Confluence',
}

export interface ToolGroup {
  label: string
  tools: string[]
}

/**
 * Humanise a tool name (snake_case → Title Case without the group
 * prefix). `gmail_search` → "Search", `sheets_append_row` → "Append row".
 */
export function humanizeToolName(name: string): string {
  // Drop the longest matching prefix from GROUP_LABELS
  const match = Object.keys(GROUP_LABELS)
    .sort((a, b) => b.length - a.length)
    .find((p) => name === p || name.startsWith(`${p}_`))
  const rest = match ? name.slice(match.length).replace(/^_/, '') : name
  const withSpaces = rest.replace(/_/g, ' ')
  if (!withSpaces) return name
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1)
}

export function groupTools(toolNames: string[]): ToolGroup[] {
  const byLabel = new Map<string, string[]>()
  for (const name of toolNames) {
    const prefix = Object.keys(GROUP_LABELS)
      .sort((a, b) => b.length - a.length)
      .find((p) => name === p || name.startsWith(`${p}_`))
    const label = prefix ? GROUP_LABELS[prefix]! : 'Other'
    if (!byLabel.has(label)) byLabel.set(label, [])
    byLabel.get(label)!.push(name)
  }
  return [...byLabel.entries()]
    .map(([label, tools]) => ({ label, tools }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
