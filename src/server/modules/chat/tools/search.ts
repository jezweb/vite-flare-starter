/**
 * Search Tools — pluggable web search providers
 *
 * Default provider: Serper (2500 free queries/month)
 * Alternatives: Brave, Tavily, Exa
 *
 * Configure via SEARCH_PROVIDER env var + provider-specific API key.
 *
 * Domain-scoped search (#89): `trusted_search` pins results to an
 * allow-list of domains (SEARCH_TRUSTED_DOMAINS, comma-separated) so the
 * agent can answer "authoritative" questions without quoting a random
 * blog. Scoping is applied twice: pushed to the provider where it has a
 * native mechanism (Tavily `include_domains`, Exa `includeDomains`,
 * `site:` operators for Serper/Brave) AND re-filtered server-side against
 * the allow-list — so a provider silently ignoring its scope parameter
 * (Tavily does exactly that on its legacy api_key-in-body auth format)
 * can never leak off-list results. Forks wanting a bespoke tool per
 * domain-set can call `createScopedSearchTool(...)` directly.
 */
import { z } from 'zod'
import { Globe, ShieldCheck } from '@phosphor-icons/react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface SearchEnv {
  SEARCH_PROVIDER?: string // 'serper' (default) | 'brave' | 'tavily' | 'exa'
  SERPER_API_KEY?: string
  BRAVE_API_KEY?: string
  TAVILY_API_KEY?: string
  EXA_API_KEY?: string
  /** Comma-separated allow-list enabling the trusted_search tool. */
  SEARCH_TRUSTED_DOMAINS?: string
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
  date?: string
}

// ─── Domain scoping helpers ──────────────────────────────────────────────

/**
 * Normalise a raw allow-list entry to a bare lowercase hostname.
 * Accepts "docs.example.com", "https://example.com/path", "*.example.com".
 * Returns null for entries that don't survive normalisation.
 */
export function normalizeDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase()
  if (!d) return null
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // strip scheme
  d = d.replace(/^\*\./, '') // *.example.com → example.com (suffix match covers it)
  d = d.split(/[/?#]/)[0]! // strip path
  d = d.split('@').pop()! // strip userinfo
  d = d.split(':')[0]! // strip port
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null
  return d
}

export function parseTrustedDomains(value: string | undefined): string[] {
  if (!value) return []
  const seen = new Set<string>()
  for (const part of value.split(/[,\s]+/)) {
    const d = normalizeDomain(part)
    if (d) seen.add(d)
  }
  return [...seen]
}

/** True when url's hostname is the domain itself or a subdomain of it. */
export function urlMatchesDomains(url: string, domains: string[]): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false // unparseable URL → fail closed
  }
  return domains.some((d) => host === d || host.endsWith(`.${d}`))
}

/** Serper/Brave have no allow-list parameter — scope via site: operators. */
const withSiteOperators = (query: string, domains?: string[]) =>
  domains && domains.length > 0
    ? `${query} (${domains.map((d) => `site:${d}`).join(' OR ')})`
    : query

// ─── Provider Implementations ───────────────────────────────────────────

interface SearchOptions {
  /** Restrict results to these domains (bare hostnames). */
  domains?: string[]
}

async function searchSerper(
  apiKey: string,
  query: string,
  limit: number,
  opts?: SearchOptions
): Promise<SearchResult[]> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: withSiteOperators(query, opts?.domains), num: limit }),
  })
  if (!response.ok) throw new Error(`Serper API error: ${response.status}`)
  const data = (await response.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string }>
  }
  return (data.organic || []).map((r) => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || '',
    date: r.date,
  }))
}

async function searchBrave(
  apiKey: string,
  query: string,
  limit: number,
  opts?: SearchOptions
): Promise<SearchResult[]> {
  const q = withSiteOperators(query, opts?.domains)
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${limit}`
  const response = await fetch(url, {
    headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Brave API error: ${response.status}`)
  const data = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> }
  }
  return (data.web?.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
    date: r.age,
  }))
}

