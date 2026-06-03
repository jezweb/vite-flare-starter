/**
 * HelpDisclosure — the canonical "Technical details" + "How this works"
 * collapsible. Wraps a styled `<details>` so every page surfaces
 * advanced detail the same way.
 *
 *   ▶ Technical details                ← summary line, collapsed by default
 *
 * When expanded:
 *   ▼ Technical details
 *     <KeyValueList>
 *       <KeyValueRow label="Approval ID" value={id} mono />
 *       …
 *     </KeyValueList>
 *
 * Tone-of-voice rule: never put internal slugs / UUIDs / SDK names in
 * the primary text of any page. Always wrap in HelpDisclosure.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

interface HelpDisclosureProps
  extends Omit<React.DetailsHTMLAttributes<HTMLDetailsElement>, 'title'> {
  /** Summary text — defaults to "Technical details". */
  title?: React.ReactNode
  /** Override the summary marker classes (e.g. for tone variations). */
  summaryClassName?: string
}

export function HelpDisclosure({
  title = 'Technical details',
  summaryClassName,
  className,
  children,
  ...rest
}: HelpDisclosureProps) {
  return (
    <details data-slot="help-disclosure" className={cn('group/disc text-xs', className)} {...rest}>
      <summary
        className={cn(
          'inline-flex cursor-pointer select-none items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors marker:hidden [&::-webkit-details-marker]:hidden',
          summaryClassName
        )}
      >
        <svg
          aria-hidden="true"
          className="size-3 transition-transform group-open/disc:rotate-90"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        {title}
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  )
}

HelpDisclosure.displayName = 'HelpDisclosure'
