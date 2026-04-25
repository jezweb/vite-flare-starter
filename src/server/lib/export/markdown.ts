/**
 * Markdown writer with optional YAML frontmatter
 *
 * Used by the "universal out" pattern — anywhere a fork wants to
 * expose user content as a downloadable .md file (conversation
 * exports, research notes, scraped page archives, etc).
 *
 * The frontmatter format matches what most static-site generators
 * (Astro, Hugo, Jekyll, 11ty) expect, so the output drops directly
 * into a content folder without further conversion.
 */

export interface FrontmatterValue {
  // Conservative — anything you'd reasonably embed in YAML. Arrays
  // become bullet lists; nested objects become block mappings; dates
  // are ISO-8601 strings; null/undefined are skipped to keep the
  // header clean.
  [key: string]: string | number | boolean | string[] | Record<string, unknown> | Date | null | undefined
}

export interface MarkdownDocOptions {
  /** Optional YAML frontmatter. Skipped entirely when omitted. */
  frontmatter?: FrontmatterValue
  /** Body text. Markdown — written as-is, no escaping. */
  body: string
  /** Append a trailing newline (default true) — most tools expect it. */
  trailingNewline?: boolean
}

/**
 * Build a markdown document with optional YAML frontmatter. Returns
 * the file contents as a string ready to write to R2 / disk / response.
 */
export function buildMarkdownDoc(opts: MarkdownDocOptions): string {
  const parts: string[] = []
  if (opts.frontmatter && Object.keys(opts.frontmatter).length > 0) {
    parts.push('---')
    parts.push(renderYaml(opts.frontmatter))
    parts.push('---')
    parts.push('')
  }
  parts.push(opts.body)
  let out = parts.join('\n')
  if (opts.trailingNewline !== false && !out.endsWith('\n')) out += '\n'
  return out
}

/**
 * YAML renderer for the narrow shape `FrontmatterValue` allows.
 * Deliberately minimal — we don't pull in a full YAML library just
 * to write a header. Strings get quoted when they contain characters
 * that would otherwise change the YAML semantics; arrays become
 * bullet lists; objects become indented blocks.
 */
function renderYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = '  '.repeat(indent)
  const lines: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`)
        continue
      }
      lines.push(`${pad}${key}:`)
      for (const item of value) {
        lines.push(`${pad}  - ${formatScalar(item)}`)
      }
    } else if (value instanceof Date) {
      lines.push(`${pad}${key}: ${value.toISOString()}`)
    } else if (typeof value === 'object') {
      lines.push(`${pad}${key}:`)
      lines.push(renderYaml(value as Record<string, unknown>, indent + 1))
    } else {
      lines.push(`${pad}${key}: ${formatScalar(value)}`)
    }
  }
  return lines.join('\n')
}

/**
 * Quote a YAML scalar only when needed — bare strings are nicer to
 * read in the output. Numbers and booleans pass through verbatim.
 */
function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '~'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  const s = String(value)
  // Quote if the string contains characters YAML treats specially:
  // colons (key separator), # (comment), leading whitespace, leading
  // dash (list marker), or any of the boolean/null literals.
  if (
    /^[#:\-?&*!|>'"%@`]/.test(s) ||
    /[:\n]/.test(s) ||
    /^\s|\s$/.test(s) ||
    /^(true|false|null|yes|no|~)$/i.test(s) ||
    s === ''
  ) {
    // Use double quotes + escape internal quotes/backslashes.
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return s
}
