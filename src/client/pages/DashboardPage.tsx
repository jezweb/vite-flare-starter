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

      {/* Capability grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CapabilityCard
          icon={Brain}
          title="AI SDK v6"
          items={['ToolLoopAgent pattern', 'Multi-provider factory', 'Streaming + reasoning', 'Conversation persistence']}
        />
        <CapabilityCard
          icon={Wrench}
          title="60+ Agent Tools"
          items={['Browser, search, memory, files', 'Code execution, delegation', 'Scheduling, audio, UI tools', 'Skills system (14 bundled)']}
        />
        <CapabilityCard
          icon={Image}
          title="Image Processing"
          items={['Resize, crop, format convert', 'AI background removal', 'AI face detection', 'Image generation (FLUX/GPT)']}
        />
        <CapabilityCard
          icon={Video}
          title="Video Processing"
          items={['Clip and resize', 'Frame extraction', 'Audio extraction', 'Spritesheet generation']}
        />
        <CapabilityCard
          icon={Search}
          title="Semantic Search"
          items={['AI SDK embeddings', 'Vectorize-ready', 'Cosine similarity', 'In-memory fallback']}
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
        />
        <CapabilityCard
          icon={Sparkles}
          title="UI Library"
          items={['59 shadcn/ui components', 'Milkdown markdown editor', 'DataTable (TanStack Table)', 'Dark/light + 8 themes']}
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

function CapabilityCard({ icon: Icon, title, items }: { icon: LucideIcon; title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="mt-1.5 size-1 rounded-full bg-primary shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export default DashboardPage
