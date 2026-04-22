/**
 * Google Workspace agent tools — native integration.
 *
 * Exposes Gmail search/send, Drive search, and Calendar read/create. Each
 * tool has its own per-user availability check — tools the user hasn't
 * granted scope for are omitted from the agent's toolkit. Access tokens
 * are fetched (and refreshed if within 5 min of expiry) on every call.
 *
 * All 5 tools are on the canonical `ToolDefinition` contract (Phase 0).
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { Mail, MailCheck, FolderOpen, Calendar, CalendarPlus } from 'lucide-react'
import { googleWorkspaceTokens } from '@/server/modules/google-workspace/db/schema'
import {
  getAccessToken,
  isGoogleWorkspaceEnabled,
  type GoogleWorkspaceEnv,
} from '@/server/modules/google-workspace/tokens'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

const RECONNECT_HINT =
  'The Google Workspace connection needs re-authorization. Ask the user to visit Connectors → Google Workspace → Reconnect.'

function gwsEnv(ctx: AgentContext): GoogleWorkspaceEnv {
  return ctx.env as unknown as GoogleWorkspaceEnv
}

/**
 * Check if the user has an active connection with the required scope.
 * Returns either a live access token or an error object. Tools return
 * the error as their output — surfaces clearly in chat.
 */
async function requireActiveToken(
  ctx: AgentContext,
  requiredScope: string,
): Promise<{ token: string } | { error: string }> {
  const env = gwsEnv(ctx)
  const db = drizzle(env.DB)
  const [row] = await db
    .select({
      scope: googleWorkspaceTokens.scope,
      status: googleWorkspaceTokens.status,
    })
    .from(googleWorkspaceTokens)
    .where(eq(googleWorkspaceTokens.userId, ctx.userId))
    .limit(1)

  if (!row) {
    return {
      error:
        'Google Workspace is not connected for this user. Ask them to visit Connectors → Google Workspace → Connect.',
    }
  }
  if (row.status !== 'active') return { error: RECONNECT_HINT }
  if (!row.scope.includes(requiredScope)) {
    return {
      error: `This action needs the "${requiredScope}" scope which was not granted. Ask the user to reconnect with this scope.`,
    }
  }

  const token = await getAccessToken(env, ctx.userId)
  if (!token) return { error: RECONNECT_HINT }
  return { token }
}

/** Top-level availability — the whole workspace feature is configured. */
const gwsAvailable = (ctx: AgentContext) => isGoogleWorkspaceEnabled(gwsEnv(ctx))

// ─── gmail_search ────────────────────────────────────────────────

const GmailSearchInput = z.object({
  query: z.string().min(1).max(500).describe('Gmail search query'),
  limit: z.number().int().min(1).max(50).default(10).optional(),
})

const GmailMessage = z.object({
  id: z.string(),
  subject: z.string(),
  from: z.string(),
  date: z.string(),
  snippet: z.string(),
})

const GmailSearchOutput = z.union([
  z.object({
    query: z.string(),
    count: z.number(),
    messages: z.array(GmailMessage),
  }),
  z.object({ error: z.string() }),
])

export type GmailSearchInput = z.infer<typeof GmailSearchInput>
export type GmailSearchOutput = z.infer<typeof GmailSearchOutput>

