/**
 * Dashboard home — "What needs you".
 *
 * The home view leads with action-oriented panels (pending approvals,
 * recent agent runs) so the user lands on what's happening right now.
 * The capability tour stays below as a collapsed reference for forks
 * and first-time visitors.
 *
 * Sections:
 *   1. Welcome strip
 *   2. "What needs you" — pending approvals (top 5)
 *   3. "Recent agent runs" — last 8 runs across all agents
 *   4. "Quick actions" — one-line link strip
 *   5. Capability tour (collapsed) — fork-onboarding reference
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  Brain,
  Wrench,
  Image,
  Video,
  Search,
  FileText,
  Settings,
  Shield,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Activity as ActivityIcon,
  MessageSquare,
  Plug,
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSession } from '@/client/lib/auth'
import { apiClient } from '@/client/lib/api-client'
import { getGreeting } from '@/shared/lib/greeting'
import { cn } from '@/lib/utils'
import { formatAgentClass, formatTrigger } from '@/shared/format/agent'
import { useAgentCatalog } from '@/client/modules/routines/hooks/useAgentCatalog'

interface Approval {
  id: string
  agentClass: string
  agentName: string
  action: string
  summary: string | null
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
  createdAt: number
}
interface ApprovalsList { total: number; approvals: Approval[] }

interface AgentRun {
  id: string
  agentClass: string
  agentName: string
  trigger: 'rest' | 'schedule' | 'webhook' | 'inter_agent'
  outcome: 'started' | 'ok' | 'error' | 'budget_exceeded'
  startedAt: number
  durationMs: number | null
  costUsd: number | null
  errorMessage: string | null
}
interface RunsList { total: number; runs: AgentRun[] }

export function DashboardPage() {
  const { data: session } = useSession()

  const approvals = useQuery({
    queryKey: ['approvals', 'pending', 'home'],
    queryFn: () => apiClient.get<ApprovalsList>('/api/approvals?status=pending&limit=5'),
    refetchInterval: 30_000,
  })

  const runs = useQuery({
    queryKey: ['agent-runs', 'home'],
    queryFn: () => apiClient.get<RunsList>('/api/agent-observability/runs?limit=8'),
    refetchInterval: 60_000,
  })

  const pendingCount = approvals.data?.total ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {getGreeting()}{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting for your review.`
            : "You're up to date. Nothing needs your attention right now."}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NeedsYouPanel approvals={approvals.data} loading={approvals.isLoading} />
        <RecentRunsPanel runs={runs.data} loading={runs.isLoading} />
      </div>

      <QuickActions />

      <CapabilityTour />
    </div>
  )
}

// Greeting helper imported from shared/lib so chat + dashboard agree on
// time-of-day cutoffs (was a finding in the slice 1+2 UX audit).

// ─── What needs you ───────────────────────────────────────────────────

function NeedsYouPanel({ approvals, loading }: { approvals?: ApprovalsList; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckSquare className="size-4 text-primary" />
              What needs you
            </CardTitle>
            <CardDescription className="mt-0.5">
              Pending approvals from your agents.
            </CardDescription>
          </div>
          {approvals && approvals.total > 0 && (
            <Button asChild size="sm" variant="ghost" className="gap-1 -my-1 -mr-2 h-8">
              <Link to="/dashboard/approvals">
                See all
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        )}
        {!loading && approvals && approvals.total === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center">
            <CheckCircle2 className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-1.5 text-sm font-medium">All clear</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              When an agent proposes a destructive action, it queues here first.
            </p>
          </div>
        )}
        {!loading && approvals && approvals.total > 0 && (
          <ul className="space-y-2">
            {approvals.approvals.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/dashboard/approvals?focus=${a.id}`}
                  className="block rounded-md border p-2.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug truncate">
                        {a.summary || prettify(a.action)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(a.createdAt * 1000), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Recent agent runs ────────────────────────────────────────────────

function RecentRunsPanel({ runs, loading }: { runs?: RunsList; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ActivityIcon className="size-4 text-primary" />
              Recent agent runs
            </CardTitle>
            <CardDescription className="mt-0.5">
              The last few times an agent ran for you.
            </CardDescription>
          </div>
          {runs && runs.total > 0 && (
            <Button asChild size="sm" variant="ghost" className="gap-1 -my-1 -mr-2 h-8">
              <Link to="/dashboard/activity">
                Activity log
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        )}
        {!loading && runs && runs.total === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center">
            <Sparkles className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-1.5 text-sm font-medium">No agent activity yet</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Open AI Chat and ask the agent to do something — it'll show up here.
            </p>
          </div>
        )}
        {!loading && runs && runs.total > 0 && (
          <ul className="space-y-1.5">
            {runs.runs.map((r) => <RunRow key={r.id} run={r} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RunRow({ run }: { run: AgentRun }) {
  const { data: agentCatalog } = useAgentCatalog()
  const agentRegistry = new Map((agentCatalog?.agents ?? []).map((a) => [a.className, a]))
  const Icon = run.outcome === 'ok'
    ? CheckCircle2
    : run.outcome === 'error'
    ? XCircle
    : run.outcome === 'budget_exceeded'
    ? AlertTriangle
    : Clock
  const colour = run.outcome === 'ok'
    ? 'text-emerald-600'
    : run.outcome === 'error' || run.outcome === 'budget_exceeded'
    ? 'text-destructive'
    : 'text-muted-foreground'
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors">
      <Icon className={cn('size-3.5 shrink-0', colour)} />
      <span className="text-xs truncate flex-1">{formatAgentClass(run.agentClass, agentRegistry)}</span>
      <span className="text-[11px] text-muted-foreground hidden xl:inline">
        {formatTrigger(run.trigger)}
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {formatDistanceToNow(new Date(run.startedAt * 1000), { addSuffix: true })}
      </span>
    </li>
  )
}

// ─── Quick actions ─────────────────────────────────────────────────────

function QuickActions() {
  const items: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/dashboard/chat', label: 'AI Chat', icon: MessageSquare },
    { to: '/dashboard/skills', label: 'Skills', icon: Zap },
    { to: '/dashboard/connectors', label: 'Connectors', icon: Plug },
    { to: '/dashboard/projects', label: 'Projects', icon: FileText },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Button key={item.to} asChild size="sm" variant="outline" className="gap-1.5">
          <Link to={item.to}>
            <item.icon className="size-3.5" />
            {item.label}
          </Link>
        </Button>
      ))}
    </div>
  )
}

// ─── Capability tour (collapsed by default) ───────────────────────────
//
// Kept verbatim from the original dashboard so the starter still teaches
// fork-users what they have. Collapsed because returning users don't
// need to see the same overview every visit.

function CapabilityTour() {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        What this starter ships with
      </button>
      {open && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CapabilityCard
            icon={Brain}
            title="AI SDK v6"
            items={['ToolLoopAgent pattern', 'Multi-provider factory', 'Streaming + reasoning', 'Conversation persistence']}
            to="/dashboard/chat"
            ctaLabel="Open AI Chat"
          />
          <CapabilityCard
            icon={Wrench}
            title="60+ Agent Tools"
            items={['Browser, search, memory, files', 'Code execution, delegation', 'Scheduling, audio, UI tools', 'Skills system (14 bundled)']}
            to="/dashboard/chat"
            ctaLabel="Try the tools"
          />
          <CapabilityCard
            icon={Image}
            title="Image Processing"
            items={['Resize, crop, format convert', 'AI background removal', 'AI face detection', 'Image generation (FLUX/GPT)']}
            to="/dashboard/chat"
            ctaLabel="Open AI Chat"
          />
          <CapabilityCard
            icon={Video}
            title="Video Processing"
            items={['Clip and resize', 'Frame extraction', 'Audio extraction', 'Spritesheet generation']}
            to="/dashboard/chat"
            ctaLabel="Open AI Chat"
          />
          <CapabilityCard
            icon={Search}
            title="Semantic Search"
            items={['AI SDK embeddings', 'Vectorize-ready', 'Cosine similarity', 'In-memory fallback']}
            to="/dashboard/chat"
            ctaLabel="Open AI Chat"
          />
          <CapabilityCard
            icon={FileText}
            title="Business Modules"
            items={['Comments, tags, watchers', 'Favourites, recent views', 'Soft delete + trash', 'CSV import/export']}
          />
          <CapabilityCard
            icon={Shield}
            title="Auth + Admin"
            items={['Google OAuth + email/password', 'Role-based access', 'API tokens with scopes', 'Session management']}
            to="/dashboard/settings"
            ctaLabel="Open settings"
          />
          <CapabilityCard
            icon={Settings}
            title="UI Library"
            items={['59 shadcn/ui components', 'Milkdown markdown editor', 'DataTable (TanStack Table)', 'Dark/light + 8 themes']}
            to="/dashboard/components"
            ctaLabel="Browse components"
          />
        </div>
      )}
    </div>
  )
}

function CapabilityCard({
  icon: Icon,
  title,
  items,
  to,
  ctaLabel,
}: {
  icon: LucideIcon
  title: string
  items: string[]
  to?: string
  ctaLabel?: string
}) {
  const body = (
    <>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="mt-1.5 size-1 rounded-full bg-primary shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        {to && ctaLabel && (
          <div className="pt-1">
            <span className="text-xs font-medium text-primary inline-flex items-center gap-1">
              {ctaLabel}
              <ArrowRight className="size-3" />
            </span>
          </div>
        )}
      </CardContent>
    </>
  )

  if (to) {
    return (
      <Link to={to} className="block">
        <Card className="h-full hover:bg-muted/30 transition-colors">{body}</Card>
      </Link>
    )
  }

  return <Card>{body}</Card>
}

// Friendlier fallback when a queued action has no summary.
function prettify(action: string): string {
  if (!action) return 'Action'
  const s = action.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default DashboardPage
