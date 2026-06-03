import {
  themeExportEnvelopeSchema,
  type ThemeScheme,
  type ThemeMode,
  type CustomThemeColors,
  type ThemeExportEnvelope,
} from '@/shared/schemas/preferences.schema'
import { appConfig } from '@/shared/config/app'

/**
 * shadcn/ui Theme Definitions
 *
 * CSS variable values for all 8 pre-built shadcn/ui themes
 * @see https://ui.shadcn.com/themes
 *
 * Each theme has light and dark variants
 * Values are in HSL format (H S% L%)
 */

type ThemeColors = {
  light: Record<string, string>
  dark: Record<string, string>
}

/**
 * Required CSS variable names for a complete theme
 */
export const THEME_CORE_VARIABLES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
] as const

/** Optional — charts and the sidebar surface. Custom themes may set these. */
export const THEME_OPTIONAL_VARIABLES = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
] as const

/** All theme variables (core + optional). Kept for backwards-compat. */
export const THEME_CSS_VARIABLES = [...THEME_CORE_VARIABLES, ...THEME_OPTIONAL_VARIABLES] as const

const themes: Record<ThemeScheme, ThemeColors> = {
  default: {
    light: {
      background: '0 0% 100%',
      foreground: '240 10% 3.9%',
      card: '0 0% 100%',
      'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%',
      'popover-foreground': '240 10% 3.9%',
      primary: '240 5.9% 10%',
      'primary-foreground': '0 0% 98%',
      secondary: '240 4.8% 95.9%',
      'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%',
      'muted-foreground': '240 3.8% 41%',
      accent: '240 4.8% 95.9%',
      'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%',
      input: '240 5.9% 90%',
      ring: '240 5.9% 10%',
    },
    dark: {
      background: '240 10% 3.9%',
      foreground: '0 0% 98%',
      card: '240 10% 3.9%',
      'card-foreground': '0 0% 98%',
      popover: '240 10% 3.9%',
      'popover-foreground': '0 0% 98%',
      primary: '0 0% 98%',
      'primary-foreground': '240 5.9% 10%',
      secondary: '240 3.7% 15.9%',
      'secondary-foreground': '0 0% 98%',
      muted: '240 3.7% 15.9%',
      'muted-foreground': '240 5% 64.9%',
      accent: '240 3.7% 15.9%',
      'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%',
      'destructive-foreground': '0 0% 98%',
      border: '240 3.7% 15.9%',
      input: '240 3.7% 15.9%',
      ring: '240 4.9% 83.9%',
    },
  },
  blue: {
    light: {
      background: '0 0% 100%',
      foreground: '222.2 84% 4.9%',
      card: '0 0% 100%',
      'card-foreground': '222.2 84% 4.9%',
      popover: '0 0% 100%',
      'popover-foreground': '222.2 84% 4.9%',
      primary: '221.2 83.2% 53.3%',
      'primary-foreground': '210 40% 98%',
      secondary: '210 40% 96.1%',
      'secondary-foreground': '222.2 47.4% 11.2%',
      muted: '210 40% 96.1%',
      'muted-foreground': '215.4 16.3% 46.9%',
      accent: '210 40% 96.1%',
      'accent-foreground': '222.2 47.4% 11.2%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '210 40% 98%',
      border: '214.3 31.8% 91.4%',
      input: '214.3 31.8% 91.4%',
      ring: '221.2 83.2% 53.3%',
    },
    dark: {
      background: '222.2 84% 4.9%',
      foreground: '210 40% 98%',
      card: '222.2 84% 4.9%',
      'card-foreground': '210 40% 98%',
      popover: '222.2 84% 4.9%',
      'popover-foreground': '210 40% 98%',
      primary: '217.2 91.2% 59.8%',
      'primary-foreground': '222.2 47.4% 11.2%',
      secondary: '217.2 32.6% 17.5%',
      'secondary-foreground': '210 40% 98%',
      muted: '217.2 32.6% 17.5%',
      'muted-foreground': '215 20.2% 65.1%',
      accent: '217.2 32.6% 17.5%',
      'accent-foreground': '210 40% 98%',
      destructive: '0 62.8% 30.6%',
      'destructive-foreground': '210 40% 98%',
      border: '217.2 32.6% 17.5%',
      input: '217.2 32.6% 17.5%',
      ring: '224.3 76.3% 48%',
    },
  },
  green: {
    light: {
      background: '0 0% 100%',
      foreground: '240 10% 3.9%',
      card: '0 0% 100%',
      'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%',
      'popover-foreground': '240 10% 3.9%',
      primary: '142.1 76.2% 36.3%',
      'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 4.8% 95.9%',
      'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%',
      'muted-foreground': '240 3.8% 41%',
      accent: '240 4.8% 95.9%',
      'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%',
      input: '240 5.9% 90%',
      ring: '142.1 76.2% 36.3%',
    },
    dark: {
      background: '20 14.3% 4.1%',
      foreground: '0 0% 95%',
      card: '24 9.8% 10%',
      'card-foreground': '0 0% 95%',
      popover: '0 0% 9%',
      'popover-foreground': '0 0% 95%',
      primary: '142.1 70.6% 45.3%',
      'primary-foreground': '144.9 80.4% 10%',
      secondary: '240 3.7% 15.9%',
      'secondary-foreground': '0 0% 98%',
      muted: '0 0% 15%',
      'muted-foreground': '240 5% 64.9%',
      accent: '12 6.5% 15.1%',
      'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%',
      'destructive-foreground': '0 85.7% 97.3%',
      border: '240 3.7% 15.9%',
      input: '240 3.7% 15.9%',
      ring: '142.4 71.8% 29.2%',
    },
  },
  orange: {
    light: {
      background: '0 0% 100%',
      foreground: '20 14.3% 4.1%',
      card: '0 0% 100%',
      'card-foreground': '20 14.3% 4.1%',
      popover: '0 0% 100%',
      'popover-foreground': '20 14.3% 4.1%',
      primary: '24.6 95% 53.1%',
      'primary-foreground': '60 9.1% 97.8%',
      secondary: '60 4.8% 95.9%',
      'secondary-foreground': '24 9.8% 10%',
      muted: '60 4.8% 95.9%',
      'muted-foreground': '25 5.3% 44.7%',
      accent: '60 4.8% 95.9%',
      'accent-foreground': '24 9.8% 10%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '60 9.1% 97.8%',
      border: '20 5.9% 90%',
      input: '20 5.9% 90%',
      ring: '24.6 95% 53.1%',
    },
    dark: {
      background: '20 14.3% 4.1%',
      foreground: '60 9.1% 97.8%',
      card: '20 14.3% 4.1%',
      'card-foreground': '60 9.1% 97.8%',
      popover: '20 14.3% 4.1%',
      'popover-foreground': '60 9.1% 97.8%',
      primary: '20.5 90.2% 48.2%',
      'primary-foreground': '60 9.1% 97.8%',
      secondary: '12 6.5% 15.1%',
      'secondary-foreground': '60 9.1% 97.8%',
      muted: '12 6.5% 15.1%',
      'muted-foreground': '24 5.4% 63.9%',
      accent: '12 6.5% 15.1%',
      'accent-foreground': '60 9.1% 97.8%',
      destructive: '0 72.2% 50.6%',
      'destructive-foreground': '60 9.1% 97.8%',
      border: '12 6.5% 15.1%',
      input: '12 6.5% 15.1%',
      ring: '20.5 90.2% 48.2%',
    },
  },
  red: {
    light: {
      background: '0 0% 100%',
      foreground: '0 0% 3.9%',
      card: '0 0% 100%',
      'card-foreground': '0 0% 3.9%',
      popover: '0 0% 100%',
      'popover-foreground': '0 0% 3.9%',
      primary: '0 72.2% 50.6%',
      'primary-foreground': '0 85.7% 97.3%',
      secondary: '0 0% 96.1%',
      'secondary-foreground': '0 0% 9%',
      muted: '0 0% 96.1%',
      'muted-foreground': '0 0% 45.1%',
      accent: '0 0% 96.1%',
      'accent-foreground': '0 0% 9%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '0 0% 98%',
      border: '0 0% 89.8%',
      input: '0 0% 89.8%',
      ring: '0 72.2% 50.6%',
    },
    dark: {
      background: '0 0% 3.9%',
      foreground: '0 0% 98%',
      card: '0 0% 3.9%',
      'card-foreground': '0 0% 98%',
      popover: '0 0% 3.9%',
      'popover-foreground': '0 0% 98%',
      primary: '0 72.2% 50.6%',
      'primary-foreground': '0 85.7% 97.3%',
      secondary: '0 0% 14.9%',
      'secondary-foreground': '0 0% 98%',
      muted: '0 0% 14.9%',
      'muted-foreground': '0 0% 63.9%',
      accent: '0 0% 14.9%',
      'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%',
      'destructive-foreground': '0 0% 98%',
      border: '0 0% 14.9%',
      input: '0 0% 14.9%',
      ring: '0 72.2% 50.6%',
    },
  },
  rose: {
    light: {
      background: '0 0% 100%',
      foreground: '240 10% 3.9%',
      card: '0 0% 100%',
      'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%',
      'popover-foreground': '240 10% 3.9%',
      primary: '346.8 77.2% 49.8%',
      'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 4.8% 95.9%',
      'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%',
      'muted-foreground': '240 3.8% 41%',
      accent: '240 4.8% 95.9%',
      'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%',
      input: '240 5.9% 90%',
      ring: '346.8 77.2% 49.8%',
    },
    dark: {
      background: '20 14.3% 4.1%',
      foreground: '0 0% 95%',
      card: '24 9.8% 10%',
      'card-foreground': '0 0% 95%',
      popover: '0 0% 9%',
      'popover-foreground': '0 0% 95%',
      primary: '346.8 77.2% 49.8%',
      'primary-foreground': '355.7 100% 97.3%',
      secondary: '240 3.7% 15.9%',
      'secondary-foreground': '0 0% 98%',
      muted: '0 0% 15%',
      'muted-foreground': '240 5% 64.9%',
      accent: '12 6.5% 15.1%',
      'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%',
      'destructive-foreground': '0 85.7% 97.3%',
      border: '240 3.7% 15.9%',
      input: '240 3.7% 15.9%',
      ring: '346.8 77.2% 49.8%',
    },
  },
  violet: {
    light: {
      background: '0 0% 100%',
      foreground: '224 71.4% 4.1%',
      card: '0 0% 100%',
      'card-foreground': '224 71.4% 4.1%',
      popover: '0 0% 100%',
      'popover-foreground': '224 71.4% 4.1%',
      primary: '262.1 83.3% 57.8%',
      'primary-foreground': '210 20% 98%',
      secondary: '220 14.3% 95.9%',
      'secondary-foreground': '220.9 39.3% 11%',
      muted: '220 14.3% 95.9%',
      'muted-foreground': '220 8.9% 46.1%',
      accent: '220 14.3% 95.9%',
      'accent-foreground': '220.9 39.3% 11%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '210 20% 98%',
      border: '220 13% 91%',
      input: '220 13% 91%',
      ring: '262.1 83.3% 57.8%',
    },
    dark: {
      background: '224 71.4% 4.1%',
      foreground: '210 20% 98%',
      card: '224 71.4% 4.1%',
      'card-foreground': '210 20% 98%',
      popover: '224 71.4% 4.1%',
      'popover-foreground': '210 20% 98%',
      primary: '263.4 70% 50.4%',
      'primary-foreground': '210 20% 98%',
      secondary: '215 27.9% 16.9%',
      'secondary-foreground': '210 20% 98%',
      muted: '215 27.9% 16.9%',
      'muted-foreground': '217.9 10.6% 64.9%',
      accent: '215 27.9% 16.9%',
      'accent-foreground': '210 20% 98%',
      destructive: '0 62.8% 30.6%',
      'destructive-foreground': '210 20% 98%',
      border: '215 27.9% 16.9%',
      input: '215 27.9% 16.9%',
      ring: '263.4 70% 50.4%',
    },
  },
  yellow: {
    light: {
      background: '0 0% 100%',
      foreground: '20 14.3% 4.1%',
      card: '0 0% 100%',
      'card-foreground': '20 14.3% 4.1%',
      popover: '0 0% 100%',
      'popover-foreground': '20 14.3% 4.1%',
      primary: '47.9 95.8% 53.1%',
      'primary-foreground': '26 83.3% 14.1%',
      secondary: '60 4.8% 95.9%',
      'secondary-foreground': '24 9.8% 10%',
      muted: '60 4.8% 95.9%',
      'muted-foreground': '25 5.3% 44.7%',
      accent: '60 4.8% 95.9%',
      'accent-foreground': '24 9.8% 10%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '60 9.1% 97.8%',
      border: '20 5.9% 90%',
      input: '20 5.9% 90%',
      ring: '20 14.3% 4.1%',
    },
    dark: {
      background: '20 14.3% 4.1%',
      foreground: '60 9.1% 97.8%',
      card: '20 14.3% 4.1%',
      'card-foreground': '60 9.1% 97.8%',
      popover: '20 14.3% 4.1%',
      'popover-foreground': '60 9.1% 97.8%',
      primary: '47.9 95.8% 53.1%',
      'primary-foreground': '26 83.3% 14.1%',
      secondary: '12 6.5% 15.1%',
      'secondary-foreground': '60 9.1% 97.8%',
      muted: '12 6.5% 15.1%',
      'muted-foreground': '24 5.4% 63.9%',
      accent: '12 6.5% 15.1%',
      'accent-foreground': '60 9.1% 97.8%',
      destructive: '0 62.8% 30.6%',
      'destructive-foreground': '60 9.1% 97.8%',
      border: '12 6.5% 15.1%',
      input: '12 6.5% 15.1%',
      ring: '35.5 91.7% 32.9%',
    },
  },
  // Custom theme uses default as fallback, actual colors passed to applyTheme
  custom: {
    light: {
      background: '0 0% 100%',
      foreground: '240 10% 3.9%',
      card: '0 0% 100%',
      'card-foreground': '240 10% 3.9%',
      popover: '0 0% 100%',
      'popover-foreground': '240 10% 3.9%',
      primary: '240 5.9% 10%',
      'primary-foreground': '0 0% 98%',
      secondary: '240 4.8% 95.9%',
      'secondary-foreground': '240 5.9% 10%',
      muted: '240 4.8% 95.9%',
      'muted-foreground': '240 3.8% 41%',
      accent: '240 4.8% 95.9%',
      'accent-foreground': '240 5.9% 10%',
      destructive: '0 84.2% 60.2%',
      'destructive-foreground': '0 0% 98%',
      border: '240 5.9% 90%',
      input: '240 5.9% 90%',
      ring: '240 5.9% 10%',
    },
    dark: {
      background: '240 10% 3.9%',
      foreground: '0 0% 98%',
      card: '240 10% 3.9%',
      'card-foreground': '0 0% 98%',
      popover: '240 10% 3.9%',
      'popover-foreground': '0 0% 98%',
      primary: '0 0% 98%',
      'primary-foreground': '240 5.9% 10%',
      secondary: '240 3.7% 15.9%',
      'secondary-foreground': '0 0% 98%',
      muted: '240 3.7% 15.9%',
      'muted-foreground': '240 5% 64.9%',
      accent: '240 3.7% 15.9%',
      'accent-foreground': '0 0% 98%',
      destructive: '0 62.8% 30.6%',
      'destructive-foreground': '0 0% 98%',
      border: '240 3.7% 15.9%',
      input: '240 3.7% 15.9%',
      ring: '240 4.9% 83.9%',
    },
  },
}

