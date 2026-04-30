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
 *
 * The 19 core vars are required — every custom theme sets these.
 * The 13 chart + sidebar vars are optional — included by themes that
 * want to style those surfaces, left undefined otherwise (the app
 * falls back to whatever index.css :root defines).
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
  'chart-1': z.string().optional(),
  'chart-2': z.string().optional(),
  'chart-3': z.string().optional(),
  'chart-4': z.string().optional(),
  'chart-5': z.string().optional(),
  sidebar: z.string().optional(),
  'sidebar-foreground': z.string().optional(),
  'sidebar-primary': z.string().optional(),
  'sidebar-primary-foreground': z.string().optional(),
  'sidebar-accent': z.string().optional(),
  'sidebar-accent-foreground': z.string().optional(),
  'sidebar-border': z.string().optional(),
  'sidebar-ring': z.string().optional(),
})

export type CustomThemeColors = z.infer<typeof customThemeColorsSchema>

/**
 * Theme export envelope — the on-disk / over-the-wire format for custom themes
 *
 * Versioned so future schema changes don't break older files or shared URLs.
 * Used by file export/import and the shareable URL (?theme=<base64>).
 */
export const themeExportEnvelopeSchema = z.object({
  version: z.literal(1),
  name: z.string().max(80).optional(),
  createdAt: z.string().optional(),
  light: customThemeColorsSchema.partial().optional(),
  dark: customThemeColorsSchema.partial().optional(),
})

export type ThemeExportEnvelope = z.infer<typeof themeExportEnvelopeSchema>

/**
 * Onboarding state — see gh #44
 *
 * `version` lets us re-show the checklist after a meaningful catalogue
 * change (e.g. a new must-do step). Bump it in code; existing dismissed
 * users will see the shelf again.
 */
export const onboardingStateSchema = z
  .object({
    version: z.number().int().nonnegative().default(1),
    dismissed: z.boolean().optional(),
  })
  .optional()

/**
 * One-time-tour state — see gh #46. Map of tour-id → 'seen'.
 */
export const toursStateSchema = z
  .object({
    chat: z.literal('seen').optional(),
  })
  .optional()

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
  // Onboarding (gh #44)
  onboarding: onboardingStateSchema,
  // First-run tours (gh #46)
  tours: toursStateSchema,
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
 * Get default theme from environment variable or fallback to 'default'
 */
const getDefaultTheme = (): ThemeScheme => {
  const envTheme = import.meta.env['VITE_DEFAULT_THEME']
  if (envTheme && themeSchemes.includes(envTheme as ThemeScheme)) {
    return envTheme as ThemeScheme
  }
  return 'default'
}

/**
 * Default preferences
 * theme: can be set via VITE_DEFAULT_THEME environment variable
 * timezone: null means auto-detect from browser
 */
export const defaultPreferences: UserPreferences = {
  theme: getDefaultTheme(),
  mode: 'system',
  timezone: null,
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
}
