/**
 * FindingsPage — agent-noticed observations + their graduated patterns.
 *
 * Two tabs:
 *   - Findings  (status: all | open | recurred | promoted | dismissed)
 *   - Learnings (graduated patterns; sourceFindingId points back)
 *
 * Each row shows: title + body preview + agent badge + status pill + time.
 * Clicking a finding expands it inline with Promote / Dismiss controls.
 *
 * Empty state on Findings tab includes a "Set up daily reflection"
 * pointer — once slice 3 ships, the CTA opens the new-routine wizard
 * pre-filled with the reflect skill. For now it links to /dashboard/routines/new.
 *
 * Goanna parallel: the agent's `<agent>/findings/` and `<agent>/learnings/`
 * folders aggregated across all the user's agents. UI default is
 * cross-agent; filter chips narrow by agent name.
 */
import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Lightbulb,
  BookOpen,
  Trash2,
  ChevronDown,
  ChevronRight,
  Clock,
  ArrowUpRight,
  Sparkles,
  RotateCcw,
} from 'lucide-react'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import {
  PageFilters,
  PageFilterTabs,
  PageFilterGroup,
  PageFilterChip,
} from '@/components/ui/page-filters'
import { TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/client/components/EmptyState'
import { PageLoading } from '@/client/components/PageState'
import { Time } from '@/components/ui/time'
import { apiClient } from '@/client/lib/api-client'
import { cn } from '@/lib/utils'

type FindingStatus = 'all' | 'open' | 'recurred' | 'promoted' | 'dismissed'

interface Finding {
  id: string
  type: 'finding' | 'learning'
  title: string
  status: string
  body: string
  category: string | null
  tags: string[]
  agentClass: string | null
  agentName: string | null
  recurrenceCount: number
  sourceFindingId: string | null
  promotedAt: number | null
  dismissedReason: string | null
  createdAt: number
  updatedAt: number
}

interface FindingsResponse {
  total: number
  findings: Finding[]
}
interface LearningsResponse {
  total: number
  learnings: Finding[]
}

const STATUS_OPTIONS: { value: FindingStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'recurred', label: 'Recurred' },
  { value: 'promoted', label: 'Promoted' },
  { value: 'dismissed', label: 'Dismissed' },
]

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'open':
      return 'outline'
    case 'recurred':
      return 'default'
    case 'promoted':
      return 'secondary'
    case 'dismissed':
      return 'destructive'
    case 'active':
      return 'default'
    default:
      return 'outline'
  }
}

