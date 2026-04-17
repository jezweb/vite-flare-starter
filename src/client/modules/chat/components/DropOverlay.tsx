/**
 * DropOverlay — full-area "drop files here" overlay.
 *
 * Listens for document-level drag events with a counter pattern to avoid
 * flicker when dragging between child elements. When a drag enters the
 * document carrying files, the overlay fades in. PromptInput's globalDrop
 * handler does the actual file capture, so this component is purely visual.
 */
import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DropOverlay({ disabled = false }: { disabled?: boolean }) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (disabled) return

    let dragCounter = 0

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      dragCounter++
      if (dragCounter === 1) setIsDragging(true)
    }

    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      dragCounter--
      if (dragCounter <= 0) {
        dragCounter = 0
        setIsDragging(false)
      }
    }

    const onDrop = () => {
      dragCounter = 0
      setIsDragging(false)
    }

    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)

    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [disabled])

  if (!isDragging) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        'bg-primary/10 backdrop-blur-sm pointer-events-none',
        'animate-in fade-in duration-150',
      )}
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary bg-background/95 px-12 py-10 shadow-2xl">
        <div className="rounded-full bg-primary/10 p-4">
          <Upload className="size-10 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold">Drop files to attach</p>
          <p className="text-sm text-muted-foreground mt-1">
            Images, PDFs, docs, audio, and more
          </p>
        </div>
      </div>
    </div>
  )
}
