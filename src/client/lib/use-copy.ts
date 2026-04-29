/**
 * useCopy — single source of truth for "copy to clipboard" UX.
 *
 * Replaces 12 hand-rolled `navigator.clipboard.writeText` blocks with
 * 7 different toast strings. Defaults match `docs/VOCABULARY.md`
 * microcopy section.
 *
 *   const { copy, copied } = useCopy()
 *   <Button onClick={() => copy(url)}>
 *     {copied ? <Check /> : <Copy />} Copy
 *   </Button>
 *
 * Or wrap in `<CopyButton value=… />` for the most common case.
 *
 * Also exposes `toastCopySuccess` / `toastCopyFailed` helpers for
 * sites that need the toast without a button (e.g. an inline link).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface UseCopyOptions {
  /** Toast on success. Default: shows toast with the success message. */
  toastOnSuccess?: boolean
  /** Toast on error. Default: true. */
  toastOnError?: boolean
  /** How long the `copied` flag stays true after a successful copy. */
  resetMs?: number
}

interface CopyOptions {
  /** Override the success toast message for this call. */
  successMessage?: string
}

export function useCopy(options: UseCopyOptions = {}) {
  const { toastOnSuccess = true, toastOnError = true, resetMs = 1500 } = options
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const copy = useCallback(
    async (value: string, callOpts: CopyOptions = {}): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        if (toastOnSuccess) {
          toastCopySuccess(callOpts.successMessage)
        }
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), resetMs)
        return true
      } catch {
        if (toastOnError) toastCopyFailed()
        return false
      }
    },
    [toastOnSuccess, toastOnError, resetMs],
  )

  return { copy, copied }
}

/** Standardised success toast — used by useCopy + CopyButton. */
export function toastCopySuccess(message?: string): void {
  toast.success(message ?? 'Copied')
}

/**
 * Standardised failure toast. Single canonical copy across the app —
 * "long-press to copy manually" hint covers the iOS Safari / Firefox
 * permission cases without sounding like an error report.
 */
export function toastCopyFailed(): void {
  toast.error('Copy failed', {
    description: 'Long-press the value to copy manually.',
  })
}
