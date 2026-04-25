/**
 * WAF / anti-bot interstitial detection.
 *
 * Cloudflare Bot Fight Mode, Akamai, Imperva, PerimeterX, DataDome,
 * Sucuri all return HTTP 200 with a "please wait" / challenge page in
 * place of the real content when they don't trust the requester.
 * Browser Rendering / Firecrawl / any scraper engine sees that as a
 * successful 200 + non-empty body and reports `success: true`.
 *
 * The naive `result.content.length > 0` quality check passes the
 * silent-garbage page through. The agent then "reads" 51 chars of
 * "Please wait while your request is being verified" and either
 * thrashes retrying or hands the user a meaningless answer.
 *
 * `detectInterstitial(title, content)` is the quality gate. Run it on
 * every browser-rendered or scraped result before promoting it to the
 * caller. Returns the WAF vendor when matched so the error message can
 * tell the user *which* anti-bot blocked them — actionable info for
 * picking a different engine, adding cookies, or asking the site for
 * API access.
 *
 * Ported from `web-scraper-mcp/src/lib/anti-bot.ts`. See
 * ~/.claude/rules/silent-garbage-detection.md for the full pattern.
 */

/**
 * Title patterns that indicate a challenge / WAF interstitial.
 * Case-insensitive substring match.
 */
const INTERSTITIAL_TITLE_PATTERNS: Array<{ pattern: RegExp; vendor: string }> = [
  { pattern: /just a moment/i, vendor: 'cloudflare' },
  { pattern: /one moment, please/i, vendor: 'cloudflare' },
  { pattern: /attention required.*cloudflare/i, vendor: 'cloudflare' },
  { pattern: /access denied/i, vendor: 'akamai' },
  { pattern: /request unsuccessful.*incapsula/i, vendor: 'imperva' },
  { pattern: /sucuri website firewall/i, vendor: 'sucuri' },
  { pattern: /please verify you are a human/i, vendor: 'datadome' },
  { pattern: /pardon our interruption/i, vendor: 'distil' },
]

/**
 * Body patterns that indicate a challenge page even when the title
 * looks normal (some WAFs return generic "200 OK" titles).
 */
const INTERSTITIAL_BODY_PATTERNS: Array<{ pattern: RegExp; vendor: string }> = [
  { pattern: /please wait while your request is being verified/i, vendor: 'cloudflare' },
  { pattern: /checking your browser before accessing/i, vendor: 'cloudflare' },
  { pattern: /ddos protection by cloudflare/i, vendor: 'cloudflare' },
  { pattern: /verifying you are human/i, vendor: 'cloudflare' },
  { pattern: /enable javascript and cookies to continue/i, vendor: 'cloudflare' },
  { pattern: /reference #\d+\.[a-f0-9]+/i, vendor: 'akamai' },
  { pattern: /incapsula incident id/i, vendor: 'imperva' },
  { pattern: /blocked by sucuri/i, vendor: 'sucuri' },
  { pattern: /press & hold to confirm/i, vendor: 'perimeterx' },
  { pattern: /\bperimeterx\b/i, vendor: 'perimeterx' },
  { pattern: /blocked by datadome|datadome\.co/i, vendor: 'datadome' },
  { pattern: /\bcaptcha\b.*verify you are human/i, vendor: 'generic-captcha' },
]

/**
 * Body patterns are checked only when content is THIS short. A 50KB
 * article that mentions "captcha" in a sentence shouldn't trigger —
 * genuine WAF blocks return tiny pages, real articles return long ones.
 */
export const SUSPICIOUS_LENGTH_THRESHOLD = 400

export interface InterstitialDetection {
  isInterstitial: boolean
  vendor?: string
  reason?: string
}

/**
 * Inspect a scraped/rendered result and decide whether it's a challenge
 * page rather than the actual content the caller asked for. Title check
 * always runs; body check runs only when content is short.
 */
export function detectInterstitial(
  title: string | undefined,
  content: string | undefined,
): InterstitialDetection {
  const safeTitle = title || ''
  const safeContent = content || ''

  for (const { pattern, vendor } of INTERSTITIAL_TITLE_PATTERNS) {
    if (pattern.test(safeTitle)) {
      return {
        isInterstitial: true,
        vendor,
        reason: `title matches ${vendor} interstitial pattern`,
      }
    }
  }

  if (safeContent.length < SUSPICIOUS_LENGTH_THRESHOLD) {
    for (const { pattern, vendor } of INTERSTITIAL_BODY_PATTERNS) {
      if (pattern.test(safeContent)) {
        return {
          isInterstitial: true,
          vendor,
          reason: `short body matches ${vendor} interstitial pattern`,
        }
      }
    }
  }

  return { isInterstitial: false }
}

/**
 * Realistic Chrome User-Agent. Default browser-rendering UA contains
 * "HeadlessChrome" which CF Bot Fight Mode catches on its first regex
 * pass. Setting this lets most challenges not fire in the first place
 * (cheap layer-1 bypass — the Cloudflare Browser Rendering REST API
 * accepts a `userAgent` parameter on most endpoints).
 */
export const REALISTIC_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * Best-effort title extraction from a markdown body. Used by the
 * markdown-only path (Cloudflare /markdown endpoint returns just text,
 * no separate title field). Falls back to first non-empty line.
 */
export function titleFromMarkdown(markdown: string): string {
  const trimmed = markdown.trim()
  if (!trimmed) return ''
  // First # heading
  const h1 = trimmed.match(/^#\s+(.+)$/m)
  if (h1?.[1]) return h1[1].trim()
  // First non-empty line
  const firstLine = trimmed.split('\n').find((l) => l.trim().length > 0)
  return firstLine?.trim() ?? ''
}

/**
 * Build a user-friendly error message when a scrape returns an
 * interstitial. Names the WAF so the caller knows what blocked them.
 */
export function interstitialError(
  url: string,
  detection: InterstitialDetection,
): string {
  const vendor = detection.vendor ?? 'unknown WAF'
  return `Blocked by ${vendor} anti-bot at ${url}. The page returned a challenge / verification interstitial instead of real content. The site may require an authenticated session, an IP whitelist, or an alternative API.`
}
