/**
 * MentionPill — inline avatar+name chip for an @-mention.
 *
 * Renders inside message body wherever a mention part appears.
 */
import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  kind: 'user' | 'agent'
  label: string
  className?: string
}

export function MentionPill({ kind, label, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
        kind === 'agent'
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'bg-primary/10 text-primary',
        className
      )}
    >
      {kind === 'agent' ? <Bot className="size-3" /> : <User className="size-3" />}
      <span>{label}</span>
    </span>
  )
}
