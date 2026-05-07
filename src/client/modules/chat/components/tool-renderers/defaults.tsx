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
import {
  // Core
  Clock,
  Info,
  Calculator,
  CheckCheck,
  // Memory
  Brain,
  BookOpen,
  Search,
  Trash2,
  ScrollText,
  Library,
  BarChart3,
  // Files
  FolderTree,
  FileCheck,
  FilePlus,
  FileX,
  FileSearch,
  // Skills
  List,
  Terminal,
  PlusSquare,
  Download,
  ToggleRight,
  // Todo
  ListPlus,
  CheckCircle2,
  ListChecks,
  Eraser,
  // Code
  FileCode2,
  // Audio
  Mic,
  Volume2,
  // Delegate
  UserPlus,
  // Email
  Mail,
  // Image
  ImageIcon,
  Wand2,
  // Media
  Scissors,
  Music,
  Grid3x3,
  // Places
  MapPin,
  // Semantic
  Sparkles,
  Database,
  // Schedule
  CalendarClock,
  ListOrdered,
  XCircle,
  // Browser
  FileText,
  Camera,
  Link2,
  Code,
  // Bare-tier additions (2026-05-07 brains-trust ship)
  Wand2 as EditIcon,
  Bell,
  Inbox,
  CheckSquare,
  Send,
  Webhook,
  TableProperties,
  Filter,
  TrendingUp,
  PieChart,
  FileSpreadsheet,
  Plus as PlusIcon,
  Edit3,
  Eye,
  Lightbulb,
  ArrowUpCircle,
  XCircle as XCircleIcon,
  Globe,
  Network,
  FilePlus2,
  Box,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ToolRenderer } from './_shared'

interface DefaultMeta {
  icon: LucideIcon
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
  done: { icon: CheckCheck, displayName: 'Done' },

  // Memory
  remember: { icon: Brain, displayName: 'Remember' },
  recall: { icon: BookOpen, displayName: 'Recall' },
  search_memory: { icon: Search, displayName: 'Search Memory' },
  forget: { icon: Trash2, displayName: 'Forget' },
  session_stats: { icon: BarChart3, displayName: 'Session Stats' },
  search_memories: { icon: ScrollText, displayName: 'Search Memories' },
  list_all_memories: { icon: Library, displayName: 'List All Memories' },

  // Files (fs_*)
  fs_list: { icon: FolderTree, displayName: 'List Files' },
  fs_read: { icon: FileCheck, displayName: 'Read File' },
  fs_write: { icon: FilePlus, displayName: 'Write File' },
  fs_delete: { icon: FileX, displayName: 'Delete File' },

  // Skills
  list_skills: { icon: List, displayName: 'List Skills' },
  load_skill: { icon: BookOpen, displayName: 'Load Skill' },
  read_skill_resource: { icon: FileSearch, displayName: 'Read Skill Resource' },
  run_skill_script: { icon: Terminal, displayName: 'Run Skill Script' },
  create_skill: { icon: PlusSquare, displayName: 'Create Skill' },
  install_skill: { icon: Download, displayName: 'Install Skill' },
  toggle_skill: { icon: ToggleRight, displayName: 'Toggle Skill' },

  // Todo
  todo_add: { icon: ListPlus, displayName: 'Add Todo' },
  todo_update: { icon: CheckCircle2, displayName: 'Update Todo' },
  todo_list: { icon: ListChecks, displayName: 'Todo List' },
  todo_clear: { icon: Eraser, displayName: 'Clear Todos' },

  // Code
  run_python: { icon: FileCode2, displayName: 'Run Python' },
  run_shell: { icon: Terminal, displayName: 'Run Shell' },
  run_js: { icon: FileCode2, displayName: 'Run JavaScript' },

  // Audio
  transcribe_audio: { icon: Mic, displayName: 'Transcribe Audio' },
  speak_text: { icon: Volume2, displayName: 'Text to Speech' },

  // Delegate
  delegate: { icon: UserPlus, displayName: 'Delegate' },

  // Email
  send_email: { icon: Mail, displayName: 'Send Email' },

  // Image
  generate_image: { icon: ImageIcon, displayName: 'Generate Image' },
  image_transform: { icon: Wand2, displayName: 'Transform Image' },
  image_info: { icon: Info, displayName: 'Image Info' },

  // Media (video_*)
  video_clip: { icon: Scissors, displayName: 'Clip Video' },
  video_frame: { icon: ImageIcon, displayName: 'Extract Frame' },
  video_audio: { icon: Music, displayName: 'Extract Audio' },
  video_spritesheet: { icon: Grid3x3, displayName: 'Video Spritesheet' },

  // Places
  places_search: { icon: MapPin, displayName: 'Places Search' },
  places_details: { icon: Info, displayName: 'Place Details' },

