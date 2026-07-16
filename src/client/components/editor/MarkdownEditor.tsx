/**
 * MarkdownEditor — WYSIWYG markdown editor built on Milkdown
 *
 * Plugin-driven, lightweight (~40kb gzipped), markdown-native.
 * Stores/outputs real markdown, not HTML.
 * Adapts to dark/light mode via wrapper CSS (no fixed theme).
 *
 * `value` seeds the initial document (not a controlled prop — Milkdown
 * owns the document after mount). `onChange` fires with the current
 * markdown on every edit.
 *
 * @example
 * <MarkdownEditor
 *   value={content}
 *   onChange={setContent}
 *   placeholder="Start writing..."
 * />
 */
import { useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { cn } from '@/lib/utils'

interface Props {
  value?: string
  onChange?: (markdown: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
}

function MilkdownEditorInner({ value, onChange, className, minHeight = '200px' }: Props) {
  // Ref so the listener (registered once at editor creation) always
  // sees the latest onChange without re-creating the editor.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // Seeded with the initial value so the mount-time emission Milkdown
  // fires for the seeded document doesn't mark a pristine form dirty.
  const lastEmittedRef = useRef(value ?? '')

  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root)
          if (value) ctx.set(defaultValueCtx, value)
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            if (markdown === lastEmittedRef.current) return
            lastEmittedRef.current = markdown
            onChangeRef.current?.(markdown)
          })
        })
        .use(commonmark)
        .use(gfm)
        .use(listener),
    []
  )

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background text-foreground',
        'prose prose-sm dark:prose-invert max-w-none',
        '[&_.milkdown]:outline-none [&_.milkdown]:px-3 [&_.milkdown]:py-2',
        '[&_.milkdown_.ProseMirror]:outline-none',
        className
      )}
      style={{ minHeight }}
    >
      <Milkdown />
    </div>
  )
}

export function MarkdownEditor(props: Props) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner {...props} />
    </MilkdownProvider>
  )
}
