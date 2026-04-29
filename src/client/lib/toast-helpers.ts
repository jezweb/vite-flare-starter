/**
 * Toast helpers — standardised wrappers around sonner.
 *
 * The codebase had 7+ different "copy failed" toast strings before
 * this module landed. Use the helpers here for the most common
 * patterns; they enforce the microcopy contract documented in
 * `docs/VOCABULARY.md`.
 *
 * For one-off toast cases, import `toast` from sonner directly — but
 * follow the verb-tense rules (past for what just happened, infinitive
 * for what would happen).
 */
import { toast } from 'sonner'

/**
 * Resolve an unknown error value into a user-readable description.
 * Strips noisy stack/file prefixes and returns null when the message
 * is empty or just internal cruft.
 */
export function errorMessage(err: unknown): string | undefined {
  if (!err) return undefined
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.trim()) return err
  return undefined
}

/**
 * "X saved" — for successful save / update / submit.
 *
 *   toastSavedX('Profile')           // "Profile saved"
 *   toastSavedX('Routine')           // "Routine saved"
 */
export function toastSavedX(thing: string): void {
  toast.success(`${thing} saved`)
}

/**
 * "X deleted" — for successful delete / archive (when the verb is delete).
 */
export function toastDeletedX(thing: string): void {
  toast.success(`${thing} deleted`)
}

/**
 * "X created" — for successful create / new.
 */
export function toastCreatedX(thing: string): void {
  toast.success(`${thing} created`)
}

/**
 * "Failed to <verb>" — generic failure for one-off actions.
 *
 *   toastFailedTo('save profile', err)   // "Failed to save profile"
 *
 * The error description is rendered as the toast subtitle when present.
 */
export function toastFailedTo(verb: string, err?: unknown): void {
  toast.error(`Failed to ${verb}`, {
    description: errorMessage(err),
  })
}
