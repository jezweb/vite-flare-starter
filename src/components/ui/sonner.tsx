import { CheckCircleIcon, InfoIcon, WarningOctagonIcon, WarningIcon } from '@phosphor-icons/react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { Spinner } from '@/components/ui/spinner'

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <WarningIcon className="size-4" />,
        error: <WarningOctagonIcon className="size-4" />,
        loading: <Spinner size="md" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
