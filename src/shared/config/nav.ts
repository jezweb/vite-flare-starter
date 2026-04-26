/**
 * Sidebar Navigation Configuration
 *
 * Config-driven sidebar — edit this file to add, remove, or reorganise nav items.
 * Items are filtered at runtime by feature flags and user roles.
 *
 * When forking this starter:
 * 1. Edit the sections and items below to match your product
 * 2. Set feature flags in .dev.vars to hide items you don't need
 * 3. The module code stays in the repo as reference implementations
 *
 * @see src/shared/config/features.ts for feature flag definitions
 *
 * Phase 1 (Projects first-class) cleanup:
 * - Added top-level Projects nav item
 * - Moved Settings, Admin Panel, Components, Style Guide to user-menu
 * - Sidebar reserved for primary destinations only
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
  Bell,
  Mic,
  Camera,
  CheckSquare,
  FolderKanban,
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
}

export interface NavSection {
  /** Section header label */
  label: string
  /** Nav items in this section */
  items: NavItem[]
  /** If true, section starts collapsed in the sidebar */
  defaultCollapsed?: boolean
}

/**
 * Sidebar navigation sections.
 *
 * Sections are rendered in order. Items within each section are filtered
 * by feature flags and user role before rendering.
 *
 * Settings / Admin Panel / Components / Style Guide are deliberately
 * NOT in the sidebar — they live in the user-menu dropdown to keep the
 * sidebar focused on primary destinations.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', label: 'Home', icon: Home },
      { to: '/dashboard/chat', label: 'AI Chat', icon: MessageSquare, feature: 'chat' },
      { to: '/dashboard/projects', label: 'Projects', icon: FolderKanban },
      { to: '/dashboard/extract', label: 'Extract', icon: Sparkles, feature: 'chat' },
      { to: '/dashboard/files', label: 'Files', icon: FolderOpen, feature: 'files' },
      { to: '/dashboard/skills', label: 'Skills', icon: Zap, feature: 'skills' },
      { to: '/dashboard/connectors', label: 'Connectors', icon: Plug, feature: 'connectors' },
      { to: '/dashboard/activity', label: 'Activity', icon: Activity, feature: 'activity' },
      { to: '/dashboard/voice-example', label: 'Voice Example', icon: Mic, feature: 'voiceAgent' },
      { to: '/dashboard/video-example', label: 'Video Example', icon: Camera, feature: 'videoAgent' },
    ],
  },
  {
    label: 'You',
    items: [
      { to: '/dashboard/notifications', label: 'Notifications', icon: Bell, feature: 'notifications' },
      { to: '/dashboard/approvals', label: 'Approvals', icon: CheckSquare },
    ],
  },
]
