/**
 * Dashboard home — capability overview.
 *
 * More useful than a generic analytics template for the starter kit
 * because it explains what the fork-user gets. Forks should replace
 * this with their own home page. The analytics template lives at
 * /dashboard/templates/analytics as a reference.
 */
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSession } from '@/client/lib/auth'
import {
  MessageSquare,
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
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export function DashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          AI agent starter kit with 60+ tools, conversation persistence, and full Cloudflare edge platform integration.
        </p>
      </div>

      {/* Primary actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <ActionCard
          icon={MessageSquare}
          title="AI Chat"
          description="Multi-model streaming chat with tool calling, conversation history, and inline UI."
          to="/dashboard/chat"
          cta="Open chat"
          primary
        />
        <ActionCard
          icon={Sparkles}
          title="Extract"
          description="Structured data extraction with streaming output. Summary, entities, sentiment."
          to="/dashboard/extract"
          cta="Try extract"
        />
        <ActionCard
          icon={Settings}
          title="Settings"
          description="Profile, password, appearance, sessions, and data export."
          to="/dashboard/settings"
          cta="Open settings"
        />
      </div>

      {/* Capability grid — each card links to where the capability is
          exercised in-app (usually AI Chat, since most tools are surfaced
          there as agent tools rather than as standalone pages). */}
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
          footer="Ask AI Chat to resize, crop, or remove backgrounds"
          to="/dashboard/chat"
          ctaLabel="Open AI Chat"
        />
        <CapabilityCard
          icon={Video}
          title="Video Processing"
          items={['Clip and resize', 'Frame extraction', 'Audio extraction', 'Spritesheet generation']}
          footer="Available as AI tools — ask chat to clip or extract frames"
          to="/dashboard/chat"
          ctaLabel="Open AI Chat"
        />
        <CapabilityCard
          icon={Search}
          title="Semantic Search"
          items={['AI SDK embeddings', 'Vectorize-ready', 'Cosine similarity', 'In-memory fallback']}
          footer="Exposed as semantic_search tool in chat"
          to="/dashboard/chat"
          ctaLabel="Open AI Chat"
        />
        <CapabilityCard
          icon={FileText}
          title="Business Modules"
          items={['Comments, tags, watchers', 'Favourites, recent views', 'Soft delete + trash', 'CSV import/export']}
          footer="Fork-only primitives — no standalone page"
        />
        <CapabilityCard
          icon={Shield}
          title="Auth + Admin"
          items={['Google OAuth + email/password', 'Role-based access', 'API tokens with scopes', 'Session management']}
          to="/dashboard/settings"
          ctaLabel="Open settings"
        />
        <CapabilityCard
          icon={Sparkles}
          title="UI Library"
          items={['59 shadcn/ui components', 'Milkdown markdown editor', 'DataTable (TanStack Table)', 'Dark/light + 8 themes']}
          to="/dashboard/components"
          ctaLabel="Browse components"
        />
      </div>
    </div>
  )
}

function ActionCard({
  icon: Icon,
  title,
  description,
  to,
  cta,
  primary,
}: {
  icon: LucideIcon
  title: string
  description: string
  to: string
  cta: string
  primary?: boolean
}) {
  return (
    <Card className={primary ? 'border-primary/20' : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm" variant={primary ? 'default' : 'outline'} className="gap-1.5">
          <Link to={to}>
            {cta}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function CapabilityCard({
  icon: Icon,
  title,
  items,
  footer,
  to,
  ctaLabel,
}: {
  icon: LucideIcon
  title: string
  items: string[]
  footer?: string
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
        {footer && (
          <p className="text-xs text-muted-foreground italic pt-1">{footer}</p>
        )}
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

export default DashboardPage
