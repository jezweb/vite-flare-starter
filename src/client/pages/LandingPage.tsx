/**
 * LandingPage — unauthenticated homepage.
 *
 * ⚠️ This route is wrapped in <PublicLayout /> (App.tsx ~line 109) which
 * provides the header (logo + Sign In / Sign Up nav) and footer. Do NOT
 * add a `<header>` element here when forking — you'll get two stacked
 * headers. Customise hero / features / CTA sections only. Same for footer.
 *
 * If you need to change the public chrome itself (header / footer
 * markup), edit `src/client/layouts/PublicLayout.tsx`.
 *
 * See gh #53.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useSession } from '@/client/lib/auth'
import {
  Shield,
  Zap,
  ArrowRight,
  Palette,
  Database,
  Users,
  Key,
  Bot,
  Flag,
  Activity,
  Bell,
  ShieldCheck,
  MessageSquare,
  FolderKanban,
  Sparkles,
  Pin,
  Hash,
  CheckSquare,
  Plug,
  Mic,
  Camera,
  Search,
  FileText,
  Eye,
  Workflow,
  GitBranch,
  Lock,
} from 'lucide-react'
import { appConfig } from '@/shared/config/app'

/**
 * ⚠️  SECURITY: Update these for production deployments
 *
 * Set VITE_GITHUB_URL="" (empty) to hide GitHub links
 * Set VITE_APP_NAME for custom branding
 *
 * See src/shared/config/app.ts for all branding options
 */

// Lucide removed brand icons in v1.0 — inline SVG for GitHub
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

/**
 * The four primary surfaces — these are the things a user spends
 * their day inside. They get top billing on the landing page.
 */
const primarySurfaces = [
  {
    icon: Hash,
    title: 'Spaces',
    badge: 'New',
    description:
      'Multi-user, multi-agent rooms. @-mention an agent to ask for help; threads, reactions, pinned messages, quote-in-reply, presence — all the Slack/Google-Chat-style primitives.',
    bullets: [
      'Per-agent reply modes: mention · proactive · ambient · always · off',
      '6 starter templates + checkbox agent picker',
      'Threads, reactions, pin, star, forward, search',
      'Cross-space FTS5 search at /api/search/messages',
      'WebSocket presence + live broadcast via Cloudflare Agents SDK',
    ],
  },
  {
    icon: FolderKanban,
    title: 'Projects',
    description:
      'Long-lived workspaces grouping conversations, files, instructions, and memory. Shareable with editors and viewers — a private project becomes a team room with one invite.',
    bullets: [
      'Project-level system prompt injected on every chat',
      'Memory blocks (project / user / org scope) with privacy zones',
      'Multi-user share — owner / editor / viewer roles',
      '3-way memory trust (ask / auto / never)',
      'Auto-tagging + universal search across every conversation',
    ],
  },
  {
    icon: MessageSquare,
    title: 'AI Chat',
    description:
      "AI SDK v6 ToolLoopAgent — 95+ tools across Gmail, Calendar, Drive, Sheets, browser automation, web search, places, code execution, audio, and the rest.",
    bullets: [
      '16 models across 8 providers (Workers AI free + OpenRouter)',
      'Streaming, vision, structured output, citations footer',
      'Per-tool telemetry in `ai_tool_calls` D1 table',
      'Privileged-tool gating + needsApproval flow',
      'Subagent delegation + skills system (Claude Agent Skills)',
    ],
  },
  {
    icon: Bot,
    title: 'Autonomous Agents',
    description:
      'Stateful AI agents living in Durable Objects. Persona + memory blocks + tool catalog + scheduled triggers + webhook ingestion + full observability.',
    bullets: [
      'AssistantAgent / ResearcherAgent / WriterAgent worked examples',
      'Multi-agent handoff (agents-as-tools pattern)',
      'Cron-driven SweeperAgent for entity processing',
      'Approval queue with run audit (cost / tokens / steps)',
      'Daily budget cap + BYOK key resolution per user',
    ],
  },
]

/**
 * The everything-else feature grid. Compact cards that map to the
 * actual modules in the repo, so a fork browsing the landing knows
 * exactly what they get.
 */
