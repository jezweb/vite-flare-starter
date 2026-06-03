/**
 * AI Context Builder
 *
 * Builds system prompts by combining:
 * 1. Base instructions (static, cacheable)
 * 2. User context (name, role, preferences from session)
 * 3. Knowledge context (injected documents, KB content)
 * 4. Tool context (available tools described for the model)
 *
 * The separation matters for prompt caching — static parts can be cached
 * while dynamic parts change per request.
 *
 * @example
 * import { buildSystemPrompt } from '@/server/lib/ai/context'
 *
 * const system = buildSystemPrompt({
 *   baseInstructions: 'You are a helpful assistant for Acme Corp.',
 *   user: { name: 'Jeremy', role: 'admin' },
 *   knowledge: [
 *     { title: 'Product FAQ', content: '...' },
 *     { title: 'Pricing', content: '...' },
 *   ],
 *   currentDate: true,
 * })
 *
 * streamText({ model, system, messages })
 */

interface KnowledgeItem {
  title: string
  content: string
}

interface UserContext {
  name?: string
  email?: string
  role?: string
  [key: string]: unknown
}

interface SystemPromptOptions {
  /** Base instructions — static, same for every request (cacheable) */
  baseInstructions?: string
  /** User context — injected per-session */
  user?: UserContext
  /** Knowledge items — documents, KB articles, scraped content */
  knowledge?: KnowledgeItem[]
  /** Inject current date/time (useful for time-relative queries) */
  currentDate?: boolean
  /** Timezone for date formatting (default: UTC) */
  timezone?: string
  /** Additional context sections (key-value, appended at the end) */
  extra?: Record<string, string>
}

/**
 * Build a structured system prompt from components.
 *
 * Returns a STRING (legacy callers) — the whole prompt, including
 * dynamic date/time. Use this when prompt caching isn't a concern.
 *
 * For prompt-cache-friendly callers (Anthropic), use
 * `buildCacheableSystemPrompt` instead — that helper splits the static
 * portion (cacheable) from the dynamic preamble (changes per turn,
 * goes into a synthetic user-message context block instead).
 *
 * The split matters because Anthropic's prompt cache byte-compares the
 * `system` field — embedding a current-date string makes every turn a
 * cache MISS. Moving date/time out preserves the cache hit on the rest
 * of the prompt (skills, persona, instructions).
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const { system, dynamic } = buildCacheableSystemPrompt(options)
  return dynamic ? `${system}\n\n${dynamic}` : system
}

/**
 * Static-vs-dynamic split for prompt-cache-friendly assembly.
 *
 *   system  — cacheable. Same byte-for-byte across turns of the same
 *             conversation as long as user / skills / extras don't
 *             change. Pass to streamText({ system, ... }).
 *   dynamic — the per-turn fluff (date/time). Inject into the messages
 *             array as a system-style preamble on the latest user
 *             message, OR concatenate manually if your provider
 *             doesn't support per-block cache_control.
 *
 * Returns dynamic = '' (empty string) when nothing dynamic was
 * requested — caller can simply skip the preamble injection.
 */
export function buildCacheableSystemPrompt(options: SystemPromptOptions): {
  system: string
  dynamic: string
} {
  const staticParts: string[] = []
  const dynamicParts: string[] = []

  // 1. Base instructions (static — cacheable)
  if (options.baseInstructions) {
    staticParts.push(options.baseInstructions)
  }

  // 2. User context (stable per session — cacheable)
  if (options.user) {
    const userParts: string[] = []
    if (options.user.name) userParts.push(`Name: ${options.user.name}`)
    if (options.user.email) userParts.push(`Email: ${options.user.email}`)
    if (options.user.role) userParts.push(`Role: ${options.user.role}`)
    if (userParts.length > 0) {
      staticParts.push(`## Current User\n${userParts.join('\n')}`)
    }
  }

  // 3. Knowledge context (stable per request — cacheable)
  if (options.knowledge && options.knowledge.length > 0) {
    const knowledgeSection = options.knowledge
      .map((item) => `### ${item.title}\n${item.content}`)
      .join('\n\n')
    staticParts.push(`## Reference Knowledge\n\n${knowledgeSection}`)
  }

  // 4. Extra sections (skills, prefs, project, memory — stable per session)
  if (options.extra) {
    for (const [key, value] of Object.entries(options.extra)) {
      staticParts.push(`## ${key}\n${value}`)
    }
  }

  // 5. DYNAMIC — current date/time. Changes every minute → cache poison
  //    if included in static system. Returned separately for the caller
  //    to inject as a user-message preamble (uncached).
  if (options.currentDate) {
    const tz = options.timezone || 'UTC'
    const dateStr = new Intl.DateTimeFormat('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
      timeZoneName: 'short',
    }).format(new Date())
    dynamicParts.push(`Current date/time: ${dateStr}`)
  }

  return {
    system: staticParts.join('\n\n'),
    dynamic: dynamicParts.join('\n\n'),
  }
}