/**
 * Apply theme to DOM
 *
 * Dynamically updates CSS variables on <html> element
 * Handles both color scheme and light/dark mode
 *
 * @param scheme - Theme color scheme (default, blue, green, etc.)
 * @param mode - Light/dark/system mode
 * @param customColors - Optional custom theme colors (for 'custom' scheme)
 */
export function applyTheme(
  scheme: ThemeScheme,
  mode: ThemeMode,
  customColors?: { light?: CustomThemeColors; dark?: CustomThemeColors }
): void {
  const root = document.documentElement

  // Determine effective mode (resolve 'system' to 'light' or 'dark')
  let effectiveMode: 'light' | 'dark' = 'light'

  if (mode === 'system') {
    effectiveMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } else {
    effectiveMode = mode
  }

  // Apply dark class for dark mode
  if (effectiveMode === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // Get theme colors for the effective mode
  // For custom scheme, use provided colors if they have actual data
  let colors: Record<string, string>
  if (scheme === 'custom') {
    const customModeColors = customColors?.[effectiveMode]
    // Only use custom colors if they exist and have content
    if (customModeColors && Object.keys(customModeColors).length > 0) {
      colors = customModeColors as Record<string, string>
    } else {
      // Fall back to default theme if custom colors are empty
      colors = themes['default'][effectiveMode]
    }
  } else {
    colors = themes[scheme][effectiveMode]
  }

  // Clear any inline overrides first so keys the new scheme doesn't set
  // fall back to the :root defaults in index.css (important for chart/sidebar
  // when switching from a custom theme that set them to a preset that doesn't).
  THEME_CSS_VARIABLES.forEach((key) => {
    root.style.removeProperty(`--${key}`)
  })

  // Update CSS variables on :root (wrap with hsl() for Tailwind v4)
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, `hsl(${value})`)
  })

  // Fork-author brand overrides — applied after the preset palette so
  // forks rebrand cleanly without users picking a custom scheme. Only
  // active on the 'default' scheme; if the user has picked Blue/Green/
  // etc. they see that scheme as-is.
  //
  // Accepts any CSS colour value (hsl/oklch/hex/rgb) — passed through
  // verbatim, so the consumer is responsible for valid syntax.
  if (scheme === 'default') {
    if (appConfig.brand.primaryColor) {
      root.style.setProperty('--primary', appConfig.brand.primaryColor)
    }
    if (appConfig.brand.accentColor) {
      root.style.setProperty('--accent', appConfig.brand.accentColor)
    }
  }
}

