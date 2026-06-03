/**
 * PageHeader — the canonical page-top primitive.
 *
 * Every dashboard page renders a PageHeader. It owns:
 *   - The H1 (`text-2xl font-semibold tracking-tight`)
 *   - The subtitle (`text-sm text-muted-foreground`)
 *   - The primary + optional secondary CTA in the trailing slot
 *   - `document.title` — sets it as a side effect, fixing the bug where
 *     pages without a nav entry inherited "Home" from the layout's
 *     prefix-match heuristic
 *   - Optional `<PageHeaderHelp>` slot below subtitle (e.g. "Technical
 *     details" disclosure for two-tier copy)
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  TITLE                                          [primary CTA]  │
 *   │  Subtitle line that explains what this page is for.            │
 *   │  [help disclosure]                                             │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * No page is allowed to hand-roll its own header markup. If a page
 * needs something PageHeader doesn't expose, extend the primitive —
 * don't bypass it. That's how randomness creeps back in.
 */
import * as React from 'react'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { appConfig } from '@/shared/config/app'

interface PageHeaderProps {
  /** The page title — also written to document.title. */
  title: React.ReactNode
  /**
   * One-sentence answer to "what am I doing here?". Optional only when
   * the H1 alone is unambiguous (rare).
   */
  subtitle?: React.ReactNode
  /**
   * The string used for `document.title` ("X · App Name"). Defaults to
   * the value of `title` when it's a string. Pass explicitly when title
   * is a ReactNode (e.g. "Good night, Jeremy" → docTitle="Home").
   */
  docTitle?: string
  /** Trailing toolbar — primary CTA + optional secondary. */
  trailing?: React.ReactNode
  /** Optional row below subtitle (links / disclosures / capability chips). */
  help?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  docTitle,
  trailing,
  help,
  className,
}: PageHeaderProps) {
  useEffect(() => {
    const fallback = typeof title === 'string' ? title : null
    const text = docTitle ?? fallback
    if (text) document.title = `${text} · ${appConfig.name}`
  }, [title, docTitle])

  return (
    <header
      data-slot="page-header"
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground max-w-2xl">{subtitle}</p>}
        {help && <div className="pt-1">{help}</div>}
      </div>
      {trailing && (
        <div
          data-slot="page-header-trailing"
          className="flex flex-wrap items-center gap-2 shrink-0"
        >
          {trailing}
        </div>
      )}
    </header>
  )
}

PageHeader.displayName = 'PageHeader'