export const gmailSearchDefinition: ToolDefinition<GmailSearchInput, GmailSearchOutput> = {
  name: 'gmail_search',
  description:
    "Search the user's Gmail. Uses Gmail search syntax (e.g. 'from:jez@jezweb.net after:2026/04/01'). Returns message subject, from, date, snippet — no full body (use gmail_read for that).",
  inputSchema: GmailSearchInput,
  outputSchema: GmailSearchOutput,
  isAvailable: gwsAvailable,
  execute: async ({ query, limit = 10 }, ctx) => {
    const auth = await requireActiveToken(ctx, 'gmail.readonly')
    if ('error' in auth) return auth

    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    listUrl.searchParams.set('q', query)
    listUrl.searchParams.set('maxResults', String(limit))
    const listResp = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    if (!listResp.ok) return { error: `Gmail list failed: ${listResp.status}` }
    const listJson = (await listResp.json()) as { messages?: Array<{ id: string }> }
    const ids = (listJson.messages ?? []).map((m) => m.id)

    const messages = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${auth.token}` } },
        )
        if (!r.ok) return null
        const m = (await r.json()) as {
          id: string
          snippet?: string
          payload?: { headers?: Array<{ name: string; value: string }> }
        }
        const hdr = (name: string) =>
          m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value
        return {
          id: m.id,
          subject: hdr('Subject') ?? '(no subject)',
          from: hdr('From') ?? '',
          date: hdr('Date') ?? '',
          snippet: m.snippet ?? '',
        }
      }),
    )
    const filtered = messages.filter((m): m is NonNullable<typeof m> => m != null)
    return { query, count: filtered.length, messages: filtered }
  },
  render: {
    icon: Mail,
    displayName: 'Gmail Search',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.count === 0) return 'no matches'
      return `${output.count} ${output.count === 1 ? 'message' : 'messages'}`
    },
  },
}

// ─── gmail_send ──────────────────────────────────────────────────

const GmailSendInput = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000).describe('Plain-text body'),
  cc: z.array(z.string().email()).optional(),
})

const GmailSendOutput = z.union([
  z.object({
    ok: z.literal(true),
    messageId: z.string().optional(),
    to: z.string(),
    subject: z.string(),
  }),
  z.object({ error: z.string() }),
])

export type GmailSendInput = z.infer<typeof GmailSendInput>
export type GmailSendOutput = z.infer<typeof GmailSendOutput>

export const gmailSendDefinition: ToolDefinition<GmailSendInput, GmailSendOutput> = {
  name: 'gmail_send',
  description:
    "Send an email from the user's Gmail account. Always confirm the recipient, subject, and body with the user before sending — this ends up in their sent folder.",
  inputSchema: GmailSendInput,
  outputSchema: GmailSendOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async ({ to, subject, body, cc }, ctx) => {
    const auth = await requireActiveToken(ctx, 'gmail.send')
    if ('error' in auth) return auth

    const headers = [
      `To: ${to}`,
      cc && cc.length > 0 ? `Cc: ${cc.join(', ')}` : '',
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ]
      .filter(Boolean)
      .join('\r\n')
    const raw = base64UrlEncode(headers)

    const resp = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      },
    )
    if (!resp.ok) {
      const errBody = await resp.text()
      return { error: `Send failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    const json = (await resp.json()) as { id?: string }
    return { ok: true as const, messageId: json.id, to, subject }
  },
  render: {
    icon: MailCheck,
    displayName: 'Gmail Send',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return 'sent'
      return null
    },
  },
}

// ─── drive_search ────────────────────────────────────────────────

const DriveSearchInput = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "Drive query — supports 'name contains \"foo\"' and full-text 'fullText contains \"foo\"'. Defaults to fullText if plain text is passed.",
    ),
  limit: z.number().int().min(1).max(50).default(10).optional(),
})

const DriveFile = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  modifiedTime: z.string(),
  url: z.string().optional(),
  owner: z.string().optional(),
})

const DriveSearchOutput = z.union([
  z.object({
    query: z.string(),
    count: z.number(),
    files: z.array(DriveFile),
  }),
  z.object({ error: z.string() }),
])

export type DriveSearchInput = z.infer<typeof DriveSearchInput>
export type DriveSearchOutput = z.infer<typeof DriveSearchOutput>

export const driveSearchDefinition: ToolDefinition<DriveSearchInput, DriveSearchOutput> = {
  name: 'drive_search',
  description:
    "Search the user's Google Drive. Returns file names, ids, mime types, and modified times. Use drive_read to fetch a file's content.",
  inputSchema: DriveSearchInput,
  outputSchema: DriveSearchOutput,
  isAvailable: gwsAvailable,
  execute: async ({ query, limit = 10 }, ctx) => {
    const auth = await requireActiveToken(ctx, 'drive.readonly')
    if ('error' in auth) return auth

    const q = /\b(name|fullText|mimeType|modifiedTime|trashed)\s+(contains|=|!=|>|<)\b/.test(query)
      ? query
      : `fullText contains ${JSON.stringify(query)}`

    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.set('q', q)
    url.searchParams.set('pageSize', String(limit))
    url.searchParams.set(
      'fields',
      'files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress))',
    )
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) return { error: `Drive search failed: ${resp.status}` }
    const json = (await resp.json()) as {
      files?: Array<{
        id: string
        name: string
        mimeType: string
        modifiedTime: string
        webViewLink?: string
        owners?: Array<{ emailAddress?: string }>
      }>
    }
    return {
      query,
      count: json.files?.length ?? 0,
      files: (json.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        url: f.webViewLink,
        owner: f.owners?.[0]?.emailAddress,
      })),
    }
  },
  render: {
    icon: FolderOpen,
    displayName: 'Drive Search',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.count === 0) return 'no files'
      return `${output.count} ${output.count === 1 ? 'file' : 'files'}`
    },
  },
}

// ─── calendar_upcoming ───────────────────────────────────────────

const CalendarUpcomingInput = z.object({
  limit: z.number().int().min(1).max(50).default(10).optional(),
  days: z
    .number()
    .int()
    .min(1)
    .max(60)
    .default(14)
    .optional()
    .describe('Days forward to look (default 14).'),
})

