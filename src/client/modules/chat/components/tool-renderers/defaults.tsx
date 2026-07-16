/**
 * Default renderers — icon + displayName only, no custom expanded view.
 *
 * Tools here fall back to the JSON `FallbackToolBody` in ToolCard, but with
 * the server-defined displayName + icon so the pill reads "List Files"
 * (with FolderTree icon) instead of "Fs List" (with generic wrench).
 *
 * This file mirrors `render: { icon, displayName }` from the server tool
 * definitions at `src/server/modules/chat/tools/*.ts`. Keep them in sync
 * when adding a new server tool — duplication is deliberate because icons
 * are React components that can't be streamed in the SSE tool-call part.
 *
 * Long-term migration path: expose server render metadata via a
 * `GET /api/chat/tool-metadata` endpoint the client fetches once on mount,
 * and derive this table from that response. See the `one-file-tool-definitions.md`
 * rule for the broader contract.
 *
 * For tools with a rich expanded view (Gmail, Drive, Calendar, etc.),
 * the per-domain renderer in `gmail.tsx`/`drive.tsx`/... takes precedence.
 */
import { Clock, Info, Calculator, Checks, Brain, BookOpen, MagnifyingGlass, Trash, Scroll, Books, ChartBar, TreeStructure, FileText, FilePlus, FileX, FileMagnifyingGlass, List, Terminal, PlusSquare, Download, ToggleRight, ListPlus, CheckCircle, ListChecks, Eraser, FileCode, FileDoc, Microphone, SpeakerHigh, UserPlus, EnvelopeSimple, ImageIcon, MagicWand, Scissors, MusicNote, GridNine, MapPin, Sparkle, Database, CalendarDots, ListNumbers, XCircle, Camera, LinkSimple, Code, MagicWand as EditIcon, Bell, Tray, CheckSquare, PaperPlaneTilt, PlugsConnected, Table, Funnel, TrendUp, ChartPie, FileXls, Plus as PlusIcon, PencilSimple, Eye, Lightbulb, ArrowCircleUp, XCircle as XCircleIcon, Globe, Network, Cube } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { ToolRenderer } from './_shared'

interface DefaultMeta {
  icon: Icon
  displayName: string
}

/**
 * Minimal display metadata for tools that don't have a custom renderer.
 * Must stay in sync with `render: { icon, displayName }` in server tool
 * definitions.
 */