export function FindingsPage() {
  const [tab, setTab] = useState<'findings' | 'learnings'>('findings')
  const [searchParams, setSearchParams] = useSearchParams()
  // P2-004 — status filter persisted in querystring so a filtered view
  // is reload-safe, bookmarkable, and shareable. Validates against the
  // known set; unknown values fall back to 'all'.
  const rawStatus = searchParams.get('status') ?? 'all'
  const statusFilter: FindingStatus = (
    ['all', 'open', 'recurred', 'promoted', 'dismissed'] as FindingStatus[]
  ).includes(rawStatus as FindingStatus)
    ? (rawStatus as FindingStatus)
    : 'all'
  const setStatusFilter = (next: FindingStatus) => {
    const updated = new URLSearchParams(searchParams)
    if (next === 'all') updated.delete('status')
    else updated.set('status', next)
    setSearchParams(updated, { replace: true })
  }
  const [expanded, setExpanded] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const findingsQuery = useQuery({
    queryKey: ['findings', statusFilter === 'all' ? null : statusFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('limit', '100')
      return apiClient.get<FindingsResponse>(`/api/findings?${params}`)
    },
    enabled: tab === 'findings',
  })

  const learningsQuery = useQuery({
    queryKey: ['learnings'],
    queryFn: () => apiClient.get<LearningsResponse>('/api/learnings?limit=100'),
    enabled: tab === 'learnings',
  })

  const promoteMutation = useMutation({
    mutationFn: (findingId: string) =>
      apiClient.post<{ finding: Finding; learning: Finding }>(
        `/api/findings/${findingId}/promote`,
        {}
      ),
    onSuccess: () => {
      toast.success('Finding promoted to a learning')
      queryClient.invalidateQueries({ queryKey: ['findings'] })
      queryClient.invalidateQueries({ queryKey: ['learnings'] })
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Promote failed'
      toast.error(message)
    },
  })

  // P4-007 — dismiss is wired with a captured-prior-status closure so
  // the toast's Undo action can call /reopen with the right target
  // (open vs recurred). The mutation receives the whole row instead of
  // just the id so onSuccess has access to the previous status.
  const dismissMutation = useMutation({
    mutationFn: (finding: Finding) =>
      apiClient
        .post<{ finding: Finding }>(`/api/findings/${finding.id}/dismiss`, {})
        .then((res) => ({ res, prior: finding.status })),
    onSuccess: ({ prior }, finding) => {
      const restoreStatus: 'open' | 'recurred' = prior === 'recurred' ? 'recurred' : 'open'
      // Sonner action callback fires when the user clicks Undo. The
      // toast auto-dismisses after the default duration (~10s) so the
      // window closes itself if no action is taken.
      toast.success('Finding dismissed', {
        action: {
          label: 'Undo',
          onClick: () =>
            reopenMutation.mutate(
              { findingId: finding.id, status: restoreStatus },
              {
                onSuccess: () => {
                  toast.success('Dismiss reverted')
                },
              }
            ),
        },
      })
      queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Dismiss failed'
      toast.error(message)
    },
  })

  // P4-008 — reopen a dismissed finding back to its prior status
  // (open or recurred). Reused by P4-007 for the dismiss-undo flow.
  const reopenMutation = useMutation({
    mutationFn: ({ findingId, status }: { findingId: string; status?: 'open' | 'recurred' }) =>
      apiClient.post<{ finding: Finding }>(
        `/api/findings/${findingId}/reopen`,
        status ? { status } : {}
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Reopen failed'
      toast.error(message)
    },
  })

  const isLoading = tab === 'findings' ? findingsQuery.isLoading : learningsQuery.isLoading
  const items = useMemo<Finding[]>(() => {
    if (tab === 'findings') return findingsQuery.data?.findings ?? []
    return learningsQuery.data?.learnings ?? []
  }, [tab, findingsQuery.data, learningsQuery.data])

  return (
    <PageContainer type="index">
      <PageHeader
        title="Findings"
        subtitle="What your agents have noticed — and what graduated to durable patterns."
        docTitle="Findings"
      />

      <PageFilters>
        <PageFilterTabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as 'findings' | 'learnings')
            setExpanded(null)
          }}
        >
          <TabsTrigger value="findings">
            <Lightbulb className="size-3.5" /> Findings
          </TabsTrigger>
          <TabsTrigger value="learnings">
            <BookOpen className="size-3.5" /> Learnings
          </TabsTrigger>
        </PageFilterTabs>

        {tab === 'findings' && (
          <PageFilterGroup>
            {STATUS_OPTIONS.map((opt) => (
              <PageFilterChip
                key={opt.value}
                active={statusFilter === opt.value}
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.label}
              </PageFilterChip>
            ))}
          </PageFilterGroup>
        )}
      </PageFilters>

      {isLoading ? (
        <PageLoading />
      ) : items.length === 0 ? (
        <EmptyState
          icon={tab === 'findings' ? Lightbulb : BookOpen}
          title={tab === 'findings' ? 'No findings yet' : 'No learnings yet'}
          description={
            tab === 'findings'
              ? 'Findings are observations your agents surface during work. The reflect routine fires nightly and writes them.'
              : 'Learnings are findings that graduated. They form the curated wiki your agents accumulate over time.'
          }
          tips={
            tab === 'findings'
              ? [
                  'Set up the reflect routine to fire nightly distillation',
                  'Or invoke the record_finding tool directly in chat',
                ]
              : [
                  'Promote a finding from the Findings tab',
                  'Or run the librarian curation routine weekly',
                ]
          }
          action={
            tab === 'findings'
              ? {
                  label: 'Set up daily reflection',
                  onClick: () => {
                    window.location.href = '/dashboard/routines/new?template=reflect-daily'
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isOpen = expanded === item.id
            return (
              <Card
                key={item.id}
                className={cn(
                  'transition-colors hover:bg-muted/30',
                  isOpen && 'ring-1 ring-primary/30'
                )}
              >
                <CardContent className="p-3">
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 text-left"
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                  >
                    <div className="mt-0.5">
                      {isOpen ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* P4-005 — `title` attr exposes the full string on
                            hover and `aria-label` gives screen readers the
                            untruncated text. The truncate utility cuts the
                            visible string at the column edge. */}
                        <p
                          className="font-medium text-sm truncate"
                          title={item.title}
                          aria-label={item.title}
                        >
                          {item.title}
                        </p>
                        <Badge variant={statusVariant(item.status)} className="text-xs">
                          {item.status}
                        </Badge>
                        {item.category && (
                          <Badge variant="outline" className="text-xs">
                            {item.category}
                          </Badge>
                        )}
                        {item.recurrenceCount > 0 && tab === 'findings' && (
                          <span className="text-xs text-muted-foreground">
                            ×{item.recurrenceCount + 1}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {(item.agentName || item.agentClass) && (
                          <span>{item.agentName ?? item.agentClass}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          <Time value={new Date(item.createdAt * 1000)} display="relative" />
                        </span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-3 border-t pt-3 space-y-3">
                      <p className="text-sm whitespace-pre-wrap">{item.body}</p>

                      {item.dismissedReason && (
                        <p className="text-xs text-muted-foreground italic">
                          Dismissed: {item.dismissedReason}
                        </p>
                      )}

                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {tab === 'learnings' && item.sourceFindingId && (
                        <Link
                          to={`/dashboard/findings#${item.sourceFindingId}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <ArrowUpRight className="size-3" />
                          From finding {item.sourceFindingId.slice(0, 8)}
                        </Link>
                      )}

                      {tab === 'findings' &&
                        (item.status === 'open' || item.status === 'recurred') && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => promoteMutation.mutate(item.id)}
                              disabled={promoteMutation.isPending}
                            >
                              <Sparkles className="size-3.5" />
                              Promote to learning
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => dismissMutation.mutate(item)}
                              disabled={dismissMutation.isPending}
                            >
                              <Trash2 className="size-3.5" />
                              Dismiss
                            </Button>
                          </div>
                        )}

                      {/* P4-008 — dismissed rows offer Reopen so a user
                          who dismisses by accident isn't trapped. Status
                          on reopen defaults to 'open' (server side); the
                          row re-appears on the Open filter. */}
                      {tab === 'findings' && item.status === 'dismissed' && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              reopenMutation.mutate(
                                { findingId: item.id },
                                {
                                  onSuccess: () => {
                                    toast.success('Finding reopened')
                                  },
                                }
                              )
                            }
                            disabled={reopenMutation.isPending}
                          >
                            <RotateCcw className="size-3.5" />
                            Reopen
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </PageContainer>
  )
}

export default FindingsPage
