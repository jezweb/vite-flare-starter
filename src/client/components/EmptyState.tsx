/**
 * Empty State Component
 *
 * Shown when a list/page has no data yet. Provides context and a call-to-action
 * so empty pages are starting points, not dead ends.
 *
 * @example
 * <EmptyState
 *   icon={FileText}
 *   title="No documents yet"
 *   description="Create your first document to get started."
 *   action={{ label: "Create Document", onClick: () => navigate('/new') }}
 * />
 *
 * @example with tips
 * <EmptyState
 *   icon={Zap}
 *   title="No skills yet"
 *   description="Skills are reusable agent procedures."
 *   tips={["Type /skill-name in chat to invoke one", "Install from GitHub or upload a SKILL.md"]}
 *   action={{ label: "Add skill", onClick: () => {} }}
 * />
 */
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'secondary'
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /**
   * Up to 3 short tips rendered as a bulleted list above the actions.
   * Use to explain *how* the user gets data into this view when the
   * description alone isn't enough (e.g. "type /skill-name in chat").
   */
  tips?: string[]
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  tips,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className ?? ''}`}>
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {tips && tips.length > 0 && (
        <ul className="mb-6 max-w-sm space-y-1 text-left text-sm text-muted-foreground">
          {tips.slice(0, 3).map((tip) => (
            <li key={tip} className="flex gap-2">
              <span aria-hidden="true" className="mt-1 block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <Button onClick={action.onClick} variant={action.variant ?? 'default'}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} variant={secondaryAction.variant ?? 'outline'}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
