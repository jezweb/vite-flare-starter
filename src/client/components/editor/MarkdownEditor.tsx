/**
 * MarkdownEditor — WYSIWYG markdown editor built on Milkdown
 *
 * Plugin-driven, lightweight (~40kb gzipped), markdown-native.
 * Stores/outputs real markdown, not HTML.
 * Adapts to dark/light mode via wrapper CSS (no fixed theme).
 *
 * @example
 * <MarkdownEditor
 *   value={content}
 *   onChange={setContent}
 *   placeholder="Start writing..."
 * />
 */
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { cn } from '@/lib/utils'

interface Props {
  value?: string
  onChange?: (markdown: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
}

function MilkdownEditorInner({ value, className, minHeight = '200px' }: Props) {
  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root)
          if (value) ctx.set(defaultValueCtx, value)
        })
        .use(commonmark)
        .use(gfm),
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
