/**
 * HSL string ↔ {h, s, l} ↔ hex utilities for the theme editor
 *
 * Theme values in this app are stored as "H S% L%" strings (no hsl() wrapper)
 * to match shadcn's and tweakcn's format. These helpers keep that string
 * shape as the source of truth and convert to/from sliders and hex inputs.
 */

export type HSL = { h: number; s: number; l: number }

/**
 * Parse "220 90% 56%" (or "220, 90%, 56%" / "hsl(...)" / hex) into { h, s, l }.
 * Returns null if the input doesn't look like a colour we can handle.
 */
export function parseHSL(value: string): HSL | null {
  if (!value) return null
  const trimmed = value.trim()

  // hex: "#abc" or "#aabbcc"
  if (trimmed.startsWith('#')) {
    const rgb = hexToRGB(trimmed)
    return rgb ? rgbToHSL(rgb) : null
  }

  // Strip hsl()/hsla() wrapper if present
  const inner = trimmed
    .replace(/^hsla?\(/i, '')
    .replace(/\)$/i, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const parts = inner.split(' ')
  if (parts.length < 3) return null

  const h = parseFloat(parts[0] ?? '')
  const s = parseFloat((parts[1] ?? '').replace('%', ''))
  const l = parseFloat((parts[2] ?? '').replace('%', ''))
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null

  return { h, s, l }
}

/** Format an HSL object back to the "H S% L%" string shape the theme uses. */
export function formatHSL({ h, s, l }: HSL): string {
  const round = (n: number) => Math.round(n * 10) / 10
  return `${round(h)} ${round(s)}% ${round(l)}%`
}

/** Convert an HSL object to a 6-digit hex string. */
export function hslToHex(hsl: HSL): string {
  return rgbToHex(hslToRGB(hsl))
}

/** Convert a hex string ("#abc" or "#aabbcc") to HSL. Returns null if invalid. */
export function hexToHSL(hex: string): HSL | null {
  const rgb = hexToRGB(hex)
  return rgb ? rgbToHSL(rgb) : null
}

// ─── internals ───────────────────────────────────────────────────────────

type RGB = { r: number; g: number; b: number }

function hexToRGB(hex: string): RGB | null {
  const cleaned = hex.replace('#', '').trim()
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned
  if (expanded.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(expanded)) return null
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: RGB): string {
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

function rgbToHSL({ r, g, b }: RGB): HSL {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rr:
        h = (gg - bb) / d + (gg < bb ? 6 : 0)
        break
      case gg:
        h = (bb - rr) / d + 2
        break
      case bb:
        h = (rr - gg) / d + 4
        break
    }
    h = h * 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslToRGB({ h, s, l }: HSL): RGB {
  const ss = s / 100
  const ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * ss
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ll - c / 2
  let rr = 0
  let gg = 0
  let bb = 0
  if (h < 60) {
    rr = c
    gg = x
    bb = 0
  } else if (h < 120) {
    rr = x
    gg = c
    bb = 0
  } else if (h < 180) {
    rr = 0
    gg = c
    bb = x
  } else if (h < 240) {
    rr = 0
    gg = x
    bb = c
  } else if (h < 300) {
    rr = x
    gg = 0
    bb = c
  } else {
    rr = c
    gg = 0
    bb = x
  }
  return { r: (rr + m) * 255, g: (gg + m) * 255, b: (bb + m) * 255 }
}
