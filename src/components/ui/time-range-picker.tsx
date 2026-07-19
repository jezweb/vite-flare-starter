/**
 * TimeRangePicker — CF-dashboard preset range control ("Last 24 hours
 * (GMT+10)" with the calendar icon). A styled wrapper over Select so
 * keyboard/AT behaviour is inherited; pages get one consistent range
 * control instead of ad-hoc ToggleGroups.
 *
 * Preset-only by design (matches the range keys server endpoints
 * accept). A fork needing custom from/to dates should extend this with
 * the Calendar popover rather than inventing a second control.
 *
 *   <TimeRangePicker value={range} onValueChange={setRange}
 *     options={[{ value: '7d', label: 'Last 7 days' }, ...]} />
 */
import * as React from 'react'
import { CalendarBlank } from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface TimeRangeOption {
  value: string
  label: string
}

export const DEFAULT_TIME_RANGES: TimeRangeOption[] = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

/** "GMT+10" / "GMT-5:30" for the viewer's zone, CF-style. */
function localGmtLabel(): string {
  const mins = -new Date().getTimezoneOffset()
  const sign = mins >= 0 ? '+' : '-'
  const abs = Math.abs(mins)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

interface TimeRangePickerProps {
  value: string
  onValueChange: (value: string) => void
  options?: TimeRangeOption[]
  /** Append the viewer's GMT offset to the trigger (CF idiom). */
  showTimezone?: boolean
  className?: string
}

export function TimeRangePicker({
  value,
  onValueChange,
  options = DEFAULT_TIME_RANGES,
  showTimezone = true,
  className,
}: TimeRangePickerProps) {
  // Computed once per mount. SPA-only assumption: an SSR fork would
  // need this moved into an effect to avoid a hydration text mismatch.
  const gmt = React.useMemo(localGmtLabel, [])
  return (
    <Select value={value} onValueChange={(v) => v != null && onValueChange(v)}>
      <SelectTrigger
        aria-label="Date range"
        className={cn('h-8 w-auto gap-1.5 text-xs font-medium', className)}
      >
        <CalendarBlank className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <SelectValue />
        {showTimezone && (
          <span className="text-muted-foreground font-normal">({gmt})</span>
        )}
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

TimeRangePicker.displayName = 'TimeRangePicker'
