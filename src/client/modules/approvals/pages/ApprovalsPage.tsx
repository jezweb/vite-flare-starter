/**
 * ApprovalsPage — standalone deep-link target for one or more approvals.
 *
 * Day-to-day flow lives in /dashboard/inbox now (Slice A — sidebar
 * entry removed). This page is preserved for:
 *
 *   - `/dashboard/approvals?focus=<id>` deep links from notifications
 *   - `?status=all` history view (resolved approvals)
 *
 * The actual approve/reject card is shared with Inbox via the
 * extracted `ApprovalCard` component (`../components/ApprovalCard.tsx`).
 * One source of truth for both surfaces.
 */
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/client/components/EmptyState'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageFilters, PageFilterTabs } from '@/components/ui/page-filters'
import { PageLoading } from '@/client/components/PageState'
import { apiClient } from '@/client/lib/api-client'
import { ApprovalCard, type Approval } from '../components/ApprovalCard'

interface ListResponse {
  total: number
  approvals: Approval[]
}

type Filter = 'pending' | 'all'

export function ApprovalsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const filter: Filter = searchParams.get('status') === 'all' ? 'all' : 'pending'
  const focus = searchParams.get('focus')

  const setFilter = (next: Filter) => {
    const p = new URLSearchParams(searchParams)
    if (next === 'pending') p.delete('status')
    else p.set('status', 'all')
    setSearchParams(p, { replace: true })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['approvals', filter],
    queryFn: () =>
      apiClient.get<ListResponse>(
        `/api/approvals?status=${filter === 'all' ? 'all' : 'pending'}&limit=200`
      ),
    refetchInterval: filter === 'pending' ? 15_000 : false,
  })

  return (
    <PageContainer type="queue">
      <PageHeader
        title="Approvals"
        subtitle="Your AI is asking before sending an email, posting a message, or updating its memory. Approve, reject, or edit before it acts."
      />

      <PageFilters>
        <PageFilterTabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsTrigger value="pending">
            Pending
            {data && filter === 'pending' && data.total > 0 && (
              <Badge variant="secondary" className="ml-2 h-5">
                {data.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </PageFilterTabs>
      </PageFilters>

      {isLoading && <PageLoading variant="list" count={3} />}

      {!isLoading && data && data.total === 0 && (
        <EmptyState
          icon={Inbox}
          title={filter === 'pending' ? 'No pending approvals' : 'No approvals yet'}
          description={
            filter === 'pending'
              ? "Nothing to review. When the AI proposes a destructive action (sending an email, posting a message, saving a memory), it'll queue here first."
              : 'Resolved approvals will appear here once agents start queuing actions.'
          }
          tips={
            filter === 'pending'
              ? [
                  'Ask the AI in chat to draft and send an email',
                  'Memory updates the AI proposes also land here',
                ]
              : undefined
          }
          action={
            filter === 'pending'
              ? { label: 'Open chat', onClick: () => navigate('/dashboard/chat') }
              : undefined
          }
        />
      )}

      {!isLoading && data && data.total > 0 && (
        <div className="space-y-3">
          {data.approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} highlight={focus === a.id} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}

export default ApprovalsPage
