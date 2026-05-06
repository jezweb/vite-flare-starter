/**
 * Feature Flags Configuration
 *
 * Controls which modules and features are visible in the UI.
 * Module code stays in the repo as reference implementations —
 * these flags just hide them from the sidebar and settings.
 *
 * When forking this starter:
 * - Set VITE_FEATURE_[NAME]=false in .dev.vars to hide modules you don't need
 * - The module code remains available as patterns for Claude Code to reference
 *
 * @see src/shared/config/nav.ts for sidebar item filtering
 */

const isEnabled = (envVar: string): boolean => {
  const value = import.meta.env[envVar]
  return value !== 'false'
}

const isDev = import.meta.env['DEV'] === true

export const features = {
  // ── Module Visibility ──────────────────────────────────────────────────
  // These control whether module pages appear in the sidebar navigation.
  // All enabled by default. Set to false to hide for your product.

  /** AI Chat + Extract pages */
  chat: isEnabled('VITE_FEATURE_CHAT'),

  /**
   * Spaces — multi-user multi-agent rooms (top-level surface).
   * Default ON for forks; opt out by setting VITE_FEATURE_SPACES=false.
   * The supporting REST + DO ship regardless of the flag, but the
   * sidebar entry + page routes hide when the flag is off.
   */
  spaces: isEnabled('VITE_FEATURE_SPACES'),

  /** File upload/management */
  files: isEnabled('VITE_FEATURE_FILES'),

  /** Activity audit log */
  activity: isEnabled('VITE_FEATURE_ACTIVITY'),

  /**
   * Findings + learnings — the agent's "I noticed something" + graduation
   * pipeline (goanna-aligned). Daily reflection routine writes findings
   * via tools; recurring patterns promote to learnings; weekly librarian
   * routine cross-pollinates across agents into shared knowledge.
   * Default ON — disable with VITE_FEATURE_FINDINGS=false if you don't
   * want the surface visible.
   */
  findings: isEnabled('VITE_FEATURE_FINDINGS'),

  /** In-app notifications bell */
  notifications: isEnabled('VITE_FEATURE_NOTIFICATIONS'),

  /**
   * Batch tasks — durable fan-out jobs ("do this for each of these").
   * Default ON. Disabling hides the /dashboard/jobs page + sidebar entry,
   * but the chat tool stays registered (unused if BATCH_WORKFLOW
   * binding is also missing).
   */
  batchTasks: isEnabled('VITE_FEATURE_BATCH_TASKS'),

  /** API token management in settings */
  apiTokens: isEnabled('VITE_FEATURE_API_TOKENS'),

  /** Skills dashboard + slash-command activation in chat */
  skills: isEnabled('VITE_FEATURE_SKILLS'),

  /**
   * Knowledge dashboard — long-form reference documents per user/project/org
   * with always-active or on-demand injection into the chat agent.
   * Sits between memories (small structured facts) and skills (procedures).
   */
  knowledge: isEnabled('VITE_FEATURE_KNOWLEDGE'),

  /** MCP Connectors — per-user OAuth/bearer connections to external MCP servers */
  connectors: isEnabled('VITE_FEATURE_CONNECTORS'),

  /**
   * Voice agent example page (@cloudflare/voice + agents SDK).
   * Default OFF — opt-in by setting VITE_FEATURE_VOICE_AGENT=true.
   * This demo shows the pattern; not every fork needs a voice UI.
   */
  voiceAgent: import.meta.env['VITE_FEATURE_VOICE_AGENT'] === 'true',

  /**
   * Video input agent example page — sampled-frame vision captioning.
   * Default OFF — opt-in by setting VITE_FEATURE_VIDEO_AGENT=true.
   * Complements the voice example; shows the "no SDK mixin, build from
   * primitives" pattern (getUserMedia → canvas → WS → DO → vision model).
   */
  videoAgent: import.meta.env['VITE_FEATURE_VIDEO_AGENT'] === 'true',

  /**
   * Kanban demo — exercises the <KanbanBoard> primitive against the
   * generic entities API. Default OFF — opt-in by setting
   * VITE_FEATURE_KANBAN_DEMO=true. The primitive itself
   * (`src/components/ui/kanban.tsx`) is always available; this flag
   * just controls the demo page + nav entry.
   */
  kanbanDemo: import.meta.env['VITE_FEATURE_KANBAN_DEMO'] === 'true',

  // ── UI Features ────────────────────────────────────────────────────────

  /** Theme/colour picker in preferences */
  themePicker: isEnabled('VITE_FEATURE_THEME_PICKER'),

  // ── Dev Tools ──────────────────────────────────────────────────────────
  // Shown in dev mode by default. Set explicitly to show in production.

  /** Master toggle for dev tool pages */
  devTools: import.meta.env['VITE_FEATURE_DEV_TOOLS'] === 'true' || isDev,

  /** Style guide page */
  styleGuide: import.meta.env['VITE_FEATURE_STYLE_GUIDE'] === 'true' || isDev,

  /** Components showcase page */
  components: isEnabled('VITE_FEATURE_COMPONENTS'),
} as const

export type Features = typeof features
