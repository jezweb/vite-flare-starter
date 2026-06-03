/**
 * Skill display formatting helpers.
 *
 * The canonical skill identity is the slug (e.g. `morning-brief`) — that's
 * what the user types after `/` in chat, what the SKILL.md frontmatter
 * holds, and the row id in the registry. But picking the slug as the
 * displayed label everywhere makes the catalog feel inhumane.
 *
 * `formatSkillName` returns a Title Case label — `morning-brief` →
 * `Morning Brief`. Use it when rendering the skill in lists, pickers,
 * or chips. Keep the slug visible as a small mono detail when context
 * doesn't make it obvious which one is meant (e.g. duplicate names
 * across personal + bundled, or alongside a slash command hint).
 */

// Common acronyms / domain words that should keep their canonical casing
// when title-casing a slug. A small allow-list — extend per-fork rather
// than getting clever with heuristics.
const ACRONYMS = new Set([
  'ai',
  'api',
  'cli',
  'csv',
  'css',
  'html',
  'json',
  'mcp',
  'pdf',
  'qa',
  'sql',
  'svg',
  'tts',
  'ui',
  'url',
  'xml',
  'yaml',
])

/**
 * Title-case a kebab-case or snake_case slug into a friendly label.
 * Special-cases a few common short tokens so they capitalise naturally.
 */
export function formatSkillName(slug: string): string {
  if (!slug) return ''
  // Replace hyphens / underscores with spaces, title-case each token,
  // and rejoin. Acronym-ish tokens keep their existing casing — if the
  // user already typed `URL` or `QA`, don't lower-case it. Known
  // acronyms are upper-cased even when the slug used lowercase.
  return slug
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .map((tok) => {
      if (!tok) return ''
      const lower = tok.toLowerCase()
      if (ACRONYMS.has(lower)) return lower.toUpperCase()
      // Already has uppercase mid-word — assume intentional acronym.
      if (/[A-Z]/.test(tok.slice(1))) return tok
      return tok.charAt(0).toUpperCase() + tok.slice(1)
    })
    .join(' ')
    .trim()
}

/** Format a slug as the slash-command hint string. */
export function formatSkillSlash(slug: string): string {
  return `/${slug}`
}
