/**
 * PageHeader — the canonical page-top primitive.
 *
 * Every dashboard page renders a PageHeader. It owns:
 *   - The H1 (`text-3xl font-semibold tracking-tight`)
 *   - The subtitle (`text-sm text-muted-foreground`)
 *   - The primary + optional secondary CTA in the trailing slot
 *   - `document.title` — sets it as a side effect, fixing the bug where
 *     pages without a nav entry inherited "Home" from the layout's
 *     prefix-match heuristic
 *   - Optional `<PageHeaderHelp>` slot below subtitle (e.g. "Technical
 *     details" disclosure for two-tier copy)
 *
 * Layout (Kumo page-header anatomy — breadcrumbs/tabs slots optional):
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  [breadcrumbs strip, hairline-divided]                         │
 *   │  TITLE (3xl)                                    [primary CTA]  │
 *   │  Subtitle line that explains what this page is for.            │
 *   │  [help disclosure]                                             │
 *   │  [tab bar, hairline-divided]                                   │
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
  /**
   * Optional breadcrumb strip rendered ABOVE the title, hairline-divided —
   * Kumo page-header anatomy (breadcrumbs → title → description → tabs).
   * Pass a <Breadcrumbs/> element; detail pages inside a module want this,
   * top-level pages usually don't.
   */
  breadcrumbs?: React.ReactNode
  /**
   * Optional tab bar rendered below the header block, hairline-divided.
   * Pass a <TabsList/> (or full Tabs header) — content panels live in the
   * page body.
   */
  tabs?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  docTitle,
  trailing,
  help,
  breadcrumbs,
  tabs,
  className,
}: PageHeaderProps) {
  useEffect(() => {
    const fallback = typeof title === 'string' ? title : null
    const text = docTitle ?? fallback
    if (text) document.title = `${text} · ${appConfig.name}`
  }, [title, docTitle])

  return (
    <header data-slot="page-header" className={cn('flex flex-col gap-2', className)}>
      {breadcrumbs && (
        <div data-slot="page-header-breadcrumbs" className="border-b border-hairline pb-2">
          {breadcrumbs}
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-base text-muted-foreground max-w-prose">{subtitle}</p>}
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
      </div>
      {tabs && (
        <div data-slot="page-header-tabs" className="border-b border-hairline pt-1">
          {tabs}
        </div>
      )}
    </header>
  )
}

PageHeader.displayName = 'PageHeader'
