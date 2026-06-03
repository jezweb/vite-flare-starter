import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  applyTheme,
  getThemeColors,
  THEME_CORE_VARIABLES,
  THEME_OPTIONAL_VARIABLES,
} from '@/lib/themes'
import { formatHSL, hslToHex, parseHSL } from '@/lib/theme-colors'
import { type CustomThemeColors, type ThemeScheme } from '@/shared/schemas/preferences.schema'

type Mode = 'light' | 'dark'

type ThemeVisualEditorProps = {
  /** Current custom theme colours (if the user has one) */
  current?: { light?: Partial<CustomThemeColors>; dark?: Partial<CustomThemeColors> }
  /** Preset to seed from when no custom theme exists yet */
  baseScheme: Exclude<ThemeScheme, 'custom'>
  /** Persist edits (debounced). Receives the complete 19-core-var object. */
  onPersist: (next: { light: CustomThemeColors; dark: CustomThemeColors }) => void
  /** Busy indicator */
  isSaving?: boolean
}

type Group = { label: string; vars: readonly string[]; defaultOpen?: boolean }

const CORE_GROUPS: Group[] = [
  { label: 'Base', vars: ['background', 'foreground'], defaultOpen: true },
  {
    label: 'Surfaces',
    vars: [
      'card',
      'card-foreground',
      'popover',
      'popover-foreground',
      'secondary',
      'secondary-foreground',
      'muted',
      'muted-foreground',
      'accent',
      'accent-foreground',
    ],
    defaultOpen: true,
  },
  {
    label: 'Actions',
    vars: ['primary', 'primary-foreground', 'destructive', 'destructive-foreground', 'ring'],
    defaultOpen: true,
  },
  { label: 'Form', vars: ['border', 'input'], defaultOpen: false },
]

const OPTIONAL_GROUPS: Group[] = [
  {
    label: 'Charts',
    vars: ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'],
    defaultOpen: false,
  },
  {
    label: 'Sidebar',
    vars: [
      'sidebar',
      'sidebar-foreground',
      'sidebar-primary',
      'sidebar-primary-foreground',
      'sidebar-accent',
      'sidebar-accent-foreground',
      'sidebar-border',
      'sidebar-ring',
    ],
    defaultOpen: false,
  },
]

/** Seed a complete CORE color object from preset theme + overrides */
function seedMode(
  mode: Mode,
  baseScheme: Exclude<ThemeScheme, 'custom'>,
  overrides?: Partial<CustomThemeColors>
): Partial<CustomThemeColors> {
  const preset = getThemeColors(baseScheme, mode)
  const result: Record<string, string> = { ...preset }
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (typeof v === 'string' && v.length > 0) result[k] = v
    }
  }
  return result as Partial<CustomThemeColors>
}

/** Ensure all 19 core vars are present; used before persisting. */
function fillCore(
  mode: Mode,
  baseScheme: Exclude<ThemeScheme, 'custom'>,
  partial: Partial<CustomThemeColors>
): CustomThemeColors {
  const preset = getThemeColors(baseScheme, mode)
  return { ...preset, ...partial } as CustomThemeColors
}

