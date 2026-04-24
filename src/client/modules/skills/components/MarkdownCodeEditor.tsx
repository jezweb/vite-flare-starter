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

export interface MarkdownCodeEditorProps {
  value: string
  onChange: (value: string) => void
  minHeight?: string
  className?: string
  placeholder?: string
  'aria-label'?: string
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

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      // EditorView.lineWrapping wraps long lines visually instead of
      // forcing horizontal scroll — essential for markdown which often
      // has long prose lines.
      extensions={[markdown(), EditorView.lineWrapping, fontTheme]}
      theme={dark ? oneDark : 'light'}
      basicSetup={{
        lineNumbers: false,
        highlightActiveLine: true,
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