  // Semantic / RAG
  semantic_search: { icon: Sparkles, displayName: 'Semantic Search' },
  vectorize_content: { icon: Database, displayName: 'Vectorize Content' },
  search_files: { icon: FileSearch, displayName: 'Search Files' },

  // Schedule
  schedule_task: { icon: CalendarClock, displayName: 'Schedule Task' },
  list_tasks: { icon: ListOrdered, displayName: 'List Tasks' },
  cancel_task: { icon: XCircle, displayName: 'Cancel Task' },

  // Browser
  browser_markdown: { icon: FileText, displayName: 'Browser Markdown' },
  browser_extract: { icon: Database, displayName: 'Browser Extract' },
  browser_screenshot: { icon: Camera, displayName: 'Browser Screenshot' },
  browser_links: { icon: Link2, displayName: 'Browser Links' },
  browser_content: { icon: Code, displayName: 'Browser Content' },

  // Microsoft Workspace (parallels Google Workspace entries in the
  // per-domain renderer files — these are fallbacks in case the
  // per-domain renderers aren't registered for a given deploy)
  outlook_search: { icon: Mail, displayName: 'Outlook — Search' },
  outlook_get_message: { icon: Mail, displayName: 'Outlook — Read' },
  outlook_send: { icon: Mail, displayName: 'Outlook — Send' },
  onedrive_search: { icon: FolderTree, displayName: 'OneDrive — Search' },
  onedrive_get_file: { icon: FileCheck, displayName: 'OneDrive — Get File' },
  msoffice_calendar_list: { icon: CalendarClock, displayName: 'MS Calendar — List' },
  msoffice_calendar_create: { icon: CalendarClock, displayName: 'MS Calendar — Create' },

  // ─── Tier-3 batch (added 2026-05-07 brains-trust ship — was bare wrench) ───
  // Most of these will get rich body rendering at runtime via shape
  // renderers (data tables → table shape, firecrawl markdown → markdown
  // shape, etc.). Default meta gives them a polished pill regardless.

  // Artifacts (edit) — create has a server render block with summary
  edit_artifact: { icon: EditIcon, displayName: 'Edit Artifact' },

  // Channels (the 5 routine-dispatch tools)
  notify: { icon: Bell, displayName: 'Notify User' },
  inbox_add: { icon: Inbox, displayName: 'Inbox · Add' },
  approval_queue: { icon: CheckSquare, displayName: 'Approval Queue' },
  space_send: { icon: Send, displayName: 'Space · Send Message' },
  webhook_post: { icon: Webhook, displayName: 'Webhook · Post' },

  // Data (will hit table shape renderer for {rows, columns})
  read_data: { icon: TableProperties, displayName: 'Read Data' },
  aggregate_data: { icon: BarChart3, displayName: 'Aggregate Data' },
  pivot_data: { icon: Filter, displayName: 'Pivot Data' },
  trend_data: { icon: TrendingUp, displayName: 'Trend Data' },
  distribution_data: { icon: PieChart, displayName: 'Distribution Data' },
  export_data: { icon: Download, displayName: 'Export Data' },

  // Documents — generate_csv had a server render block, fallback meta here too
  generate_csv: { icon: FileSpreadsheet, displayName: 'Generate CSV' },

  // Entities (typed CRUD store)
  entity_create: { icon: PlusIcon, displayName: 'Entity · Create' },
  entity_update: { icon: Edit3, displayName: 'Entity · Update' },
  entity_get: { icon: Eye, displayName: 'Entity · Get' },
  entity_list: { icon: Box, displayName: 'Entity · List' },
  entity_search: { icon: Search, displayName: 'Entity · Search' },

  // Findings (agent observability)
  record_finding: { icon: Lightbulb, displayName: 'Record Finding' },
  promote_finding: { icon: ArrowUpCircle, displayName: 'Promote Finding' },
  dismiss_finding: { icon: XCircleIcon, displayName: 'Dismiss Finding' },

  // Firecrawl (will hit markdown shape renderer for content)
  firecrawl_scrape: { icon: Globe, displayName: 'Firecrawl · Scrape' },
  firecrawl_crawl: { icon: Network, displayName: 'Firecrawl · Crawl' },

  // Google Workspace — markdown→docs upload (others have rich renderers)
  docs_create_from_markdown: { icon: FilePlus2, displayName: 'Docs · Create from Markdown' },

  // Memory (multi-entry — distinct from the simpler memory.tsx renderers)
  memory_search: { icon: Search, displayName: 'Memory · Search' },
  memory_add: { icon: Brain, displayName: 'Memory · Add' },
  memory_update: { icon: Edit3, displayName: 'Memory · Update' },
  memory_remove: { icon: Trash2, displayName: 'Memory · Remove' },
  load_memory: { icon: BookOpen, displayName: 'Memory · Load' },

  // Search (web_search has a domain renderer for search.tsx — this is the
  // fallback when the registry doesn't recognise the variant)
  web_search: { icon: Search, displayName: 'Web Search' },
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
  }),
)
