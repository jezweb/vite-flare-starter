import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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

const features = [
  {
    icon: Bot,
    title: 'AI Agent (60+ Tools)',
    description: 'ToolLoopAgent with browser, search, memory, files, code execution, scheduling, audio, and subagent delegation.',
  },
  {
    icon: Database,
    title: 'Conversation Persistence',
    description: 'Chat history saved to D1 with sidebar UI, conversation resume, and message validation.',
  },
  {
    icon: Zap,
    title: 'Image + Video Processing',
    description: 'Cloudflare Images and Media bindings for resize, crop, background removal, face detection, and video clipping.',
  },
  {
    icon: Shield,
    title: 'Auth + Admin',
    description: 'Google OAuth, email/password, role-based access, API tokens with scopes, session management.',
  },
  {
    icon: Flag,
    title: 'Skills System',
    description: 'Claude Agent Skills compatible. 14 bundled skills, plus install from R2 or GitHub at runtime.',
  },
  {
    icon: Key,
    title: 'MCP Integration',
    description: 'Full MCP spec support: tools, resources, prompts, elicitation. Connect to any MCP server.',
  },
  {
    icon: Users,
    title: 'Business Modules',
    description: 'Comments, tags, watchers, favourites, recent views, soft delete — all polymorphic.',
  },
  {
    icon: Activity,
    title: 'Semantic Search',
    description: 'AI SDK embeddings with Vectorize-ready vector storage. Cosine similarity with in-memory fallback.',
  },
  {
    icon: Bell,
    title: 'DataTable + Editor',
    description: 'TanStack Table with sort, filter, pagination, bulk actions. Milkdown markdown editor.',
  },
  {
    icon: ShieldCheck,
    title: 'Human-in-the-Loop',
    description: 'needsApproval on destructive tools, token budget tracking via prepareStep, tool approval UI.',
  },
  {
    icon: Palette,
    title: '59 UI Components',
    description: 'Complete shadcn/ui library with Tailwind v4, 8 themes, dark/light mode, command palette.',
  },
]

export function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />

        <div className="container relative mx-auto max-w-6xl px-4 py-24 md:py-32">
          <div className="flex flex-col items-center text-center">
            <Badge variant="secondary" className="mb-4">
              AI Agent Starter Kit for Cloudflare
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl max-w-4xl">
              Build AI apps{' '}
              <span className="text-primary">at the edge</span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-2xl md:text-xl">
              60+ agent tools, conversation persistence, image and video processing,
              semantic search, and a full business module library. All on Cloudflare Workers.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Button size="lg" asChild>
                <Link to="/sign-up">
                  Get Started
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

            <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 dark:bg-green-400" />
                MIT Licensed
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                TypeScript
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
                Cloudflare Ready
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to ship
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              A complete foundation with authentication, admin panel, AI integration,
              and production-ready infrastructure.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border border-border/50">
                <CardContent className="pt-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-24">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              Modern Tech Stack
            </h2>
            <p className="text-muted-foreground">
              Built with the best tools for developer experience and performance.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {[
              'React 19',
              'Vite',
              'Hono',
              'Cloudflare Workers',
              'Workers AI',
              'D1 Database',
              'R2 Storage',
              'Drizzle ORM',
              'better-auth',
              'Tailwind v4',
              'shadcn/ui',
              'TanStack Query',
              'React Hook Form',
              'Zod',
            ].map((tech) => (
              <Badge key={tech} variant="secondary" className="text-sm py-1.5 px-3">
                {tech}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Ready to build?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Clone the repo and start building your next project in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link to="/sign-up">
                Try the Demo
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
                  Star on GitHub
                </a>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
