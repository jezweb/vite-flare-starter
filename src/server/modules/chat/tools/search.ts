/**
 * Search Tools — pluggable web search providers
 *
 * Default provider: Serper (2500 free queries/month)
 * Alternatives: Brave, Tavily, Exa
 *
 * Configure via SEARCH_PROVIDER env var + provider-specific API key.
 */
import { z } from 'zod'
import { Globe } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface SearchEnv {
  SEARCH_PROVIDER?: string // 'serper' (default) | 'brave' | 'tavily' | 'exa'
  SERPER_API_KEY?: string
  BRAVE_API_KEY?: string
  TAVILY_API_KEY?: string
  EXA_API_KEY?: string
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
  date?: string
}

// ─── Provider Implementations ───────────────────────────────────────────

async function searchSerper(apiKey: string, query: string, limit: number): Promise<SearchResult[]> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: limit }),
  })
  if (!response.ok) throw new Error(`Serper API error: ${response.status}`)
  const data = await response.json() as { organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string }> }
  return (data.organic || []).map((r) => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || '',
    date: r.date,
  }))
}

async function searchBrave(apiKey: string, query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`
  const response = await fetch(url, {
    headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Brave API error: ${response.status}`)
  const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> } }
  return (data.web?.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
    date: r.age,
  }))
}

async function searchTavily(apiKey: string, query: string, limit: number): Promise<SearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: limit }),
  })
  if (!response.ok) throw new Error(`Tavily API error: ${response.status}`)
  const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> }
  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
    date: r.published_date,
  }))
}

async function searchExa(apiKey: string, query: string, limit: number): Promise<SearchResult[]> {
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, numResults: limit }),
  })
  if (!response.ok) throw new Error(`Exa API error: ${response.status}`)
  const data = await response.json() as { results?: Array<{ title?: string; url?: string; text?: string; publishedDate?: string }> }
  return (data.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.text || '',
    date: r.publishedDate,
  }))
}

// ─── Provider Factory ───────────────────────────────────────────────────

export async function webSearch(env: SearchEnv, query: string, limit = 10): Promise<SearchResult[]> {
  const provider = env.SEARCH_PROVIDER || 'serper'

  switch (provider) {
    case 'serper':
      if (!env.SERPER_API_KEY) throw new Error('SERPER_API_KEY required. Get one free at https://serper.dev (2500 queries/month)')
      return searchSerper(env.SERPER_API_KEY, query, limit)
    case 'brave':
      if (!env.BRAVE_API_KEY) throw new Error('BRAVE_API_KEY required. Get one at https://brave.com/search/api/')
      return searchBrave(env.BRAVE_API_KEY, query, limit)
    case 'tavily':
      if (!env.TAVILY_API_KEY) throw new Error('TAVILY_API_KEY required. Get one at https://tavily.com')
      return searchTavily(env.TAVILY_API_KEY, query, limit)
    case 'exa':
      if (!env.EXA_API_KEY) throw new Error('EXA_API_KEY required. Get one at https://exa.ai')
      return searchExa(env.EXA_API_KEY, query, limit)
    default:
      throw new Error(`Unknown search provider: ${provider}. Supported: serper, brave, tavily, exa`)
  }
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
      }),
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

export const searchDefinitions = [webSearchDefinition] as ToolDefinition<unknown, unknown>[]
