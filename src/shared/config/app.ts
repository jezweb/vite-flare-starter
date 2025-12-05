/**
 * Application Configuration
 *
 * Central configuration for app-wide settings that can be customized via environment variables.
 * These are typically used for branding and white-labeling client deployments.
 *
 * Environment variables:
 * - VITE_APP_NAME: Custom application name (default: "Vite Flare Starter")
 *
 * Example .dev.vars:
 * VITE_APP_NAME=My Client App
 */

export const appConfig = {
  /**
   * Application name displayed in sidebar, headers, and landing page
   */
  name: import.meta.env['VITE_APP_NAME'] || 'Vite Flare Starter',
} as const

export type AppConfig = typeof appConfig