async function searchTavily(
  apiKey: string,
  query: string,
  limit: number,
  opts?: SearchOptions
): Promise<SearchResult[]> {
  // Bearer auth is Tavily's current documented format. The legacy
  // api_key-in-body format historically ignored include_domains and
  // returned unscoped results (#89; observed fixed upstream 2026-07-17,
  // but don't depend on it). The post-filter in webSearch() catches any
  // such leak; scoping at the provider keeps result slots useful.
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      max_results: limit,
      ...(opts?.domains && opts.domains.length > 0 ? { include_domains: opts.domains } : {}),
    }),
  })
  if (!response.ok) throw new Error(`Tavily API error: ${response.status}`)
  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>
  }
  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
    date: r.published_date,
  }))
}

async function searchExa(
  apiKey: string,
  query: string,
  limit: number,
  opts?: SearchOptions
): Promise<SearchResult[]> {
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      numResults: limit,
      ...(opts?.domains && opts.domains.length > 0 ? { includeDomains: opts.domains } : {}),
    }),
  })
  if (!response.ok) throw new Error(`Exa API error: ${response.status}`)
  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; text?: string; publishedDate?: string }>
  }
  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.text || '',
    date: r.publishedDate,
  }))
}

// ─── Provider Factory ───────────────────────────────────────────────────

export async function webSearch(
  env: SearchEnv,
  query: string,
  limit = 10,
  opts?: SearchOptions
): Promise<SearchResult[]> {
  const provider = env.SEARCH_PROVIDER || 'serper'

  let results: SearchResult[]
  switch (provider) {
    case 'serper':
      if (!env.SERPER_API_KEY)
        throw new Error(
          'SERPER_API_KEY required. Get one free at https://serper.dev (2500 queries/month)'
        )
      results = await searchSerper(env.SERPER_API_KEY, query, limit, opts)
      break
    case 'brave':
      if (!env.BRAVE_API_KEY)
        throw new Error('BRAVE_API_KEY required. Get one at https://brave.com/search/api/')
      results = await searchBrave(env.BRAVE_API_KEY, query, limit, opts)
      break
    case 'tavily':
      if (!env.TAVILY_API_KEY)
        throw new Error('TAVILY_API_KEY required. Get one at https://tavily.com')
      results = await searchTavily(env.TAVILY_API_KEY, query, limit, opts)
      break
    case 'exa':
      if (!env.EXA_API_KEY) throw new Error('EXA_API_KEY required. Get one at https://exa.ai')
      results = await searchExa(env.EXA_API_KEY, query, limit, opts)
      break
    default:
      throw new Error(`Unknown search provider: ${provider}. Supported: serper, brave, tavily, exa`)
  }

  // Defence-in-depth: never trust the provider to have honoured its scope
  // parameter — re-filter against the allow-list before anything is
  // returned to the model.
  if (opts?.domains && opts.domains.length > 0) {
    results = results.filter((r) => urlMatchesDomains(r.url, opts.domains!))
  }
  return results
}

export function getActiveSearchProvider(env: SearchEnv): string | null {
  const provider = env.SEARCH_PROVIDER || 'serper'
  const keyMap: Record<string, string | undefined> = {
    serper: env.SERPER_API_KEY,
    brave: env.BRAVE_API_KEY,
    tavily: env.TAVILY_API_KEY,
    exa: env.EXA_API_KEY,
  }
  return keyMap[provider] ? provider : null
}

// ─── Tool Definitions ───────────────────────────────────────────────────

function getSearchEnv(ctx: AgentContext): SearchEnv {
  return ctx.env as unknown as SearchEnv
}

const WebSearchOutput = z.union([
  z.object({
    query: z.string(),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
        date: z.string().optional(),
      })
    ),
    count: z.number(),
    provider: z.string(),
  }),
  z.object({ query: z.string(), error: z.string() }),
])

export const webSearchDefinition: ToolDefinition<
  { query: string; limit?: number },
  z.infer<typeof WebSearchOutput>
