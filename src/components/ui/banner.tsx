/**
 * Banner — full-width message bar for page-level notices.
 *
 * Kumo-anatomy sibling of Alert: Alert is an in-flow content callout;
 * Banner spans its container edge-to-edge (top of a page, above a form)
 * and reads as chrome, not content. Structured title/description for
 * scannability, or plain children for one-liners.
 *
 *   <Banner variant="warning" title="Sandbox mode" onDismiss={...}>
 *     Emails are logged, not sent.
 *   </Banner>
 *
 * Variants map to the status tint tokens (index.css): info / success /
 * warning / danger / neutral.
 */
import * as React from 'react'
import { Info, CheckCircle, Warning, WarningCircle, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type BannerVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const VARIANT_CLASSES: Record<BannerVariant, string> = {
  info: 'bg-info-tint/60 border-info/30',
  success: 'bg-success-tint/60 border-success/30',
  warning: 'bg-warning-tint/60 border-warning/40',
  danger: 'bg-destructive/10 border-destructive/30',
  neutral: 'bg-surface-tint border-hairline',
}

const VARIANT_ICONS: Record<BannerVariant, React.ElementType> = {
  info: Info,
  success: CheckCircle,
  warning: Warning,
  danger: WarningCircle,
  neutral: Info,
}

interface BannerProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  variant?: BannerVariant
  /** Bold lead line. Optional — children alone suits one-line notices. */
  title?: React.ReactNode
  /** Trailing action slot (e.g. a small Button or link). */
  action?: React.ReactNode
  /** Renders a dismiss button when provided. */
  onDismiss?: () => void
  /** Hide the status icon (default shown). */
  hideIcon?: boolean
}

export function Banner({
  variant = 'info',
  title,
  action,
  onDismiss,
  hideIcon = false,
  className,
  children,
  ...props
}: BannerProps) {
  const Icon = VARIANT_ICONS[variant]
  return (
    <div
      // Danger banners interrupt (role=alert → assertive live region);
      // everything else queues politely.
      role={variant === 'danger' ? 'alert' : 'status'}
      data-slot="banner"
      data-variant={variant}
      className={cn(
        'flex w-full items-start gap-3 border-y px-4 py-2.5 text-sm',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {!hideIcon && <Icon weight="fill" className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'text-muted-foreground')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 self-center opacity-60 hover:opacity-100"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
