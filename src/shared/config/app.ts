/**
 * Application Configuration
 *
 * Central configuration for app-wide settings that can be customized via environment variables.
 * These are typically used for branding and white-labeling client deployments.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️  SECURITY: REBRAND BEFORE PRODUCTION DEPLOYMENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The default values in this file identify your site as using "Vite Flare Starter".
 * An attacker could use these markers to:
 *   1. Identify the framework and look for known vulnerabilities
 *   2. Use framework-specific attack vectors
 *   3. Target multiple sites using the same starter kit
 *
 * BEFORE deploying to production, set these environment variables:
 *
 *   VITE_APP_NAME=Your App Name
 *   VITE_APP_ID=yourapp                    # Used for storage keys, Sentry, etc.
 *   VITE_TOKEN_PREFIX=yap_                 # 3-4 chars + underscore (e.g., "yap_")
 *   VITE_GITHUB_URL=                       # Leave empty to hide GitHub links
 *   VITE_FOOTER_TEXT=© 2025 Your Company   # Custom footer text
 *
 * Also update index.html:
 *   - <title>Your App Name</title>
 *   - <meta name="title" content="Your App Name" />
 *   - <meta name="description" content="Your app description" />
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const appConfig = {
  /**
   * Application name displayed in sidebar, headers, and landing page
   * @env VITE_APP_NAME
   */
  name: import.meta.env['VITE_APP_NAME'] || 'Vite Flare Starter',

  /**
   * Short application identifier used for:
   * - localStorage keys (e.g., "yourapp-theme")
   * - Sentry release names (e.g., "yourapp@1.0.0")
   * - Other internal identifiers
   *
   * Should be lowercase, no spaces, URL-safe (e.g., "myapp", "clientname")
   * @env VITE_APP_ID
   */
  id: import.meta.env['VITE_APP_ID'] || 'vite-flare-starter',

  /**
   * API token prefix for generated tokens
   * Format: 3-4 lowercase chars + underscore (e.g., "myapp_", "abc_")
   *
   * This appears in Authorization headers and should not reveal framework identity.
   * @env VITE_TOKEN_PREFIX
   */
  tokenPrefix: import.meta.env['VITE_TOKEN_PREFIX'] || 'vfs_',

  /**
   * GitHub repository URL for "View Source" links
   * Set to empty string to hide GitHub links on landing page
   * @env VITE_GITHUB_URL
   */
  githubUrl: import.meta.env['VITE_GITHUB_URL'] || 'https://github.com/jezweb/vite-flare-starter',

  /**
   * Footer text for public pages
   * @env VITE_FOOTER_TEXT
   */
  footerText: import.meta.env['VITE_FOOTER_TEXT'] || '',

  /**
   * Optional logo URL (PNG / SVG / etc.) shown in the sidebar header
   * + landing page header. When set, replaces the auto-generated
   * initial-letter badge with a real image.
   *
   *   VITE_APP_LOGO_URL=/logo.png             (drop the file in public/)
   *   VITE_APP_LOGO_URL=https://cdn.../logo.svg
   *
   * Leave empty to fall back to the initial-letter badge. Acts as the
   * fallback when `logos.sidebar` / `logos.signIn` are not set.
   * @env VITE_APP_LOGO_URL
   */
  logoUrl: import.meta.env['VITE_APP_LOGO_URL'] || '',

  /**
   * Per-surface logo set. Different surfaces want different aspect
   * ratios — a single `logoUrl` can't drive all of them well. Set the
   * ones you have; consumers fall back to `logoUrl` then to the
   * auto-generated initial-letter badge.
   *
   *   sidebar — small / icon, ~32px (square crops well)
   *   signIn  — wordmark for sign-in / landing hero (wide-format)
   *   favicon — browser tab icon (set in index.html, surfaced here for docs)
   *   og      — 1200×630 social sharing preview
   *
   * @env VITE_APP_LOGO_SIDEBAR
   * @env VITE_APP_LOGO_SIGNIN
   * @env VITE_APP_LOGO_FAVICON
   * @env VITE_APP_LOGO_OG
   */
  logos: {
    sidebar: import.meta.env['VITE_APP_LOGO_SIDEBAR'] || '',
    signIn: import.meta.env['VITE_APP_LOGO_SIGNIN'] || '',
    favicon: import.meta.env['VITE_APP_LOGO_FAVICON'] || '',
    og: import.meta.env['VITE_APP_LOGO_OG'] || '',
  },

  /**
   * Default theme mode for first-time visitors (before they pick a
   * preference). One of `'light'`, `'dark'`, `'system'`. Stored choice
   * in localStorage takes precedence — this only fires on first paint.
   *
   * @env VITE_DEFAULT_THEME_MODE — one of light | dark | system. Default 'system'.
   */
  defaultThemeMode:
    (import.meta.env['VITE_DEFAULT_THEME_MODE'] as 'light' | 'dark' | 'system' | undefined) ||
    'system',

  /**
   * Brand colours that override the 'default' palette's --primary and
   * --accent. Use any CSS colour value (`hsl(220 90% 56%)`,
   * `oklch(0.55 0.15 240)`, `#ff6600`, `rgb(255 102 0)`).
   *
   * Wired in `src/lib/themes.ts` — applied AFTER the preset palette so
   * forks rebrand cleanly without users needing to pick a custom theme.
   * Users who pick a different scheme from the theme picker (e.g. "Blue",
   * "Green") still see that scheme; only the 'default' scheme picks up
   * these brand overrides.
   *
   * Leave both empty for the unbranded slate-grey starter look.
   *
   * @env VITE_APP_PRIMARY_COLOR — overrides --primary on default scheme
   * @env VITE_APP_ACCENT_COLOR  — overrides --accent on default scheme
   */
  brand: {
    primaryColor: import.meta.env['VITE_APP_PRIMARY_COLOR'] || '',
    accentColor: import.meta.env['VITE_APP_ACCENT_COLOR'] || '',
  },
} as const

/**
 * Resolve the logo URL for a given surface, falling back through:
 *
 *   1. The surface-specific override (e.g. logos.sidebar)
 *   2. The legacy `logoUrl` (kept for backward compatibility)
 *   3. Empty string — consumer should render an initial-letter badge or
 *      product name as wordmark.
 *
 * Returns '' when nothing is set, so consumers can use a truthy check.
 */
export function getLogoUrl(surface: 'sidebar' | 'signIn' | 'favicon' | 'og'): string {
  return appConfig.logos[surface] || appConfig.logoUrl || ''
}

/**
 * Get the theme storage key for localStorage
 * Uses app ID to avoid conflicts and hide framework identity
 */
export function getThemeStorageKey(): string {
  return `${appConfig.id}-theme`
}

/**
 * Get the Sentry release identifier
 * Format: appId@version
 */
export function getSentryRelease(version: string): string {
  return `${appConfig.id}@${version}`
}

export type AppConfig = typeof appConfig
