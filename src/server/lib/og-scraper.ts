/**
 * og-scraper — fetch a URL and extract OpenGraph + HTML <head> metadata.
 *
 * Uses HTMLRewriter (native on Workers) to stream the response and stop
 * once <head> meta is captured. Times out at 10s so a slow site doesn't
 * stall a `waitUntil()` background task.
 *
 * Output:
 *   { title, description, image, siteName } — all may be null
 *   Returns null if the URL is non-http(s), the response isn't HTML, or
 *   nothing usable was extracted.
 *
 * Use cases:
 *   - Enrich link cards in chat / inbox / hopper-style intake
 *   - Avoid link rot — capture metadata at save time, not render time
 *
 * Adapted from kindling/src/server/modules/hopper/og-scraper.ts (Jezweb).
 */

export interface OgScrapeResult {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

const FETCH_TIMEOUT_MS = 10_000

const USER_AGENT = 'vite-flare-starter/1.0 (+https://github.com/jezweb/vite-flare-starter)'

export async function scrapeOg(url: string): Promise<OgScrapeResult | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  // Only fetch http(s). Prevents file://, ftp://, data: and other schemes.
  if (!['http:', 'https:'].includes(parsed.protocol)) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Some sites 403 on default fetch UAs (Cloudflare Bot Fight Mode in
        // particular). A real-looking UA gets through.
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!resp.ok) return null

    const contentType = resp.headers.get('content-type') ?? ''
    if (!contentType.includes('html')) return null

    const result: OgScrapeResult = {
      title: null,
      description: null,
      image: null,
      siteName: null,
    }

    // <title> needs a text-node hook — HTMLRewriter's element handler only
    // sees attributes by default.
    let inTitle = false
    let titleBuffer = ''

    const rewriter = new HTMLRewriter()
      .on('title', {
        element() {
          inTitle = true
        },
        text(chunk) {
          if (inTitle) titleBuffer += chunk.text
          if (chunk.lastInTextNode) inTitle = false
        },
      })
      .on('meta', {
        element(el) {
          const property = el.getAttribute('property') ?? el.getAttribute('name')
          const content = el.getAttribute('content')
          if (!property || !content) return

          const prop = property.toLowerCase()
          if (prop === 'og:title' && !result.title) {
            result.title = decodeEntities(content)
          } else if (prop === 'og:description' || prop === 'description') {
            if (!result.description) result.description = decodeEntities(content)
          } else if (prop === 'og:image' && !result.image) {
            result.image = absoluteUrl(content, parsed)
          } else if (prop === 'og:site_name' && !result.siteName) {
            result.siteName = decodeEntities(content)
          }
        },
      })

    // Pipe response through the rewriter then consume to drive it. Cap
    // total bytes at 256KB — enough for any reasonable <head>, prevents
    // pulling huge HTML docs.
    const transformed = rewriter.transform(resp)
    const reader = transformed.body?.getReader()
    if (reader) {
      let total = 0
      while (total < 256 * 1024) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) total += value.byteLength
      }
      try {
        await reader.cancel()
      } catch {
        /* ignore cancel errors */
      }
    }

    // Fallbacks: if no og:title, use plain <title>; if no og:site_name,
    // derive from hostname.
    if (!result.title && titleBuffer.trim()) {
      result.title = titleBuffer.trim().slice(0, 300)
    }
    if (!result.siteName) {
      result.siteName = parsed.hostname.replace(/^www\./, '')
    }

    // Nothing usable — return null so callers can skip the update.
    if (!result.title && !result.description && !result.image) return null
    return result
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function decodeEntities(text: string): string {
  return (
    text
      // Numeric refs first — order matters; later &amp; replacement would
      // mangle any `&#x...;` sequences that contained `&amp;`.
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;|&apos;/g, "'")
      .trim()
  )
}

function absoluteUrl(value: string, base: URL): string | null {
  try {
    return new URL(value, base).toString()
  } catch {
    return null
  }
}