/**
 * Get theme colors for preview
 *
 * Returns the color values for a specific theme and mode
 * Useful for rendering theme previews in UI
 */
export function getThemeColors(
  scheme: ThemeScheme,
  mode: 'light' | 'dark'
): Record<string, string> {
  return themes[scheme][mode]
}

/**
 * Parse CSS from theme generators into theme colors object
 *
 * Accepts CSS from generators like:
 * - https://tweakcn.com/
 * - https://ui.shadcn.com/themes
 * - https://ui.jln.dev/
 *
 * Handles formats:
 * - :root { --primary: 220 90% 56%; }
 * - :root { --primary: hsl(220 90% 56%); }
 * - :root { --primary: hsl(220, 90%, 56%); }
 * - oklch() format (converted to HSL approximation)
 *
 * @returns Object with light and dark theme colors, or null if parsing failed
 */
export function parseThemeCSS(css: string): {
  light: Partial<CustomThemeColors>
  dark: Partial<CustomThemeColors>
} | null {
  try {
    const result: {
      light: Partial<CustomThemeColors>
      dark: Partial<CustomThemeColors>
    } = { light: {}, dark: {} }

    // Normalize CSS: remove comments, normalize whitespace
    const normalized = css
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\n/g, ' ') // Flatten newlines

    // Extract :root block (light mode)
    const rootMatch = normalized.match(/:root\s*\{([^}]+)\}/i)
    if (rootMatch && rootMatch[1]) {
      const vars = parseVariablesFromBlock(rootMatch[1])
      Object.assign(result.light, vars)
    }

    // Extract .dark block
    const darkMatch = normalized.match(/\.dark\s*\{([^}]+)\}/i)
    if (darkMatch && darkMatch[1]) {
      const vars = parseVariablesFromBlock(darkMatch[1])
      Object.assign(result.dark, vars)
    }

    // Check if we got at least some required variables
    const hasLight = Object.keys(result.light).length > 0
    const hasDark = Object.keys(result.dark).length > 0

    if (!hasLight && !hasDark) {
      return null
    }

    // If only one mode provided, copy to the other (better than nothing)
    if (hasLight && !hasDark) {
      result.dark = { ...result.light }
    } else if (hasDark && !hasLight) {
      result.light = { ...result.dark }
    }

    return result
  } catch (error) {
    console.error('Failed to parse theme CSS:', error)
    return null
  }
}

