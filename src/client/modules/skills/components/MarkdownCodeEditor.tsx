/**
 * MarkdownCodeEditor — CodeMirror 6 wrapped for markdown with YAML frontmatter.
 *
 * Kept standalone so it's easy to lazy-load (pulls in ~100KB gzipped of
 * CodeMirror core + markdown grammar + dark theme). The skill editor is
 * the only current consumer.
 *
 * Theme follows the app's light/dark mode via a MutationObserver on the
 * root <html> element's class (same pattern used by the site header theme
 * toggle). Light mode uses CodeMirror's default; dark uses `oneDark`.
 */
import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { foldGutter } from '@codemirror/language'
import { highlightSelectionMatches, search } from '@codemirror/search'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { TOOL_CATALOG_SORTED } from '@/shared/agent/tool-catalog'

export interface MarkdownCodeEditorProps {
  value: string
  onChange: (value: string) => void
  minHeight?: string
  className?: string
  placeholder?: string
  'aria-label'?: string
  /**
   * Enable SKILL.md-specific linting — frontmatter field limits + shape
   * checks. Default true. Pass false for generic markdown editing where
   * the frontmatter rules don't apply.
   */
  lintSkillFrontmatter?: boolean
}

/**
 * Tool-name autocomplete source. Triggers on `/` and filters by the
 * word typed after it. Picking a suggestion inserts the tool name
 * wrapped in backticks (markdown inline-code convention for SKILL.md),
 * replacing the `/prefix` the user typed.
 *
 * We match `/word-chars` — so typing `/gmail` narrows to gmail_* tools.
 * If the `/` is part of something that shouldn't be a trigger (URL
 * path, regex, date), the popup still shows but won't insert unless
 * the user explicitly selects — harmless.
 */
function toolCompletionSource(ctx: CompletionContext): CompletionResult | null {
  // Match a / followed by any number of [a-z_] chars (tool names are
  // snake_case lowercase). Allow the popup to show even on bare `/`
  // so the full list is browsable.
  const match = ctx.matchBefore(/\/[a-z_]*/)
  if (!match) return null
  // Don't fire when the user is explicitly typing — require at least
  // the `/` to be typed. Also skip explicit-only mode when nothing typed
  // unless the user triggered manually (Ctrl+Space).
  if (match.from === match.to && !ctx.explicit) return null

  const typed = match.text.slice(1).toLowerCase() // drop the leading /

  return {
    from: match.from,
    to: match.to,
    options: TOOL_CATALOG_SORTED.filter((t) =>
      typed === '' || t.name.toLowerCase().includes(typed),
    ).map((t) => ({
      label: t.name,
      detail: t.category,
      info: t.description,
      // Wrap in backticks — the standard SKILL.md convention for tool
      // references. Typing `/gmail_search` + accept → `` `gmail_search` ``
      apply: `\`${t.name}\``,
      type: 'function',
    })),
    // Re-run the source while the user continues typing word chars so
    // filtering stays live.
    validFor: /^\/[a-z_]*$/,
  }
}

/**
 * SKILL.md frontmatter linter — mirrors the server-side parser's spec
 * (name ≤64 chars lowercase-kebab, description ≤1024 chars, both required).
 * Shows as red squiggles / warning underlines inline, plus markers in the
 * lint gutter. Runs on the full document; debounced by CodeMirror's
 * linter() wrapper so it doesn't fire per-keystroke.
 */
