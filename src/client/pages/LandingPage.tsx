import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Shield,
  Zap,
  Github,
  ArrowRight,
  Palette,
  Database,
  Users,
  Settings,
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

const features = [
  {
    icon: Shield,
    title: 'Secure Authentication',
    description: 'Email/password and Google OAuth with session management built on better-auth.',
  },
  {
    icon: Users,
    title: 'User Management',
    description: 'Profile settings, password management, and theme preferences out of the box.',
  },
  {
    icon: Database,
    title: 'Edge Database',
    description: 'Cloudflare D1 with Drizzle ORM for type-safe SQL queries at the edge.',
  },
  {
    icon: Palette,
    title: 'Modern UI',
    description: 'Tailwind v4 + shadcn/ui with dark/light/system theme support.',
  },
  {
    icon: Settings,
    title: 'API Tokens',
    description: 'Built-in API token management for programmatic access and integrations.',
  },
  {
    icon: Zap,
    title: 'Edge Performance',
    description: 'Deployed on Cloudflare Workers for sub-50ms response times globally.',
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
              Minimal Authenticated Starter Kit
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl max-w-4xl">
              Start building{' '}
              <span className="text-primary">faster</span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-2xl md:text-xl">
              A minimal, production-ready starter kit with authentication, user settings,
              and essential infrastructure for Cloudflare Workers.
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
                    <Github className="mr-2 h-4 w-4" />
                    View on GitHub
                  </a>
                </Button>
              )}
            </div>

            <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                MIT Licensed
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                TypeScript
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-orange-500" />
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
              Everything you need to get started
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              A minimal foundation with authentication, user management, and modern UI -
              ready to build upon.
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
              'D1 Database',
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
                  <Github className="mr-2 h-4 w-4" />
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
