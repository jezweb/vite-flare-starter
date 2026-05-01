import { Outlet, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/client/components/theme-toggle'
import { appConfig, getLogoUrl } from '@/shared/config/app'
import { useSession } from '@/client/lib/auth'

/**
 * Public layout for landing and auth pages
 * Provides simple header and footer for public pages
 *
 * ⚠️  SECURITY: Update VITE_APP_NAME and VITE_FOOTER_TEXT env vars
 * to rebrand for production (see src/shared/config/app.ts)
 */
export function PublicLayout() {
  const { data: session } = useSession()
  // Build footer text from config or default
  const footerText = appConfig.footerText || `© ${new Date().getFullYear()} ${appConfig.name}. MIT Licensed.`
  // signIn wordmark logo (falls back to plain text name when not set).
  const wordmark = getLogoUrl('signIn')

  return (
    <div className="flex min-h-screen flex-col">
      {/* Simple Header */}
      <header className="border-b border-border">
        <div className="container mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold flex items-center gap-2">
            {wordmark ? (
              <img src={wordmark} alt={appConfig.name} className="h-7 w-auto" />
            ) : (
              <span>{appConfig.name}</span>
            )}
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {session?.user ? (
              <Button asChild>
                <Link to="/dashboard">Open Dashboard</Link>
              </Button>
            ) : (
              <Button variant="ghost" asChild>
                <Link to="/sign-in">Sign In</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Simple Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto max-w-6xl px-4 text-center text-muted-foreground text-sm">
          <p>{footerText}</p>
        </div>
      </footer>
    </div>
  )
}