/**
 * Parse CSS variables from a block of CSS
 */
function parseVariablesFromBlock(block: string): Partial<CustomThemeColors> {
  const result: Partial<CustomThemeColors> = {}

  // Match --variable: value; patterns
  const varRegex = /--([a-z-]+)\s*:\s*([^;]+);?/gi
  let match

  while ((match = varRegex.exec(block)) !== null) {
    const name = match[1]
    const rawValue = match[2]
    if (!name || !rawValue) continue

    const value = rawValue.trim()

    // Skip non-theme variables (like --radius, --chart-*, etc.)
    if (!THEME_CSS_VARIABLES.includes(name as (typeof THEME_CSS_VARIABLES)[number])) {
      continue
    }

    // Parse the color value
    const hslValue = parseColorValue(value)
    if (hslValue) {
      result[name as keyof CustomThemeColors] = hslValue
    }
  }

  return result
}

/**
 * Parse a color value to HSL format (H S% L%)
 *
 * Handles:
 * - Raw HSL: "220 90% 56%"
 * - hsl(): "hsl(220 90% 56%)" or "hsl(220, 90%, 56%)"
 * - oklch(): "oklch(0.7 0.15 250)" (approximate conversion)
 */
function parseColorValue(value: string): string | null {
  const trimmed = value.trim()

  // Already raw HSL format: "220 90% 56%"
  if (/^\d+\.?\d*\s+\d+\.?\d*%\s+\d+\.?\d*%$/.test(trimmed)) {
    return trimmed
  }

  // hsl() format: "hsl(220 90% 56%)" or "hsl(220, 90%, 56%)"
  const hslMatch = trimmed.match(/hsl\(\s*([^)]+)\s*\)/i)
  if (hslMatch && hslMatch[1]) {
    // Normalize commas to spaces and clean up
    const inner = hslMatch[1].replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
    // Validate it looks like HSL values
    if (/^\d+\.?\d*\s+\d+\.?\d*%?\s+\d+\.?\d*%?$/.test(inner)) {
      // Ensure percentages have % symbol
      const parts = inner.split(' ')
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const h = parts[0]
        const s = parts[1].endsWith('%') ? parts[1] : `${parts[1]}%`
        const l = parts[2].endsWith('%') ? parts[2] : `${parts[2]}%`
        return `${h} ${s} ${l}`
      }
    }
    return inner
  }

  // oklch() format: "oklch(0.7 0.15 250)" - approximate conversion to HSL
  const oklchMatch = trimmed.match(/oklch\(\s*([^)]+)\s*\)/i)
  if (oklchMatch && oklchMatch[1]) {
    const parts = oklchMatch[1].replace(/,/g, ' ').replace(/\s+/g, ' ').trim().split(' ')
    if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
      // Very rough oklch to HSL approximation
      // L (lightness): 0-1 maps to 0-100%
      // C (chroma): affects saturation (0-0.4 range typically)
      // H (hue): same concept, 0-360
      const l = parseFloat(parts[0]) * 100 // Lightness percentage
      const c = parseFloat(parts[1])
      const h = parseFloat(parts[2])
      // Rough saturation estimate from chroma (chroma 0.15 ≈ 60% saturation)
      const s = Math.min(100, c * 400)
      return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`
    }
  }

  return null
}

/**
 * Validate that parsed colors have all required (core) variables.
 * Chart and sidebar vars are optional — their absence doesn't fail validation.
 */
export function validateThemeColors(colors: Partial<CustomThemeColors>): {
  valid: boolean
  missing: string[]
} {
  const missing = THEME_CORE_VARIABLES.filter((v) => !colors[v as keyof CustomThemeColors])
  return {
    valid: missing.length === 0,
    missing,
  }
}

/**
 * Get template CSS for custom themes
 * Useful for showing users what format to paste
 */
export function getThemeCSSTemplate(): string {
  return `:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 240 10% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 240 4.9% 83.9%;
}`
}

// ─────────────────────────────────────────────────────────────────────────
// Theme export / import (JSON files + shareable URLs)
// ─────────────────────────────────────────────────────────────────────────

export const THEME_EXPORT_FILENAME = 'vfs-theme.json'
export const THEME_EXPORT_MIME = 'application/json'

/**
 * Merge a possibly-partial imported envelope with a base (the user's current
 * custom theme if any, otherwise the default theme) so we always produce a
 * complete 19-key CustomThemeColors on both sides. Lets shared links carry
 * just the vars that differ — handy for "share my primary" links.
 */
export function mergeThemeEnvelope(
  envelope: { light?: Partial<CustomThemeColors>; dark?: Partial<CustomThemeColors> },
  base?: { light?: CustomThemeColors; dark?: CustomThemeColors }
): { light: CustomThemeColors; dark: CustomThemeColors } {
  const baseLight = (base?.light ?? themes['default'].light) as unknown as CustomThemeColors
  const baseDark = (base?.dark ?? themes['default'].dark) as unknown as CustomThemeColors
  const fromEnvLight = envelope.light ?? envelope.dark ?? {}
  const fromEnvDark = envelope.dark ?? envelope.light ?? {}
  return {
    light: { ...baseLight, ...fromEnvLight } as CustomThemeColors,
    dark: { ...baseDark, ...fromEnvDark } as CustomThemeColors,
  }
}

/**
 * Build an export envelope from the user's current custom theme colours.
 * Either mode can be omitted — callers commonly have both.
 */
export function buildThemeExport(
  customTheme:
    | { light?: Partial<CustomThemeColors>; dark?: Partial<CustomThemeColors> }
    | undefined,
  name?: string
): ThemeExportEnvelope {
  return {
    version: 1,
    ...(name ? { name } : {}),
    createdAt: new Date().toISOString(),
    ...(customTheme?.light ? { light: customTheme.light } : {}),
    ...(customTheme?.dark ? { dark: customTheme.dark } : {}),
  }
}

/**
 * Serialize an export envelope to pretty JSON (for file download)
 */
export function serializeThemeExport(envelope: ThemeExportEnvelope): string {
  return JSON.stringify(envelope, null, 2)
}

/**
 * Parse an import JSON string into an envelope. Returns a discriminated result
 * so callers can show targeted error messages.
 */
export function parseThemeImport(
  json: string
): { ok: true; envelope: ThemeExportEnvelope } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }

  const parsed = themeExportEnvelopeSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first?.path.join('.') || 'envelope'
    return { ok: false, error: `${path}: ${first?.message ?? 'invalid shape'}` }
  }

  if (!parsed.data.light && !parsed.data.dark) {
    return { ok: false, error: 'Envelope is missing both light and dark colours.' }
  }

  return { ok: true, envelope: parsed.data }
}

/**
 * Encode an envelope into a URL-safe base64 string (for ?theme=<…>)
 *
 * No compression yet — a custom theme fits in ~2KB base64, well under the
 * browser URL limit. If we ever need shorter, swap in lz-string here.
 */
export function encodeThemeToURL(envelope: ThemeExportEnvelope): string {
  const json = JSON.stringify(envelope)
  const b64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, 'utf-8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decode an envelope from a URL-safe base64 string. Safe to call with
 * untrusted input; returns an error rather than throwing.
 */
export function decodeThemeFromURL(
  encoded: string
): { ok: true; envelope: ThemeExportEnvelope } | { ok: false; error: string } {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(escape(atob(b64 + pad)))
        : Buffer.from(b64 + pad, 'base64').toString('utf-8')
    return parseThemeImport(json)
  } catch {
    return { ok: false, error: 'Theme link is corrupt or incomplete.' }
  }
}