const features = [
  { icon: Zap, title: 'Skills System', description: 'Claude Agent Skills compatible. 14 bundled skills + R2 + GitHub sources, AI-sparkle rewrite, diff approval.' },
  { icon: Plug, title: 'MCP Connectors', description: 'Per-user OAuth to external MCP servers. PKCE + DCR, AES-GCM tokens, per-tool always/ask/never.' },
  { icon: CheckSquare, title: 'Approvals Queue', description: 'Human-in-the-loop for agent actions. Memory updates, sends, posts — review before execute.' },
  { icon: Activity, title: 'Agent Observability', description: '`agent_runs` audit table — cost, tokens, duration, steps per agent invocation. Stuck-run detection.' },
  { icon: Search, title: 'FTS5 Search', description: 'Universal search across conversations, spaces, messages. Cross-space + in-space scoped queries.' },
  { icon: Pin, title: 'Pin / Star / Forward', description: 'Per-space pinned shelf, personal stars, forward to any space you\'re a member of.' },
  { icon: Mic, title: 'Voice Agent', description: 'Cloudflare Voice SDK — withVoiceInput mixin streams audio + Workers AI Deepgram Nova 3 transcription.' },
  { icon: Camera, title: 'Video Agent', description: 'getUserMedia → canvas frame sample → vision model. Companion to the voice agent — no SDK, just primitives.' },
  { icon: FileText, title: 'Files + Image + Video', description: 'R2 with metadata, Cloudflare Images for resize/crop/face/bg-remove, Media Transformations for video.' },
  { icon: Database, title: 'Conversation Persistence', description: 'D1-backed messages + sidebar UI + summary + tags + auto-resume. ChatStorage interface (DO-ready).' },
  { icon: Bell, title: 'Notifications', description: 'In-app bell, unread counts, URL-persisted filter, deep-links to source pages.' },
  { icon: Key, title: 'API Tokens', description: 'SHA-256 hashed, scope-based access. Useful for ElevenLabs voice agents, MCP clients, external services.' },
  { icon: Users, title: 'Better-Auth + Orgs', description: 'Google OAuth, optional email/password, role gating, org plugin, deep-link preserved through sign-in.' },
  { icon: Flag, title: 'Feature Flags', description: 'DB-backed toggles, public + admin endpoints. Hide modules from the sidebar without deleting code.' },
  { icon: GitBranch, title: 'Pattern Library', description: 'Every module is a worked example. Don\'t delete what you don\'t need — disable via flags. Reference for AI agents reading your codebase.' },
  { icon: Lock, title: 'BYOK + Trust', description: 'Per-user model keys (Anthropic, OpenAI, Google, OpenRouter). Service credentials encrypted at rest.' },
  { icon: Workflow, title: 'Cron + Background', description: 'Memory sweep, history-disabled cleanup, due-job processor. Existing 15-min cron has 5 sweep tasks already.' },
  { icon: Eye, title: 'Comments + Watchers + Tags', description: 'Polymorphic business modules. Comments on any entity, watchers for changes, tags for organisation.' },
  { icon: Palette, title: '59 UI Components', description: 'shadcn/ui complete + Tailwind v4, 8 themes, dark/light/system, command palette, keyboard shortcuts.' },
  { icon: ShieldCheck, title: 'Sentry + Activity Log', description: 'Server-side error reporting hooks + audit trail with pagination, filters, entity history.' },
  { icon: Sparkles, title: 'Card-format Bot Messages', description: 'Agents emit metadata.cardFormat for daily digests / reports — UI renders structured cards instead of text.' },
  { icon: Shield, title: 'Privileged-tool Gating', description: 'Destructive tools (gmail_send, calendar_delete, sheets_write) need user-intent keyword unlock.' },
]

/**
 * Spaces is the headline new thing — it gets a dedicated section
 * because "multi-user multi-agent chat" doesn't compress well into a
 * card.
 */
