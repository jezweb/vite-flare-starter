/**
 * ClipboardText — read-only value with one-click copy (API keys, webhook
 * URLs, connection strings). Kumo-anatomy: mono value in a control-styled
 * field, copy affordance flush right.
 *
 *   <ClipboardText value={token} label="API token" masked />
 *
 * `masked` renders •••• until revealed — the sensitive-credential idiom
 * (Kumo's sensitive-input) without a separate component.
 */
import * as React from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { Label } from '@/components/ui/label'

interface ClipboardTextProps {
  value: string
  label?: React.ReactNode
  /** Render as ••••, with an eye toggle to reveal. */
  masked?: boolean
  className?: string
}

export function ClipboardText({ value, label, masked = false, className }: ClipboardTextProps) {
  const [revealed, setRevealed] = React.useState(!masked)
  const id = React.useId()

  // Re-mask whenever the field becomes sensitive or the value changes —
  // a reveal must never outlive the secret it was granted for. Fixed-width
  // mask so the dot count doesn't leak secret length (brains-trust
  // 2026-07-16, H4).
  React.useEffect(() => {
    setRevealed(!masked)
  }, [masked, value])

  const display = revealed ? value : '•'.repeat(12)

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <Label htmlFor={id} className="mb-1.5 block">
          {label}
        </Label>
      )}
      <div className="flex h-9 w-full items-center gap-1 rounded-md border border-input bg-card pr-1 pl-3 shadow-xs">
        <input
          id={id}
          readOnly
          value={display}
          // Select-on-focus only when the real value is shown — selecting
          // the mask invites Ctrl+C of literal bullets.
          onFocus={(e) => revealed && e.currentTarget.select()}
          className="min-w-0 flex-1 truncate bg-transparent font-mono text-[13px] outline-none"
          aria-label={typeof label === 'string' ? label : 'Copyable value'}
        />
        {masked && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide value' : 'Reveal value'}
          >
            {revealed ? <EyeSlash className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        )}
        <CopyButton
          value={value}
          variant="ghost"
          className="size-7 shrink-0 text-muted-foreground"
        />
      </div>
    </div>
  )
}
