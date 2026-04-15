/**
 * usePasteUpload — Cmd+V file/image paste handler.
 *
 * Listens for paste events on a target element (or document), extracts
 * files from the clipboard, and calls onPaste with the File[]. Works
 * with screenshots (Cmd+Shift+4 → Cmd+V), copied images, and file pastes.
 *
 * @example
 * const { ref } = usePasteUpload({
 *   onPaste: (files) => uploadFiles(files),
 *   accept: 'image/*',
 * })
 * return <div ref={ref}>Paste here</div>
 *
 * // Or attach to document (no ref needed):
 * usePasteUpload({ onPaste: handleFiles, global: true })
 */
import { useEffect, useRef, useCallback } from 'react'

interface UsePasteUploadOptions {
  /** Called with pasted files. */
  onPaste: (files: File[]) => void
  /** MIME type filter (e.g. 'image/*'). Accepts all if omitted. */
  accept?: string
  /** Listen on document instead of a ref'd element. */
  global?: boolean
  /** Disabled — stops listening when true. */
  disabled?: boolean
  /** Maximum number of files to accept per paste. Default: 10. */
  maxFiles?: number
  /** Maximum file size in bytes. Default: 10MB. */
  maxFileSize?: number
}

function matchesMime(fileType: string, accept: string): boolean {
  if (!accept) return true
  return accept.split(',').some((pattern) => {
    const p = pattern.trim()
    if (p === '*/*') return true
    if (p.endsWith('/*')) return fileType.startsWith(p.replace('/*', '/'))
    return fileType === p
  })
}

export function usePasteUpload({
  onPaste,
  accept,
  global = false,
  disabled = false,
  maxFiles = 10,
  maxFileSize = 10 * 1024 * 1024,
}: UsePasteUploadOptions) {
  const ref = useRef<HTMLElement>(null)
  const onPasteRef = useRef(onPaste)
  onPasteRef.current = onPaste

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind !== 'file') continue
        const file = item.getAsFile()
        if (!file) continue
        if (accept && !matchesMime(file.type, accept)) continue
        if (file.size > maxFileSize) continue
        files.push(file)
        if (files.length >= maxFiles) break
      }

      if (files.length > 0) {
        e.preventDefault()
        onPasteRef.current(files)
      }
    },
    [accept, maxFiles, maxFileSize],
  )

  useEffect(() => {
    if (disabled) return

    const target = global ? document : ref.current
    if (!target) return

    target.addEventListener('paste', handlePaste as EventListener)
    return () => target.removeEventListener('paste', handlePaste as EventListener)
  }, [global, disabled, handlePaste])

  return { ref }
}
