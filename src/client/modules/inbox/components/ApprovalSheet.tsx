/**
 * ApprovalSheet — slide-in detail for an approval, mounted inside Inbox.
 *
 * Replaces the old route-bounce to /dashboard/approvals?focus=<id>. The
 * approval is fetched lazily when the sheet opens and rendered via the
 * shared ApprovalCard component (single source of truth for both this
 * surface and the standalone Approvals page).
 */
import { useQuery } from '@tanstack/react-query'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { apiClient } from '@/client/lib/api-client'
import {
  ApprovalCard,
  type Approval,
} from '@/client/modules/approvals/components/ApprovalCard'

interface Props {
  approvalId: string | null
  open: boolean
  onClose: () => void
}

export function ApprovalSheet({ approvalId, open, onClose }: Props) {
  const { data, isLoading, error } = useQuery<Approval>({
    queryKey: ['approvals', approvalId],
    queryFn: () => apiClient.get<Approval>(`/api/approvals/${approvalId}`),
    enabled: !!approvalId && open,
  })

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>Review approval</SheetTitle>
          <SheetDescription>
            Approve, reject, or edit before the AI acts.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex h-32 items-center justify-center">
              <Spinner size="lg" className="text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {(error as Error).message}
            </div>
          )}
          {data && <ApprovalCard approval={data} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
