/**
 * IdentityRow — avatar + name + secondary line (email or role).
 *
 * Replaces 4 hand-rolled blocks where each module computed initials
 * differently — Comments was using `userId.slice(0,2)` which renders
 * garbage to users.
 *
 *   <IdentityRow name="Jeremy Dawes" secondary="jeremy@jezweb.net" />
 *   <IdentityRow name={user.name} imageUrl={user.image} size="lg"
 *                rightSlot={<RoleBadge role="owner" />} />
 *
 * Initials calculation: first letter of name (split on whitespace,
 * take first character of first 1–2 segments). Fallback to first
 * letter of secondary, then "?". Always uppercase.
 */
import * as React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

type IdentitySize = 'sm' | 'md' | 'lg'

const avatarSize: Record<IdentitySize, string> = {
  sm: 'size-7',
  md: 'size-8',
  lg: 'size-10',
}

const titleSize: Record<IdentitySize, string> = {
  sm: 'text-xs font-medium',
  md: 'text-sm font-medium',
  lg: 'text-base font-medium',
}

interface IdentityRowProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string | null | undefined
  /** Email, role, or any secondary identifier. */
  secondary?: React.ReactNode
  /** Avatar image URL. Falls back to initials. */
  imageUrl?: string | null
  size?: IdentitySize
  /** Right-aligned slot — role badge, action button, etc. */
  rightSlot?: React.ReactNode
  /** Highlight as "you" with subtle styling. */
  isYou?: boolean
}

export function IdentityRow({
  name,
  secondary,
  imageUrl,
  size = 'md',
  rightSlot,
  isYou,
  className,
  ...rest
}: IdentityRowProps) {
  const initials = computeInitials(name, secondary)
  const displayName = name?.trim() || (typeof secondary === 'string' ? secondary : '?')
  return (
    <div data-slot="identity-row" className={cn('flex items-center gap-3', className)} {...rest}>
      <Avatar className={cn(avatarSize[size], 'shrink-0')}>
        {imageUrl && <AvatarImage src={imageUrl} alt={displayName} />}
        <AvatarFallback className="rounded-full text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('truncate', titleSize[size])}>{displayName}</span>
          {isYou && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              you
            </span>
          )}
        </div>
        {secondary && <p className="text-xs text-muted-foreground truncate">{secondary}</p>}
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  )
}

/**
 * Initials = first letter of each of the first 1–2 whitespace-split
 * name segments. "Jeremy Dawes" → "JD". "Jeremy" → "J". Empty →
 * fall back to secondary's first letter, then "?".
 */
function computeInitials(name: string | null | undefined, secondary: React.ReactNode): string {
  const trimmed = name?.trim()
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
    return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
  }
  if (typeof secondary === 'string' && secondary.trim()) {
    return secondary.trim().charAt(0).toUpperCase()
  }
  return '?'
}

IdentityRow.displayName = 'IdentityRow'
