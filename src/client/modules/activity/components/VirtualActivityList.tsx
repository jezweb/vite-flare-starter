/**
 * VirtualActivityList — windowed list of activity rows.
 *
 * Uses `useWindowVirtualizer` from `@tanstack/react-virtual` so the page
 * scroller drives virtualization (filters/header scroll naturally with
 * the content). Only visible rows mount, so a 100-row page stays smooth
 * — and the foundation is in place to switch to infinite-scroll later.
 *
 * Semantics: the outer wrapper is still styled like a `ListRowGroup`
 * (border + divide-y look) using a div with `role="list"`, so screen
 * readers see this as a list and each row's `role="listitem"`.
 * Absolute positioning inside a tall spacer is required by the
 * virtualizer; we can't use `<ul>/<li>` here because absolute children
 * of `<ul>` break the table-style divide-y border treatment.
 *
 * Phase 1 of issue #52.
 */
import { useRef } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import type { Activity } from '../hooks/useActivity'

interface VirtualActivityListProps {
  activities: Activity[]
  renderRow: (activity: Activity) => React.ReactNode
  /** Estimated row height in px. Most activity rows are ~56px. */
  estimateSize?: number
}

export function VirtualActivityList({
  activities,
  renderRow,
  estimateSize = 56,
}: VirtualActivityListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)

  const virtualizer = useWindowVirtualizer({
    count: activities.length,
    estimateSize: () => estimateSize,
    overscan: 6,
    // Account for the offset between the page top and where the list
    // actually starts (header + stats + filters above it). Without this
    // the virtualizer thinks row 0 is at scrollY=0 and renders/measures
    // wrong rows during scroll.
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  })

  return (
    <div
      ref={parentRef}
      role="list"
      className={cn('rounded-md border bg-card overflow-hidden')}
      style={{
        // The full virtual height keeps the page scrollbar accurate
        // even though only a few rows are mounted at any time.
        height: virtualizer.getTotalSize(),
        position: 'relative',
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const activity = activities[virtualRow.index]
        if (!activity) return null
        return (
          <div
            key={activity.id}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            role="listitem"
            // Divide-y look: every row except the first gets a top border.
            className={cn(
              'absolute left-0 right-0',
              virtualRow.index > 0 && 'border-t',
            )}
            style={{
              transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {renderRow(activity)}
          </div>
        )
      })}
    </div>
  )
}
