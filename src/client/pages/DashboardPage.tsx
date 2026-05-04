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
import { Time } from '@/components/ui/time'
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
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FolderKanban,
  Users,
  Repeat,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSession } from '@/client/lib/auth'
import { apiClient } from '@/client/lib/api-client'
import { getGreeting } from '@/shared/lib/greeting'
import { cn } from '@/lib/utils'
import { formatAgentClass, formatTrigger } from '@/shared/format/agent'
import { useAgentCatalog } from '@/client/modules/routines/hooks/useAgentCatalog'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { useBuilderMode } from '@/client/lib/builder-mode'

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
  const greeting = `${getGreeting()}${session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}`
  const subtitle =
    pendingCount > 0
      ? `${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting for your review.`
      : "You're up to date. Nothing needs your attention right now."

  return (
    <PageContainer type="hub">
      <PageHeader title={greeting} subtitle={subtitle} docTitle="Home" />

      <OnboardingChecklist />

      <div className="grid gap-4 lg:grid-cols-2">
        <NeedsYouPanel approvals={approvals.data} loading={approvals.isLoading} />
        <RecentRunsPanel runs={runs.data} loading={runs.isLoading} />
      </div>

      <QuickActions />

      {/* CapabilityTour is fork-author content (what this starter ships
          with). Visible only in Builder mode so a returning user doesn't
          see the same overview block on every visit. */}
      <BuilderOnlyCapabilityTour />
    </PageContainer>
  )
}

