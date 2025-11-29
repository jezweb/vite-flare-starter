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
   * Style Guide - Component showcase for development and client demos
   * Automatically enabled in dev mode, can be controlled in production
   */
  styleGuide: import.meta.env['VITE_FEATURE_STYLE_GUIDE'] === 'true' || import.meta.env['DEV'] === true,

  /**
   * Components Page - Full shadcn/ui component showcase
   * Useful for AI agents and human developers to reference available components
   */
  components: isEnabled('VITE_FEATURE_COMPONENTS'),
} as const

export type Features = typeof features
