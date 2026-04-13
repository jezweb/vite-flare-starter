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
 * The prompt is structured so that static parts come first (for prompt caching)
 * and dynamic parts come last.
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const parts: string[] = []

  // 1. Base instructions (static — cacheable)
  if (options.baseInstructions) {
    parts.push(options.baseInstructions)
  }

  // 2. Current date/time (changes per request but small)
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
    parts.push(`Current date/time: ${dateStr}`)
  }

  // 3. User context
  if (options.user) {
    const userParts: string[] = []
    if (options.user.name) userParts.push(`Name: ${options.user.name}`)
    if (options.user.email) userParts.push(`Email: ${options.user.email}`)
    if (options.user.role) userParts.push(`Role: ${options.user.role}`)
    if (userParts.length > 0) {
      parts.push(`## Current User\n${userParts.join('\n')}`)
    }
  }

  // 4. Knowledge context
  if (options.knowledge && options.knowledge.length > 0) {
    const knowledgeSection = options.knowledge
      .map((item) => `### ${item.title}\n${item.content}`)
      .join('\n\n')
    parts.push(`## Reference Knowledge\n\n${knowledgeSection}`)
  }

  // 5. Extra context sections
  if (options.extra) {
    for (const [key, value] of Object.entries(options.extra)) {
      parts.push(`## ${key}\n${value}`)
    }
  }

  return parts.join('\n\n')
}
