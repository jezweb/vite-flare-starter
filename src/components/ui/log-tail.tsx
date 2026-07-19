/**
 * LogTail — wrangler-tail-style log viewer: monospace rows, level
 * tints, dim timestamps, click-to-expand detail. The rendering half of
 * an observability story — feed it agent run steps, webhook events,
 * email delivery events, or a live stream.
 *
 *   <LogTail
 *     lines={runs.map(r => ({
 *       id: r.id, ts: r.startedAt, level: r.outcome === 'error' ? 'error' : 'info',
 *       text: `${r.agentClass} · ${r.trigger}`,
 *       detail: JSON.stringify(r, null, 2),
 *     }))}
 *     follow
 *   />
 *
 * `follow` keeps the view pinned to the newest line ONLY while the user
 * is already at the bottom — scrolling up to read always wins over the
 * stream (the wrangler-tail behaviour people expect).
 *
 * Rows are plain divs unless `detail` is present (then a button with
 * aria-expanded). String details render in a <pre>; nodes render as-is.
 */
import * as React from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogLine {
  /** Stable identity; falls back to index (fine for append-only data). */
  id?: string
  ts?: string | number | Date
  level?: LogLevel
  text: string
  /** Expandable body — string renders preformatted, nodes render as-is. */
  detail?: React.ReactNode
}

const LEVEL_DOT: Record<LogLevel, string> = {
  debug: 'bg-muted-foreground/40',
  info: 'bg-chart-1',
  warn: 'bg-warning',
  error: 'bg-destructive',
}

function defaultFormatTs(ts: string | number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

interface LogTailProps {
  lines: LogLine[]
  /** Scroll container max height in px. */
  maxHeight?: number
  /** Pin to newest line while the user is at the bottom. */
  follow?: boolean
  formatTs?: (ts: string | number | Date) => string
  emptyText?: string
  className?: string
}

export function LogTail({
  lines,
  maxHeight = 320,
  follow = false,
  formatTs = defaultFormatTs,
  emptyText = 'No log lines yet.',
  className,
}: LogTailProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  // Tracks whether the user was at the bottom BEFORE new lines arrived,
  // so follow-mode never fights an upward scroll.
  const atBottomRef = React.useRef(true)

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  // Depends on the lines ARRAY, not its length — a rolling tail buffer
  // (drop oldest + append newest) keeps length constant, and that's
  // exactly the case follow-mode exists for.
  React.useEffect(() => {
    const el = scrollRef.current
    if (follow && el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [lines, follow])

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div
      data-slot="log-tail"
      className={cn(
        'overflow-hidden rounded-md border bg-surface-recessed/40 font-mono text-xs',
        className
      )}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        className="overflow-y-auto"
        style={{ maxHeight }}
      >
        {lines.length === 0 ? (
          <p className="px-3 py-6 text-center font-sans text-muted-foreground">{emptyText}</p>
        ) : (
          lines.map((line, i) => {
            const key = line.id ?? `${i}`
            const isOpen = expanded.has(key)
            const hasDetail = line.detail != null
            const level = line.level ?? 'info'
            const rowInner = (
              <>
                {hasDetail ? (
                  <CaretRight
                    aria-hidden
                    className={cn(
                      'mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-90'
                    )}
                  />
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <span
                  aria-hidden
                  className={cn('mt-1 size-1.5 shrink-0 rounded-full', LEVEL_DOT[level])}
                />
                {/* Severity must survive without color perception. */}
                {(level === 'warn' || level === 'error') && (
                  <span className="sr-only">{level === 'warn' ? 'Warning:' : 'Error:'}</span>
                )}
                {line.ts !== undefined && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatTs(line.ts)}
                  </span>
                )}
                <span className="min-w-0 whitespace-pre-wrap break-words text-left">
                  {line.text}
                </span>
              </>
            )
            const rowClass =
              'flex w-full items-start gap-2 px-3 py-1 hover:bg-muted/40'
            return (
              <div key={key} className="border-b border-hairline last:border-b-0">
                {hasDetail ? (
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-expanded={isOpen}
                    aria-controls={`log-detail-${key}`}
                    className={cn(rowClass, 'cursor-pointer')}
                  >
                    {rowInner}
                  </button>
                ) : (
                  <div className={rowClass}>{rowInner}</div>
                )}
                {isOpen && hasDetail && (
                  <div
                    id={`log-detail-${key}`}
                    className="border-t border-hairline bg-surface-recessed/60 px-8 py-2"
                  >
                    {typeof line.detail === 'string' ? (
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground">
                        {line.detail}
                      </pre>
                    ) : (
                      line.detail
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

LogTail.displayName = 'LogTail'
