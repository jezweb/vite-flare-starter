/**
 * AdminAgentPage — `/dashboard/admin`
 *
 * One-shot landing page that ensures the user has an `admin` Space
 * with AdminAgent as a member, then redirects to that Space.
 *
 * Why a landing page instead of provisioning on dashboard mount: the
 * provisioning is rare (most users only do it once). Putting it in a
 * dedicated page keeps the dashboard fast and lets us render a clear
 * loading state for the first-time setup. Returning users hit the
 * same endpoint and bounce through in <100ms.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'

import { apiClient } from '@/client/lib/api-client'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'

interface EnsureResponse {
  id: string
  created: boolean
}

export function AdminAgentPage() {
  const navigate = useNavigate()

  const ensure = useMutation<EnsureResponse, Error, void>({
    mutationFn: () => apiClient.post<EnsureResponse>('/api/admin-agent/ensure-space', {}),
    onSuccess: (data) => {
      navigate(`/dashboard/spaces/${data.id}`, { replace: true })
    },
  })

  useEffect(() => {
    ensure.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PageContainer type="hub">
      <PageHeader
        title="Platform admin"
        subtitle="Talk to the AdminAgent — describe what you want set up; it proposes routines, agents, connections. You review + approve."
      />

      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-muted/30 px-6 py-16 text-center">
        <ShieldCheck className="size-10 text-primary" />
        {ensure.isError ? (
          <>
            <p className="text-sm text-destructive">
              Could not open admin chat: {(ensure.error as Error).message}
            </p>
            <Button onClick={() => ensure.mutate()} variant="outline">
              Try again
            </Button>
          </>
        ) : (
          <>
            <Spinner size="lg" className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {ensure.isPending ? 'Opening admin chat…' : 'Redirecting…'}
            </p>
          </>
        )}
      </div>
    </PageContainer>
  )
}

export default AdminAgentPage
