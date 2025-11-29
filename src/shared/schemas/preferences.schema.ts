import { z } from 'zod'

/**
 * Available shadcn/ui color themes
 * @see https://ui.shadcn.com/themes
 */
export const themeSchemes = [
  'default',
  'blue',
  'green',
  'orange',
  'red',
  'rose',
  'violet',
  'yellow',
] as const

/**
 * Theme display modes
 */
export const themeModes = ['light', 'dark', 'system'] as const

/**
 * Date format options
 */
export const dateFormats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const

/**
 * Time format options
 */
export const timeFormats = ['12h', '24h'] as const

/**
 * User preferences schema
 * Includes appearance settings, timezone, and date/time formatting preferences
 */
export const userPreferencesSchema = z.object({
  // Appearance
  theme: z.enum(themeSchemes),
  mode: z.enum(themeModes),
  // Timezone (IANA timezone ID, e.g., 'Australia/Sydney')
  // null means auto-detect from browser
  timezone: z.string().nullable().optional(),
  // Date/time formatting
  dateFormat: z.enum(dateFormats).optional(),
  timeFormat: z.enum(timeFormats).optional(),
})

/**
 * TypeScript types
 */
export type ThemeScheme = (typeof themeSchemes)[number]
export type ThemeMode = (typeof themeModes)[number]
export type DateFormat = (typeof dateFormats)[number]
export type TimeFormat = (typeof timeFormats)[number]
export type UserPreferences = z.infer<typeof userPreferencesSchema>

/**
 * Default preferences
 * timezone: null means auto-detect from browser
 */
export const defaultPreferences: UserPreferences = {
  theme: 'default',
  mode: 'system',
  timezone: null,
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
}
