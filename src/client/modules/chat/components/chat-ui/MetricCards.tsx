import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Metric {
  label: string
  value: string
  trend?: string
  trendDirection?: 'up' | 'down' | 'neutral'
  icon?: string
}

interface Props {
  metrics: Metric[]
}

const TREND_ICONS = { up: TrendingUp, down: TrendingDown, neutral: Minus }
const TREND_COLORS = {
  up: 'text-green-600 dark:text-green-400',
  down: 'text-destructive',
  neutral: 'text-muted-foreground',
}

export function MetricCards({ metrics }: Props) {
  return (
    <div
      className={cn(
        'grid gap-2',
        metrics.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
      )}
    >
      {metrics.map((m, i) => {
        const TrendIcon = m.trendDirection ? TREND_ICONS[m.trendDirection] : null
        return (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">{m.label}</div>
            <div className="text-xl font-semibold mt-1">{m.value}</div>
            {m.trend && (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs mt-1',
                  m.trendDirection && TREND_COLORS[m.trendDirection]
                )}
              >
                {TrendIcon && <TrendIcon className="size-3" />}
                <span>{m.trend}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
