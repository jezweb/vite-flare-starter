/**
 * Route Configuration for SEO
 *
 * Defines public routes that should be included in the sitemap.
 * Update this file when adding new public-facing pages.
 *
 * Note: Protected routes (dashboard/*) are excluded from the sitemap
 * since they require authentication and can't be crawled.
 */

export interface RouteConfig {
  /** Route path (e.g., '/', '/sign-in') */
  path: string
  /** SEO priority (0.0 to 1.0, higher = more important) */
  priority: number
  /** How often the page content changes */
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
}

/**
 * Public routes to include in sitemap.xml
 *
 * Only add routes that:
 * - Are publicly accessible (no auth required)
 * - Should be indexed by search engines
 */
export const publicRoutes: RouteConfig[] = [
  {
    path: '/',
    priority: 1.0,
    changefreq: 'weekly',
  },
  {
    path: '/sign-in',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/sign-up',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/forgot-password',
    priority: 0.3,
    changefreq: 'yearly',
  },
  {
    path: '/reset-password',
    priority: 0.3,
    changefreq: 'yearly',
  },
]
