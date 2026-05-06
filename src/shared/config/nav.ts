/**
 * Sidebar Navigation Configuration
 *
 * Config-driven sidebar — edit this file to add, remove, or reorganise nav items.
 * Items are filtered at runtime by feature flags, user roles, and Builder Mode.
 *
 * Mode hierarchy (see docs/PAGE_GRAMMAR.md):
 *   - "Work" — daily users get work done (Home, Chat, Projects, Spaces, Inbox)
 *   - "Setup" — adding capability (Skills, Connections, Routines)
 *   - "Builder" — developer surfaces (Components, Style Guide, Activity, Voice/Video examples)
 *     Hidden by default; toggled via the user-menu Builder Mode switch.
 *
 * When forking this starter:
 * 1. Edit the sections and items below to match your product
 * 2. Set feature flags in .dev.vars to hide items you don't need
 * 3. The module code stays in the repo as reference implementations
 *
 * @see src/shared/config/features.ts for feature flag definitions
 * @see src/client/lib/builder-mode.tsx for the Builder Mode toggle
 */
import type { LucideIcon } from 'lucide-react'
import {
  Home,
  MessageSquare,
  Sparkles,
  Activity,
  FolderOpen,
  Zap,
  Plug,
  Mic,
  Camera,
  FolderKanban,
  Users,
  Inbox,
  Lightbulb,
  Repeat,
  Component,
  Palette,
  BarChart3,
  ShieldCheck,
  Bot,
  Kanban,
  Layers,
  BookOpen,
} from 'lucide-react'

export interface NavItem {
  /** Route path */
  to: string
  /** Display label */
  label: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Only show if this feature flag is true (from features config) */
  feature?: string
  /** Minimum role required. Omit = visible to all roles. */
  minRole?: 'user' | 'manager' | 'admin'
  /**
   * Only show when Builder Mode is enabled (developer surfaces). Hidden
   * by default for normal users. The toggle lives in the user menu.
   */
  builderOnly?: boolean
}

export interface NavSection {
  /** Section header label */
  label: string
  /** Nav items in this section */
  items: NavItem[]
  /** If true, section starts collapsed in the sidebar */
  defaultCollapsed?: boolean
  /**
   * If true, the entire section is hidden unless Builder Mode is on.
   * Use this for the "Builder" group; per-item `builderOnly` is for
   * mixing builder items into other sections.
   */
  builderOnly?: boolean
}

/**
 * Sidebar navigation sections.
 *
 * Three tiers, each answering a different user-intent question:
 *
 *   - Work (always visible) — daily actions. "What kind of work am I
 *     doing right now?" One-off chats, ongoing projects, team spaces,
 *     scheduled routines, queued items needing attention.
 *
 *   - Setup (collapsed) — configuration. "How does the AI behave?"
 *     Connections, skills, agents, chat-driven config. Most users
 *     touch this on day 2-3 (plug Gmail in), then rarely.
 *
 *   - Insights (collapsed) — observability. "What has the AI done?"
 *     Approvals queue, agent runs/cost charts, audit log, files
 *     produced, structured extraction.
 *
 *   - Builder (collapsed, builder-mode gated) — fork-author surfaces.
 *     Component showcase, style guide, voice/video worked examples.
 *
 * Restructure 2026-05-02: Routines moved Work-side (it's a daily
 * intent, not a setup step). Connections / Skills / Agents / Admin chat
 * collapsed into Setup (configuration concerns). Insights collapsed by
 * default (status reading, not daily action).
 *
 * Settings / Admin Panel live in the user-menu dropdown to keep the
 * sidebar focused on primary destinations.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Work',
    items: [
      { to: '/dashboard', label: 'Home', icon: Home },
      { to: '/dashboard/chat', label: 'AI Chat', icon: MessageSquare, feature: 'chat' },
      { to: '/dashboard/inbox', label: 'Inbox', icon: Inbox },
      { to: '/dashboard/jobs', label: 'Batch jobs', icon: Layers, feature: 'batchTasks' },
      { to: '/dashboard/findings', label: 'Findings', icon: Lightbulb, feature: 'findings' },
      { to: '/dashboard/projects', label: 'Projects', icon: FolderKanban },
      { to: '/dashboard/spaces', label: 'Spaces', icon: Users, feature: 'spaces' },
      { to: '/dashboard/routines', label: 'Routines', icon: Repeat },
    ],
  },
  {
    // Setup — configuration. Collapsed by default; users touch it on
    // day 2-3 (plug Gmail in), then rarely.
    label: 'Setup',
    defaultCollapsed: true,
    items: [
      { to: '/dashboard/connections', label: 'Connections', icon: Plug, feature: 'connectors' },
      { to: '/dashboard/skills', label: 'Skills', icon: Zap, feature: 'skills' },
      { to: '/dashboard/knowledge', label: 'Knowledge', icon: BookOpen, feature: 'knowledge' },
      { to: '/dashboard/agents', label: 'Agents', icon: Bot },
      { to: '/dashboard/admin-chat', label: 'Admin chat', icon: ShieldCheck },
    ],
  },
  {
    // Insights — observability + status. Collapsed by default; opened
    // when the user wants to see what's queued, what's run, what cost.
    //
    // Note: Approvals removed as a sidebar entry — they live inside
    // Inbox now (decisions are first-class inbox rows). The route
    // `/dashboard/approvals` still exists for deep links from notifications;
    // it'll fold into a Sheet detail inside Inbox in a follow-up.
    label: 'Insights',
    defaultCollapsed: true,
    items: [
      { to: '/dashboard/agent-observability', label: 'Observability', icon: BarChart3 },
      { to: '/dashboard/activity', label: 'Activity', icon: Activity, feature: 'activity' },
      { to: '/dashboard/files', label: 'Files', icon: FolderOpen, feature: 'files' },
      { to: '/dashboard/artifacts', label: 'Artifacts', icon: Sparkles, feature: 'chat' },
      { to: '/dashboard/extract', label: 'Extract', icon: Sparkles, feature: 'chat' },
    ],
  },
  {
    // Builder — genuinely developer-facing surfaces only. Default ON
    // for the starter (its audience IS builders); forks shipping a
    // polished product set VITE_DEFAULT_BUILDER_MODE=false to hide it
    // from end users. See src/client/lib/builder-mode.tsx for details.
    label: 'Builder',
    defaultCollapsed: true,
    builderOnly: true,
    items: [
      { to: '/dashboard/components', label: 'Components', icon: Component },
      { to: '/dashboard/style-guide', label: 'Style guide', icon: Palette },
      { to: '/dashboard/voice-example', label: 'Voice example', icon: Mic, feature: 'voiceAgent' },
      { to: '/dashboard/video-example', label: 'Video example', icon: Camera, feature: 'videoAgent' },
      { to: '/dashboard/kanban-demo', label: 'Kanban demo', icon: Kanban, feature: 'kanbanDemo' },
    ],
  },
]
