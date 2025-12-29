/**
 * Password Strength Meter Component
 *
 * Visual indicator of password strength with requirements checklist.
 */

import { useMemo } from 'react'
import { Check, X } from 'lucide-react'
import {
  checkPasswordStrength,
  getPasswordRequirements,
  getStrengthColor,
} from '@/shared/lib/password-strength'
import { cn } from '@/lib/utils'

interface PasswordStrengthMeterProps {
  password: string
  showRequirements?: boolean
  className?: string
}

export function PasswordStrengthMeter({
  password,
  showRequirements = true,
  className,
}: PasswordStrengthMeterProps) {
  const strength = useMemo(() => checkPasswordStrength(password), [password])
  const requirements = useMemo(() => getPasswordRequirements(password), [password])

  if (!password) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Password strength</span>
          <span
            className={cn(
              'text-xs font-medium',
              strength.score === 0 && 'text-destructive',
              strength.score === 1 && 'text-orange-500',
              strength.score === 2 && 'text-yellow-500',
              strength.score === 3 && 'text-green-500',
              strength.score === 4 && 'text-emerald-500'
            )}
          >
            {strength.label}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300', getStrengthColor(strength.score))}
            style={{ width: `${((strength.score + 1) / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Requirements checklist */}
      {showRequirements && (
        <ul className="space-y-1">
          {requirements.map((req, index) => (
            <li
              key={index}
              className={cn(
                'flex items-center gap-1.5 text-xs',
                req.met ? 'text-green-600' : 'text-muted-foreground'
              )}
            >
              {req.met ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : (
                <X className="h-3 w-3 shrink-0" />
              )}
              {req.label}
            </li>
          ))}
        </ul>
      )}

      {/* Feedback */}
      {strength.feedback.length > 0 && !showRequirements && (
        <ul className="space-y-0.5">
          {strength.feedback.map((item, index) => (
            <li key={index} className="text-xs text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
