/**
 * DetailHeader — the canonical top-of-page bar for `type="detail"` pages.
 *
 * Single-record dwell surfaces (project page, routine detail, space page,
 * conversation page) all share the same shape:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  ← back-link                                                     │
 *   │  RECORD NAME                       [primary action] [⋯ kebab]    │
 *   │  status · meta · meta                                            │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Body sub-patterns vary (single-column / two-column split / three-pane /
 * tabs — see PAGE_GRAMMAR.md). DetailHeader doesn't constrain the body;
 * it just locks down the top so every detail page reads the same way.
 *
 * Usage:
 *   <DetailHeader
 *     backTo="/dashboard/projects"
 *     backLabel="Projects"
 *     title={project.name}
 *     subtitle={<>updated {timeAgo} · {chatCount} chats</>}
 *     trailing={<>
 *       <Button>Start chat</Button>
 *       <DropdownMenu>…</DropdownMenu>
 *     </>}
 *   />
 *
 * Sets `document.title` to the record name (override with docTitle if you
 * want something other than the literal title, e.g. for non-string titles).
 */
import * as React from 'react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { appConfig } from '@/shared/config/app'

interface DetailHeaderProps {
  /** Title — usually the record's name. Sets document.title when string. */
  title: React.ReactNode
  /** Optional eyebrow back-link to the parent index page. */
  backTo?: string
  /** Optional label for the back-link. Defaults to "Back". */
  backLabel?: string
  /** One-line metadata under the title (status badges, age, owner). */
  subtitle?: React.ReactNode
  /** Right-side action cluster — primary CTA + optional kebab. */
  trailing?: React.ReactNode
  /** Override document.title (e.g. "Project · X" instead of just title string). */
  docTitle?: string
  className?: string
}

export function DetailHeader({
  title,
  backTo,
  backLabel = 'Back',
  subtitle,
  trailing,
  docTitle,
  className,
}: DetailHeaderProps) {
  useEffect(() => {
    const fallback = typeof title === 'string' ? title : null
    const text = docTitle ?? fallback
    if (text) document.title = `${text} · ${appConfig.name}`
  }, [title, docTitle])

  return (
    <header data-slot="detail-header" className={cn('space-y-2', className)}>
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-3" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              {subtitle}
            </div>
          )}
        </div>
        {trailing && (
          <div
            data-slot="detail-header-trailing"
            className="flex flex-wrap items-center gap-2 shrink-0"
          >
            {trailing}
          </div>
        )}
      </div>
    </header>
  )
}

DetailHeader.displayName = 'DetailHeader'
