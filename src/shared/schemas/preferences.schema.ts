import { z } from 'zod'

/**
 * Available shadcn/ui color themes
 * @see https://ui.shadcn.com/themes
 *
 * 'custom' allows users to paste CSS from theme generators like:
 * - https://tweakcn.com/
 * - https://ui.shadcn.com/themes
 * - https://ui.jln.dev/
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
  'custom',
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
 * Custom theme colors schema
 * HSL values without the hsl() wrapper, e.g., "220 90% 56%"
 */
export const customThemeColorsSchema = z.object({
  background: z.string(),
  foreground: z.string(),
  card: z.string(),
  'card-foreground': z.string(),
  popover: z.string(),
  'popover-foreground': z.string(),
  primary: z.string(),
  'primary-foreground': z.string(),
  secondary: z.string(),
  'secondary-foreground': z.string(),
  muted: z.string(),
  'muted-foreground': z.string(),
  accent: z.string(),
  'accent-foreground': z.string(),
  destructive: z.string(),
  'destructive-foreground': z.string(),
  border: z.string(),
  input: z.string(),
  ring: z.string(),
})

export type CustomThemeColors = z.infer<typeof customThemeColorsSchema>

/**
 * User preferences schema
 * Includes appearance settings, timezone, and date/time formatting preferences
 */
export const userPreferencesSchema = z.object({
  // Appearance
  theme: z.enum(themeSchemes),
  mode: z.enum(themeModes),
  // Custom theme colors (only used when theme === 'custom')
  customTheme: z
    .object({
      light: customThemeColorsSchema.optional(),
      dark: customThemeColorsSchema.optional(),
    })
    .optional(),
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
