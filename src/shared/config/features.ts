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

  /** File upload/management */
  files: isEnabled('VITE_FEATURE_FILES'),

  /** Activity audit log */
  activity: isEnabled('VITE_FEATURE_ACTIVITY'),

  /** In-app notifications bell */
  notifications: isEnabled('VITE_FEATURE_NOTIFICATIONS'),

  /** API token management in settings */
  apiTokens: isEnabled('VITE_FEATURE_API_TOKENS'),

  /** Skills dashboard + slash-command activation in chat */
  skills: isEnabled('VITE_FEATURE_SKILLS'),

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
