/**
 * Tool catalog — canonical client-side list of agent tool names with
 * short descriptions + category. Used by the skill editor's autocomplete
 * popup (trigger: `/`) so authors can insert tool names without having
 * to remember the exact spelling.
 *
 * Not the source of truth for the server toolkit — that lives in
 * `src/server/modules/chat/tools/index.ts`. Kept as a separate hand-
 * maintained list because:
 *   - server tool defs import server-only code (D1 drizzle, Hono, etc.)
 *     and can't be tree-shaken into the client bundle cleanly
 *   - autocomplete is a convenience UI, not a correctness contract —
 *     slight drift is acceptable; picking a suggestion just inserts a
 *     literal string, it doesn't call anything
 *
 * When you add a new tool, add it here too. Ordered by category then
 * alphabetical within each — matches how the editor groups the popup.
 */

export type ToolCategory =
  | 'core'
  | 'memory'
  | 'ui'
  | 'skills'
  | 'code'
  | 'agent'
  | 'audio'
  | 'todo'
  | 'config'
  | 'browser'
  | 'search'
  | 'places'
  | 'files'
  | 'gmail'
  | 'drive'
  | 'tasks'
  | 'calendar'
  | 'docs'
  | 'sheets'
  | 'outlook'
  | 'onedrive'
  | 'msoffice-cal'

export interface ToolCatalogEntry {
  name: string
  description: string
  category: ToolCategory
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  // Core
  { name: 'get_server_time', description: 'Current UTC time + user timezone.', category: 'core' },
  { name: 'get_model_info', description: 'Info about the currently loaded LLM.', category: 'core' },
  { name: 'calculate', description: 'Safe arithmetic (+, −, ×, ÷, %).', category: 'core' },

  // Memory
  { name: 'remember', description: 'Store a fact in the user_meta D1 table.', category: 'memory' },
  { name: 'recall', description: 'Fetch a remembered fact by key.', category: 'memory' },
  { name: 'search_memory', description: 'Full-text search over remembered facts.', category: 'memory' },
  { name: 'forget', description: 'Delete a remembered fact.', category: 'memory' },

  // UI elements
  { name: 'offer_choices', description: 'Show a list of selectable options.', category: 'ui' },
  { name: 'show_alert', description: 'Surface a warning / info banner.', category: 'ui' },
  { name: 'show_contact', description: 'Render a contact card (name + email + phone).', category: 'ui' },
  { name: 'collect_info', description: 'Form-style field collection from the user.', category: 'ui' },
  { name: 'ask_questions', description: 'Ask clarifying questions before acting.', category: 'ui' },
  { name: 'show_data_table', description: 'Render rows + columns of tabular data.', category: 'ui' },
  { name: 'show_metric_cards', description: 'Dashboard-style KPI cards.', category: 'ui' },
  { name: 'show_timeline', description: 'Chronological events on a timeline.', category: 'ui' },
  { name: 'show_progress', description: 'Progress bar for long-running work.', category: 'ui' },
  { name: 'show_comparison', description: 'Side-by-side comparison of options.', category: 'ui' },
  { name: 'confirm_action', description: 'Y/N confirmation with summary.', category: 'ui' },
  { name: 'show_map', description: 'Leaflet map with markers + scrollable cards.', category: 'ui' },

  // Skills
  { name: 'load_skill', description: 'Load a full SKILL.md by name for detailed instructions.', category: 'skills' },

  // Code execution
  { name: 'run_python', description: 'Execute Python in an isolated sandbox.', category: 'code' },
  { name: 'run_shell', description: 'Run shell commands in an isolated sandbox.', category: 'code' },
  { name: 'run_js', description: 'Execute JavaScript in an isolated sandbox.', category: 'code' },

  // Agent / subagent
  { name: 'delegate', description: 'Spawn a subagent to work on a discrete task.', category: 'agent' },

  // Audio
  { name: 'transcribe_audio', description: 'STT via Deepgram Nova 3 on Workers AI.', category: 'audio' },
  { name: 'speak_text', description: 'TTS via Deepgram Aura 2 (12 voices).', category: 'audio' },

  // Todo list
  { name: 'todo_add', description: 'Add a task to the session todo list.', category: 'todo' },
  { name: 'todo_update', description: 'Update a task status.', category: 'todo' },
  { name: 'todo_list', description: 'Show the session todo list.', category: 'todo' },
  { name: 'todo_clear', description: 'Clear completed tasks.', category: 'todo' },

  // Config diff
  { name: 'propose_patch', description: 'Stage a change to a user-configurable resource (skill, prompt) for approval.', category: 'config' },

  // Browser
  { name: 'browser_markdown', description: 'Render a URL as clean markdown.', category: 'browser' },
  { name: 'browser_extract', description: 'AI-powered extraction from a URL with a natural-language prompt.', category: 'browser' },
  { name: 'browser_screenshot', description: 'Capture a page screenshot.', category: 'browser' },
  { name: 'browser_links', description: 'Get all links from a page.', category: 'browser' },
  { name: 'browser_content', description: 'Get raw HTML content of a page.', category: 'browser' },

