import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Feature {
  label: string
  value: string | boolean
}

interface Option {
  title: string
  subtitle?: string
  highlight?: boolean
  features: Feature[]
  cta?: string
}

interface Props {
  options: Option[]
  onSelect?: (optionTitle: string) => void
}

export function ComparisonCards({ options, onSelect }: Props) {
  return (
    <div
      className={cn(
        'grid gap-3',
        options.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      )}
    >
      {options.map((opt) => (
        <div
          key={opt.title}
          className={cn(
            'rounded-lg border p-3',
            opt.highlight ? 'border-primary bg-primary/5' : 'border-border'
          )}
        >
          {opt.highlight && (
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">
              Recommended
            </div>
          )}
          <div className="font-semibold text-sm">{opt.title}</div>
          {opt.subtitle && <div className="text-xs text-muted-foreground mb-2">{opt.subtitle}</div>}
          <ul className="space-y-1 mt-2 mb-3">
            {opt.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {typeof f.value === 'boolean' ? (
                  f.value ? (
                    <Check className="size-3.5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                  ) : (
                    <X className="size-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                  )
                ) : (
                  <span className="text-muted-foreground shrink-0">•</span>
                )}
                <span
                  className={cn(
                    'flex-1',
                    typeof f.value === 'boolean' && !f.value && 'text-muted-foreground/50'
                  )}
                >
                  {typeof f.value === 'string' ? `${f.label}: ${f.value}` : f.label}
                </span>
              </li>
            ))}
          </ul>
          {opt.cta && onSelect && (
            <Button
              size="sm"
              variant={opt.highlight ? 'default' : 'outline'}
              className="w-full"
              onClick={() => onSelect(opt.title)}
            >
              {opt.cta}
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
