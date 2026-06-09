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
 * For formatted copy (markdown → rich paste into Outlook / Google Docs),
 * use `copyRich(elementOr{html,text})` or `<CopyButton value=… html=… />`.
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

  const markCopied = useCallback(
    (successMessage?: string) => {
      setCopied(true)
      if (toastOnSuccess) toastCopySuccess(successMessage)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), resetMs)
    },
    [toastOnSuccess, resetMs]
  )

  const copy = useCallback(
    async (value: string, callOpts: CopyOptions = {}): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(value)
        markCopied(callOpts.successMessage)
        return true
      } catch {
        if (toastOnError) toastCopyFailed()
        return false
      }
    },
    [markCopied, toastOnError]
  )

  /**
   * Rich copy — writes both `text/html` (rendered) and `text/plain` so the
   * paste target picks the best fit: Outlook / Google Docs take the HTML and
   * keep bold/bullets/links; a plain textarea takes the text. Pass either a
   * live DOM element (its innerHTML + innerText are read) or an explicit
   * `{ html, text }` payload.
   *
   * Falls back to plain `writeText` when ClipboardItem isn't available
   * (older Safari/Firefox) — degrade to plain, never fail silently. (#81)
   */
  const copyRich = useCallback(
    async (
      source: HTMLElement | { html: string; text: string },
      callOpts: CopyOptions = {}
    ): Promise<boolean> => {
      const html = source instanceof HTMLElement ? source.innerHTML : source.html
      const text =
        source instanceof HTMLElement ? (source.innerText ?? source.textContent ?? '') : source.text
      try {
        const canRich =
          typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'
        if (canRich) {
          const item = new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          })
          await navigator.clipboard.write([item])
        } else {
          await navigator.clipboard.writeText(text)
        }
        markCopied(callOpts.successMessage)
        return true
      } catch {
        // Last-ditch: try plain text before giving up.
        try {
          await navigator.clipboard.writeText(text)
          markCopied(callOpts.successMessage)
          return true
        } catch {
          if (toastOnError) toastCopyFailed()
          return false
        }
      }
    },
    [markCopied, toastOnError]
  )

  return { copy, copyRich, copied }
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