const CalendarEvent = z.object({
  id: z.string(),
  summary: z.string(),
  start: z.string().optional(),
  end: z.string().optional(),
  location: z.string().optional(),
  meetLink: z.string().optional(),
  attendees: z.array(z.string()),
})

const CalendarUpcomingOutput = z.union([
  z.object({
    count: z.number(),
    events: z.array(CalendarEvent),
  }),
  z.object({ error: z.string() }),
])

export type CalendarUpcomingInput = z.infer<typeof CalendarUpcomingInput>
export type CalendarUpcomingOutput = z.infer<typeof CalendarUpcomingOutput>

export const calendarUpcomingDefinition: ToolDefinition<CalendarUpcomingInput, CalendarUpcomingOutput> = {
  name: 'calendar_upcoming',
  description:
    "List the user's upcoming calendar events (default: next 10 events across the primary calendar). Use before suggesting a meeting time or answering 'what's on my schedule?'",
  inputSchema: CalendarUpcomingInput,
  outputSchema: CalendarUpcomingOutput,
  isAvailable: gwsAvailable,
  execute: async ({ limit = 10, days = 14 }, ctx) => {
    const auth = await requireActiveToken(ctx, 'calendar.events')
    if ('error' in auth) return auth

    const now = new Date()
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('timeMin', now.toISOString())
    url.searchParams.set('timeMax', end.toISOString())
    url.searchParams.set('maxResults', String(limit))
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) return { error: `Calendar list failed: ${resp.status}` }
    const json = (await resp.json()) as {
      items?: Array<{
        id: string
        summary?: string
        start?: { dateTime?: string; date?: string }
        end?: { dateTime?: string; date?: string }
        location?: string
        hangoutLink?: string
        attendees?: Array<{ email: string }>
      }>
    }
    return {
      count: json.items?.length ?? 0,
      events: (json.items ?? []).map((e) => ({
        id: e.id,
        summary: e.summary ?? '(no title)',
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        location: e.location,
        meetLink: e.hangoutLink,
        attendees: e.attendees?.map((a) => a.email) ?? [],
      })),
    }
  },
  render: {
    icon: Calendar,
    displayName: 'Calendar',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.count === 0) return 'no upcoming events'
      return `${output.count} ${output.count === 1 ? 'event' : 'events'}`
    },
  },
}

// ─── calendar_create ─────────────────────────────────────────────

const CalendarCreateInput = z.object({
  summary: z.string().min(1).max(200).describe('Event title'),
  start: z.string().describe('Start time — RFC 3339 / ISO 8601 (e.g. "2026-04-25T14:00:00+10:00")'),
  end: z.string().describe('End time — RFC 3339 / ISO 8601'),
  description: z.string().max(5000).optional(),
  attendees: z.array(z.string().email()).max(50).optional(),
  location: z.string().max(500).optional(),
})

const CalendarCreateOutput = z.union([
  z.object({
    ok: z.literal(true),
    eventId: z.string().optional(),
    url: z.string().optional(),
    summary: z.string(),
    start: z.string(),
    end: z.string(),
  }),
  z.object({ error: z.string() }),
])

export type CalendarCreateInput = z.infer<typeof CalendarCreateInput>
export type CalendarCreateOutput = z.infer<typeof CalendarCreateOutput>

export const calendarCreateDefinition: ToolDefinition<CalendarCreateInput, CalendarCreateOutput> = {
  name: 'calendar_create',
  description:
    'Create a calendar event on the primary calendar. Always confirm the time, attendees, and details with the user before creating — attendees will receive invites immediately.',
  inputSchema: CalendarCreateInput,
  outputSchema: CalendarCreateOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async ({ summary, start, end, description, attendees, location }, ctx) => {
    const auth = await requireActiveToken(ctx, 'calendar.events')
    if ('error' in auth) return auth

    const event = {
      summary,
      description,
      location,
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: attendees?.map((email) => ({ email })),
    }
    const resp = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      },
    )
    if (!resp.ok) {
      const errBody = await resp.text()
      return { error: `Create failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    const json = (await resp.json()) as { id?: string; htmlLink?: string }
    return { ok: true as const, eventId: json.id, url: json.htmlLink, summary, start, end }
  },
  render: {
    icon: CalendarPlus,
    displayName: 'Calendar — Create Event',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return 'created'
      return null
    },
  },
}

/**
 * All Google Workspace tool definitions — imported by the aggregator.
 * Order here determines the order shown to the model in the tool catalog.
 */
export const googleWorkspaceDefinitions = [
  gmailSearchDefinition,
  gmailSendDefinition,
  driveSearchDefinition,
  calendarUpcomingDefinition,
  calendarCreateDefinition,
] as ToolDefinition<unknown, unknown>[]

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