const DEFAULT_META: Record<string, DefaultMeta> = {
  // Core
  get_server_time: { icon: Clock, displayName: 'Server Time' },
  get_model_info: { icon: Info, displayName: 'Model Info' },
  calculate: { icon: Calculator, displayName: 'Calculator' },
  done: { icon: Checks, displayName: 'Done' },

  // Memory
  remember: { icon: Brain, displayName: 'Remember' },
  recall: { icon: BookOpen, displayName: 'Recall' },
  search_memory: { icon: MagnifyingGlass, displayName: 'Search Memory' },
  forget: { icon: Trash, displayName: 'Forget' },
  session_stats: { icon: ChartBar, displayName: 'Session Stats' },
  search_memories: { icon: Scroll, displayName: 'Search Memories' },
  list_all_memories: { icon: Books, displayName: 'List All Memories' },

  // Files (fs_*)
  fs_list: { icon: TreeStructure, displayName: 'List Files' },
  fs_read: { icon: FileText, displayName: 'Read File' },
  fs_write: { icon: FilePlus, displayName: 'Write File' },
  fs_delete: { icon: FileX, displayName: 'Delete File' },

  // Skills
  list_skills: { icon: List, displayName: 'List Skills' },
  load_skill: { icon: BookOpen, displayName: 'Load Skill' },
  read_skill_resource: { icon: FileMagnifyingGlass, displayName: 'Read Skill Resource' },
  run_skill_script: { icon: Terminal, displayName: 'Run Skill Script' },
  create_skill: { icon: PlusSquare, displayName: 'Create Skill' },
  install_skill: { icon: Download, displayName: 'Install Skill' },
  toggle_skill: { icon: ToggleRight, displayName: 'Toggle Skill' },

  // Todo
  todo_add: { icon: ListPlus, displayName: 'Add Todo' },
  todo_update: { icon: CheckCircle, displayName: 'Update Todo' },
  todo_list: { icon: ListChecks, displayName: 'Todo List' },
  todo_clear: { icon: Eraser, displayName: 'Clear Todos' },

  // Code
  run_python: { icon: FileCode, displayName: 'Run Python' },
  run_shell: { icon: Terminal, displayName: 'Run Shell' },
  run_js: { icon: FileCode, displayName: 'Run JavaScript' },
  generate_document: { icon: FileDoc, displayName: 'Generate Document' },

  // Audio
  transcribe_audio: { icon: Microphone, displayName: 'Transcribe Audio' },
  speak_text: { icon: SpeakerHigh, displayName: 'Text to Speech' },

  // Delegate
  delegate: { icon: UserPlus, displayName: 'Delegate' },

  // Email
  send_email: { icon: EnvelopeSimple, displayName: 'Send Email' },

  // Image
  generate_image: { icon: ImageIcon, displayName: 'Generate Image' },
  image_transform: { icon: MagicWand, displayName: 'Transform Image' },
  image_info: { icon: Info, displayName: 'Image Info' },

  // Media (video_*)
  video_clip: { icon: Scissors, displayName: 'Clip Video' },
  video_frame: { icon: ImageIcon, displayName: 'Extract Frame' },
  video_audio: { icon: MusicNote, displayName: 'Extract Audio' },
  video_spritesheet: { icon: GridNine, displayName: 'Video Spritesheet' },

  // Places
  places_search: { icon: MapPin, displayName: 'Places Search' },
  places_details: { icon: Info, displayName: 'Place Details' },

  // Semantic / RAG
  semantic_search: { icon: Sparkle, displayName: 'Semantic Search' },
  vectorize_content: { icon: Database, displayName: 'Vectorize Content' },
  search_files: { icon: FileMagnifyingGlass, displayName: 'Search Files' },

  // Schedule
  schedule_task: { icon: CalendarDots, displayName: 'Schedule Task' },
  list_tasks: { icon: ListNumbers, displayName: 'List Tasks' },
  cancel_task: { icon: XCircle, displayName: 'Cancel Task' },

  // Browser
  browser_markdown: { icon: FileText, displayName: 'Browser Markdown' },
  browser_extract: { icon: Database, displayName: 'Browser Extract' },
  browser_screenshot: { icon: Camera, displayName: 'Browser Screenshot' },
  browser_links: { icon: LinkSimple, displayName: 'Browser Links' },
  browser_content: { icon: Code, displayName: 'Browser Content' },

  // Microsoft Workspace (parallels Google Workspace entries in the
  // per-domain renderer files — these are fallbacks in case the
  // per-domain renderers aren't registered for a given deploy)
  outlook_search: { icon: EnvelopeSimple, displayName: 'Outlook — Search' },
  outlook_get_message: { icon: EnvelopeSimple, displayName: 'Outlook — Read' },
  outlook_send: { icon: EnvelopeSimple, displayName: 'Outlook — Send' },
  onedrive_search: { icon: TreeStructure, displayName: 'OneDrive — Search' },
  onedrive_get_file: { icon: FileText, displayName: 'OneDrive — Get File' },
  msoffice_calendar_list: { icon: CalendarDots, displayName: 'MS Calendar — List' },
  msoffice_calendar_create: { icon: CalendarDots, displayName: 'MS Calendar — Create' },

  // ─── Tier-3 batch (added 2026-05-07 brains-trust ship — was bare wrench) ───
  // Most of these will get rich body rendering at runtime via shape
  // renderers (data tables → table shape, firecrawl markdown → markdown
  // shape, etc.). Default meta gives them a polished pill regardless.

  // Artifacts (edit) — create has a server render block with summary
  edit_artifact: { icon: EditIcon, displayName: 'Edit Artifact' },

  // Channels (the 5 routine-dispatch tools)
  notify: { icon: Bell, displayName: 'Notify User' },
  inbox_add: { icon: Tray, displayName: 'Inbox · Add' },
  approval_queue: { icon: CheckSquare, displayName: 'Approval Queue' },
  space_send: { icon: PaperPlaneTilt, displayName: 'Space · Send Message' },
  webhook_post: { icon: PlugsConnected, displayName: 'Webhook · Post' },

  // Data (will hit table shape renderer for {rows, columns})
  read_data: { icon: Table, displayName: 'Read Data' },
  aggregate_data: { icon: ChartBar, displayName: 'Aggregate Data' },
  pivot_data: { icon: Funnel, displayName: 'Pivot Data' },
  trend_data: { icon: TrendUp, displayName: 'Trend Data' },
  distribution_data: { icon: ChartPie, displayName: 'Distribution Data' },
  export_data: { icon: Download, displayName: 'Export Data' },

  // Documents — generate_csv had a server render block, fallback meta here too
  generate_csv: { icon: FileXls, displayName: 'Generate CSV' },

  // Entities (typed CRUD store)
  entity_create: { icon: PlusIcon, displayName: 'Entity · Create' },
  entity_update: { icon: PencilSimple, displayName: 'Entity · Update' },
  entity_get: { icon: Eye, displayName: 'Entity · Get' },
  entity_list: { icon: Cube, displayName: 'Entity · List' },
  entity_search: { icon: MagnifyingGlass, displayName: 'Entity · Search' },

  // Findings (agent observability)
  record_finding: { icon: Lightbulb, displayName: 'Record Finding' },
  promote_finding: { icon: ArrowCircleUp, displayName: 'Promote Finding' },
  dismiss_finding: { icon: XCircleIcon, displayName: 'Dismiss Finding' },

  // Firecrawl (will hit markdown shape renderer for content)
  firecrawl_scrape: { icon: Globe, displayName: 'Firecrawl · Scrape' },
  firecrawl_crawl: { icon: Network, displayName: 'Firecrawl · Crawl' },

  // Google Workspace — markdown→docs upload (others have rich renderers)
  docs_create_from_markdown: { icon: FilePlus, displayName: 'Docs · Create from Markdown' },

  // Memory (multi-entry — distinct from the simpler memory.tsx renderers)
  memory_search: { icon: MagnifyingGlass, displayName: 'Memory · Search' },
  memory_add: { icon: Brain, displayName: 'Memory · Add' },
  memory_update: { icon: PencilSimple, displayName: 'Memory · Update' },
  memory_remove: { icon: Trash, displayName: 'Memory · Remove' },
  load_memory: { icon: BookOpen, displayName: 'Memory · Load' },

  // Search (web_search has a domain renderer for search.tsx — this is the
  // fallback when the registry doesn't recognise the variant)
  web_search: { icon: MagnifyingGlass, displayName: 'Web Search' },
}

/**
 * Generated renderers — one per tool in DEFAULT_META, no custom
 * `expanded` so the shared JSON fallback body handles the detail view.
 * `summary` is omitted — tools without a custom summary don't render one.
 */
export const defaultRenderers: ToolRenderer[] = Object.entries(DEFAULT_META).map(
  ([name, meta]) => ({
    match: name,
    icon: meta.icon,
    displayName: meta.displayName,
  })
)