function skillFrontmatterLinter() {
  return linter((view): Diagnostic[] => {
    const text = view.state.doc.toString()
    const out: Diagnostic[] = []

    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!fmMatch) {
      return [
        {
          from: 0,
          to: Math.min(20, text.length),
          severity: 'error',
          message:
            'SKILL.md must start with YAML frontmatter delimited by --- lines',
        },
      ]
    }

    const fmBody = fmMatch[1] ?? ''
    const fmStart = 4 // past the opening "---\n"
    let hasName = false
    let hasDescription = false
    let offset = fmStart

    for (const line of fmBody.split('\n')) {
      const lineEnd = offset + line.length
      const colon = line.indexOf(':')
      if (colon === -1) {
        offset = lineEnd + 1
        continue
      }
      const key = line.slice(0, colon).trim()
      const valueStartInLine = line.slice(0, colon + 1).length
      const leadingSpace = line[colon + 1] === ' ' ? 1 : 0
      const valueFrom = offset + valueStartInLine + leadingSpace
      const value = line.slice(colon + 1).trim()

      if (key === 'name') {
        hasName = true
        if (value.length === 0) {
          out.push({ from: offset, to: lineEnd, severity: 'error', message: 'name cannot be empty' })
        } else if (value.length > 64) {
          out.push({ from: valueFrom, to: lineEnd, severity: 'error', message: `name exceeds 64 chars (got ${value.length})` })
        } else if (!/^[a-z0-9-]+$/.test(value)) {
          out.push({
            from: valueFrom,
            to: lineEnd,
            severity: 'error',
            message: 'name must be lowercase letters, digits, and hyphens only',
          })
        }
      }

      if (key === 'description') {
        hasDescription = true
        if (value.length === 0) {
          out.push({ from: offset, to: lineEnd, severity: 'error', message: 'description cannot be empty' })
        } else if (value.length > 1024) {
          out.push({
            from: valueFrom,
            to: lineEnd,
            severity: 'error',
            message: `description exceeds 1024 chars (got ${value.length})`,
          })
        } else if (value.length < 20) {
          out.push({
            from: valueFrom,
            to: lineEnd,
            severity: 'warning',
            message:
              'description is very short — agents use this to decide when to load the skill. Describe purpose + trigger conditions.',
          })
        }
      }

      offset = lineEnd + 1 // +1 for the \n
    }

    const fmEnd = fmStart + fmBody.length
    if (!hasName) {
      out.push({ from: fmStart, to: fmEnd, severity: 'error', message: 'name: field is required' })
    }
    if (!hasDescription) {
      out.push({ from: fmStart, to: fmEnd, severity: 'error', message: 'description: field is required' })
    }

    return out
  }, { delay: 300 })
}

function useIsDarkMode() {
  const [dark, setDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    const update = () => setDark(html.classList.contains('dark'))
    update()
    const observer = new MutationObserver(update)
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

export function MarkdownCodeEditor({
  value,
  onChange,
  minHeight = '400px',
  className,
  placeholder,
  'aria-label': ariaLabel,
  lintSkillFrontmatter = true,
}: MarkdownCodeEditorProps) {
  const dark = useIsDarkMode()

  // Force a consistent 11px font inside the editor + match the app's
  // rounded-md + border-input chrome so it visually aligns with the
  // shadcn Textarea it replaces. `maxWidth: 100%` and overflow clip on
  // the outer wrapper prevent the editor from blowing past its parent
  // when a single line is longer than the container — line wrapping
  // (below) handles long lines visually, this is belt-and-braces.
  const fontTheme = useMemo(
    () =>
      EditorView.theme({
        '&': {
          fontSize: '11px',
          lineHeight: '1.6',
          borderRadius: '0.375rem',
          border: '1px solid hsl(var(--input, 215 27% 20%))',
          maxWidth: '100%',
          overflow: 'hidden',
        },
        '.cm-scroller': { overflowX: 'auto' },
        '.cm-content': {
          fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
          wordBreak: 'break-word',
        },
        '.cm-gutters': { fontSize: '10px' },
      }),
    [],
  )

  // Tier-1 editor extensions (see docs/PATTERNS note on skill UX):
  //  - lineWrapping: wrap long markdown prose at container edge
  //  - foldGutter: collapsible `#`/`##` heading sections
  //  - search: Cmd+F panel (search + replace + regex)
  //  - highlightSelectionMatches: double-click a word → all matches
  //    highlight across the doc
  //  - lintGutter + skill frontmatter linter: red/amber markers next to
  //    lines violating the SKILL.md spec (name ≤64 kebab-case, description
  //    ≤1024 chars, both required)
  const extensions = useMemo(() => {
    const exts = [
      markdown(),
      EditorView.lineWrapping,
      fontTheme,
      foldGutter(),
      search({ top: true }),
      highlightSelectionMatches(),
      // Tool-name autocomplete — type `/` anywhere to pop a filterable
      // list of agent tool names. Selection inserts the name wrapped in
      // backticks (SKILL.md inline-code convention).
      autocompletion({ override: [toolCompletionSource], activateOnTyping: true }),
    ]
    if (lintSkillFrontmatter) {
      exts.push(lintGutter())
      exts.push(skillFrontmatterLinter())
    }
    return exts
  }, [fontTheme, lintSkillFrontmatter])

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={dark ? oneDark : 'light'}
      basicSetup={{
        lineNumbers: false,
        highlightActiveLine: true,
        // foldGutter comes from our explicit extension above — we disable
        // basicSetup's version to avoid double-gutters.
        foldGutter: false,
        bracketMatching: true,
        indentOnInput: false,
        autocompletion: false,
      }}
      minHeight={minHeight}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
    />
  )
}

export default MarkdownCodeEditor
