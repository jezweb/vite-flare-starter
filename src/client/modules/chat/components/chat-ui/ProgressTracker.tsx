import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_SOLID } from '@/client/lib/status-colors'

interface Step {
  label: string
  status: 'completed' | 'current' | 'upcoming'
  description?: string
}

interface Props {
  title?: string
  steps: Step[]
}

export function ProgressTracker({ title, steps }: Props) {
  const completed = steps.filter((s) => s.status === 'completed').length
  const total = steps.length
  const percent = Math.round((completed / total) * 100)

  return (
    <div className="rounded-lg border border-border p-3">
      {title && (
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">{title}</h3>
          <span className="text-xs text-muted-foreground">
            {completed}/{total} • {percent}%
          </span>
        </div>
      )}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div
              className={cn(
                'mt-0.5 size-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                step.status === 'completed' && STATUS_SOLID.success,
                step.status === 'current' && 'bg-primary text-primary-foreground',
                step.status === 'upcoming' && 'bg-muted text-muted-foreground'
              )}
            >
              {step.status === 'completed' ? <Check className="size-3" /> : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn('text-sm', step.status === 'upcoming' && 'text-muted-foreground')}>
                {step.label}
              </div>
              {step.description && (
                <div className="text-xs text-muted-foreground mt-0.5">{step.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
