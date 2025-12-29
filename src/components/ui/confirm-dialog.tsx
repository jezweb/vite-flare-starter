/**
 * Confirmation Dialog Component
 *
 * A reusable dialog for confirming destructive actions.
 * Uses AlertDialog from shadcn/ui.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm()
    // Don't close automatically - let the parent handle it
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              variant === 'destructive' &&
                buttonVariants({ variant: 'destructive' })
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Please wait...
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Hook for managing confirm dialog state
 */
import { useState, useCallback } from 'react'

interface UseConfirmDialogOptions<T = void> {
  onConfirm: (data: T) => void | Promise<void>
}

export function useConfirmDialog<T = void>({ onConfirm }: UseConfirmDialogOptions<T>) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingData, setPendingData] = useState<T | null>(null)

  const openDialog = useCallback((data: T) => {
    setPendingData(data)
    setOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setOpen(false)
    setPendingData(null)
    setIsLoading(false)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (pendingData === null) return

    setIsLoading(true)
    try {
      await onConfirm(pendingData)
      closeDialog()
    } catch (error) {
      setIsLoading(false)
      throw error
    }
  }, [pendingData, onConfirm, closeDialog])

  return {
    open,
    isLoading,
    pendingData,
    openDialog,
    closeDialog,
    handleConfirm,
    setOpen,
  }
}
