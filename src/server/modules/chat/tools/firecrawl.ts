/**
 * Firecrawl tools — JS-heavy page scraping + site crawling
 *
 * Firecrawl handles pages that defeat Cloudflare Browser Rendering
 * (heavy JS, anti-bot interstitials, login walls when given session
 * cookies). Use as the second-tier scraping option alongside the
 * existing browser_* tools.
 *
 * BYOK-aware: requires a `firecrawl` credential (per-user or per-org)
 * OR the operator's `FIRECRAWL_API_KEY` env var. When neither is set,
 * the tools hide via `isAvailable`.
 *
 * Sign up: https://firecrawl.dev (free tier ~500 pages/mo as of 2026-04).
 */
import { z } from 'zod'
import { Globe, Network } from 'lucide-react'
import { getServiceKey, type CredentialEnv } from '@/server/lib/credentials'
import {
  detectInterstitial,
  interstitialError,
  titleFromMarkdown,
} from '@/server/lib/interstitial-detect'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

async function getFirecrawlKey(ctx: AgentContext): Promise<string | null> {
  const env = ctx.env as unknown as CredentialEnv
  return getServiceKey(env, { userId: ctx.userId }, 'firecrawl')
}

async function firecrawlAvailable(ctx: AgentContext): Promise<boolean> {
  return (await getFirecrawlKey(ctx)) !== null
}

const FirecrawlScrapeOutput = z.union([
  z.object({
    url: z.string(),
    markdown: z.string(),
    title: z.string().optional(),
    sourceUrl: z.string().optional(),
  }),
  z.object({ url: z.string(), error: z.string() }),
])

export const firecrawlScrapeDefinition: ToolDefinition<
  { url: string; onlyMainContent?: boolean },
  z.infer<typeof FirecrawlScrapeOutput>
> = {
  name: 'firecrawl_scrape',
  description:
    'Scrape a single URL via Firecrawl. Use when browser_markdown returns interstitials, JS-heavy SPAs, or pages with anti-bot blocks. Returns markdown of the rendered page.',
  inputSchema: z.object({
    url: z.string().url(),
    onlyMainContent: z
      .boolean()
      .optional()
      .describe('Strip nav/footer/sidebar, keep main article. Default true.'),
  }),
  outputSchema: FirecrawlScrapeOutput,
  isAvailable: firecrawlAvailable,
  execute: async ({ url, onlyMainContent = true }, ctx) => {
    const key = await getFirecrawlKey(ctx)
    if (!key) return { url, error: 'Firecrawl not configured' }
    try {
      const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent,
        }),
      })
      if (!resp.ok) {
        const errBody = await resp.text()
        return { url, error: `Firecrawl ${resp.status}: ${errBody.slice(0, 200)}` }
      }
      const json = (await resp.json()) as {
        success: boolean
        data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } }
        error?: string
      }
      if (!json.success || !json.data?.markdown) {
        return { url, error: json.error ?? 'Firecrawl returned no markdown' }
      }
      const markdown = json.data.markdown
      // Same interstitial detector — Firecrawl can also be served a
      // verification page if rate-limited or anti-bot triggers.
      const detection = detectInterstitial(
        json.data.metadata?.title ?? titleFromMarkdown(markdown),
        markdown,
      )
      if (detection.isInterstitial) {
        return { url, error: interstitialError(url, detection) }
      }
      return {
        url,
        markdown,
        ...(json.data.metadata?.title && { title: json.data.metadata.title }),
        ...(json.data.metadata?.sourceURL && { sourceUrl: json.data.metadata.sourceURL }),
      }
    } catch (err) {
      return { url, error: err instanceof Error ? err.message : String(err) }
    }
  },
  render: { icon: Globe, displayName: 'Firecrawl Scrape' },
}

const FirecrawlCrawlOutput = z.union([
  z.object({
    url: z.string(),
    pages: z.array(
      z.object({
        url: z.string(),
        title: z.string().optional(),
        markdown: z.string(),
      }),
    ),
    total: z.number(),
    truncated: z.boolean(),
  }),
  z.object({ url: z.string(), error: z.string() }),
])

export const firecrawlCrawlDefinition: ToolDefinition<
  { url: string; limit?: number; includePaths?: string[] },
  z.infer<typeof FirecrawlCrawlOutput>
> = {
  name: 'firecrawl_crawl',
  description:
    'Crawl multiple pages from a starting URL. Returns markdown of each page. Use when the user wants to ingest a whole site (docs, blog, marketing pages). Capped — set limit explicitly for larger crawls.',
  inputSchema: z.object({
    url: z.string().url().describe('Starting URL'),
    limit: z.number().int().min(1).max(50).optional().describe('Max pages to fetch (default 10).'),
    includePaths: z
      .array(z.string())
      .max(20)
      .optional()
      .describe('Path-glob filters (e.g. ["/blog/*", "/docs/*"])'),
  }),
  outputSchema: FirecrawlCrawlOutput,
  isAvailable: firecrawlAvailable,
  execute: async ({ url, limit = 10, includePaths }, ctx) => {
    const key = await getFirecrawlKey(ctx)
    if (!key) return { url, error: 'Firecrawl not configured' }
    try {
      // Firecrawl's crawl endpoint is async — kicks off a job, returns
      // a job id, you poll. For simplicity we use the `/crawl` POST
      // with `waitFor` semantics where supported.
      const resp = await fetch('https://api.firecrawl.dev/v1/crawl', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          limit,
          ...(includePaths && { includePaths }),
          scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
        }),
      })
      if (!resp.ok) {
        const errBody = await resp.text()
        return { url, error: `Firecrawl crawl ${resp.status}: ${errBody.slice(0, 200)}` }
      }
      const json = (await resp.json()) as {
        success: boolean
        id?: string
        url?: string
        error?: string
      }
      if (!json.success || !json.id) {
        return { url, error: json.error ?? 'Firecrawl crawl rejected' }
      }
      // Poll the job until done or 60s — agent timeouts catch us
      // either way. For longer crawls a fork should use Workflows.
      const jobUrl = `https://api.firecrawl.dev/v1/crawl/${json.id}`
      const deadline = Date.now() + 60_000
      let finalData: { url: string; markdown?: string; metadata?: { title?: string } }[] = []
      let truncated = false
      while (Date.now() < deadline) {
        const pollResp = await fetch(jobUrl, { headers: { Authorization: `Bearer ${key}` } })
        if (!pollResp.ok) break
        const pollJson = (await pollResp.json()) as {
          status: string
          data?: typeof finalData
        }
        if (pollJson.status === 'completed') {
          finalData = pollJson.data ?? []
          break
        }
        if (pollJson.status === 'failed') {
          return { url, error: 'Firecrawl crawl failed' }
        }
        // Hold this turn — sleep is bounded.
        await new Promise((r) => setTimeout(r, 2000))
      }
      if (finalData.length === 0) {
        // Timed out before completion — return what's there + truncated flag.
        truncated = true
      }
      return {
        url,
        pages: finalData
          .filter((p) => typeof p.markdown === 'string')
          .map((p) => ({
            url: p.url,
            ...(p.metadata?.title && { title: p.metadata.title }),
            markdown: p.markdown ?? '',
          })),
        total: finalData.length,
        truncated,
      }
    } catch (err) {
      return { url, error: err instanceof Error ? err.message : String(err) }
    }
  },
  render: { icon: Network, displayName: 'Firecrawl Crawl' },
}

export const firecrawlDefinitions = [
  firecrawlScrapeDefinition,
  firecrawlCrawlDefinition,
] as ToolDefinition<unknown, unknown>[]
