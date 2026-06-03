/**
 * Project colour palette.
 *
 * Six brand-neutral colours plus "none" for ungrouped visual treatment.
 * Stored on projects.color as the string key ("blue", "emerald", …).
 * Kept in one file so the sidebar and the project page agree on
 * exactly which Tailwind classes to use for each colour — Tailwind's
 * JIT can't tree-shake dynamic class names, so we list each literal
 * here and let the JIT see them.
 */

export type ProjectColor = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate'

export const PROJECT_COLORS: ProjectColor[] = [
  'blue',
  'emerald',
  'amber',
  'rose',
  'violet',
  'slate',
]

/**
 * Tailwind class name mapping. The *fill* class is applied to the folder
 * icon in the sidebar and the colour chip in the picker. The *dot* class
 * is a stronger variant used for the leading indicator dot.
 *
 * Listed as explicit literals so Tailwind's content scanner picks them up.
 * Don't switch to template-string construction — that breaks JIT.
 */
export const PROJECT_COLOR_CLASSES: Record<
  ProjectColor,
  { fill: string; dot: string; label: string }
> = {
  blue: { fill: 'text-blue-500', dot: 'bg-blue-500', label: 'Blue' },
  emerald: { fill: 'text-emerald-500', dot: 'bg-emerald-500', label: 'Emerald' },
  amber: { fill: 'text-amber-500', dot: 'bg-amber-500', label: 'Amber' },
  rose: { fill: 'text-rose-500', dot: 'bg-rose-500', label: 'Rose' },
  violet: { fill: 'text-violet-500', dot: 'bg-violet-500', label: 'Violet' },
  slate: { fill: 'text-slate-400', dot: 'bg-slate-400', label: 'Slate' },
}

export function isProjectColor(value: unknown): value is ProjectColor {
  return typeof value === 'string' && PROJECT_COLORS.includes(value as ProjectColor)
}

/** Returns fill class or undefined for the default (no-colour) state. */
export function getProjectFillClass(color: string | null | undefined): string | undefined {
  if (!color || !isProjectColor(color)) return undefined
  return PROJECT_COLOR_CLASSES[color].fill
}
