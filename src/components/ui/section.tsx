/**
 * Section — labelled content block.
 *
 * Used to group related content under a small uppercase label, with
 * optional description and trailing action. Provides consistent vertical
 * spacing between sections on long pages (Connectors, Settings, Skills
 * detail, Project detail).
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  SECTION TITLE                                  [trailing]     │
 *   │  Optional description                                          │
 *   │  ───────────────────────────────────────────────────────────── │
 *   │  {children}                                                    │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Variants:
 *   - `default` — small uppercase label; grouping helper
 *   - `headline` — larger title; reads as a sub-section heading
 *
 * Use `Section.Header` + `Section.Title` + `Section.Description` for
 * advanced layouts; the simple form takes `title` / `description` as
 * props for the common case.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Short label / title above the section content */
  title?: React.ReactNode
  /** Optional one-line description under the title */
  description?: React.ReactNode
  /** Right-aligned slot (button, link, count badge) on the title row */
  trailing?: React.ReactNode
  /** Use a larger headline style (default is small uppercase). */
  variant?: 'default' | 'headline'
}

const Section = React.forwardRef<HTMLElement, SectionProps>(
  ({ className, title, description, trailing, variant = 'default', children, ...props }, ref) => {
    return (
      <section ref={ref} data-slot="section" className={cn('space-y-3', className)} {...props}>
        {(title || description || trailing) && (
          <SectionHeader>
            <div className="min-w-0 flex-1 space-y-0.5">
              {title && <SectionTitle variant={variant}>{title}</SectionTitle>}
              {description && <SectionDescription>{description}</SectionDescription>}
            </div>
            {trailing && <div className="shrink-0">{trailing}</div>}
          </SectionHeader>
        )}
        {children}
      </section>
    )
  }
)
Section.displayName = 'Section'

const SectionHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="section-header"
      className={cn('flex items-start justify-between gap-3', className)}
      {...props}
    />
  )
)
SectionHeader.displayName = 'Section.Header'

const SectionTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { variant?: 'default' | 'headline' }
>(({ className, variant = 'default', ...props }, ref) => (
  <h2
    ref={ref}
    data-slot="section-title"
    className={cn(
      variant === 'headline'
        ? 'text-base font-semibold tracking-tight'
        : 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
      className
    )}
    {...props}
  />
))
SectionTitle.displayName = 'Section.Title'

const SectionDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="section-description"
    className={cn('text-xs text-muted-foreground', className)}
    {...props}
  />
))
SectionDescription.displayName = 'Section.Description'

export { Section, SectionHeader, SectionTitle, SectionDescription }
