/**
 * CopyButton — the canonical "copy this value" button.
 *
 * Wraps useCopy + a Copy/Check icon flip + the standard toast helpers.
 * Replaces 12 hand-rolled `navigator.clipboard.writeText` blocks across
 * Invitations / API tokens / preferences / chat / spaces / admin / etc.
 *
 *   <CopyButton value={url} />                        // icon-only "Copy"
 *   <CopyButton value={token} label="Copy token" />   // text + icon
 *   <CopyButton value={url} successMessage="Link copied" size="xs" />
 *   <CopyButton value={md} html={renderedHtml} label="Copy" />  // rich
 *
 * Pass `html` to copy formatted content — both `text/html` and `text/plain`
 * are written so it pastes formatted into Outlook / Docs and as plain text
 * into a textarea (#81). Omit `html` for the plain-text default.
 *
 * Defaults to a small ghost icon button to match how copy buttons are
 * used in 80% of sites today (inside a row's trailing slot).
 */
import type * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopy } from '@/client/lib/use-copy'

interface CopyButtonProps
  extends Omit<React.ComponentProps<typeof Button>, 'onClick' | 'children'> {
  value: string
  /**
   * Rendered HTML for a rich copy. When set, the button writes both
   * `text/html` and `text/plain` (value) so the content pastes formatted
   * into Outlook / Docs and as plain text elsewhere. Omit for plain copy.
   */
  html?: string
  /** Inline button text. Omit for icon-only. */
  label?: React.ReactNode
  /** Override the success toast message. */
  successMessage?: string
}

export function CopyButton({
  value,
  html,
  label,
  successMessage,
  size = 'icon-sm',
  variant = 'ghost',
  ...rest
}: CopyButtonProps) {
  const { copy, copyRich, copied } = useCopy()
  const Icon = copied ? Check : Copy
  const opts = successMessage ? { successMessage } : undefined
  return (
    <Button
      data-slot="copy-button"
      type="button"
      size={label ? (size === 'icon-sm' ? 'sm' : size) : size}
      variant={variant}
      onClick={() => (html ? copyRich({ html, text: value }, opts) : copy(value, opts))}
      aria-label={label ? undefined : 'Copy'}
      {...rest}
    >
      <Icon />
      {label && <span>{copied ? 'Copied' : label}</span>}
    </Button>
  )
}

CopyButton.displayName = 'CopyButton'
