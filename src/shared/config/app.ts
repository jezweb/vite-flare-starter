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
} as const

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
