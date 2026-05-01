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
  CheckSquare,
  FolderKanban,
  Users,
  Inbox,
  Repeat,
  Component,
  Palette,
  BarChart3,
  ShieldCheck,
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
 * Sections are rendered in order. Items within each section are filtered
 * by feature flags, user role, and Builder Mode before rendering.
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
      { to: '/dashboard/projects', label: 'Projects', icon: FolderKanban },
      { to: '/dashboard/spaces', label: 'Spaces', icon: Users, feature: 'spaces' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { to: '/dashboard/connections', label: 'Connections', icon: Plug, feature: 'connectors' },
      { to: '/dashboard/skills', label: 'Skills', icon: Zap, feature: 'skills' },
      { to: '/dashboard/routines', label: 'Routines', icon: Repeat },
      { to: '/dashboard/admin-chat', label: 'Admin chat', icon: ShieldCheck },
    ],
  },
  {
    label: 'Builder',
    defaultCollapsed: true,
    builderOnly: true,
    items: [
      { to: '/dashboard/approvals', label: 'Approvals queue', icon: CheckSquare },
      { to: '/dashboard/agent-observability', label: 'Agent observability', icon: BarChart3 },
      { to: '/dashboard/activity', label: 'Activity', icon: Activity, feature: 'activity' },
      { to: '/dashboard/extract', label: 'Extract', icon: Sparkles, feature: 'chat' },
      { to: '/dashboard/files', label: 'Files', icon: FolderOpen, feature: 'files' },
      { to: '/dashboard/components', label: 'Components', icon: Component },
      { to: '/dashboard/style-guide', label: 'Style guide', icon: Palette },
      { to: '/dashboard/voice-example', label: 'Voice example', icon: Mic, feature: 'voiceAgent' },
      { to: '/dashboard/video-example', label: 'Video example', icon: Camera, feature: 'videoAgent' },
    ],
  },
]
