import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_SOFT_BG } from '@/client/lib/status-colors'

interface Props {
  type?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  message: string
}

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle }
const STYLES = {
  info: STATUS_SOFT_BG.info,
  success: STATUS_SOFT_BG.success,
  warning: STATUS_SOFT_BG.warning,
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
}

export function AlertBox({ type = 'info', title, message }: Props) {
  const Icon = ICONS[type]
  return (
    <div className={cn('flex gap-3 rounded-lg border p-3 text-sm', STYLES[type])}>
      <Icon className="size-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div className="opacity-90">{message}</div>
      </div>
    </div>
  )
}
