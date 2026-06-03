/**
 * Breadcrumbs — navigation trail for hierarchical content
 *
 * Two modes:
 * - Route-based: derives from current URL path segments
 * - Data-based: pass an explicit array of { label, href }
 *
 * @example
 * // Route-based (auto from URL)
 * <Breadcrumbs />
 *
 * // Data-based (entity hierarchy)
 * <Breadcrumbs items={[
 *   { label: 'Engineering', href: '/wiki/engineering' },
 *   { label: 'API Docs', href: '/wiki/engineering/api-docs' },
 * ]} />
 */
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href: string
}

interface Props {
  /** Explicit breadcrumb items (overrides route-based) */
  items?: BreadcrumbItem[]
  /** Label overrides for route segments (e.g. { 'chat': 'AI Chat' }) */
  labels?: Record<string, string>
  /** Show home icon as first item */
  showHome?: boolean
  className?: string
}

export function Breadcrumbs({ items, labels = {}, showHome = true, className }: Props) {
  const location = useLocation()

  // Build items from URL if not provided
  const breadcrumbs = items ?? buildFromPath(location.pathname, labels)

  if (breadcrumbs.length === 0) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-1 text-sm text-muted-foreground', className)}
    >
      {showHome && (
        <>
          <Link to="/dashboard" className="hover:text-foreground transition-colors">
            <Home className="size-3.5" />
          </Link>
          {breadcrumbs.length > 0 && <ChevronRight className="size-3 text-muted-foreground/50" />}
        </>
      )}
      {breadcrumbs.map((item, i) => {
        const isLast = i === breadcrumbs.length - 1
        return (
          <span key={item.href} className="flex items-center gap-1">
            {isLast ? (
              <span className="font-medium text-foreground truncate max-w-[200px]">
                {item.label}
              </span>
            ) : (
              <>
                <Link
                  to={item.href}
                  className="hover:text-foreground transition-colors truncate max-w-[150px]"
                >
                  {item.label}
                </Link>
                <ChevronRight className="size-3 text-muted-foreground/50 shrink-0" />
              </>
            )}
          </span>
        )
      })}
    </nav>
  )
}

function buildFromPath(pathname: string, labels: Record<string, string>): BreadcrumbItem[] {
  // Strip /dashboard prefix and split
  const path = pathname.replace(/^\/dashboard\/?/, '')
  if (!path) return []

  const segments = path.split('/').filter(Boolean)
  return segments.map((segment, i) => ({
    label: labels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
    href: '/dashboard/' + segments.slice(0, i + 1).join('/'),
  }))
}