export function ThemeVisualEditor({
  current,
  baseScheme,
  onPersist,
  isSaving,
}: ThemeVisualEditorProps) {
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light'
  )

  const [light, setLight] = useState<Partial<CustomThemeColors>>(() =>
    seedMode('light', baseScheme, current?.light)
  )
  const [dark, setDark] = useState<Partial<CustomThemeColors>>(() =>
    seedMode('dark', baseScheme, current?.dark)
  )

  const active = mode === 'light' ? light : dark

  // Live-apply changes to CSS variables on every edit
  useEffect(() => {
    applyTheme('custom', mode, {
      light: light as CustomThemeColors,
      dark: dark as CustomThemeColors,
    })
  }, [light, dark, mode])

  // Debounced persist
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedulePersist = useCallback(
    (nextLight: Partial<CustomThemeColors>, nextDark: Partial<CustomThemeColors>) => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
      persistTimer.current = setTimeout(() => {
        onPersist({
          light: fillCore('light', baseScheme, nextLight),
          dark: fillCore('dark', baseScheme, nextDark),
        })
      }, 500)
    },
    [onPersist, baseScheme]
  )
  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    },
    []
  )

  const handleChange = (key: string, value: string) => {
    if (mode === 'light') {
      const next = { ...light, [key]: value }
      setLight(next)
      schedulePersist(next, dark)
    } else {
      const next = { ...dark, [key]: value }
      setDark(next)
      schedulePersist(light, next)
    }
  }

  const handleReset = (key: string) => {
    const presetValue = getThemeColors(baseScheme, mode)[
      key as keyof ReturnType<typeof getThemeColors>
    ]
    if (presetValue) handleChange(key, presetValue)
    else handleChange(key, '') // optional var without preset — let it fall back to :root
  }

  const resetAll = () => {
    const nextLight = seedMode('light', baseScheme)
    const nextDark = seedMode('dark', baseScheme)
    setLight(nextLight)
    setDark(nextDark)
    schedulePersist(nextLight, nextDark)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="light">Light</TabsTrigger>
            <TabsTrigger value="dark">Dark</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isSaving ? 'Saving…' : 'Auto-saves 0.5s after your last edit'}
          <Button type="button" variant="ghost" size="sm" onClick={resetAll}>
            Reset to {baseScheme}
          </Button>
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto pr-2 space-y-4">
        {CORE_GROUPS.map((group) => (
          <GroupBlock
            key={group.label}
            group={group}
            values={active}
            onChange={handleChange}
            onReset={handleReset}
          />
        ))}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-2">
            Optional — style charts and the sidebar surface. Leave blank to use the default.
          </p>
          {OPTIONAL_GROUPS.map((group) => (
            <GroupBlock
              key={group.label}
              group={group}
              values={active}
              onChange={handleChange}
              onReset={handleReset}
              optional
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function GroupBlock({
  group,
  values,
  onChange,
  onReset,
  optional,
}: {
  group: Group
  values: Partial<CustomThemeColors>
  onChange: (key: string, value: string) => void
  onReset: (key: string) => void
  optional?: boolean
}) {
  const [open, setOpen] = useState(group.defaultOpen ?? false)
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-sm font-medium py-1.5 hover:text-primary transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {group.label}{' '}
          {optional && <span className="text-muted-foreground font-normal">(optional)</span>}
        </span>
        <span className="text-xs text-muted-foreground">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-2 pt-1">
          {group.vars.map((key) => (
            <ColorRow
              key={key}
              label={formatLabel(key)}
              value={values[key as keyof CustomThemeColors] ?? ''}
              onChange={(v) => onChange(key, v)}
              onReset={() => onReset(key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ColorRow({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onReset: () => void
}) {
  // Derived hex/HSL from the current string value
  const hsl = useMemo(() => parseHSL(value), [value])
  const hex = useMemo(() => (hsl ? hslToHex(hsl) : '#000000'), [hsl])
  const [textValue, setTextValue] = useState(value)

  // Keep local text in sync when parent changes (e.g. mode toggle)
  useEffect(() => {
    setTextValue(value)
  }, [value])

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
      <Label
        className="text-xs w-28 truncate"
        title={TOKEN_DESCRIPTIONS[label] ?? 'CSS variable — applies across the UI'}
      >
        {label}
      </Label>
      <Input
        type="text"
        value={textValue}
        placeholder="hue saturation% lightness%"
        className="h-8 font-mono text-xs md:text-xs"
        title="Format: 'hue saturation% lightness%' (e.g. '222 47% 11%')"
        onChange={(e) => setTextValue(e.target.value)}
        onBlur={() => {
          // Accept the edit on blur if it parses, otherwise snap back
          const parsed = parseHSL(textValue)
          if (parsed) onChange(formatHSL(parsed))
          else setTextValue(value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setTextValue(value)
        }}
      />
      <input
        type="color"
        value={hex}
        className="h-8 w-10 rounded border border-input bg-background cursor-pointer"
        onChange={(e) => {
          const parsed = parseHSL(e.target.value)
          if (parsed) onChange(formatHSL(parsed))
        }}
        aria-label={`${label} color picker`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onReset}
        aria-label={`Reset ${label}`}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function formatLabel(key: string): string {
  return key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Short descriptions surfaced as title tooltips on token labels. Helps
 * designers who don't live in shadcn/ui tokens know what each variable
 * actually controls — T2 from the UX audit.
 */
const TOKEN_DESCRIPTIONS: Record<string, string> = {
  Background: 'Main page background colour',
  Foreground: 'Default text colour on the main background',
  Card: 'Background for cards and panels',
  'Card Foreground': 'Text colour on cards and panels',
  Popover: 'Background for popovers, dropdowns, and menus',
  'Popover Foreground': 'Text colour on popovers and dropdowns',
  Secondary: 'Secondary button background (lower emphasis actions)',
  'Secondary Foreground': 'Text on secondary buttons',
  Muted: 'Background for badges, chips, and subtle surfaces',
  'Muted Foreground': 'De-emphasised text (helper text, timestamps)',
  Accent: 'Hover / focus background on list rows and dropdown items',
  'Accent Foreground': 'Text on accent-coloured surfaces',
  Primary: 'Primary button background — the brand action colour',
  'Primary Foreground': 'Text on primary buttons',
  Destructive: 'Danger button background (delete, remove)',
  'Destructive Foreground': 'Text on destructive buttons',
  Ring: 'Focus ring around inputs, buttons, and dialogs',
  Border: 'Hairlines between cards, rows, and sections',
  Input: 'Border colour around text inputs and selects',
  'Chart 1': 'First series colour in charts',
  'Chart 2': 'Second series colour in charts',
  'Chart 3': 'Third series colour in charts',
  'Chart 4': 'Fourth series colour in charts',
  'Chart 5': 'Fifth series colour in charts',
  Sidebar: 'Sidebar background',
  'Sidebar Foreground': 'Default text in the sidebar',
  'Sidebar Primary': 'Active nav-item background',
  'Sidebar Primary Foreground': 'Active nav-item text',
  'Sidebar Accent': 'Hover background in the sidebar',
  'Sidebar Accent Foreground': 'Text on hovered sidebar items',
  'Sidebar Border': 'Border between sidebar sections',
  'Sidebar Ring': 'Focus ring on sidebar items',
}

// Ensure THEME_CORE_VARIABLES and THEME_OPTIONAL_VARIABLES stay referenced —
// the editor relies on the groups above matching them. Delete this line if
// you change the variable lists and want the typechecker to flag the groups.
void [THEME_CORE_VARIABLES, THEME_OPTIONAL_VARIABLES]
