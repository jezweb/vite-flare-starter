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
import type { Icon } from '@phosphor-icons/react'
import {
  House,
  Chat,
  Lightning,
  Plug,
  Microphone,
  Camera,
  Kanban,
  Users,
  Tray,
  Lightbulb,
  Repeat,
  PuzzlePiece,
  Palette,
  ChartBar,
  ChartLine,
  ShieldCheck,
  Robot,
  Stack,
  BookOpen,
  Megaphone,
} from '@phosphor-icons/react'

/**
 * Runtime badge sources.
 *
 * A nav item can name a source here to get live state (an unseen dot, or
 * being hidden when it has nothing to show) without this file becoming
 * dynamic. The config stays plain serialisable data — the CommandPalette
 * and forks both depend on that — and `src/client/lib/nav-badges.ts`
 * resolves the name to a hook in the sidebar renderer.
 */
export type NavBadgeSource = 'updates'

export interface NavItem {
  /** Route path */
  to: string
  /** Display label */
  label: string
  /** Phosphor icon component */
  icon: Icon
  /**
   * Names a runtime badge source (see NavBadgeSource). The renderer
   * overlays a dot and may hide the item entirely — e.g. What's New
   * hides itself until the first entry is published, so a fresh fork
   * never shows an empty room.
   */
  badgeSource?: NavBadgeSource
  /** Only show if this feature flag is true (from features config) */
  feature?: string
  /** Minimum role required. Omit = visible to all roles. */
  minRole?: 'user' | 'manager' | 'admin'
  /**
   * Only show when Builder Mode is enabled (developer surfaces). Hidden
   * by default for normal users. The toggle lives in the user menu.
   */
  builderOnly?: boolean
  /**
   * Cloudflare-dashboard-style nesting: the item renders with a muted
   * icon as a whole-row collapsible toggle; children render text-only,
   * indented behind a vertical rail (the rail IS the hierarchy cue —
   * no child icons). Navigation lives in the children; the parent's
   * `to` is only used when the sidebar is icon-collapsed (children
   * unreachable → parent degrades to a link to its overview route).
   */
  children?: NavChildItem[]
  /** Small dashed pill after the label (e.g. "Beta", "New") — Kumo MenuBadge. */
  badge?: string
}

export interface NavChildItem {
  /** Route path */
  to: string
  /** Display label */
  label: string
  /** Only show if this feature flag is true (from features config) */
  feature?: string
  /** Minimum role required. Omit = visible to all roles. */
  minRole?: 'user' | 'manager' | 'admin'
  /** Only show when Builder Mode is enabled. */
  builderOnly?: boolean
  /** Small dashed pill after the label (e.g. "Beta", "New"). */
  badge?: string
}

/**
 * A nav item after the sidebar has overlaid runtime badge state onto it.
 * `dot` is never authored in NAV_SECTIONS — it only ever comes from a
 * `badgeSource` resolver.
 */
export type ResolvedNavItem = NavItem & { dot?: boolean }

/** Runtime state a `badgeSource` resolver can report for an item. */
export interface NavBadgeState {
  /** Show the unseen dot. */
  dot?: boolean
  /** Hide the item entirely — it has nothing worth navigating to. */
  hidden?: boolean
}

/**
 * Overlay runtime badge state onto the static config.
 *
 * Lives here rather than in the sidebar component so it stays a pure
 * function over plain data — importable by tests without dragging the
 * browser-side React tree in behind it.
 *
 * An item whose source reports `hidden` drops out; one reporting `dot`
 * gets the unseen marker; items with no `badgeSource` pass through
 * untouched. A source that is missing entirely falls OPEN (item shown),
 * so a fork that deletes a resolver gets a working link rather than a
 * silently unreachable route.
 */
export function applyBadges(
  items: NavItem[],
  badges: Record<string, NavBadgeState>
): ResolvedNavItem[] {
  return items.flatMap((item) => {
    if (!item.badgeSource) return [item]
    const state = badges[item.badgeSource]
    if (state?.hidden) return []
    return [{ ...item, dot: state?.dot === true }]
  })
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
      { to: '/dashboard', label: 'Home', icon: House },
      { to: '/dashboard/chat', label: 'AI Chat', icon: Chat, feature: 'chat' },
      { to: '/dashboard/inbox', label: 'Inbox', icon: Tray },
      { to: '/dashboard/jobs', label: 'Batch jobs', icon: Stack, feature: 'batchTasks' },
      { to: '/dashboard/findings', label: 'Findings', icon: Lightbulb, feature: 'findings' },
      { to: '/dashboard/projects', label: 'Projects', icon: Kanban },
      // Hides itself until the first release note is published — see
      // NavBadgeSource. Nothing to configure in a fresh fork.
      {
        to: '/dashboard/updates',
        label: "What's new",
        icon: Megaphone,
        feature: 'updates',
        badgeSource: 'updates',
      },
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
      { to: '/dashboard/skills', label: 'Skills', icon: Lightning, feature: 'skills' },
      { to: '/dashboard/knowledge', label: 'Knowledge', icon: BookOpen, feature: 'knowledge' },
      { to: '/dashboard/agents', label: 'Agents', icon: Robot },
      { to: '/dashboard/admin-chat', label: 'Admin chat', icon: ShieldCheck },
    ],
  },
  {
    // Insights — observability + status, in the Cloudflare-dashboard
    // nested style: ONE icon'd parent (navigates to Observability, the
    // natural overview) with text-only children behind a vertical rail.
    // This is the worked example of `children:` — convert other groups
    // the same way if the CF look suits your fork.
    //
    // Note: Approvals removed as a sidebar entry — they live inside
    // Inbox now (decisions are first-class inbox rows). The route
    // `/dashboard/approvals` still exists for deep links from notifications;
    // it'll fold into a Sheet detail inside Inbox in a follow-up.
    label: 'Insights',
    defaultCollapsed: true,
    items: [
      {
        to: '/dashboard/agent-observability',
        label: 'Insights',
        icon: ChartBar,
        children: [
          { to: '/dashboard/agent-observability', label: 'Observability' },
          { to: '/dashboard/activity', label: 'Activity', feature: 'activity' },
          { to: '/dashboard/admin/access-log', label: 'Access log', minRole: 'admin' },
          { to: '/dashboard/files', label: 'Files', feature: 'files' },
          { to: '/dashboard/artifacts', label: 'Artifacts', feature: 'chat' },
          { to: '/dashboard/extract', label: 'Extract', feature: 'chat' },
          { to: '/dashboard/questions', label: 'Guide questions', feature: 'walkabout' },
        ],
      },
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
      { to: '/dashboard/components', label: 'Components', icon: PuzzlePiece },
      { to: '/dashboard/analytics-demo', label: 'Analytics demo', icon: ChartLine },
      { to: '/dashboard/style-guide', label: 'Style guide', icon: Palette },
      {
        to: '/dashboard/voice-example',
        label: 'Voice example',
        icon: Microphone,
        feature: 'voiceAgent',
        badge: 'Beta',
      },
      {
        to: '/dashboard/video-example',
        label: 'Video example',
        icon: Camera,
        feature: 'videoAgent',
        badge: 'Beta',
      },
      { to: '/dashboard/kanban-demo', label: 'Kanban demo', icon: Kanban, feature: 'kanbanDemo' },
      {
        to: '/dashboard/think-pilot',
        label: 'Think pilot',
        icon: Robot,
        feature: 'thinkPilot',
        badge: 'Beta',
      },
    ],
  },
]
