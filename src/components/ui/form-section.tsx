/**
 * FormSection — a labelled group of form fields.
 *
 * Pairs a Section.headline with a vertical FieldGroup so settings tabs,
 * admin forms, and create/edit pages all use the same rhythm:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  Profile information                          [optional trailing] │
 *   │  Update your personal details and avatar.                         │
 *   │  ───────────────────────────────────────────────────────────────  │
 *   │  [Field]                                                          │
 *   │  [Field]                                                          │
 *   │  [Field]                                                          │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Use only inside `type="form"` pages. The default density is `comfortable`
 * (Card chrome + p-6 + space-y-4); use `compact` for in-list edit forms.
 *
 * Why this exists: 8 settings tabs each invented their own field layout
 * before this primitive landed; `<FormSection>` collapses them to one
 * shape so a returning user doesn't re-orient on every tab.
 */
import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface FormSectionProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Optional right-aligned slot in the section header (e.g. status badge). */
  trailing?: React.ReactNode
  /** Visual density. Default `comfortable` wraps in Card; `compact` skips Card. */
  density?: 'comfortable' | 'compact'
  /** When true, separate header and body with a divider rule. */
  divided?: boolean
  className?: string
  children: React.ReactNode
}

export function FormSection({
  title,
  description,
  trailing,
  density = 'comfortable',
  divided = false,
  className,
  children,
}: FormSectionProps) {
  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  )

  const body = (
    <div
      data-slot="form-section-body"
      className={cn('space-y-4', divided && 'mt-4 pt-4 border-t')}
    >
      {children}
    </div>
  )

  if (density === 'compact') {
    return (
      <section data-slot="form-section" className={cn('space-y-3', className)}>
        {header}
        {body}
      </section>
    )
  }

  return (
    <Card data-slot="form-section" className={className}>
      <CardContent className="p-6 space-y-3">
        {header}
        {body}
      </CardContent>
    </Card>
  )
}

FormSection.displayName = 'FormSection'
