/**
 * Feature Flags Configuration
 *
 * Controls which features/modules are enabled in the application.
 * This allows for easy customization when building your app.
 *
 * To disable a feature:
 * - In development: Set VITE_FEATURE_[NAME]=false in .dev.vars
 * - In production: Set VITE_FEATURE_[NAME]=false in wrangler.jsonc vars
 *
 * Example .dev.vars:
 * VITE_FEATURE_STYLE_GUIDE=false   # Hide style guide in production
 */

// Helper function to check feature flag
// Returns true by default, false only if explicitly set to 'false'
const isEnabled = (envVar: string): boolean => {
  const value = import.meta.env[envVar]
  return value !== 'false'
}

export const features = {
  /**
   * Development Tools
   */

  /**
   * Dev Tools - Show development pages (Components, Style Guide) in sidebar
   * Automatically enabled in dev mode, can be controlled in production
   * Set VITE_FEATURE_DEV_TOOLS=false to hide in production
   */
  devTools: import.meta.env['VITE_FEATURE_DEV_TOOLS'] === 'true' || import.meta.env['DEV'] === true,

  /**
   * Style Guide - Component showcase for development and client demos
   * Automatically enabled in dev mode, can be controlled in production
   */
  styleGuide: import.meta.env['VITE_FEATURE_STYLE_GUIDE'] === 'true' || import.meta.env['DEV'] === true,

  /**
   * Components Page - Full shadcn/ui component showcase
   * Useful for AI agents and human developers to reference available components
   */
  components: isEnabled('VITE_FEATURE_COMPONENTS'),

  /**
   * User Preferences
   */

  /**
   * Theme Picker - Allow users to change color theme
   * Set to false to lock users to the default theme (for branded client sites)
   * Default theme is set in src/shared/schemas/preferences.schema.ts
   */
  themePicker: isEnabled('VITE_FEATURE_THEME_PICKER'),

  /**
   * Settings Tabs
   */

  /**
   * API Tokens - Allow users to manage API tokens in settings
   * Set to false to hide API token management (power user feature)
   */
  apiTokens: isEnabled('VITE_FEATURE_API_TOKENS'),
} as const

export type Features = typeof features
