/**
 * Application Constants
 *
 * Centralized configuration for limits, timeouts, and other constants.
 * These provide sensible defaults that can be referenced throughout the app.
 *
 * Note: Some of these can be overridden via environment variables in specific modules.
 */

/**
 * Session Configuration
 */
export const SESSION = {
  /** Session expiration time in seconds (default: 7 days) */
  EXPIRES_IN: 60 * 60 * 24 * 7,

  /** How often session should be refreshed in seconds (default: 24 hours) */
  UPDATE_AGE: 60 * 60 * 24,
} as const

/**
 * Avatar Upload Configuration
 */
export const AVATAR = {
  /** Maximum file size in bytes (default: 5MB) */
  MAX_SIZE_BYTES: 5 * 1024 * 1024,

  /** Maximum file size for display (human readable) */
  MAX_SIZE_DISPLAY: '5MB',

  /** Allowed MIME types for avatar uploads */
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,

  /** File extensions to check when serving avatars */
  EXTENSIONS: ['jpg', 'jpeg', 'png', 'webp'] as const,

  /** Target dimensions for avatar resize (client-side) */
  DIMENSIONS: {
    WIDTH: 512,
    HEIGHT: 512,
  },

  /** JPEG compression quality (0-1) */
  QUALITY: 0.9,

  /** Cache duration for served avatars (default: 1 year, immutable) */
  CACHE_MAX_AGE: 31536000,
} as const

/**
 * API Token Configuration
 *
 * Note: Token PREFIX is now configurable via VITE_TOKEN_PREFIX env var.
 * See src/shared/config/app.ts for branding configuration.
 */
export const API_TOKEN = {
  /** Number of random bytes for token generation */
  BYTE_LENGTH: 32,

  /** Number of characters to show in masked display */
  DISPLAY_LENGTH: 12,
} as const

/**
 * Rate Limiting (for future implementation)
 */
export const RATE_LIMITS = {
  /** Password change attempts per 24 hours */
  PASSWORD_CHANGE: 3,

  /** Email change attempts per 24 hours */
  EMAIL_CHANGE: 5,

  /** Account deletion attempts per 24 hours */
  ACCOUNT_DELETION: 1,

  /** Avatar uploads per hour */
  AVATAR_UPLOAD: 10,

  /** API token creations per day */
  TOKEN_CREATION: 10,

  /** AI chat requests per hour (cost protection) */
  CHAT: 60,

  /** Structured extraction requests per hour */
  EXTRACT: 30,

  /** Voice transcribe + TTS requests per hour (3rd-party spend protection) */
  VOICE: 60,

  /** AI-Sparkle skill rewrites per hour (one OPENROUTER_API_KEY call each) */
  SKILL_AI_EDIT: 20,

  /** Walkabout Guide questions per hour (one AI call each) */
  WALKABOUT_ASK: 40,
} as const

/**
 * Query/Cache Configuration
 */
export const CACHE = {
  /** Stale time for user preferences queries (default: 5 minutes) */
  PREFERENCES_STALE_TIME: 5 * 60 * 1000,
} as const

/**
 * Test-auth email pattern (security primitive).
 *
 * Headless agents mint sessions only for emails matching this shape, so
 * the test-auth endpoints can never take over a real account. Two call
 * sites depend on it and MUST agree, so it lives here as one source of
 * truth: (1) the /api/test-auth/cookies validator, (2) the signup
 * allowlist gate, which bypasses these emails when TEST_AUTH_TOKEN is set
 * so headless tests work even behind an active allowlist (#88, #91).
 *
 * `.local` TLD is reserved and unroutable, so these addresses can never
 * receive mail or correspond to a real inbox.
 */
export const TEST_EMAIL_PATTERN = /^[a-z0-9._-]+@test\.[a-z0-9.-]+\.local$/i

/**
 * Application Version
 * Read from package.json at build time via Vite. In Node contexts
 * (drizzle-kit generating migrations) the global isn't defined, so
 * guard the access — falls back to '0.0.0' there.
 */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

// Declare the global for TypeScript
declare const __APP_VERSION__: string | undefined