> = {
  name: 'web_search',
  description:
    'Search the web for current information. Returns a list of results with titles, URLs, snippets, and dates. Use when the user asks about recent events, or when you need up-to-date information.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    limit: z.number().optional().describe('Number of results to return (default: 10, max: 20)'),
  }),
  outputSchema: WebSearchOutput,
  isAvailable: (ctx) => !!getActiveSearchProvider(getSearchEnv(ctx)),
  execute: async ({ query, limit = 10 }, ctx) => {
    const env = getSearchEnv(ctx)
    try {
      const results = await webSearch(env, query, Math.min(limit, 20))
      return { query, results, count: results.length, provider: env.SEARCH_PROVIDER || 'serper' }
    } catch (error) {
      return { query, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: {
    icon: Globe,
    displayName: 'Web Search',
    summary: (output) => {
      const o = output as { count?: number; error?: string } | undefined
      if (!o || o.error) return null
      const n = o.count ?? 0
      return n === 0 ? 'no results' : `${n} ${n === 1 ? 'result' : 'results'}`
    },
  },
}

// ─── Domain-scoped search (#89) ──────────────────────────────────────────

const ScopedSearchOutput = z.union([
  z.object({
    query: z.string(),
    domains: z.array(z.string()),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
        date: z.string().optional(),
      })
    ),
    count: z.number(),
    provider: z.string(),
  }),
  z.object({ query: z.string(), error: z.string() }),
])

type ScopedSearchOutputT = z.infer<typeof ScopedSearchOutput>

/**
 * Build a domain-pinned variant of web_search. Forks with a fixed set of
 * authoritative sources (a regulator, the client's own docs, a vendor KB)
 * call this with static domains and register the result alongside their
 * other tools; the starter's `trusted_search` below resolves its domains
 * from SEARCH_TRUSTED_DOMAINS at call time instead.
 */
export function createScopedSearchTool(config: {
  name: string
  displayName: string
  description: string
  domains: string[] | ((ctx: AgentContext) => string[])
}): ToolDefinition<{ query: string; limit?: number }, ScopedSearchOutputT> {
  const resolveDomains = (ctx: AgentContext) =>
    typeof config.domains === 'function' ? config.domains(ctx) : config.domains

  return {
    name: config.name,
    description: config.description,
    inputSchema: z.object({
      query: z.string().describe('The search query (no site: operators needed — scoping is automatic)'),
      limit: z.number().optional().describe('Number of results to return (default: 10, max: 20)'),
    }),
    outputSchema: ScopedSearchOutput,
    isAvailable: (ctx) =>
      !!getActiveSearchProvider(getSearchEnv(ctx)) && resolveDomains(ctx).length > 0,
    execute: async ({ query, limit = 10 }, ctx) => {
      const env = getSearchEnv(ctx)
      const domains = resolveDomains(ctx)
      if (domains.length === 0) return { query, error: 'No trusted domains configured' }
      try {
        const results = await webSearch(env, query, Math.min(limit, 20), { domains })
        return {
          query,
          domains,
          results,
          count: results.length,
          provider: env.SEARCH_PROVIDER || 'serper',
        }
      } catch (error) {
        return { query, error: error instanceof Error ? error.message : String(error) }
      }
    },
    render: {
      icon: ShieldCheck,
      displayName: config.displayName,
      summary: (output) => {
        const o = output as { count?: number; error?: string } | undefined
        if (!o || o.error) return null
        const n = o.count ?? 0
        return n === 0 ? 'no results on trusted domains' : `${n} trusted ${n === 1 ? 'result' : 'results'}`
      },
    },
  }
}

export const trustedSearchDefinition = createScopedSearchTool({
  name: 'trusted_search',
  displayName: 'Trusted Search',
  description:
    'Search the web restricted to an operator-configured allow-list of trusted domains (official docs, regulators, vendor knowledge bases). Results outside the allow-list are filtered out server-side. Prefer this over web_search when the answer must come from an authoritative source. The output lists which domains were searched.',
  domains: (ctx) => parseTrustedDomains(getSearchEnv(ctx).SEARCH_TRUSTED_DOMAINS),
})

export const searchDefinitions = [webSearchDefinition, trustedSearchDefinition] as ToolDefinition<
  unknown,
  unknown
>[]