  // Search
  { name: 'web_search', description: 'Web search via configured provider (Serper/Brave/Tavily/Exa).', category: 'search' },

  // Places (Google)
  { name: 'places_search', description: 'Search Google Places for local businesses.', category: 'places' },
  { name: 'places_details', description: 'Get details for a specific Google Place.', category: 'places' },

  // Filesystem (R2)
  { name: 'fs_list', description: 'List files in the user\'s R2 bucket.', category: 'files' },
  { name: 'fs_read', description: 'Read a file from R2.', category: 'files' },
  { name: 'fs_write', description: 'Write a file to R2.', category: 'files' },
  { name: 'fs_delete', description: 'Delete a file from R2.', category: 'files' },

  // Gmail (Google Workspace)
  { name: 'gmail_search', description: 'Search Gmail — accepts operators or natural-language queries.', category: 'gmail' },
  { name: 'gmail_get_message', description: 'Fetch a single Gmail message by id.', category: 'gmail' },
  { name: 'gmail_list_labels', description: 'List Gmail labels.', category: 'gmail' },
  { name: 'gmail_draft', description: 'Create a Gmail draft.', category: 'gmail' },
  { name: 'gmail_reply', description: 'Reply to a Gmail thread.', category: 'gmail' },
  { name: 'gmail_send', description: 'Send a Gmail message (privileged — requires approval).', category: 'gmail' },

  // Drive
  { name: 'drive_search', description: 'Search Google Drive.', category: 'drive' },
  { name: 'drive_get_file', description: 'Fetch a Google Drive file\'s metadata.', category: 'drive' },
  { name: 'drive_create_folder', description: 'Create a new folder in Google Drive.', category: 'drive' },

  // Tasks
  { name: 'tasks_list', description: 'List Google Tasks.', category: 'tasks' },
  { name: 'tasks_create', description: 'Create a Google Task.', category: 'tasks' },

  // Calendar (Google)
  { name: 'calendar_upcoming', description: 'Next N upcoming events across calendars.', category: 'calendar' },
  { name: 'calendar_list_events', description: 'List events in a time range (accepts natural-language queries).', category: 'calendar' },
  { name: 'calendar_get_event', description: 'Fetch a single calendar event.', category: 'calendar' },
  { name: 'calendar_find_free_slot', description: 'Find open time blocks in a range.', category: 'calendar' },
  { name: 'calendar_create', description: 'Create a calendar event (privileged — requires approval).', category: 'calendar' },
  { name: 'calendar_update_event', description: 'Update an event (privileged — requires approval).', category: 'calendar' },
  { name: 'calendar_delete_event', description: 'Delete an event (privileged — requires approval).', category: 'calendar' },

  // Docs
  { name: 'docs_search', description: 'Search Google Docs.', category: 'docs' },
  { name: 'docs_get', description: 'Read a Google Doc\'s content.', category: 'docs' },
  { name: 'docs_create', description: 'Create a Google Doc (privileged).', category: 'docs' },
  { name: 'docs_append', description: 'Append text / markdown to an existing Doc (privileged).', category: 'docs' },

  // Sheets
  { name: 'sheets_list_tabs', description: 'List tabs in a Google Sheet.', category: 'sheets' },
  { name: 'sheets_read_range', description: 'Read a range of cells (A1 notation).', category: 'sheets' },
  { name: 'sheets_append_row', description: 'Append a row of values (privileged).', category: 'sheets' },
  { name: 'sheets_write_range', description: 'Write a range of cells (privileged).', category: 'sheets' },

  // Outlook (Microsoft 365)
  { name: 'outlook_search', description: 'Search Outlook messages.', category: 'outlook' },
  { name: 'outlook_get_message', description: 'Fetch a single Outlook message.', category: 'outlook' },
  { name: 'outlook_send', description: 'Send an Outlook message (privileged).', category: 'outlook' },

  // OneDrive
  { name: 'onedrive_search', description: 'Search OneDrive files.', category: 'onedrive' },
  { name: 'onedrive_get_file', description: 'Fetch OneDrive file metadata + pre-auth URL.', category: 'onedrive' },

  // MS calendar
  { name: 'msoffice_calendar_list', description: 'List Microsoft 365 calendar events.', category: 'msoffice-cal' },
  { name: 'msoffice_calendar_create', description: 'Create an Outlook event, optionally with Teams meeting link (privileged).', category: 'msoffice-cal' },
]

/** Sorted list used for autocomplete rendering. */
export const TOOL_CATALOG_SORTED = [...TOOL_CATALOG].sort((a, b) =>
  a.name.localeCompare(b.name),
)
