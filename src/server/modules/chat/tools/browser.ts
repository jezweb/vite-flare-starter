/**
 * Browser Tools — Cloudflare Browser Rendering REST API
 *
 * /markdown, /json, /screenshot, /links, /content endpoints. No Puppeteer.
 * Requires CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (Browser Rendering - Edit).
 *
 * @see https://developers.cloudflare.com/browser-rendering/rest-api/
 */
import { z } from 'zod'
import { FileText, Database, Camera, Link2, Code } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface BrowserEnv {
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
}

function getBrowserEnv(ctx: AgentContext): BrowserEnv {
  return ctx.env as unknown as BrowserEnv
}

const browserAvailable = (ctx: AgentContext) => {
  const env = getBrowserEnv(ctx)
  return !!(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN)
}

async function callBrowserAPI<T>(
  env: BrowserEnv,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/${endpoint}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Browser Rendering ${endpoint} failed: ${response.status} ${text}`)
  }

  const data = await response.json() as { success: boolean; result?: T; errors?: unknown }
  if (!data.success) {
    throw new Error(`Browser Rendering ${endpoint} error: ${JSON.stringify(data.errors)}`)
  }
  return data.result as T
}

export const browserMarkdownDefinition: ToolDefinition<
  { url: string; waitForSelector?: string },
  unknown
> = {
  name: 'browser_markdown',
  description: 'Fetch a URL and convert the page to clean markdown. Ideal for reading articles, docs, or any web content as text.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to fetch'),
    waitForSelector: z.string().optional().describe('CSS selector to wait for before extracting (for JS-heavy pages)'),
  }),
  outputSchema: z.unknown(),
  isAvailable: browserAvailable,
  execute: async ({ url, waitForSelector }, ctx) => {
    try {
      const body: Record<string, unknown> = { url }
      if (waitForSelector) body['waitForSelector'] = waitForSelector
      const markdown = await callBrowserAPI<string>(getBrowserEnv(ctx), 'markdown', body)
      return { url, markdown }
    } catch (error) {
      return { url, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: FileText, displayName: 'Browser Markdown' },
}

export const browserExtractDefinition: ToolDefinition<
  { url: string; prompt: string },
  unknown
> = {
  name: 'browser_extract',
  description:
    'Extract structured data from a webpage using natural language. Powered by Workers AI — describe what you want and it returns JSON. Use for scraping product info, article metadata, listings, or any structured content.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to extract from'),
    prompt: z
      .string()
      .describe(
        'Natural language instruction: "Extract product name, price, and availability" or "Get the article title, author, and publish date"',
      ),
  }),
  outputSchema: z.unknown(),
  isAvailable: browserAvailable,
  execute: async ({ url, prompt }, ctx) => {
    try {
      const result = await callBrowserAPI<unknown>(getBrowserEnv(ctx), 'json', { url, prompt })
      return { url, data: result }
    } catch (error) {
      return { url, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Database, displayName: 'Browser Extract' },
}

export const browserScreenshotDefinition: ToolDefinition<
  { url: string; fullPage?: boolean },
  unknown
> = {
  name: 'browser_screenshot',
  description:
    'Take a screenshot of a webpage. Returns a base64 PNG image URL that can be referenced by other tools.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to screenshot'),
    fullPage: z.boolean().optional().describe('Capture the full scrollable page (default: viewport only)'),
  }),
  outputSchema: z.unknown(),
  isAvailable: browserAvailable,
  execute: async ({ url, fullPage }, ctx) => {
    const env = getBrowserEnv(ctx)
    try {
      const body: Record<string, unknown> = { url }
      if (fullPage) body['screenshotOptions'] = { fullPage: true }
      const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/screenshot`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
      return { url, imageDataUrl: `data:image/png;base64,${base64}`, sizeBytes: buffer.byteLength }
    } catch (error) {
      return { url, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Camera, displayName: 'Browser Screenshot' },
}

export const browserLinksDefinition: ToolDefinition<{ url: string }, unknown> = {
  name: 'browser_links',
  description: 'Extract all links from a webpage. Useful for discovering pages to crawl or navigation structure.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to extract links from'),
  }),
  outputSchema: z.unknown(),
  isAvailable: browserAvailable,
  execute: async ({ url }, ctx) => {
    try {
      const links = await callBrowserAPI<string[]>(getBrowserEnv(ctx), 'links', { url })
      return { url, links, count: Array.isArray(links) ? links.length : 0 }
    } catch (error) {
      return { url, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Link2, displayName: 'Browser Links' },
}

export const browserContentDefinition: ToolDefinition<
  { url: string; waitForSelector?: string },
  unknown
> = {
  name: 'browser_content',
  description: 'Get the rendered HTML content of a page. Use when you need raw HTML, not markdown.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to fetch'),
    waitForSelector: z.string().optional().describe('CSS selector to wait for'),
  }),
  outputSchema: z.unknown(),
  isAvailable: browserAvailable,
  execute: async ({ url, waitForSelector }, ctx) => {
    try {
      const body: Record<string, unknown> = { url }
      if (waitForSelector) body['waitForSelector'] = waitForSelector
      const html = await callBrowserAPI<string>(getBrowserEnv(ctx), 'content', body)
      return { url, html, length: typeof html === 'string' ? html.length : 0 }
    } catch (error) {
      return { url, error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Code, displayName: 'Browser Content' },
}

export const browserDefinitions = [
  browserMarkdownDefinition,
  browserExtractDefinition,
  browserScreenshotDefinition,
  browserLinksDefinition,
  browserContentDefinition,
] as ToolDefinition<unknown, unknown>[]