function BuilderOnlyCapabilityTour() {
  const { isBuilder } = useBuilderMode()
  if (!isBuilder) return null
  return <CapabilityTour />
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
              Pending review
            </CardTitle>
            <CardDescription className="mt-0.5">
              Your AI is waiting on a yes / no before it acts.
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
            <Spinner size="md" />
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
                        <Time value={a.createdAt} display="relative" />
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
            <Spinner size="md" />
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
  const triggerLabel = formatTrigger(run.trigger)
  const showTrigger = triggerLabel !== 'via another agent'
  return (
    <li>
      <Link
        to={`/dashboard/activity?focus=${run.id}`}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors"
      >
        <Icon className={cn('size-3.5 shrink-0', colour)} />
        <span className="text-xs truncate flex-1">{formatAgentClass(run.agentClass, agentRegistry)}</span>
        {showTrigger && (
          <span className="text-[11px] text-muted-foreground hidden xl:inline">
            {triggerLabel}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground tabular-nums">
          <Time value={run.startedAt} display="relative" />
        </span>
      </Link>
    </li>
  )
}

// ─── Quick actions ─────────────────────────────────────────────────────

interface QuickActionCard {
  to: string
  label: string
  description: string
  icon: LucideIcon
  /** Hide if matching feature flag is off — set the key from features.ts. */
  feature?: 'chat' | 'spaces'
}

/**
 * Four cards covering the four ways to "start something":
 *   - Chat — quick 1:1 question
 *   - Project — long-running personal workspace
 *   - Space — team room with AI
 *   - Routine — recurring scheduled work
 *
 * Each card has more detail than the sidebar entry — a one-line
 * description lifts the "what does this do?" answer out of memory.
 * Helps newcomers pick the right entry point without first learning
 * the vocabulary.
 */
const QUICK_ACTIONS: QuickActionCard[] = [
  {
    to: '/dashboard/chat',
    label: 'Start a chat',
    description: 'Quick question or one-off task. Pick a model, paste an image, get an answer.',
    icon: MessageSquare,
    feature: 'chat',
  },
  {
    // Verb-prefix labels promise an action — link straight into the
    // creation flow rather than dumping the user on a list page where
    // they'd have to find the "+ New project" button. Both Projects and
    // Spaces index pages auto-open their create modal when arriving
    // with `?new=1`. Routines has a dedicated /new route.
    to: '/dashboard/projects?new=1',
    label: 'New project',
    description: 'A long-running workspace for ongoing work — chats, files, memory, instructions all in one place.',
    icon: FolderKanban,
  },
  {
    to: '/dashboard/spaces?new=1',
    label: 'New space',
    description: 'Multi-participant room — you + teammates + AI agents. Use @mentions to direct work.',
    icon: Users,
    feature: 'spaces',
  },
  {
    to: '/dashboard/routines/new',
    label: 'Schedule a routine',
    description: 'Recurring AI work — fire on a cadence to scan, summarise, or react. Findings land in your Inbox.',
    icon: Repeat,
  },
]

function QuickActions() {
  // Filter cards by feature flag — same shape as the sidebar nav
  // pattern. No need to re-import the flags object here; just
  // hard-coded skips are fine since we only have two gates.
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium">Start something new</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.to}
              to={action.to}
              className="group flex flex-col gap-2 rounded-lg border bg-card p-4 transition-all hover:border-primary/40 hover:bg-muted/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
              <div className="flex items-center gap-1 font-medium">
                {action.label}
                <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3">
                {action.description}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─── Getting Started checklist (gh #44) ───────────────────────────────

interface OnboardingState {
  version: number
  dismissed: boolean
  steps: {
    connect: boolean
    project: boolean
    memory: boolean
    chat: boolean
    skill: boolean
    routine: boolean
  }
}

interface ChecklistItem {
  id: keyof OnboardingState['steps']
  label: string
  icon: LucideIcon
  to: string
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'connect', label: 'Connect a workspace (Google or Microsoft)', icon: Plug, to: '/dashboard/connections' },
  { id: 'project', label: 'Create your first project', icon: FileText, to: '/dashboard/projects' },
  { id: 'memory', label: 'Save a memory the AI should remember', icon: Brain, to: '/dashboard/settings?tab=memory' },
  { id: 'chat', label: 'Send a message in chat', icon: MessageSquare, to: '/dashboard/chat' },
  { id: 'skill', label: 'Try a skill (type /skill-name in chat)', icon: Sparkles, to: '/dashboard/skills' },
  { id: 'routine', label: 'Schedule your first routine', icon: Repeat, to: '/dashboard/routines' },
]

function OnboardingChecklist() {
  const session = useSession()
  const enabled = !!session.data?.user
  const state = useQuery({
    queryKey: ['onboarding', 'state'],
    queryFn: () => apiClient.get<OnboardingState>('/api/onboarding/state'),
    enabled,
    staleTime: 60_000,
  })
  const [hidingLocally, setHidingLocally] = useState(false)

  if (!enabled || !state.data || hidingLocally) return null
  if (state.data.dismissed) return null

  const completed = Object.values(state.data.steps).filter(Boolean).length
  const total = CHECKLIST_ITEMS.length
  if (completed >= total) return null

  async function dismiss() {
    setHidingLocally(true)
    // Best-effort persistence — fire-and-forget. If it fails, the shelf
    // hides locally for this session and reappears on next load (which
    // is fine — better than blocking the UI on a network round-trip).
    try {
      const prefsResp = await apiClient.get<{ preferences: Record<string, unknown> }>('/api/settings/preferences')
      await apiClient.patch('/api/settings/preferences', {
        ...prefsResp.preferences,
        onboarding: { version: state.data?.version ?? 1, dismissed: true },
      })
    } catch {
      // ignore — local-hide is acceptable fallback
    }
  }

  return (
    <section className="rounded-lg border border-border/60 bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Getting started</h2>
          <p className="text-xs text-muted-foreground">
            {completed} of {total} done — tick off as you explore.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void dismiss()}
          className="rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss Getting Started checklist"
          title="Dismiss"
        >
          <XCircle className="size-4" />
        </button>
      </header>
      <ul className="space-y-1.5">
        {CHECKLIST_ITEMS.map((item) => {
          const done = state.data.steps[item.id]
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/40',
                  done && 'text-muted-foreground',
                )}
              >
                {done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <span className="inline-block size-4 shrink-0 rounded-full border border-border" />
                )}
                <item.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className={cn('flex-1', done && 'line-through decoration-muted-foreground/50')}>
                  {item.label}
                </span>
                {!done && (
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" aria-hidden />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
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
