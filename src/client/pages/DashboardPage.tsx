import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSession } from '@/client/lib/auth'
import { Settings, Component, Palette, Rocket } from 'lucide-react'

/**
 * Dashboard home page
 * Simple welcome page with quick links to get started
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
          Your app is ready. Start building something amazing.
        </p>
      </div>

      {/* Quick Start Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              Getting Started
            </CardTitle>
            <CardDescription>
              This starter kit includes authentication, settings, and a beautiful UI ready to go.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first module by following the patterns in the codebase. Check out the Style Guide for component examples.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/style-guide">View Style Guide</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Component className="h-5 w-5 text-primary" />
              Components
            </CardTitle>
            <CardDescription>
              Browse all available shadcn/ui components with live examples.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Use this page as a reference when building your UI. Great for AI agents too!
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/components">Browse Components</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Settings
            </CardTitle>
            <CardDescription>
              Manage your profile, password, and appearance preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Update your profile picture, change password, and customize your theme.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/settings">Open Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tech Stack Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Built With
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              'React 19',
              'Vite',
              'Cloudflare Workers',
              'D1 Database',
              'Hono',
              'better-auth',
              'Tailwind v4',
              'shadcn/ui',
              'TanStack Query',
              'React Hook Form',
              'Zod',
            ].map((tech) => (
              <span
                key={tech}
                className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
              >
                {tech}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
