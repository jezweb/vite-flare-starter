/**
 * PageContainer — type-aware page outer wrapper.
 *
 * Sets the max-width and vertical rhythm based on the page TYPE:
 *
 *   queue   → max-w-3xl   (Inbox, Notifications, Approvals, Routines, Activity, Files)
 *   index   → max-w-5xl   (Projects, Spaces, Skills)
 *   detail  → max-w-5xl   (project / routine detail; can be overridden to 7xl)
 *   form    → max-w-3xl   (New Routine, Settings, Admin, Organization)
 *   catalog → max-w-5xl   (Connections, model picker)
 *   hub     → max-w-5xl   (Dashboard Home — mixed layout allowed)
 *
 * No page is allowed to hand-pick `max-w-*`. If a layout genuinely
 * needs to break the contract, that's a new type — add it to the docs
 * and to this primitive.
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

type PageType = 'queue' | 'index' | 'detail' | 'form' | 'catalog' | 'hub'

const widthFor: Record<PageType, string> = {
  queue: 'max-w-3xl',
  index: 'max-w-5xl',
  detail: 'max-w-5xl',
  form: 'max-w-3xl',
  catalog: 'max-w-5xl',
  hub: 'max-w-5xl',
}

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  type: PageType
  /**
   * Override the max-width for special cases. Use sparingly — prefer
   * picking the right type. When set, it replaces the type's default
   * max-width entirely.
   */
  maxWidth?: 'sm' | 'md' | 'lg' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'none'
}

export function PageContainer({
  type,
  maxWidth,
  className,
  children,
  ...rest
}: PageContainerProps) {
  const width =
    maxWidth === 'none'
      ? ''
      : maxWidth
        ? `max-w-${maxWidth}`
        : widthFor[type]
  return (
    <div
      data-slot="page-container"
      data-page-type={type}
      className={cn('container mx-auto space-y-6', width, className)}
      {...rest}
    >
      {children}
    </div>
  )
}

PageContainer.displayName = 'PageContainer'
