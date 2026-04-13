/**
 * Browser Tools — Cloudflare Browser Rendering REST API
 *
 * Uses the /markdown, /json, /screenshot, /links, /content, /pdf endpoints.
 * No Puppeteer/Playwright dependencies — just REST calls.
 *
 * Requires env.CLOUDFLARE_ACCOUNT_ID and env.CLOUDFLARE_API_TOKEN with
 * "Browser Rendering - Edit" permission.
 *
 * @see https://developers.cloudflare.com/browser-rendering/rest-api/
 */
import { tool } from 'ai'
import { z } from 'zod'

interface BrowserEnv {
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
}

async function callBrowserAPI<T>(
  env: BrowserEnv,
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error(
      'Browser Rendering requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars. ' +
      'Create a token with "Browser Rendering - Edit" permission at https://dash.cloudflare.com/profile/api-tokens'
    )
  }

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

export function buildBrowserTools(env: BrowserEnv) {
  return {
    browser_markdown: tool({
      description: 'Fetch a URL and convert the page to clean markdown. Ideal for reading articles, docs, or any web content as text.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to fetch'),
        waitForSelector: z.string().optional().describe('CSS selector to wait for before extracting (for JS-heavy pages)'),
      }),
      execute: async ({ url, waitForSelector }) => {
        try {
          const body: Record<string, unknown> = { url }
          if (waitForSelector) body['waitForSelector'] = waitForSelector
          const markdown = await callBrowserAPI<string>(env, 'markdown', body)
          return { url, markdown }
        } catch (error) {
          return { url, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    browser_extract: tool({
      description: 'Extract structured data from a webpage using natural language. Powered by Workers AI — describe what you want and it returns JSON. Use for scraping product info, article metadata, listings, or any structured content.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to extract from'),
        prompt: z.string().describe('Natural language instruction: "Extract product name, price, and availability" or "Get the article title, author, and publish date"'),
      }),
      execute: async ({ url, prompt }) => {
        try {
          const result = await callBrowserAPI<unknown>(env, 'json', { url, prompt })
          return { url, data: result }
        } catch (error) {
          return { url, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    browser_screenshot: tool({
      description: 'Take a screenshot of a webpage. Returns a base64 PNG image URL that can be referenced by other tools.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to screenshot'),
        fullPage: z.boolean().optional().describe('Capture the full scrollable page (default: viewport only)'),
      }),
      execute: async ({ url, fullPage }) => {
        try {
          const body: Record<string, unknown> = { url }
          if (fullPage) body['screenshotOptions'] = { fullPage: true }
          // The screenshot endpoint returns binary — we need to handle it differently
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
    }),

    browser_links: tool({
      description: 'Extract all links from a webpage. Useful for discovering pages to crawl or navigation structure.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to extract links from'),
      }),
      execute: async ({ url }) => {
        try {
          const links = await callBrowserAPI<string[]>(env, 'links', { url })
          return { url, links, count: Array.isArray(links) ? links.length : 0 }
        } catch (error) {
          return { url, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    browser_content: tool({
      description: 'Get the rendered HTML content of a page. Use when you need raw HTML, not markdown.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to fetch'),
        waitForSelector: z.string().optional().describe('CSS selector to wait for'),
      }),
      execute: async ({ url, waitForSelector }) => {
        try {
          const body: Record<string, unknown> = { url }
          if (waitForSelector) body['waitForSelector'] = waitForSelector
          const html = await callBrowserAPI<string>(env, 'content', body)
          return { url, html, length: typeof html === 'string' ? html.length : 0 }
        } catch (error) {
          return { url, error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
