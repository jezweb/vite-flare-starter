/**
 * Empty State Component
 *
 * A reusable component for displaying empty states in lists and tables.
 * Supports icon, title, description, and optional action button.
 */
import type { ReactNode, ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  /** Lucide icon component to display */
  icon?: ComponentType<LucideProps>
  /** Title text */
  title: string
  /** Description text */
  description?: string
  /** Action button label */
  actionLabel?: string
  /** Action button click handler */
  onAction?: () => void
  /** Additional action button (secondary) */
  secondaryActionLabel?: string
  /** Secondary action click handler */
  onSecondaryAction?: () => void
  /** Custom content to render */
  children?: ReactNode
  /** Additional CSS classes */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
}

const sizeStyles = {
  sm: {
    container: 'py-6',
    iconWrapper: 'h-10 w-10',
    icon: 'h-5 w-5',
    title: 'text-sm font-medium',
    description: 'text-xs',
  },
  md: {
    container: 'py-10',
    iconWrapper: 'h-12 w-12',
    icon: 'h-6 w-6',
    title: 'text-base font-medium',
    description: 'text-sm',
  },
  lg: {
    container: 'py-16',
    iconWrapper: 'h-16 w-16',
    icon: 'h-8 w-8',
    title: 'text-lg font-semibold',
    description: 'text-base',
  },
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  children,
  className,
  size = 'md',
}: EmptyStateProps) {
  const styles = sizeStyles[size]

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        styles.container,
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-muted mb-4',
            styles.iconWrapper
          )}
        >
          <Icon className={cn('text-muted-foreground', styles.icon)} />
        </div>
      )}

      <h3 className={cn('text-foreground', styles.title)}>{title}</h3>

      {description && (
        <p className={cn('text-muted-foreground mt-1 max-w-sm', styles.description)}>
          {description}
        </p>
      )}

      {children}

      {(actionLabel || secondaryActionLabel) && (
        <div className="flex gap-2 mt-4">
          {actionLabel && onAction && (
            <Button onClick={onAction} size={size === 'sm' ? 'sm' : 'default'}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button
              variant="outline"
              onClick={onSecondaryAction}
              size={size === 'sm' ? 'sm' : 'default'}
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
