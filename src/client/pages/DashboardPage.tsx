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

/**
 * Dashboard home page — overview of starter capabilities
 */
export function DashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}!
        </h1>
        <p className="text-muted-foreground">
          AI agent starter kit with 60+ tools, conversation persistence, and full Cloudflare edge platform integration.
        </p>
      </div>

      {/* Primary actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-5 text-primary" />
              AI Chat
            </CardTitle>
            <CardDescription>
              Multi-model streaming chat with tool calling, conversation history, and inline UI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/dashboard/chat">
                Open Chat <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-5 text-primary" />
              Extract
            </CardTitle>
            <CardDescription>
              Structured data extraction with streaming output. Summary, entities, or sentiment analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/dashboard/extract">
                Try Extract <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="size-5 text-primary" />
              Settings
            </CardTitle>
            <CardDescription>
              Profile, password, appearance, sessions, and data export.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/dashboard/settings">
                Open Settings <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Capability overview */}
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