const spacesScenes: Array<{ icon: typeof Hash; title: string; body: string }> = [
  {
    icon: Bot,
    title: 'Agents reply when called',
    body: '@-mention @research and they answer. Stay quiet otherwise. Per-agent reply modes (mention / proactive / ambient / always / off) so each room sets its own vibe.',
  },
  {
    icon: MessageSquare,
    title: 'Threads keep the timeline glanceable',
    body: 'Long agent replies auto-thread. Replies inside a thread stay there. The thread pane has a per-thread bell so you can mute noisy ones.',
  },
  {
    icon: Sparkles,
    title: 'Reactions are first-class',
    body: '👍 ✅ ❤️ quick-bar plus the full emoji-mart picker. Bots react with the same emojis humans do. Classifier-driven `ambient` agents react silently when there\'s signal.',
  },
  {
    icon: Pin,
    title: 'Pin · Star · Quote · Forward',
    body: 'Pin to space (collective), star (personal bookmark), quote-in-reply with a chip preview, forward a message to any other space you\'re in.',
  },
]

export function LandingPage() {
  const { data: session } = useSession()
  const isAuthed = !!session?.user
  const primaryCtaHref = isAuthed ? '/dashboard' : '/sign-up'
  const primaryCtaLabel = isAuthed ? 'Open Dashboard' : 'Get Started'
  // Lightbox: which screenshot is open. null = closed. Stores the
  // shot's data so the dialog can render title + body + image without
  // a separate state hop.
  const [zoom, setZoom] = useState<{ src: string; title: string; body: string } | null>(null)

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />

        <div className="container relative mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="flex flex-col items-center text-center">
            <Badge variant="secondary" className="mb-4">
              AI-native starter for Cloudflare Workers
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl max-w-4xl">
              Multi-user. Multi-agent.{' '}
              <span className="bg-gradient-to-r from-primary to-emerald-500 bg-clip-text text-transparent">
                Built at the edge.
              </span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-2xl md:text-xl">
              Spaces, Projects, AI chat with 95+ tools, autonomous agents, MCP, voice, video, observability. Every module is a worked example you can fork, rebrand, and ship.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Button size="lg" asChild>
                <Link to={primaryCtaHref}>
                  {primaryCtaLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              {appConfig.githubUrl && (
                <Button size="lg" variant="outline" asChild>
                  <a
                    href={appConfig.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <GithubIcon className="mr-2 h-4 w-4" />
                    View on GitHub
                  </a>
                </Button>
              )}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Stat value="95+" label="agent tools" />
              <Stat value="16" label="AI models" />
              <Stat value="30+" label="modules" />
              <Stat value="4" label="agent kinds" />
            </div>
          </div>
        </div>
      </section>

      {/* Primary surfaces */}
      <section className="py-12 md:py-14">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Four primary surfaces</h2>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
              Where users spend their time. Each one is a complete reference implementation with patterns you can copy.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {primarySurfaces.map((surface) => (
              <Card key={surface.title} className="border-primary/20 bg-gradient-to-br from-primary/[0.03] to-background">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <surface.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{surface.title}</h3>
                        {surface.badge && (
                          <Badge variant="default" className="text-[10px] uppercase tracking-wider">
                            {surface.badge}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{surface.description}</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {surface.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-1.5">
                        <span className="mt-1 inline-block h-1 w-1 rounded-full bg-primary/50" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Spaces deep-dive */}
      <section className="py-12 bg-muted/30 border-y border-border">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-3">Headline feature</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-3">
              Spaces — Slack-style rooms with AI as a first-class member.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The pattern that big-LLM products haven&apos;t shipped yet: a multi-user chat where AI agents are members alongside humans. @-mention them and they answer. Set their reply mode and they jump in proactively, react ambiently, or stay quiet.
            </p>
          </div>

          {/* Real screenshot of a live Space — click to zoom. */}
          <button
            type="button"
            onClick={() => setZoom({
              src: '/spaces-hero.png',
              title: 'Spaces — live three-pane layout',
              body: 'Members rail · timeline · thread pane. @-mention pills, hover action bar with quick reactions + emoji picker + thread + more menu, "1 reply" indicator. Real authed UI, not a mockup.',
            })}
            className="mb-10 block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border shadow-2xl transition-transform hover:scale-[1.005]"
            aria-label="Zoom Spaces screenshot"
          >
            <img
              src="/spaces-hero.png"
              alt="Marketing-pod Space — three-pane layout with @-mentioned message and 1 reply thread"
              className="w-full"
            />
          </button>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            {spacesScenes.map((s) => (
              <Card key={s.title} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-2">
                    <s.icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant="outline">@-autocomplete</Badge>
            <Badge variant="outline">Threads · Reactions</Badge>
            <Badge variant="outline">Templates</Badge>
            <Badge variant="outline">Cross-space search</Badge>
            <Badge variant="outline">MCP attachments</Badge>
            <Badge variant="outline">Slash sub-commands</Badge>
            <Badge variant="outline">Per-thread mute</Badge>
            <Badge variant="outline">Block / Pin / Star / Forward</Badge>
            <Badge variant="outline">Proactive · Ambient modes</Badge>
            <Badge variant="outline">Card-format bot messages</Badge>
          </div>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            Built on Cloudflare Agents SDK + Durable Objects for presence and live broadcast. D1 is canonical storage. WebSocket is just for live fan-out.
          </div>
        </div>
      </section>

      {/* Dashboard tour — real screenshots */}
      <section className="py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A tour of the dashboard</h2>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
              Real screenshots — not mockups — of every primary surface inside the app.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { src: '/tour/01-chat.png', title: 'AI Chat', body: '"Good evening, Jeremy" greeting, preset chips, 16-model picker, persistent history.' },
              { src: '/tour/02-projects.png', title: 'Projects', body: 'Long-lived workspaces — search, sort by activity, archive, multi-user share with editor/viewer roles.' },
              { src: '/tour/03-skills.png', title: 'Skills', body: '14 bundled Claude Agent Skills + R2 + GitHub sources. AI Sparkle rewrite + diff approval flow.' },
              { src: '/tour/04-connectors.png', title: 'MCP Connectors', body: 'Per-user OAuth to Google Workspace, Microsoft 365, any MCP server. PKCE + DCR, AES-GCM tokens.' },
              { src: '/tour/05-approvals.png', title: 'Approvals queue', body: 'Human-in-the-loop for autonomous agents — review memory updates, sends, posts before they execute.' },
              { src: '/tour/06-activity.png', title: 'Activity log', body: 'Audit trail with daily/weekly stats, filters, entity history. Pagination built-in.' },
              { src: '/tour/03-create-modal.png', title: 'New space — Custom', body: 'Per-agent checkbox + reply-mode picker. Pick exactly the agent set + behaviour you want.' },
              { src: '/tour/04-templates.png', title: 'New space — Templates', body: '6 starter packs: Solo workshop, Marketing pod, Support war room, Research room, Writer\'s desk, Blank.' },
              { src: '/tour/06-mention-autocomplete.png', title: '@-mention autocomplete', body: 'People + Agents sections, keyboard nav (↑/↓/Enter/Escape), inserts a real pill chip.' },
            ].map((shot) => (
              <button
                type="button"
                key={shot.title}
                onClick={() => setZoom(shot)}
                className="group block w-full text-left"
                aria-label={`Zoom ${shot.title}`}
              >
                <Card className="overflow-hidden border-border/50 transition-colors group-hover:border-primary/40">
                  <div className="overflow-hidden">
                    <img
                      src={shot.src}
                      alt={shot.title}
                      className="w-full cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                  <CardContent className="p-3">
                    <h3 className="text-sm font-semibold mb-0.5">{shot.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{shot.body}</p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Wide feature grid */}
      <section className="py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything else, included.</h2>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
              30+ modules. Not toy demos — production patterns shaped by real apps.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <f.icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold">{f.title}</h3>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="py-12 bg-muted/30 border-y border-border">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="grid gap-8 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-3">
                Built the way you should build on Cloudflare.
              </h2>
              <p className="text-muted-foreground mb-4">
                Workers + Static Assets at the edge. D1 for persistence. R2 for files. Durable Objects for stateful agents. Workers AI free tier + OpenRouter for everything else. Vectorize-ready when you need semantic memory.
              </p>
              <p className="text-sm text-muted-foreground">
                Every module is opt-in via feature flags. Don&apos;t delete what you don&apos;t need — keep it as a worked example for the next person (or AI agent) reading your code.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 font-mono text-xs leading-relaxed">
              <div className="text-muted-foreground">// wrangler.jsonc — opt-in bindings</div>
              <div className="mt-2"><span className="text-muted-foreground">d1_databases</span>: [DB]</div>
              <div><span className="text-muted-foreground">r2_buckets</span>: [AVATARS, FILES, SKILLS, DATA_LAKE]</div>
              <div><span className="text-muted-foreground">ai</span>: AI</div>
              <div><span className="text-muted-foreground">images</span>: IMAGES</div>
              <div><span className="text-muted-foreground">media</span>: MEDIA</div>
              <div><span className="text-muted-foreground">durable_objects</span>:</div>
              <div className="ml-4">VoiceInputExample · VideoInputExample</div>
              <div className="ml-4">ReminderAgent · AssistantAgent</div>
              <div className="ml-4">ResearcherAgent · WriterAgent</div>
              <div className="ml-4">SweeperAgent · ScratchpadMcpAgent</div>
              <div className="ml-4 text-emerald-600 dark:text-emerald-400">SpaceAgent ← new</div>
              <div className="mt-2"><span className="text-muted-foreground">triggers.crons</span>: [&quot;*/15 * * * *&quot;]</div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="py-12">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">Modern stack</h2>
            <p className="text-muted-foreground">Latest of everything. Updated weekly as the ecosystem ships.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              'React 19', 'Vite 7', 'Hono 4.12', 'AI SDK v6', 'Cloudflare Agents SDK',
              'Workers AI', 'D1 + Drizzle', 'R2', 'Durable Objects', 'Vectorize',
              'better-auth 1.6', 'Tailwind v4', 'shadcn/ui (59)', 'TanStack Query 5',
              'Milkdown', 'Zod', 'emoji-mart', 'OpenRouter',
            ].map((tech) => (
              <Badge key={tech} variant="secondary" className="text-sm py-1.5 px-3">
                {tech}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-b from-muted/30 to-background border-t border-border">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Fork it. Ship something nobody else has.
          </h2>
          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            The pattern library that lets you build assistive SaaS at the edge — without rebuilding the platform every time.
          </p>
          {appConfig.githubUrl && (
            <div className="mb-8 max-w-2xl mx-auto">
              <div className="rounded-lg border bg-background/60 px-4 py-3 text-left font-mono text-sm text-muted-foreground overflow-x-auto">
                <span className="select-none text-muted-foreground/60">$ </span>
                <span className="text-foreground">git clone {appConfig.githubUrl}.git</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Then read{' '}
                <a
                  href={`${appConfig.githubUrl}/blob/main/FORKING.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  FORKING.md
                </a>{' '}
                for the rebrand + customise checklist.
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link to={primaryCtaHref}>
                Try it live
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            {appConfig.githubUrl && (
              <Button size="lg" variant="outline" asChild>
                <a href={appConfig.githubUrl} target="_blank" rel="noopener noreferrer">
                  <GithubIcon className="mr-2 h-4 w-4" />
                  Star on GitHub
                </a>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Lightbox — opens when any tour screenshot is clicked. Esc /
          click-outside / X dismiss. Image renders at natural size up
          to 95vw / 90vh so detail is visible without forcing a
          full-page navigation. */}
      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent
          className="max-h-[95vh] w-[95vw] max-w-[1600px] overflow-y-auto p-0 sm:!max-w-[1600px]"
          showCloseButton
        >
          {zoom && (
            <div className="flex flex-col">
              <img src={zoom.src} alt={zoom.title} className="w-full" />
              <div className="border-t border-border bg-card px-5 py-3">
                <DialogTitle className="text-base font-semibold">{zoom.title}</DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-relaxed">
                  {zoom.body}
                </DialogDescription>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-base font-bold text-foreground">{value}</span>
      <span>{label}</span>
    </div>
  )
}
