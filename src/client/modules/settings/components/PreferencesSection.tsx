import { useEffect, useMemo, useState } from 'react'
import {
  Moon,
  Sun,
  Monitor,
  Palette,
  Globe,
  Clock,
  Calendar,
  ExternalLink,
  Wand2,
  AlertCircle,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { usePreferences, useUpdatePreferences } from '../hooks/useSettings'
import { applyTheme, parseThemeCSS, validateThemeColors } from '@/lib/themes'
import {
  defaultPreferences,
  dateFormats,
  timeFormats,
  type DateFormat,
  type TimeFormat,
  type CustomThemeColors,
} from '@/shared/schemas/preferences.schema'
import type { ThemeScheme, ThemeMode } from '@/shared/schemas/preferences.schema'
import {
  COMMON_TIMEZONES,
  getBrowserTimezone,
  getTimezoneAbbreviation,
  formatTimeInTimezone,
} from '@/lib/timezones'
import { features } from '@/shared/config/features'

type ModeOption = {
  value: ThemeMode
  label: string
  icon: React.ReactNode
}

type SchemeOption = {
  value: ThemeScheme
  label: string
  description: string
  preview: {
    primary: string
    background: string
    accent: string
  }
}

const modeOptions: ModeOption[] = [
  { value: 'light', label: 'Light', icon: <Sun className="h-5 w-5" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="h-5 w-5" /> },
  { value: 'system', label: 'System', icon: <Monitor className="h-5 w-5" /> },
]

// Built-in theme options (excludes 'custom' which is handled separately)
const schemeOptions: SchemeOption[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Neutral gray tones',
    preview: { primary: '#18181b', background: '#ffffff', accent: '#f4f4f5' },
  },
  {
    value: 'blue',
    label: 'Blue',
    description: 'Professional blue',
    preview: { primary: '#3b82f6', background: '#ffffff', accent: '#dbeafe' },
  },
  {
    value: 'green',
    label: 'Green',
    description: 'Natural green',
    preview: { primary: '#22c55e', background: '#ffffff', accent: '#dcfce7' },
  },
  {
    value: 'orange',
    label: 'Orange',
    description: 'Warm orange',
    preview: { primary: '#f97316', background: '#ffffff', accent: '#ffedd5' },
  },
  {
    value: 'red',
    label: 'Red',
    description: 'Bold red',
    preview: { primary: '#ef4444', background: '#ffffff', accent: '#fee2e2' },
  },
  {
    value: 'rose',
    label: 'Rose',
    description: 'Elegant rose',
    preview: { primary: '#f43f5e', background: '#ffffff', accent: '#ffe4e6' },
  },
  {
    value: 'violet',
    label: 'Violet',
    description: 'Royal violet',
    preview: { primary: '#8b5cf6', background: '#ffffff', accent: '#ede9fe' },
  },
  {
    value: 'yellow',
    label: 'Yellow',
    description: 'Bright yellow',
    preview: { primary: '#eab308', background: '#ffffff', accent: '#fef9c3' },
  },
]

// Theme generator links for custom themes
const THEME_GENERATORS = [
  { name: 'tweakcn', url: 'https://tweakcn.com/', description: 'Modern editor with OKLch support' },
  { name: 'shadcn/ui Themes', url: 'https://ui.shadcn.com/themes', description: 'Official hand-picked themes' },
  { name: '10000+ Themes', url: 'https://ui.jln.dev/', description: 'Browse community themes' },
]

