import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { FeatureCard } from '@/client/components/marketing/FeatureCard'
import { TechStackGrid, techStackItems } from '@/client/components/marketing/TechStackGrid'
import { totalMcpTools, totalSdkMethods } from '@/client/constants/marketing-data'
import {
  Users,
  Building2,
  Target,
  MessageSquare,
  Shield,
  Zap,
  Github,
  ArrowRight,
  Globe,
  Wrench,
  LifeBuoy,
  Inbox,
  BookOpen,
  Bot,
  Mic,
  Code2,
} from 'lucide-react'

const features = [
  {
    icon: Users,
    title: 'Contact Management',
    description: 'Track contacts with full activity history, notes, and relationship mapping to companies.',
  },
  {
    icon: Building2,
    title: 'Company Management',
    description: 'Manage companies with linked contacts, deals, and comprehensive notes.',
  },
  {
    icon: Target,
    title: 'Deal Pipeline',
    description: 'Visual deal stages with drag-and-drop, value tracking, and progress monitoring.',
  },
  {
    icon: LifeBuoy,
    title: 'Cases & Support',
    description: 'Ticket management with status tracking, priority levels, and assignment workflows.',
  },
  {
    icon: Inbox,
    title: 'Lead Capture',
    description: 'Public enquiry forms with status workflow, source tracking, and team assignment.',
  },
  {
    icon: BookOpen,
    title: 'Documentation Wiki',
    description: 'Hierarchical docs with versioning, public/private visibility, and rich text editing.',
  },
  {
    icon: MessageSquare,
    title: 'Threaded Notes',
    description: 'Rich notes with threading support, linked across contacts, companies, deals, and cases.',
  },
  {
    icon: Bot,
    title: 'AI Integration',
    description: '7 MCP servers with 53+ tools for AI agents, voice assistants, and TypeScript SDK access.',
  },
  {
    icon: Shield,
    title: 'Secure Authentication',
    description: 'Email/password and Google OAuth with session management built on better-auth.',
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
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />

        <div className="container relative mx-auto max-w-6xl px-4 py-24 md:py-32">
          <div className="flex flex-col items-center text-center">
            <Badge variant="secondary" className="mb-4">
              Open Source CRM Starter Kit
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl max-w-4xl">
              Build your business app{' '}
              <span className="text-primary">in days, not months</span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-2xl md:text-xl">
              A production-ready full-stack starter kit for building CRMs, dashboards, and
              business applications on Cloudflare's global edge network.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Button size="lg" asChild>
                <Link to="/sign-up">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a
                  href="https://github.com/jezweb/vite-flare-stack"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="mr-2 h-4 w-4" />
                  View on GitHub
                </a>
              </Button>
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
              Everything you need to manage relationships
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              A complete CRM solution with contacts, companies, deals, cases, documentation,
              and AI integration - all built with modern technologies and best practices.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>

          <div className="mt-12 text-center">
            <Button variant="outline" size="lg" asChild>
              <Link to="/features">
                Explore All Features
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* AI & Automation Section */}
      <section className="py-24">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">AI-Ready Platform</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Built for the age of AI agents
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Connect AI assistants, voice agents, and custom integrations via Model Context Protocol (MCP).
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* MCP Servers Card */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                  <Bot className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">7 MCP Servers</h3>
                <p className="text-3xl font-bold text-primary mb-2">{totalMcpTools}+ Tools</p>
                <p className="text-muted-foreground text-sm">
                  Full CRM access via JSON-RPC for Claude Desktop, Cursor IDE, and custom AI agents.
                </p>
              </CardContent>
            </Card>

            {/* Voice Widget Card */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                  <Mic className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Voice Integration</h3>
                <p className="text-3xl font-bold text-primary mb-2">ElevenLabs</p>
                <p className="text-muted-foreground text-sm">
                  Built-in voice widget for conversational AI on your website with real-time CRM access.
                </p>
              </CardContent>
            </Card>

            {/* TypeScript SDK Card */}
            <Card className="relative overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                  <Code2 className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">TypeScript SDK</h3>
                <p className="text-3xl font-bold text-primary mb-2">{totalSdkMethods} Methods</p>
                <p className="text-muted-foreground text-sm">
                  Fully typed SDK with 6 module clients for programmatic CRM automation and scripting.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-12 text-center">
            <Button variant="outline" size="lg" asChild>
              <Link to="/developers">
                View AI Integration Docs
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">For Developers</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Modern tech stack, zero compromise
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Built with the latest technologies for type safety, performance, and developer experience.
            </p>
          </div>

          <TechStackGrid items={techStackItems} />

          <div className="mt-12 text-center">
            <Button variant="outline" size="lg" asChild>
              <Link to="/developers">
                Developer Documentation
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Two Paths Section */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Two ways to get started
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Whether you're a developer or a business owner, we've got you covered.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Developer Path */}
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-6">
                <Github className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold mb-3">For Developers</h3>
              <p className="text-muted-foreground mb-6">
                Fork the repository, customize to your needs, and deploy your own instance.
                Full source code access with MIT license.
              </p>
              <ul className="space-y-3 mb-8 text-sm">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Clone and run in under 30 minutes
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  7 MCP servers with 53+ AI tools
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  TypeScript SDK included
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Deploy to Cloudflare free tier
                </li>
              </ul>
              <Button asChild>
                <Link to="/developers">
                  <Github className="mr-2 h-4 w-4" />
                  Get the Code
                </Link>
              </Button>
            </div>

            {/* Business Path */}
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-6">
                <Wrench className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold mb-3">For Businesses</h3>
              <p className="text-muted-foreground mb-6">
                Let Jezweb handle the technical details. We'll deploy, customize, and manage
                your instance so you can focus on your business.
              </p>
              <ul className="space-y-3 mb-8 text-sm">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Managed deployment & hosting
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Voice assistant integration
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Custom branding & features
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Ongoing support & updates
                </li>
              </ul>
              <Button asChild>
                <Link to="/services">
                  <Globe className="mr-2 h-4 w-4" />
                  Explore Services
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Ready to build something great?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Start with our demo to see the platform in action, or dive straight into the code.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link to="/sign-up">
                Try the Demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a
                href="https://github.com/jezweb/vite-flare-stack"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="mr-2 h-4 w-4" />
                Star on GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
