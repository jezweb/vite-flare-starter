/**
 * Natural-language translators for Google Workspace search tools.
 *
 * Each helper takes a free-form user query ("emails from nick last
 * week with attachments") and translates it to API-specific syntax
 * ("from:nick@... after:2026/04/16 has:attachment") via a small
 * specialist model — Nemotron 3 on Workers AI.
 *
 * Why Nemotron 3:
 *   - reliable with nested Zod schemas (per the workers-ai-structured-output
 *     bakeoff, many alternatives silently fail on union outputs)
 *   - free tier
 *   - fast enough for an inline translation (~3-8s per call)
 *
 * Design rules:
 *   - Deterministic failure mode: timeout at 10s, log, and fall back
 *     to passthrough (raw text as the query). The Gmail/Calendar API
 *     will still return *something* sensible.
 *   - Inject "today's date" and the user's timezone into the system
 *     prompt so relative phrases ("last week", "tomorrow") resolve
 *     correctly. The Worker itself runs in UTC, so we can't lean on
 *     the model's own date intuition.
 *   - Never throw — all errors caught and logged.
 */
import { generateText, generateObject } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { z } from 'zod'

const NEMOTRON = '@cf/nvidia/nemotron-3-120b-a12b'
const TIMEOUT_MS = 10_000

interface NlpEnv {
  AI: Ai
}

function nemotronFor(env: NlpEnv) {
  const workersai = createWorkersAI({ binding: env.AI })
  return workersai(NEMOTRON)
}

function todayContext(timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return fmt.format(new Date())
}

function structuredLog(event: string, fields: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ event, ...fields }))
  } catch {
    // no-op
  }
}

// ─── Gmail query translation ─────────────────────────────────────
// Returns a Gmail search-operator string. Falls back to the raw
// naturalQuery on any error so the caller can still do a fulltext
// search instead of returning nothing.

export async function translateGmailQuery(
  env: NlpEnv,
  naturalQuery: string,
  timezone = 'Australia/Sydney'
): Promise<{ query: string; translated: boolean; fallbackReason?: string }> {
  const started = Date.now()
  try {
    const { text } = await generateText({
      model: nemotronFor(env),
      system: [
        'You convert natural English requests into Gmail search syntax.',
        `Today is ${todayContext(timezone)}. The user is in timezone ${timezone}.`,
        '',
        'Gmail operators you can use:',
        '  from:EMAIL, to:EMAIL, cc:EMAIL, bcc:EMAIL, subject:TEXT',
        '  after:YYYY/MM/DD, before:YYYY/MM/DD',
        '  newer_than:7d, older_than:30d (units: d/m/y)',
        '  has:attachment, has:drive, has:document, has:spreadsheet',
        '  is:unread, is:read, is:starred, is:important',
        '  label:NAME, in:inbox, in:sent, in:trash, in:anywhere',
        '  larger:5M, smaller:1M',
        '  category:primary, category:social, category:promotions, category:updates, category:forums',
        '',
        'Rules:',
        '  • Resolve relative dates ("last week", "yesterday") to explicit after:/before: ranges.',
        '  • Keep non-operator keywords at the end so Gmail does a fulltext match on them.',
        '  • If the user mentions a name without an email, search by name in quotes: "jez"',
        '  • Reply with ONLY the query string, nothing else. No explanations, no quotes around the whole reply.',
      ].join('\n'),
      prompt: naturalQuery,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const cleaned = text
      .trim()
      .replace(/^["']+|["']+$/g, '') // strip surrounding quotes Nemotron sometimes adds
      .replace(/^Query:\s*/i, '') // strip "Query: " prefix if it leaks through
      .trim()
    if (!cleaned) {
      return {
        query: naturalQuery,
        translated: false,
        fallbackReason: 'empty translator output',
      }
    }
    structuredLog('gmail_nlp_translate', {
      naturalQuery,
      translated: cleaned,
      durationMs: Date.now() - started,
    })
    return { query: cleaned, translated: true }
  } catch (err) {
    structuredLog('gmail_nlp_fallback', {
      naturalQuery,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    })
    return {
      query: naturalQuery,
      translated: false,
      fallbackReason: err instanceof Error ? err.name : 'translator error',
    }
  }
}

// ─── Calendar list translation ───────────────────────────────────
// Returns the subset of calendar_list_events inputs that the user's
// natural query implies. Preserves caller-supplied structured fields
// when the translator omits them.

const CalendarListNlpSchema = z.object({
  range: z
    .enum(['today', 'tomorrow', 'thisWeek', 'nextWeek', 'thisMonth'])
    .optional()
    .describe('Preset window if the user clearly means one'),
  start: z
    .string()
    .optional()
    .describe('ISO 8601 with timezone offset, only when range does not fit'),
  end: z
    .string()
    .optional()
    .describe('ISO 8601 with timezone offset, only when range does not fit'),
  query: z
    .string()
    .optional()
    .describe('Free-text filter for event summary/description (e.g. attendee name)'),
})

export type CalendarListNlp = z.infer<typeof CalendarListNlpSchema>

export async function translateCalendarListQuery(
  env: NlpEnv,
  naturalQuery: string,
  timezone = 'Australia/Sydney'
): Promise<{ fields: CalendarListNlp; translated: boolean; fallbackReason?: string }> {
  const started = Date.now()
  try {
    const { object } = await generateObject({
      model: nemotronFor(env),
      schema: CalendarListNlpSchema,
      system: [
        'You translate a natural calendar-listing request into structured fields.',
        `Today is ${todayContext(timezone)}. The user is in timezone ${timezone}.`,
        '',
        'Rules:',
        '  • Prefer a `range` preset when the user clearly means one of:',
        '      today, tomorrow, thisWeek, nextWeek, thisMonth',
        '  • Only fall back to explicit `start`/`end` ISO timestamps when no preset fits',
        '    (e.g. "the next 3 weeks", "Monday to Friday", "this afternoon").',
        "  • All ISO timestamps MUST include the user's timezone offset",
        `    (${timezone} — compute the offset for today\'s date).`,
        '  • Use `query` for free-text filters: attendee names, event titles,',
        '    location terms. Omit for pure time-window requests.',
        '  • Return an empty object when the request is non-specific',
        '    (e.g. "show me events") — the caller\'s default range will kick in.',
      ].join('\n'),
      prompt: naturalQuery,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })
    structuredLog('calendar_nlp_translate', {
      naturalQuery,
      fields: object,
      durationMs: Date.now() - started,
    })
    return { fields: object, translated: true }
  } catch (err) {
    structuredLog('calendar_nlp_fallback', {
      naturalQuery,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    })
    // Last-resort fallback: treat the whole query as a free-text filter.
    // The caller's default range (or the tool's default lookback) covers
    // the time window.
    return {
      fields: { query: naturalQuery },
      translated: false,
      fallbackReason: err instanceof Error ? err.name : 'translator error',
    }
  }
}