export function PreferencesSection() {
  const { data: preferences, isLoading } = usePreferences()
  const updatePreferences = useUpdatePreferences()

  // Use current preferences or defaults
  const currentPrefs = preferences || defaultPreferences
  const currentScheme = currentPrefs.theme
  const currentMode = currentPrefs.mode
  const currentTimezone = currentPrefs.timezone || getBrowserTimezone()
  const currentDateFormat = currentPrefs.dateFormat || defaultPreferences.dateFormat
  const currentTimeFormat = currentPrefs.timeFormat || defaultPreferences.timeFormat

  // Current time state for live preview
  const [currentTime, setCurrentTime] = useState(new Date())

  // Custom theme dialog state
  const [customThemeDialogOpen, setCustomThemeDialogOpen] = useState(false)
  const [customCSSInput, setCustomCSSInput] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseSuccess, setParseSuccess] = useState(false)

  // Update current time every minute for live preview
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  // Group timezones by region for the dropdown
  const timezonesByRegion = useMemo(() => {
    const regions: Record<string, typeof COMMON_TIMEZONES> = {}
    for (const tz of COMMON_TIMEZONES) {
      if (!regions[tz.region]) {
        regions[tz.region] = []
      }
      regions[tz.region]!.push(tz)
    }
    return regions
  }, [])

  // Apply theme on preferences change
  useEffect(() => {
    if (currentPrefs) {
      applyTheme(currentPrefs.theme, currentPrefs.mode, currentPrefs.customTheme)
    }
  }, [currentPrefs])

  // Handle custom theme CSS parsing and application
  const handleParseCustomCSS = () => {
    setParseError(null)
    setParseSuccess(false)

    if (!customCSSInput.trim()) {
      setParseError('Please paste some CSS')
      return
    }

    const parsed = parseThemeCSS(customCSSInput)
    if (!parsed) {
      setParseError('Could not parse CSS. Make sure it contains :root or .dark blocks with --variable definitions.')
      return
    }

    // Validate light mode colors
    const lightValidation = validateThemeColors(parsed.light)
    const darkValidation = validateThemeColors(parsed.dark)

    if (!lightValidation.valid && !darkValidation.valid) {
      setParseError(
        `Missing required variables: ${lightValidation.missing.slice(0, 5).join(', ')}${lightValidation.missing.length > 5 ? '...' : ''}`
      )
      return
    }

    setParseSuccess(true)
  }

  // Apply the parsed custom theme
  const handleApplyCustomTheme = async () => {
    const parsed = parseThemeCSS(customCSSInput)
    if (!parsed) return

    const customTheme = {
      light: parsed.light as CustomThemeColors,
      dark: parsed.dark as CustomThemeColors,
    }

    // Apply theme immediately for instant visual feedback
    applyTheme('custom', currentMode, customTheme)

    try {
      await updatePreferences.mutateAsync({
        ...currentPrefs,
        theme: 'custom',
        customTheme,
      })
      setCustomThemeDialogOpen(false)
      setCustomCSSInput('')
      setParseError(null)
      setParseSuccess(false)
    } catch (error) {
      console.error('Failed to apply custom theme:', error)
      // Revert to previous theme on error
      applyTheme(currentPrefs.theme, currentMode, currentPrefs.customTheme)
      setParseError('Failed to save custom theme. Please try again.')
    }
  }

  // Handle mode change
  const handleModeChange = async (mode: ThemeMode) => {
    try {
      await updatePreferences.mutateAsync({
        ...currentPrefs,
        mode,
      })
      // applyTheme will be called via useEffect after mutation succeeds
    } catch (error) {
      console.error('Failed to update mode:', error)
    }
  }

  // Handle scheme change
  const handleSchemeChange = async (scheme: ThemeScheme) => {
    try {
      await updatePreferences.mutateAsync({
        ...currentPrefs,
        theme: scheme,
      })
      // applyTheme will be called via useEffect after mutation succeeds
    } catch (error) {
      console.error('Failed to update theme:', error)
    }
  }

  // Handle timezone change
  const handleTimezoneChange = async (timezone: string) => {
    try {
      await updatePreferences.mutateAsync({
        ...currentPrefs,
        timezone,
      })
    } catch (error) {
      console.error('Failed to update timezone:', error)
    }
  }

  // Handle date format change
  const handleDateFormatChange = async (dateFormat: DateFormat) => {
    try {
      await updatePreferences.mutateAsync({
        ...currentPrefs,
        dateFormat,
      })
    } catch (error) {
      console.error('Failed to update date format:', error)
    }
  }

  // Handle time format change
  const handleTimeFormatChange = async (timeFormat: TimeFormat) => {
    try {
      await updatePreferences.mutateAsync({
        ...currentPrefs,
        timeFormat,
      })
    } catch (error) {
      console.error('Failed to update time format:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading preferences...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Color Scheme Selector - hidden when themePicker feature is disabled */}
      {features.themePicker && (
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Color Theme
            </div>
          </CardTitle>
          <CardDescription>
            Choose your preferred color scheme for the interface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {schemeOptions.map((scheme) => (
              <button
                key={scheme.value}
                onClick={() => handleSchemeChange(scheme.value)}
                disabled={updatePreferences.isPending}
                className={cn(
                  'group relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all hover:bg-accent',
                  currentScheme === scheme.value
                    ? 'border-primary bg-accent'
                    : 'border-muted hover:border-muted-foreground/50'
                )}
              >
                {/* Color preview circles */}
                <div className="flex gap-1.5">
                  <div
                    className="h-5 w-5 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: scheme.preview.primary }}
                  />
                  <div
                    className="h-5 w-5 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: scheme.preview.accent }}
                  />
                  <div
                    className="h-5 w-5 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: scheme.preview.background }}
                  />
                </div>

                {/* Label and description */}
                <div className="flex-1">
                  <div className="font-semibold">{scheme.label}</div>
                  <div className="text-xs text-muted-foreground">{scheme.description}</div>
                </div>

                {/* Active indicator */}
                {currentScheme === scheme.value && (
                  <div className="absolute right-3 top-3">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                )}
              </button>
            ))}

            {/* Custom Theme Option */}
            <Dialog open={customThemeDialogOpen} onOpenChange={setCustomThemeDialogOpen}>
              <DialogTrigger asChild>
                <button
                  className={cn(
                    'group relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all hover:bg-accent',
                    currentScheme === 'custom'
                      ? 'border-primary bg-accent'
                      : 'border-dashed border-muted hover:border-muted-foreground/50'
                  )}
                >
                  {/* Custom icon */}
                  <div className="flex gap-1.5 items-center">
                    <Wand2 className="h-5 w-5 text-muted-foreground" />
                  </div>

                  {/* Label and description */}
                  <div className="flex-1">
                    <div className="font-semibold">Custom</div>
                    <div className="text-xs text-muted-foreground">
                      {currentScheme === 'custom' ? 'Your custom theme' : 'Import from generator'}
                    </div>
                  </div>

                  {/* Active indicator */}
                  {currentScheme === 'custom' && (
                    <div className="absolute right-3 top-3">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                </button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Wand2 className="h-5 w-5" />
                    Import Custom Theme
                  </DialogTitle>
                  <DialogDescription>
                    Paste CSS from a theme generator. Supports HSL, hsl(), and oklch() formats.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Theme generator links */}
                  <div className="flex flex-wrap gap-2">
                    {THEME_GENERATORS.map((gen) => (
                      <a
                        key={gen.name}
                        href={gen.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {gen.name}
                      </a>
                    ))}
                  </div>

                  {/* CSS Input */}
                  <Textarea
                    placeholder={`:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 220 90% 56%;
  /* ... more variables */
}

.dark {
  --background: 240 10% 3.9%;
  /* ... dark mode variables */
}`}
                    value={customCSSInput}
                    onChange={(e) => {
                      setCustomCSSInput(e.target.value)
                      setParseError(null)
                      setParseSuccess(false)
                    }}
                    className="font-mono text-sm min-h-[200px] max-h-[300px] resize-y"
                  />

                  {/* Parse status */}
                  {parseError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{parseError}</AlertDescription>
                    </Alert>
                  )}

                  {parseSuccess && (
                    <Alert>
                      <Check className="h-4 w-4 text-green-500" />
                      <AlertDescription>
                        Theme parsed successfully! Click "Apply Theme" to use it.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={handleParseCustomCSS}
                    disabled={!customCSSInput.trim()}
                  >
                    Validate CSS
                  </Button>
                  <Button
                    onClick={handleApplyCustomTheme}
                    disabled={!parseSuccess || updatePreferences.isPending}
                  >
                    {updatePreferences.isPending ? 'Applying...' : 'Apply Theme'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Show current custom theme info */}
          {currentScheme === 'custom' && currentPrefs.customTheme && (
            <p className="text-sm text-muted-foreground">
              Using your custom theme. Click "Custom" above to modify.
            </p>
          )}
        </CardContent>
      </Card>
      )}

      {/* Mode Selector (Light/Dark/System) */}
      <Card>
        <CardHeader>
          <CardTitle>Display Mode</CardTitle>
          <CardDescription>
            Choose how the app appears. System will match your device settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {modeOptions.map((modeOption) => (
              <Button
                key={modeOption.value}
                variant={currentMode === modeOption.value ? 'default' : 'outline'}
                className={cn(
                  'justify-start h-auto py-4 px-4',
                  currentMode === modeOption.value && 'ring-2 ring-ring ring-offset-2'
                )}
                onClick={() => handleModeChange(modeOption.value)}
                disabled={updatePreferences.isPending}
              >
                <div className="flex items-center gap-3">
                  {modeOption.icon}
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">{modeOption.label}</span>
                    {currentMode === modeOption.value && (
                      <span className="text-xs opacity-70">Active</span>
                    )}
                  </div>
                </div>
              </Button>
            ))}
          </div>

          <p className="text-sm text-muted-foreground mt-4">
            Current: <strong className="capitalize">{currentScheme}</strong> theme in{' '}
            <strong className="capitalize">{currentMode}</strong> mode
          </p>
        </CardContent>
      </Card>

      {/* Timezone Settings */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Timezone
            </div>
          </CardTitle>
          <CardDescription>
            Set your timezone for accurate date and time display throughout the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Your timezone</p>
              <p className="text-xs text-muted-foreground">
                Times throughout the app will be shown in this timezone
              </p>
            </div>
            <Select
              value={currentTimezone}
              onValueChange={handleTimezoneChange}
              disabled={updatePreferences.isPending}
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(timezonesByRegion).map(([region, timezones]) => (
                  <SelectGroup key={region}>
                    <SelectLabel>{region}</SelectLabel>
                    {timezones.map((tz) => (
                      <SelectItem key={tz.id} value={tz.id}>
                        <span className="flex items-center gap-2">
                          <span>{tz.label}</span>
                          <span className="text-muted-foreground text-xs">
                            ({tz.offset})
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Live time preview */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Current time in your timezone</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatTimeInTimezone(
                    currentTime,
                    currentTimezone,
                    currentTimeFormat === '24h' ? 'HH:mm' : 'h:mm a'
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getTimezoneAbbreviation(currentTimezone)} ({currentTimezone})
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Date & Time Format Settings */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Date & Time Format
            </div>
          </CardTitle>
          <CardDescription>
            Choose how dates and times are displayed throughout the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Date Format */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Date format</p>
              <p className="text-xs text-muted-foreground">
                How dates appear in lists and forms
              </p>
            </div>
            <Select
              value={currentDateFormat}
              onValueChange={(value) => handleDateFormatChange(value as DateFormat)}
              disabled={updatePreferences.isPending}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                {dateFormats.map((format) => (
                  <SelectItem key={format} value={format}>
                    {format === 'DD/MM/YYYY' && '28/11/2025 (Day/Month)'}
                    {format === 'MM/DD/YYYY' && '11/28/2025 (Month/Day)'}
                    {format === 'YYYY-MM-DD' && '2025-11-28 (ISO)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Format */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Time format</p>
              <p className="text-xs text-muted-foreground">
                12-hour (3:00 PM) or 24-hour (15:00)
              </p>
            </div>
            <div className="flex gap-2">
              {timeFormats.map((format) => (
                <Button
                  key={format}
                  variant={currentTimeFormat === format ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTimeFormatChange(format)}
                  disabled={updatePreferences.isPending}
                >
                  {format === '12h' ? '12-hour' : '24-hour'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
