/**
 * Voice Context Variables
 *
 * Defines the dynamic variables passed to ElevenLabs voice agents.
 * These variables can be used in agent system prompts and first messages
 * using the {{ variable_name }} syntax in the ElevenLabs dashboard.
 *
 * Example system prompt:
 *   "You are a helpful assistant for {{ user_name }}.
 *    They are currently viewing: {{ current_page }}"
 */

export interface VoiceContextVariables {
  // Basic context (always available)
  /** User's display name or 'Guest' for unauthenticated */
  user_name: string
  /** User's email or 'unknown' for unauthenticated */
  user_email: string
  /** Current route pathname (e.g., '/dashboard/contacts') */
  current_page: string
  /** Browser document title */
  page_title: string
  /** ISO timestamp when variables were built */
  timestamp: string
  /** Whether user is authenticated */
  is_authenticated: string

  // Extended context (optional, for CRM entity pages)
  /** Type of entity being viewed: 'contact' | 'company' | 'deal' | 'case' */
  entity_type?: string
  /** Display name of the entity (e.g., 'John Doe', 'Acme Corp') */
  entity_name?: string
  /** JSON string with additional entity details */
  entity_context?: string
}

export interface BuildVariablesOptions {
  /** Authenticated user info, or null for guests */
  user?: { name: string; email: string } | null
  /** Current route pathname */
  pathname: string
  /** Override page title (defaults to document.title) */
  pageTitle?: string
  /** Optional entity context for CRM detail pages */
  entity?: {
    type: string
    name: string
    data?: Record<string, unknown>
  }
}

/**
 * Build dynamic variables for ElevenLabs voice agent
 *
 * @example Basic usage
 * ```typescript
 * const vars = buildVariables({
 *   user: { name: 'John', email: 'john@example.com' },
 *   pathname: '/dashboard/contacts'
 * })
 * // { user_name: 'John', user_email: 'john@example.com', ... }
 * ```
 *
 * @example With entity context
 * ```typescript
 * const vars = buildVariables({
 *   user: session?.user,
 *   pathname: '/dashboard/contacts/123',
 *   entity: {
 *     type: 'contact',
 *     name: 'Jane Smith',
 *     data: { status: 'active', company: 'Acme Corp' }
 *   }
 * })
 * ```
 */
export function buildVariables(options: BuildVariablesOptions): VoiceContextVariables {
  const isAuthenticated = !!options.user

  const baseVariables: VoiceContextVariables = {
    user_name: options.user?.name || 'Guest',
    user_email: options.user?.email || 'unknown',
    current_page: options.pathname,
    page_title: options.pageTitle || (typeof document !== 'undefined' ? document.title : ''),
    timestamp: new Date().toISOString(),
    is_authenticated: isAuthenticated ? 'yes' : 'no',
  }

  // Add entity context if provided
  if (options.entity) {
    return {
      ...baseVariables,
      entity_type: options.entity.type,
      entity_name: options.entity.name,
      entity_context: options.entity.data ? JSON.stringify(options.entity.data) : undefined,
    }
  }

  return baseVariables
}

/**
 * Helper to get a human-readable page name from pathname
 *
 * @example
 * getPageName('/dashboard/contacts') // 'Contacts'
 * getPageName('/dashboard/deals/123') // 'Deal Details'
 */
export function getPageName(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) return 'Home'

  const firstSegment = segments[0]
  if (firstSegment === 'dashboard') {
    if (segments.length === 1) return 'Dashboard'
    const page = segments[1]
    if (!page) return 'Dashboard'
    // Check if there's an ID (detail page)
    if (segments.length > 2) {
      return `${page.charAt(0).toUpperCase() + page.slice(1, -1)} Details`
    }
    return page.charAt(0).toUpperCase() + page.slice(1)
  }

  // Public pages
  const lastSegment = segments[segments.length - 1]
  if (!lastSegment) return 'Page'
  return lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1)
}
