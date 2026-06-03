import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: (yes: boolean) => void
  disabled?: boolean
}

export function ConfirmAction({
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  disabled,
}: Props) {
  const [responded, setResponded] = useState<'yes' | 'no' | null>(null)
  const isDisabled = disabled || responded !== null

  const handleResponse = (yes: boolean) => {
    if (isDisabled) return
    setResponded(yes ? 'yes' : 'no')
    onConfirm(yes)
  }

  return (
    <div className="rounded-lg border border-border p-3 max-w-md">
      <div className="flex gap-3">
        {destructive && <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm">{message}</p>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant={destructive ? 'destructive' : 'default'}
              onClick={() => handleResponse(true)}
              disabled={isDisabled}
            >
              {responded === 'yes' ? '✓' : ''} {confirmLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleResponse(false)}
              disabled={isDisabled}
            >
              {responded === 'no' ? '✓' : ''} {cancelLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
