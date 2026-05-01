/**
 * PublicAppLayout — layout for public-facing app pages
 *
 * Distinct from PublicLayout (marketing/landing) and DashboardLayout (authed).
 * Used for: status pages, customer portals, public documentation, embeddable views.
 *
 * Features:
 * - Minimal header with app branding
 * - Optional "Sign in" banner for unauthenticated users
 * - No sidebar — full-width content area
 * - Clean, embeddable design
 */
import { Outlet, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/client/components/theme-toggle'
import { appConfig, getLogoUrl } from '@/shared/config/app'

interface Props {
  /** Show "Sign in for more features" banner */
  showAuthBanner?: boolean
  /** Whether the current user is authenticated (passed from route loader or context) */
  isAuthenticated?: boolean
}

export function PublicAppLayout({ showAuthBanner = true, isAuthenticated = false }: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Minimal header */}
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
            {getLogoUrl('signIn') ? (
              <img
                src={getLogoUrl('signIn')}
                alt={appConfig.name}
                className="h-6 w-auto"
              />
            ) : (
              <span>{appConfig.name}</span>
            )}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!isAuthenticated && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/sign-in">Sign in</Link>
              </Button>
            )}
            {isAuthenticated && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Auth banner for unauthenticated users */}
      {showAuthBanner && !isAuthenticated && (
        <div className="border-b border-border bg-muted/50">
          <div className="mx-auto max-w-5xl px-4 py-2 text-center text-sm text-muted-foreground">
            <Link to="/sign-in" className="underline hover:text-foreground transition-colors">
              Sign in
            </Link>{' '}
            for additional features and personalisation.
          </div>
        </div>
      )}

      {/* Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-4 text-center text-xs text-muted-foreground">
          {appConfig.footerText || `© ${new Date().getFullYear()} ${appConfig.name}`}
        </div>
      </footer>
    </div>
  )
}
