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
import {
  Mail,
  MailCheck,
  MailOpen,
  MailQuestion,
  Reply,
  Tags,
  FolderOpen,
  FolderPlus,
  Calendar,
  CalendarPlus,
  CalendarSearch,
  CalendarClock,
  CalendarCheck,
  CalendarX,
  FileText,
  FileSearch,
  FilePlus,
  FilePen,
  FileDown,
  FileType,
  Sheet,
  Table2,
  Rows4,
  ListTodo,
  ListPlus,
} from 'lucide-react'
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
  // Scope strings are space-separated full URIs. Match exactly on the
  // short suffix (everything after `/auth/`) so `gmail.readonly` doesn't
  // spuriously match `gmail.readonly.something` if Google ever ships
  // a super-set scope with that prefix.
  const grantedScopes = row.scope
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const idx = s.indexOf('/auth/')
      return idx >= 0 ? s.slice(idx + '/auth/'.length) : s
    })
  if (!grantedScopes.includes(requiredScope)) {
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

const GmailSearchInput = z
  .object({
    query: z
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe('Gmail search query in operator syntax. Prefer this when you can construct it yourself.'),
    naturalQuery: z
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe(
        'Free-form English — "emails from nick last week with attachments". Use only when you have free-form user intent and would otherwise have to guess the Gmail operator syntax. Server translates via Nemotron 3 (costs ~3-8s of extra latency per call).',
      ),
    limit: z.number().int().min(1).max(50).default(10).optional(),
  })
  .refine((i) => !!i.query || !!i.naturalQuery, {
    message: 'Provide either `query` or `naturalQuery`',
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
    translatedFrom: z.string().optional().describe('Original naturalQuery when the server translated it'),
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
    "Search the user's Gmail. Returns message subject, from, date, snippet — no full body (use gmail_get_message for that). Pass `query` in Gmail operator syntax (e.g. 'from:jez@jezweb.net after:2026/04/01') when you can, or `naturalQuery` in free-form English when translating user intent is clearer.",
  inputSchema: GmailSearchInput,
  outputSchema: GmailSearchOutput,
  isAvailable: gwsAvailable,
  execute: async ({ query, naturalQuery, limit = 10 }, ctx) => {
    const auth = await requireActiveToken(ctx, 'gmail.readonly')
    if ('error' in auth) return auth

    // Translate naturalQuery when we don't already have a structured query.
    // If both are provided, structured wins (silently — avoids surprising
    // behaviour where a user-provided operator gets "helpfully" replaced).
    let translatedFrom: string | undefined
    let effectiveQuery = query
    if (!effectiveQuery && naturalQuery) {
      const { translateGmailQuery } = await import('./google-workspace-nlp')
      const result = await translateGmailQuery(
        gwsEnv(ctx) as unknown as { AI: Ai },
        naturalQuery,
      )
      effectiveQuery = result.query
      translatedFrom = naturalQuery
    }
    if (!effectiveQuery) {
      return { error: 'Internal error: no query after translation' }
    }

    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    listUrl.searchParams.set('q', effectiveQuery)
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
    return {
      query: effectiveQuery,
      translatedFrom,
      count: filtered.length,
      messages: filtered,
    }
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

    const raw = base64UrlEncode(buildMimeMessage({ to, subject, body, cc }))

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

// ─── gmail_get_message ───────────────────────────────────────────
// Fetch one message's full body + metadata. Separate from gmail_search
// so the model can do "search → pick one → read" rather than bulk-reading.

const GmailGetMessageInput = z.object({
  messageId: z.string().min(1).describe('Message id returned by gmail_search'),
  format: z
    .enum(['full', 'summary'])
    .default('full')
    .optional()
    .describe('full = include body text, summary = metadata only'),
})

const GmailFullMessage = z.object({
  id: z.string(),
  threadId: z.string(),
  subject: z.string(),
  from: z.string(),
  to: z.string().optional(),
  cc: z.string().optional(),
  date: z.string(),
  snippet: z.string(),
  body: z.string().optional(),
  hasAttachments: z.boolean(),
  attachments: z
    .array(
      z.object({
        attachmentId: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
      }),
    )
    .optional(),
  labelIds: z.array(z.string()).optional(),
})

const GmailGetMessageOutput = z.union([
  GmailFullMessage,
  z.object({ error: z.string() }),
])

export type GmailGetMessageInput = z.infer<typeof GmailGetMessageInput>
export type GmailGetMessageOutput = z.infer<typeof GmailGetMessageOutput>

export const gmailGetMessageDefinition: ToolDefinition<GmailGetMessageInput, GmailGetMessageOutput> = {
  name: 'gmail_get_message',
  description:
    "Read one Gmail message in full (body + headers + attachment metadata). Call after gmail_search when the user asks about a specific thread. Format 'summary' returns metadata only — cheaper when you just need subject/from.",
  inputSchema: GmailGetMessageInput,
  outputSchema: GmailGetMessageOutput,
  isAvailable: gwsAvailable,
  execute: async ({ messageId, format = 'full' }, ctx) => {
    const auth = await requireActiveToken(ctx, 'gmail.readonly')
    if ('error' in auth) return auth

    const apiFormat = format === 'summary' ? 'metadata' : 'full'
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    )
    url.searchParams.set('format', apiFormat)
    if (apiFormat === 'metadata') {
      for (const h of ['From', 'To', 'Cc', 'Subject', 'Date']) {
        url.searchParams.append('metadataHeaders', h)
      }
    }
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) return { error: `Gmail get failed: ${resp.status}` }
    const m = (await resp.json()) as GmailApiMessage

    const hdr = (name: string) =>
      m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value
    const { body, attachments } = extractGmailBody(m.payload)

    return {
      id: m.id,
      threadId: m.threadId ?? m.id,
      subject: hdr('Subject') ?? '(no subject)',
      from: hdr('From') ?? '',
      to: hdr('To'),
      cc: hdr('Cc'),
      date: hdr('Date') ?? '',
      snippet: m.snippet ?? '',
      body: format === 'full' ? body : undefined,
      hasAttachments: attachments.length > 0,
      attachments: attachments.length > 0 ? attachments : undefined,
      labelIds: m.labelIds,
    }
  },
  render: {
    icon: MailOpen,
    displayName: 'Gmail — Read',
    summary: (output) => {
      if ('error' in output) return 'failed'
      return output.subject ? truncate(output.subject, 40) : null
    },
  },
}

// ─── gmail_list_labels ───────────────────────────────────────────
// Enables label-aware follow-ups without hard-coding INBOX / STARRED / UNREAD.

const GmailListLabelsInput = z.object({})

const GmailLabel = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['system', 'user']).optional(),
  messageListVisibility: z.string().optional(),
})

const GmailListLabelsOutput = z.union([
  z.object({
    count: z.number(),
    labels: z.array(GmailLabel),
  }),
  z.object({ error: z.string() }),
])

export type GmailListLabelsInput = z.infer<typeof GmailListLabelsInput>
export type GmailListLabelsOutput = z.infer<typeof GmailListLabelsOutput>

export const gmailListLabelsDefinition: ToolDefinition<GmailListLabelsInput, GmailListLabelsOutput> = {
  name: 'gmail_list_labels',
  description:
    "List the user's Gmail labels (both system labels like INBOX / STARRED and user-created labels). Useful when the user wants to filter by a custom label or organise mail.",
  inputSchema: GmailListLabelsInput,
  outputSchema: GmailListLabelsOutput,
  isAvailable: gwsAvailable,
  execute: async (_input, ctx) => {
    const auth = await requireActiveToken(ctx, 'gmail.readonly')
    if ('error' in auth) return auth

    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    if (!resp.ok) return { error: `Gmail labels failed: ${resp.status}` }
    const json = (await resp.json()) as {
      labels?: Array<{
        id: string
        name: string
        type?: 'system' | 'user'
        messageListVisibility?: string
      }>
    }
    const labels = json.labels ?? []
    return { count: labels.length, labels }
  },
  render: {
    icon: Tags,
    displayName: 'Gmail — Labels',
    summary: (output) => {
      if ('error' in output) return 'failed'
      return `${output.count} ${output.count === 1 ? 'label' : 'labels'}`
    },
  },
}

// ─── gmail_draft ─────────────────────────────────────────────────
// Creates a draft WITHOUT sending. Deliberately NOT privileged — drafts
// have no external effect; the user can approve sending later via
// gmail_send or by editing in the Gmail UI.

const GmailDraftInput = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000).describe('Plain-text body'),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  /**
   * Optional: thread this draft belongs to. Setting this puts the draft
   * into an existing conversation view and auto-fills the In-Reply-To /
   * References headers on send.
   */
  threadId: z.string().optional(),
})

const GmailDraftOutput = z.union([
  z.object({
    ok: z.literal(true),
    draftId: z.string(),
    messageId: z.string().optional(),
    to: z.string(),
    subject: z.string(),
  }),
  z.object({ error: z.string() }),
])

export type GmailDraftInput = z.infer<typeof GmailDraftInput>
export type GmailDraftOutput = z.infer<typeof GmailDraftOutput>

export const gmailDraftDefinition: ToolDefinition<GmailDraftInput, GmailDraftOutput> = {
  name: 'gmail_draft',
  description:
    "Compose a Gmail draft WITHOUT sending. Returns a draft id the user can review, edit, or send later. Prefer this over gmail_send when the user hasn't explicitly said 'send it'.",
  inputSchema: GmailDraftInput,
  outputSchema: GmailDraftOutput,
  isAvailable: gwsAvailable,
  execute: async ({ to, subject, body, cc, bcc, threadId }, ctx) => {
    const auth = await requireActiveToken(ctx, 'gmail.compose')
    if ('error' in auth) return auth

    const raw = base64UrlEncode(buildMimeMessage({ to, subject, body, cc, bcc }))

    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { raw, threadId } }),
    })
    if (!resp.ok) {
      const errBody = await resp.text()
      return { error: `Draft failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    const json = (await resp.json()) as { id?: string; message?: { id?: string } }
    return {
      ok: true as const,
      draftId: json.id ?? '',
      messageId: json.message?.id,
      to,
      subject,
    }
  },
  render: {
    icon: MailQuestion,
    displayName: 'Gmail — Draft',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return `draft · ${truncate(output.subject, 30)}`
      return null
    },
  },
}

// ─── gmail_reply ─────────────────────────────────────────────────
// Replies to an existing thread with proper In-Reply-To / References
// headers so Gmail threads the response correctly. Privileged — sends
// an email to the original recipients.

const GmailReplyInput = z.object({
  messageId: z.string().describe('The message id to reply to (from gmail_search / gmail_get_message)'),
  body: z.string().min(1).max(20000),
  /** Reply to everyone (To + all Cc) vs just the sender. Default: false (sender only). */
  replyAll: z.boolean().default(false).optional(),
})

const GmailReplyOutput = z.union([
  z.object({
    ok: z.literal(true),
    messageId: z.string().optional(),
    threadId: z.string().optional(),
    to: z.string(),
  }),
  z.object({ error: z.string() }),
])

export type GmailReplyInput = z.infer<typeof GmailReplyInput>
export type GmailReplyOutput = z.infer<typeof GmailReplyOutput>

export const gmailReplyDefinition: ToolDefinition<GmailReplyInput, GmailReplyOutput> = {
  name: 'gmail_reply',
  description:
    "Reply to a Gmail message. Auto-handles threading (In-Reply-To, References, Re: prefix) so Gmail groups the reply with the original. Set replyAll=true to include everyone on the original. Always confirm the body with the user first — this actually sends.",
  inputSchema: GmailReplyInput,
  outputSchema: GmailReplyOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async ({ messageId, body, replyAll = false }, ctx) => {
    const auth = await requireActiveToken(ctx, 'gmail.send')
    if ('error' in auth) return auth

    // 1. Fetch the original message's headers + user profile in parallel.
    //    The profile lookup gives us the user's own email so we can strip
    //    it from the replyAll cc list (Gmail does NOT dedupe self-addresses).
    const metaUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    )
    metaUrl.searchParams.set('format', 'metadata')
    for (const h of ['From', 'To', 'Cc', 'Subject', 'Message-ID', 'References', 'In-Reply-To']) {
      metaUrl.searchParams.append('metadataHeaders', h)
    }
    const [metaResp, profileResp] = await Promise.all([
      fetch(metaUrl, { headers: { Authorization: `Bearer ${auth.token}` } }),
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${auth.token}` },
      }),
    ])
    if (!metaResp.ok) return { error: `Reply lookup failed: ${metaResp.status}` }
    const meta = (await metaResp.json()) as {
      threadId?: string
      payload?: { headers?: Array<{ name: string; value: string }> }
    }
    const profile = profileResp.ok
      ? ((await profileResp.json()) as { emailAddress?: string })
      : undefined
    const selfEmail = profile?.emailAddress?.toLowerCase() ?? ''
    const hdr = (name: string) =>
      meta.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value

    const origFrom = hdr('From') ?? ''
    const origTo = hdr('To') ?? ''
    const origCc = hdr('Cc') ?? ''
    const origSubject = hdr('Subject') ?? ''
    const origMessageIdHeader = hdr('Message-ID') ?? hdr('Message-Id') ?? ''
    const origRefs = hdr('References') ?? ''

    const to = origFrom
    // replyAll: include the original To + Cc, but strip the user's own
    // email so we don't reply-all to ourselves. Gmail does NOT dedupe
    // self-addresses on send.
    const ccList = replyAll
      ? splitAddresses([origTo, origCc].filter(Boolean).join(', ')).filter(
          (addr) => !selfEmail || !addressEquals(addr, selfEmail),
        )
      : []
    const subject = /^re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`
    const references = origRefs
      ? `${origRefs} ${origMessageIdHeader}`.trim()
      : origMessageIdHeader

    const extraHeaders: string[] = []
    if (origMessageIdHeader) extraHeaders.push(`In-Reply-To: ${origMessageIdHeader}`)
    if (references) extraHeaders.push(`References: ${references}`)
    const raw = base64UrlEncode(
      buildMimeMessage({
        to,
        subject,
        body,
        cc: ccList.length > 0 ? ccList : undefined,
        extraHeaders,
      }),
    )

    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw, threadId: meta.threadId }),
    })
    if (!resp.ok) {
      const errBody = await resp.text()
      return { error: `Reply send failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    const json = (await resp.json()) as { id?: string; threadId?: string }
    return { ok: true as const, messageId: json.id, threadId: json.threadId, to }
  },
  render: {
    icon: Reply,
    displayName: 'Gmail — Reply',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return `replied to ${truncate(output.to, 30)}`
      return null
    },
  },
}

// ─── calendar_list_events ────────────────────────────────────────
// Richer than calendar_upcoming — supports range presets, custom windows,
// and non-primary calendars. We keep calendar_upcoming around as a
// simpler "next 10 events" shortcut the model tends to reach for.

const CALENDAR_RANGES = ['today', 'tomorrow', 'thisWeek', 'nextWeek', 'thisMonth'] as const
type CalendarRange = (typeof CALENDAR_RANGES)[number]

const CalendarListEventsInput = z.object({
  range: z.enum(CALENDAR_RANGES).optional().describe('Preset date window. Mutually exclusive with start/end.'),
  start: z.string().optional().describe('ISO 8601 start. Required if range is not set AND naturalQuery not provided.'),
  end: z.string().optional().describe('ISO 8601 end. Required if range is not set AND naturalQuery not provided.'),
  limit: z.number().int().min(1).max(100).default(25).optional(),
  calendarId: z.string().default('primary').optional(),
  query: z.string().max(200).optional().describe('Free-text search within event summary/description'),
  naturalQuery: z
    .string()
    .min(1)
    .max(300)
    .optional()
    .describe(
      'Free-form English — "meetings with Sarah this week". Server translates via Nemotron 3 into range/start/end/query. Use when the user intent is free-form and structured fields would require guessing. Structured fields (range, start, end, query) take precedence if BOTH are provided.',
    ),
  timezone: z
    .string()
    .default('Australia/Sydney')
    .optional()
    .describe('IANA timezone for naturalQuery interpretation. Default Australia/Sydney.'),
})

const CalendarListEventsOutput = z.union([
  z.object({
    count: z.number(),
    rangeStart: z.string(),
    rangeEnd: z.string(),
    events: z.array(CalendarEvent),
    translatedFrom: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export type CalendarListEventsInput = z.infer<typeof CalendarListEventsInput>
export type CalendarListEventsOutput = z.infer<typeof CalendarListEventsOutput>

export const calendarListEventsDefinition: ToolDefinition<
  CalendarListEventsInput,
  CalendarListEventsOutput
> = {
  name: 'calendar_list_events',
  description:
    "List calendar events. Three ways to specify the window: `range` preset (today/tomorrow/thisWeek/nextWeek/thisMonth), explicit `start`/`end` ISO timestamps, OR `naturalQuery` free-form English that the server translates via Nemotron 3. Falls back to the primary calendar unless calendarId is given.",
  inputSchema: CalendarListEventsInput,
  outputSchema: CalendarListEventsOutput,
  isAvailable: gwsAvailable,
  execute: async (
    {
      range,
      start,
      end,
      limit = 25,
      calendarId = 'primary',
      query,
      naturalQuery,
      timezone = 'Australia/Sydney',
    },
    ctx,
  ) => {
    const auth = await requireActiveToken(ctx, 'calendar.events')
    if ('error' in auth) return auth

    // Translate naturalQuery only to fill gaps — caller-supplied structured
    // fields always win. That way a user can still add "quarterly planning"
    // as query text on top of a `range: thisMonth`.
    let translatedFrom: string | undefined
    let effectiveRange = range
    let effectiveStart = start
    let effectiveEnd = end
    let effectiveQuery = query
    if (naturalQuery && !range && !start && !end && !query) {
      const { translateCalendarListQuery } = await import('./google-workspace-nlp')
      const result = await translateCalendarListQuery(
        gwsEnv(ctx) as unknown as { AI: Ai },
        naturalQuery,
        timezone,
      )
      effectiveRange = result.fields.range ?? effectiveRange
      effectiveStart = result.fields.start ?? effectiveStart
      effectiveEnd = result.fields.end ?? effectiveEnd
      effectiveQuery = result.fields.query ?? effectiveQuery
      translatedFrom = naturalQuery
    }

    const now = new Date()
    let rangeStart: Date
    let rangeEnd: Date
    if (effectiveRange) {
      ;[rangeStart, rangeEnd] = resolveRange(effectiveRange, now)
    } else if (effectiveStart && effectiveEnd) {
      rangeStart = new Date(effectiveStart)
      rangeEnd = new Date(effectiveEnd)
    } else {
      // No structured window and the translator didn't produce one —
      // default to the next 14 days so the query still yields something
      // useful instead of erroring.
      rangeStart = now
      rangeEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    }

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    )
    url.searchParams.set('timeMin', rangeStart.toISOString())
    url.searchParams.set('timeMax', rangeEnd.toISOString())
    url.searchParams.set('maxResults', String(limit))
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    if (effectiveQuery) url.searchParams.set('q', effectiveQuery)
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) return { error: `Calendar list failed: ${resp.status}` }
    const json = (await resp.json()) as { items?: GoogleCalendarApiEvent[] }
    const events = (json.items ?? []).map(normaliseCalendarEvent)
    return {
      count: events.length,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      events,
      translatedFrom,
    }
  },
  render: {
    icon: CalendarSearch,
    displayName: 'Calendar — List',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.count === 0) return 'no events in range'
      return `${output.count} ${output.count === 1 ? 'event' : 'events'}`
    },
  },
}

// ─── calendar_get_event ──────────────────────────────────────────

const CalendarGetEventInput = z.object({
  eventId: z.string(),
  calendarId: z.string().default('primary').optional(),
})

const CalendarEventFull = CalendarEvent.extend({
  description: z.string().optional(),
  htmlLink: z.string().optional(),
  status: z.string().optional(),
  organizer: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
})

const CalendarGetEventOutput = z.union([
  CalendarEventFull,
  z.object({ error: z.string() }),
])

export type CalendarGetEventInput = z.infer<typeof CalendarGetEventInput>
export type CalendarGetEventOutput = z.infer<typeof CalendarGetEventOutput>

export const calendarGetEventDefinition: ToolDefinition<
  CalendarGetEventInput,
  CalendarGetEventOutput
> = {
  name: 'calendar_get_event',
  description:
    'Fetch full details for a single calendar event (id from calendar_list_events / calendar_upcoming). Includes description, htmlLink, status, organizer — useful for follow-ups.',
  inputSchema: CalendarGetEventInput,
  outputSchema: CalendarGetEventOutput,
  isAvailable: gwsAvailable,
  execute: async ({ eventId, calendarId = 'primary' }, ctx) => {
    const auth = await requireActiveToken(ctx, 'calendar.events')
    if ('error' in auth) return auth

    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    )
    if (!resp.ok) return { error: `Calendar get failed: ${resp.status}` }
    const e = (await resp.json()) as GoogleCalendarApiEvent & {
      htmlLink?: string
      status?: string
      organizer?: { email?: string; displayName?: string }
      created?: string
      updated?: string
    }
    return {
      ...normaliseCalendarEvent(e),
      description: e.description,
      htmlLink: e.htmlLink,
      status: e.status,
      organizer: e.organizer?.email ?? e.organizer?.displayName,
      created: e.created,
      updated: e.updated,
    }
  },
  render: {
    icon: Calendar,
    displayName: 'Calendar — Event',
    summary: (output) => {
      if ('error' in output) return 'failed'
      return output.summary ? truncate(output.summary, 40) : null
    },
  },
}

// ─── calendar_find_free_slot ─────────────────────────────────────
// Common workflow: "suggest me a 30-min slot this week." Uses freeBusy
// to check the primary calendar + optional extra calendars.

const CalendarFindFreeSlotInput = z.object({
  durationMinutes: z.number().int().min(5).max(480),
  earliest: z.string().describe('ISO 8601 earliest start'),
  latest: z.string().describe('ISO 8601 latest end'),
  workingHours: z
    .object({
      start: z.number().int().min(0).max(23).default(9),
      end: z.number().int().min(1).max(24).default(17),
    })
    .optional()
    .describe('Local hour window, inclusive start / exclusive end. Default 9-17.'),
  /**
   * IANA timezone for working-hours interpretation. Required — without a
   * timezone, "9-17 local" is ambiguous and the Worker defaults to UTC
   * (meaning a Sydney user would get slots in the middle of the night).
   * Pass the user's current timezone (e.g. "Australia/Sydney",
   * "America/Los_Angeles"). Defaults to Australia/Sydney which matches
   * the starter's agent prompt context.
   */
  timezone: z.string().default('Australia/Sydney').optional(),
  candidates: z.number().int().min(1).max(10).default(5).optional(),
  calendarIds: z
    .array(z.string())
    .default(['primary'])
    .optional()
    .describe('Calendars to union. Default: primary only.'),
})

const FreeSlot = z.object({
  start: z.string(),
  end: z.string(),
})

const CalendarFindFreeSlotOutput = z.union([
  z.object({
    durationMinutes: z.number(),
    candidateCount: z.number(),
    slots: z.array(FreeSlot),
  }),
  z.object({ error: z.string() }),
])

export type CalendarFindFreeSlotInput = z.infer<typeof CalendarFindFreeSlotInput>
export type CalendarFindFreeSlotOutput = z.infer<typeof CalendarFindFreeSlotOutput>

export const calendarFindFreeSlotDefinition: ToolDefinition<
  CalendarFindFreeSlotInput,
  CalendarFindFreeSlotOutput
> = {
  name: 'calendar_find_free_slot',
  description:
    "Find candidate free slots for a meeting. Takes a duration (minutes), a search window (earliest/latest ISO timestamps), optional working-hours (default 9-17), and returns up to N non-overlapping candidate slots. Use before suggesting a time to the user.",
  inputSchema: CalendarFindFreeSlotInput,
  outputSchema: CalendarFindFreeSlotOutput,
  isAvailable: gwsAvailable,
  execute: async (
    {
      durationMinutes,
      earliest,
      latest,
      workingHours,
      timezone = 'Australia/Sydney',
      candidates = 5,
      calendarIds = ['primary'],
    },
    ctx,
  ) => {
    const auth = await requireActiveToken(ctx, 'calendar.events')
    if ('error' in auth) return auth

    const timeMin = new Date(earliest)
    const timeMax = new Date(latest)
    if (!isFinite(+timeMin) || !isFinite(+timeMax) || timeMin >= timeMax) {
      return { error: 'earliest must be before latest and both must be valid ISO timestamps' }
    }

    // Validate the timezone — Intl throws RangeError on unknown IANA names.
    // Better to return a friendly message than crash the loop below.
    let getLocalHour: (d: Date) => number
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false,
      })
      getLocalHour = (d) => Number.parseInt(fmt.format(d), 10)
      // Sanity-check the formatter — some browsers return weird strings
      if (!Number.isFinite(getLocalHour(new Date()))) {
        return { error: `Invalid timezone: ${timezone}` }
      }
    } catch {
      return { error: `Invalid timezone: ${timezone}` }
    }

    const fbResp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      }),
    })
    if (!fbResp.ok) return { error: `freeBusy failed: ${fbResp.status}` }
    const fb = (await fbResp.json()) as {
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>
    }

    // Merge all busy ranges and sort by start
    const busy: Array<{ start: number; end: number }> = []
    for (const cal of Object.values(fb.calendars ?? {})) {
      for (const b of cal.busy ?? []) {
        busy.push({ start: +new Date(b.start), end: +new Date(b.end) })
      }
    }
    busy.sort((a, b) => a.start - b.start)

    // Walk the window in `durationMinutes` increments inside working hours
    const slotMs = durationMinutes * 60 * 1000
    const step = 15 * 60 * 1000 // 15-minute granularity
    const whStart = workingHours?.start ?? 9
    const whEnd = workingHours?.end ?? 17
    const slots: Array<{ start: string; end: string }> = []

    let cursor = timeMin.getTime()
    // Round up to the next 15-minute mark for cleaner candidates
    cursor = Math.ceil(cursor / step) * step

    while (cursor + slotMs <= timeMax.getTime() && slots.length < candidates) {
      const startDate = new Date(cursor)
      const endDate = new Date(cursor + slotMs)
      const startHour = getLocalHour(startDate)
      const endHour = getLocalHour(endDate)

      // Enforce working hours on the requested timezone. A slot is
      // admissible iff both its START and END fall inside [whStart, whEnd).
      // (If a slot crosses midnight this also correctly rejects it since
      // endHour will be smaller than startHour.)
      const startOk = startHour >= whStart && startHour < whEnd
      const endOk = endHour > whStart && endHour <= whEnd
      if (!startOk || !endOk || endHour < startHour) {
        cursor += step
        continue
      }

      // Check against busy list
      const conflicts = busy.some((b) => cursor < b.end && cursor + slotMs > b.start)
      if (!conflicts) {
        slots.push({
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        })
        cursor += slotMs // skip ahead a full duration to avoid adjacent duplicates
      } else {
        cursor += step
      }
    }

    return {
      durationMinutes,
      candidateCount: slots.length,
      slots,
    }
  },
  render: {
    icon: CalendarClock,
    displayName: 'Calendar — Free Slots',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.candidateCount === 0) return 'no slots found'
      return `${output.candidateCount} ${output.candidateCount === 1 ? 'slot' : 'slots'}`
    },
  },
}

// ─── calendar_update_event ───────────────────────────────────────

const CalendarUpdateEventInput = z.object({
  eventId: z.string(),
  calendarId: z.string().default('primary').optional(),
  summary: z.string().min(1).max(200).optional(),
  start: z.string().optional().describe('ISO 8601'),
  end: z.string().optional().describe('ISO 8601'),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
  addAttendees: z.array(z.string().email()).optional(),
  removeAttendees: z.array(z.string().email()).optional(),
  sendUpdates: z.enum(['all', 'externalOnly', 'none']).default('all').optional(),
})

const CalendarUpdateEventOutput = z.union([
  z.object({
    ok: z.literal(true),
    eventId: z.string(),
    url: z.string().optional(),
    summary: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export type CalendarUpdateEventInput = z.infer<typeof CalendarUpdateEventInput>
export type CalendarUpdateEventOutput = z.infer<typeof CalendarUpdateEventOutput>

export const calendarUpdateEventDefinition: ToolDefinition<
  CalendarUpdateEventInput,
  CalendarUpdateEventOutput
> = {
  name: 'calendar_update_event',
  description:
    'Partially update an existing calendar event (time, title, attendees, location, description). Only the fields you pass are changed. Use addAttendees / removeAttendees to adjust the guest list. Sends updates to existing attendees by default — confirm with the user before calling.',
  inputSchema: CalendarUpdateEventInput,
  outputSchema: CalendarUpdateEventOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async (
    {
      eventId,
      calendarId = 'primary',
      summary,
      start,
      end,
      description,
      location,
      addAttendees,
      removeAttendees,
      sendUpdates = 'all',
    },
    ctx,
  ) => {
    const auth = await requireActiveToken(ctx, 'calendar.events')
    if ('error' in auth) return auth

    // If we need to edit attendees, fetch existing to compute the new list.
    let attendees: Array<{ email: string }> | undefined
    if (addAttendees || removeAttendees) {
      const getResp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { headers: { Authorization: `Bearer ${auth.token}` } },
      )
      if (!getResp.ok) return { error: `Event lookup failed: ${getResp.status}` }
      const existing = (await getResp.json()) as {
        attendees?: Array<{ email?: string }>
      }
      const current = new Set((existing.attendees ?? []).map((a) => a.email ?? '').filter(Boolean))
      for (const e of addAttendees ?? []) current.add(e)
      for (const e of removeAttendees ?? []) current.delete(e)
      attendees = Array.from(current).map((email) => ({ email }))
    }

    const patch: Record<string, unknown> = {}
    if (summary !== undefined) patch['summary'] = summary
    if (description !== undefined) patch['description'] = description
    if (location !== undefined) patch['location'] = location
    if (start !== undefined) patch['start'] = { dateTime: start }
    if (end !== undefined) patch['end'] = { dateTime: end }
    if (attendees !== undefined) patch['attendees'] = attendees

    if (Object.keys(patch).length === 0) {
      return { error: 'No fields to update — pass at least one of summary/start/end/description/location/attendees.' }
    }

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    )
    url.searchParams.set('sendUpdates', sendUpdates)
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    })
    if (!resp.ok) {
      const errBody = await resp.text()
      return { error: `Update failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    const json = (await resp.json()) as { id?: string; htmlLink?: string; summary?: string }
    return {
      ok: true as const,
      eventId: json.id ?? eventId,
      url: json.htmlLink,
      summary: json.summary,
    }
  },
  render: {
    icon: CalendarCheck,
    displayName: 'Calendar — Update',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return 'updated'
      return null
    },
  },
}

// ─── calendar_delete_event ───────────────────────────────────────

const CalendarDeleteEventInput = z.object({
  eventId: z.string(),
  calendarId: z.string().default('primary').optional(),
  sendUpdates: z.enum(['all', 'externalOnly', 'none']).default('all').optional(),
})

const CalendarDeleteEventOutput = z.union([
  z.object({
    ok: z.literal(true),
    eventId: z.string(),
  }),
  z.object({ error: z.string() }),
])

export type CalendarDeleteEventInput = z.infer<typeof CalendarDeleteEventInput>
export type CalendarDeleteEventOutput = z.infer<typeof CalendarDeleteEventOutput>

export const calendarDeleteEventDefinition: ToolDefinition<
  CalendarDeleteEventInput,
  CalendarDeleteEventOutput
> = {
  name: 'calendar_delete_event',
  description:
    "Cancel / delete an event. Google sends cancellations to attendees by default (sendUpdates=all). Privileged action — confirm intent and the specific event before calling.",
  inputSchema: CalendarDeleteEventInput,
  outputSchema: CalendarDeleteEventOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async ({ eventId, calendarId = 'primary', sendUpdates = 'all' }, ctx) => {
    const auth = await requireActiveToken(ctx, 'calendar.events')
    if ('error' in auth) return auth

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    )
    url.searchParams.set('sendUpdates', sendUpdates)
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    // Google returns 204 No Content on success
    if (resp.status !== 204 && !resp.ok) {
      const errBody = await resp.text()
      return { error: `Delete failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    return { ok: true as const, eventId }
  },
  render: {
    icon: CalendarX,
    displayName: 'Calendar — Delete',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return 'cancelled'
      return null
    },
  },
}

// ─── docs_search ─────────────────────────────────────────────────
// Scoped Drive query for Google Docs only — uses mimeType filter.

const DocsSearchInput = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).default(10).optional(),
})

const DocsFile = z.object({
  id: z.string(),
  name: z.string(),
  modifiedTime: z.string(),
  url: z.string().optional(),
  owner: z.string().optional(),
})

const DocsSearchOutput = z.union([
  z.object({
    query: z.string(),
    count: z.number(),
    docs: z.array(DocsFile),
  }),
  z.object({ error: z.string() }),
])

export type DocsSearchInput = z.infer<typeof DocsSearchInput>
export type DocsSearchOutput = z.infer<typeof DocsSearchOutput>

export const docsSearchDefinition: ToolDefinition<DocsSearchInput, DocsSearchOutput> = {
  name: 'docs_search',
  description:
    "Search the user's Google Docs by title + content. Returns doc ids, names, and links — use docs_get to fetch the content.",
  inputSchema: DocsSearchInput,
  outputSchema: DocsSearchOutput,
  isAvailable: gwsAvailable,
  execute: async ({ query, limit = 10 }, ctx) => {
    const auth = await requireActiveToken(ctx, 'drive.readonly')
    if ('error' in auth) return auth

    const q = `mimeType='application/vnd.google-apps.document' and fullText contains ${JSON.stringify(query)} and trashed=false`
    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.set('q', q)
    url.searchParams.set('pageSize', String(limit))
    url.searchParams.set('orderBy', 'modifiedTime desc')
    url.searchParams.set(
      'fields',
      'files(id,name,modifiedTime,webViewLink,owners(emailAddress))',
    )
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) return { error: `Docs search failed: ${resp.status}` }
    const json = (await resp.json()) as {
      files?: Array<{
        id: string
        name: string
        modifiedTime: string
        webViewLink?: string
        owners?: Array<{ emailAddress?: string }>
      }>
    }
    return {
      query,
      count: json.files?.length ?? 0,
      docs: (json.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
        url: f.webViewLink,
        owner: f.owners?.[0]?.emailAddress,
      })),
    }
  },
  render: {
    icon: FileSearch,
    displayName: 'Docs — Search',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.count === 0) return 'no docs'
      return `${output.count} ${output.count === 1 ? 'doc' : 'docs'}`
    },
  },
}

// ─── docs_get ────────────────────────────────────────────────────
// Fetch full doc content flattened to plain text (preserves paragraph
// structure + heading hierarchy as markdown). Skip tables / images /
// embedded objects in v1 — the model usually just needs the prose.

const DocsGetInput = z.object({
  docId: z.string(),
})

const DocsGetOutput = z.union([
  z.object({
    docId: z.string(),
    title: z.string(),
    content: z.string().describe('Plain text, with `# heading` / `## heading` markers preserved'),
    revisionId: z.string().optional(),
    /**
     * True when the content was retrieved via Drive export (plain text fallback)
     * because the Docs API scope wasn't granted. In that case heading structure
     * is lost — the model should caveat any "the document has N sections" claims.
     */
    degraded: z.boolean().optional(),
  }),
  z.object({ error: z.string() }),
])

export type DocsGetInput = z.infer<typeof DocsGetInput>
export type DocsGetOutput = z.infer<typeof DocsGetOutput>

export const docsGetDefinition: ToolDefinition<DocsGetInput, DocsGetOutput> = {
  name: 'docs_get',
  description:
    "Read a Google Doc's content as plain text (with heading markers). Use after docs_search. Tables and images are not returned — the model sees paragraphs only.",
  inputSchema: DocsGetInput,
  outputSchema: DocsGetOutput,
  isAvailable: gwsAvailable,
  execute: async ({ docId }, ctx) => {
    const auth = await requireActiveToken(ctx, 'documents.readonly')
    if ('error' in auth) {
      // Fallback: some users have only `drive.readonly` — try exporting as text.
      const fallback = await requireActiveToken(ctx, 'drive.readonly')
      if ('error' in fallback) return auth
      return readDocViaDriveExport(docId, fallback.token)
    }

    const resp = await fetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    )
    if (!resp.ok) return { error: `Docs get failed: ${resp.status}` }
    const doc = (await resp.json()) as GoogleDocsApiDoc
    return {
      docId: doc.documentId ?? docId,
      title: doc.title ?? '(untitled)',
      content: flattenGoogleDoc(doc),
      revisionId: doc.revisionId,
    }
  },
  render: {
    icon: FileText,
    displayName: 'Docs — Read',
    summary: (output) => {
      if ('error' in output) return 'failed'
      return truncate(output.title || '(untitled)', 40)
    },
  },
}

// ─── docs_create ─────────────────────────────────────────────────

const DocsCreateInput = z.object({
  title: z.string().min(1).max(200),
  /** Optional seed content — paragraphs separated by blank lines, headings prefixed with #. */
  content: z.string().max(50000).optional(),
})

const DocsCreateOutput = z.union([
  z.object({
    ok: z.literal(true),
    docId: z.string(),
    title: z.string(),
    url: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export type DocsCreateInput = z.infer<typeof DocsCreateInput>
export type DocsCreateOutput = z.infer<typeof DocsCreateOutput>

export const docsCreateDefinition: ToolDefinition<DocsCreateInput, DocsCreateOutput> = {
  name: 'docs_create',
  description:
    "Create a new Google Doc. Optional `content` is appended after creation using the same rules as docs_append (paragraphs + `# heading` lines). Returns the docId and shareable URL.",
  inputSchema: DocsCreateInput,
  outputSchema: DocsCreateOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async ({ title, content }, ctx) => {
    const auth = await requireActiveToken(ctx, 'documents')
    if ('error' in auth) return auth

    const createResp = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    })
    if (!createResp.ok) {
      const errBody = await createResp.text()
      return { error: `Docs create failed: ${createResp.status} ${errBody.slice(0, 200)}` }
    }
    const created = (await createResp.json()) as { documentId?: string }
    const docId = created.documentId
    if (!docId) return { error: 'Docs create returned no documentId' }

    // Optional seed content
    if (content && content.trim()) {
      const append = await appendToGoogleDoc(auth.token, docId, content)
      if ('error' in append) {
        // Doc exists but seed failed — still a partial success; surface the error.
        return { error: `Doc created (${docId}) but seed content failed: ${append.error}` }
      }
    }

    return {
      ok: true as const,
      docId,
      title,
      url: `https://docs.google.com/document/d/${docId}/edit`,
    }
  },
  render: {
    icon: FilePlus,
    displayName: 'Docs — Create',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return truncate(output.title, 30)
      return null
    },
  },
}

// ─── docs_append ─────────────────────────────────────────────────

const DocsAppendInput = z.object({
  docId: z.string(),
  content: z
    .string()
    .min(1)
    .max(50000)
    .describe('Paragraphs separated by blank lines. Lines starting with # / ## / ### become H1 / H2 / H3.'),
})

const DocsAppendOutput = z.union([
  z.object({
    ok: z.literal(true),
    docId: z.string(),
    charsAppended: z.number(),
  }),
  z.object({ error: z.string() }),
])

export type DocsAppendInput = z.infer<typeof DocsAppendInput>
export type DocsAppendOutput = z.infer<typeof DocsAppendOutput>

export const docsAppendDefinition: ToolDefinition<DocsAppendInput, DocsAppendOutput> = {
  name: 'docs_append',
  description:
    "Append paragraphs (and optional markdown headings `#`, `##`, `###`) to an existing Google Doc. Doesn't support tables or images — use the Docs UI for those.",
  inputSchema: DocsAppendInput,
  outputSchema: DocsAppendOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async ({ docId, content }, ctx) => {
    const auth = await requireActiveToken(ctx, 'documents')
    if ('error' in auth) return auth

    const result = await appendToGoogleDoc(auth.token, docId, content)
    if ('error' in result) return result
    return { ok: true as const, docId, charsAppended: content.length }
  },
  render: {
    icon: FilePen,
    displayName: 'Docs — Append',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return `+${output.charsAppended} chars`
      return null
    },
  },
}

// ─── docs_create_from_markdown ───────────────────────────────────
// One-shot create-formatted-doc-from-markdown. Most agent output is
// markdown-shaped; the existing docs_create + docs_append force the
// agent through plain-text APIs and lose all structure. This tool
// renders the markdown to a Doc batchUpdate sequence in a single call.
//
// Supports: headings (H1-H6), paragraphs, bold/italic, inline code,
// code blocks (monospace + grey background), links, bulleted lists,
// numbered lists, task items (☐ / ☑). Tables fall through as plain
// pipe-separated text — the converter is deliberately minimal; for
// proper Doc tables either pre-render via Sheets or build a
// fork-specific extension.

const DocsCreateFromMarkdownInput = z.object({
  title: z.string().min(1).max(200),
  markdown: z
    .string()
    .min(1)
    .max(200_000)
    .describe(
      'Full markdown document. Headings, bold/italic, code, lists, links, task items render as native Docs structure.',
    ),
})

const DocsCreateFromMarkdownOutput = z.union([
  z.object({
    ok: z.literal(true),
    docId: z.string(),
    title: z.string(),
    url: z.string(),
    /** Number of insert/style requests emitted — useful for debugging
     *  formatting issues against the markdown the agent sent. */
    requestCount: z.number(),
  }),
  z.object({ error: z.string() }),
])

export type DocsCreateFromMarkdownInput = z.infer<typeof DocsCreateFromMarkdownInput>
export type DocsCreateFromMarkdownOutput = z.infer<typeof DocsCreateFromMarkdownOutput>

export const docsCreateFromMarkdownDefinition: ToolDefinition<
  DocsCreateFromMarkdownInput,
  DocsCreateFromMarkdownOutput
> = {
  name: 'docs_create_from_markdown',
  description:
    'Create a new Google Doc from a markdown source. Headings, bold/italic, inline code, code blocks, links, bulleted lists, numbered lists, and task items all render as native Docs formatting in one call. Prefer this over docs_create + docs_append when the content has any structure.',
  inputSchema: DocsCreateFromMarkdownInput,
  outputSchema: DocsCreateFromMarkdownOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async ({ title, markdown }, ctx) => {
    const auth = await requireActiveToken(ctx, 'documents')
    if ('error' in auth) return auth

    // Step 1: create the empty doc.
    const createResp = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    })
    if (!createResp.ok) {
      const errBody = await createResp.text()
      return { error: `Docs create failed: ${createResp.status} ${errBody.slice(0, 200)}` }
    }
    const created = (await createResp.json()) as { documentId?: string }
    const docId = created.documentId
    if (!docId) return { error: 'Docs create returned no documentId' }

    // Step 2: convert markdown → batchUpdate requests. New docs
    // always have an empty body whose first valid insert index is 1.
    const { markdownToDocsRequests } = await import('@/server/lib/google/markdown-to-docs')
    const { requests } = markdownToDocsRequests(markdown, 1)

    if (requests.length === 0) {
      return {
        ok: true as const,
        docId,
        title,
        url: `https://docs.google.com/document/d/${docId}/edit`,
        requestCount: 0,
      }
    }

    // Step 3: apply. The Docs API caps batchUpdate at ~1000 requests
    // and ~10MB. Our converter typically emits well under that even
    // for long docs, but we chunk defensively at 500 just in case.
    const CHUNK = 500
    for (let i = 0; i < requests.length; i += CHUNK) {
      const chunk = requests.slice(i, i + CHUNK)
      const resp = await fetch(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests: chunk }),
        },
      )
      if (!resp.ok) {
        const errBody = await resp.text()
        return {
          error: `Doc created (${docId}) but markdown render failed at chunk ${
            i / CHUNK
          }: ${resp.status} ${errBody.slice(0, 300)}`,
        }
      }
    }

    return {
      ok: true as const,
      docId,
      title,
      url: `https://docs.google.com/document/d/${docId}/edit`,
      requestCount: requests.length,
    }
  },
  render: {
    icon: FileType,
    displayName: 'Docs — From Markdown',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return `${truncate(output.title, 26)} (${output.requestCount} ops)`
      return null
    },
  },
}

// ─── sheets_list_tabs ────────────────────────────────────────────

const SheetsListTabsInput = z.object({
  spreadsheetId: z.string(),
})

const SheetTab = z.object({
  sheetId: z.number(),
  title: z.string(),
  index: z.number(),
  rowCount: z.number().optional(),
  columnCount: z.number().optional(),
})

const SheetsListTabsOutput = z.union([
  z.object({
    spreadsheetId: z.string(),
    title: z.string(),
    tabs: z.array(SheetTab),
  }),
  z.object({ error: z.string() }),
])

export type SheetsListTabsInput = z.infer<typeof SheetsListTabsInput>
export type SheetsListTabsOutput = z.infer<typeof SheetsListTabsOutput>

export const sheetsListTabsDefinition: ToolDefinition<SheetsListTabsInput, SheetsListTabsOutput> = {
  name: 'sheets_list_tabs',
  description:
    'List the tabs (sheets) inside a Google Sheets spreadsheet. Use before sheets_read_range so the model knows which tab name to pass in the A1 range.',
  inputSchema: SheetsListTabsInput,
  outputSchema: SheetsListTabsOutput,
  isAvailable: gwsAvailable,
  execute: async ({ spreadsheetId }, ctx) => {
    const auth = await requireActiveToken(ctx, 'spreadsheets.readonly')
    if ('error' in auth) return auth

    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    )
    url.searchParams.set('fields', 'properties(title),sheets(properties(sheetId,title,index,gridProperties))')
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) return { error: `Sheets list failed: ${resp.status}` }
    const json = (await resp.json()) as {
      properties?: { title?: string }
      sheets?: Array<{
        properties?: {
          sheetId?: number
          title?: string
          index?: number
          gridProperties?: { rowCount?: number; columnCount?: number }
        }
      }>
    }
    return {
      spreadsheetId,
      title: json.properties?.title ?? '(untitled)',
      tabs: (json.sheets ?? []).map((s) => ({
        sheetId: s.properties?.sheetId ?? 0,
        title: s.properties?.title ?? '',
        index: s.properties?.index ?? 0,
        rowCount: s.properties?.gridProperties?.rowCount,
        columnCount: s.properties?.gridProperties?.columnCount,
      })),
    }
  },
  render: {
    icon: Sheet,
    displayName: 'Sheets — Tabs',
    summary: (output) => {
      if ('error' in output) return 'failed'
      const n = output.tabs.length
      return `${n} ${n === 1 ? 'tab' : 'tabs'}`
    },
  },
}

// ─── sheets_read_range ───────────────────────────────────────────

const SheetsReadRangeInput = z.object({
  spreadsheetId: z.string(),
  range: z.string().describe('A1 notation, e.g. "Sheet1!A1:D20" or "Budget!A:A"'),
  valueRenderOption: z
    .enum(['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'])
    .default('FORMATTED_VALUE')
    .optional(),
})

const SheetsReadRangeOutput = z.union([
  z.object({
    range: z.string(),
    rowCount: z.number(),
    columnCount: z.number(),
    values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  }),
  z.object({ error: z.string() }),
])

export type SheetsReadRangeInput = z.infer<typeof SheetsReadRangeInput>
export type SheetsReadRangeOutput = z.infer<typeof SheetsReadRangeOutput>

export const sheetsReadRangeDefinition: ToolDefinition<SheetsReadRangeInput, SheetsReadRangeOutput> = {
  name: 'sheets_read_range',
  description:
    "Read a range from a Google Sheets spreadsheet in A1 notation. Default valueRenderOption is FORMATTED_VALUE (strings — what the user sees); use UNFORMATTED_VALUE for raw numbers/dates or FORMULA to inspect formulas.",
  inputSchema: SheetsReadRangeInput,
  outputSchema: SheetsReadRangeOutput,
  isAvailable: gwsAvailable,
  execute: async ({ spreadsheetId, range, valueRenderOption = 'FORMATTED_VALUE' }, ctx) => {
    const auth = await requireActiveToken(ctx, 'spreadsheets.readonly')
    if ('error' in auth) return auth

    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    )
    url.searchParams.set('valueRenderOption', valueRenderOption)
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) return { error: `Sheets read failed: ${resp.status}` }
    const json = (await resp.json()) as {
      range?: string
      values?: Array<Array<string | number | boolean | null>>
    }
    const values = json.values ?? []
    const rowCount = values.length
    const columnCount = values.reduce((m, row) => Math.max(m, row.length), 0)
    return { range: json.range ?? range, rowCount, columnCount, values }
  },
  render: {
    icon: Table2,
    displayName: 'Sheets — Read',
    summary: (output) => {
      if ('error' in output) return 'failed'
      return `${output.rowCount} × ${output.columnCount}`
    },
  },
}

// ─── sheets_append_row ───────────────────────────────────────────

const SheetsAppendRowInput = z.object({
  spreadsheetId: z.string(),
  range: z
    .string()
    .describe(
      "A1 of the target table, e.g. 'Sheet1' or 'Sheet1!A:D'. Google scans this range to find the 'logical table' (trailing empty rows are ignored) and inserts new rows AFTER that table, pushing any data in unrelated rows below down one row per appended row.",
    ),
  rows: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
    .min(1)
    .max(1000)
    .describe('Rows to append — each row is an array of cell values.'),
  valueInputOption: z.enum(['RAW', 'USER_ENTERED']).default('USER_ENTERED').optional(),
})

const SheetsAppendRowOutput = z.union([
  z.object({
    ok: z.literal(true),
    spreadsheetId: z.string(),
    updatedRange: z.string().optional(),
    updatedRows: z.number().optional(),
  }),
  z.object({ error: z.string() }),
])

export type SheetsAppendRowInput = z.infer<typeof SheetsAppendRowInput>
export type SheetsAppendRowOutput = z.infer<typeof SheetsAppendRowOutput>

export const sheetsAppendRowDefinition: ToolDefinition<SheetsAppendRowInput, SheetsAppendRowOutput> = {
  name: 'sheets_append_row',
  description:
    "Append one or more rows to the end of a Google Sheets tab. valueInputOption=USER_ENTERED (default) parses numbers/dates/formulas like the UI does; RAW stores the string verbatim. Privileged — confirm with the user before calling.",
  inputSchema: SheetsAppendRowInput,
  outputSchema: SheetsAppendRowOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async (
    { spreadsheetId, range, rows, valueInputOption = 'USER_ENTERED' },
    ctx,
  ) => {
    const auth = await requireActiveToken(ctx, 'spreadsheets')
    if ('error' in auth) return auth

    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`,
    )
    url.searchParams.set('valueInputOption', valueInputOption)
    url.searchParams.set('insertDataOption', 'INSERT_ROWS')
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    })
    if (!resp.ok) {
      const errBody = await resp.text()
      return { error: `Sheets append failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    const json = (await resp.json()) as {
      updates?: { updatedRange?: string; updatedRows?: number }
    }
    return {
      ok: true as const,
      spreadsheetId,
      updatedRange: json.updates?.updatedRange,
      updatedRows: json.updates?.updatedRows,
    }
  },
  render: {
    icon: Rows4,
    displayName: 'Sheets — Append',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return `+${output.updatedRows ?? '?'} rows`
      return null
    },
  },
}

// ─── sheets_write_range ──────────────────────────────────────────

const SheetsWriteRangeInput = z.object({
  spreadsheetId: z.string(),
  range: z.string().describe('A1 notation — must match the shape of values'),
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
    .min(1)
    .max(1000),
  valueInputOption: z.enum(['RAW', 'USER_ENTERED']).default('USER_ENTERED').optional(),
})

const SheetsWriteRangeOutput = z.union([
  z.object({
    ok: z.literal(true),
    spreadsheetId: z.string(),
    updatedRange: z.string().optional(),
    updatedCells: z.number().optional(),
  }),
  z.object({ error: z.string() }),
])

export type SheetsWriteRangeInput = z.infer<typeof SheetsWriteRangeInput>
export type SheetsWriteRangeOutput = z.infer<typeof SheetsWriteRangeOutput>

export const sheetsWriteRangeDefinition: ToolDefinition<SheetsWriteRangeInput, SheetsWriteRangeOutput> = {
  name: 'sheets_write_range',
  description:
    "Overwrite a range in Google Sheets with the provided values. The range must match the values matrix shape. Privileged — this replaces existing data.",
  inputSchema: SheetsWriteRangeInput,
  outputSchema: SheetsWriteRangeOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async (
    { spreadsheetId, range, values, valueInputOption = 'USER_ENTERED' },
    ctx,
  ) => {
    const auth = await requireActiveToken(ctx, 'spreadsheets')
    if ('error' in auth) return auth

    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    )
    url.searchParams.set('valueInputOption', valueInputOption)
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    })
    if (!resp.ok) {
      const errBody = await resp.text()
      return { error: `Sheets write failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    const json = (await resp.json()) as { updatedRange?: string; updatedCells?: number }
    return {
      ok: true as const,
      spreadsheetId,
      updatedRange: json.updatedRange,
      updatedCells: json.updatedCells,
    }
  },
  render: {
    icon: Table2,
    displayName: 'Sheets — Write',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return `${output.updatedCells ?? '?'} cells`
      return null
    },
  },
}

// ─── drive_get_file ──────────────────────────────────────────────
// Fetch content for text-shaped files. Binary / Workspace files return
// metadata only + a `notSupported` flag the model can surface to the user.

const DriveGetFileInput = z.object({
  fileId: z.string(),
})

const DriveGetFileOutput = z.union([
  z.object({
    fileId: z.string(),
    name: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().optional(),
    modifiedTime: z.string().optional(),
    content: z.string().optional(),
    notSupported: z.boolean().optional(),
    notSupportedReason: z.string().optional(),
    url: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export type DriveGetFileInput = z.infer<typeof DriveGetFileInput>
export type DriveGetFileOutput = z.infer<typeof DriveGetFileOutput>

export const driveGetFileDefinition: ToolDefinition<DriveGetFileInput, DriveGetFileOutput> = {
  name: 'drive_get_file',
  description:
    "Fetch a Drive file's content. Supports text/markdown/CSV/JSON and Google Docs (auto-exported to text). Binary files (PDFs, images, zips) return metadata only with notSupported=true — use drive_search to get their webViewLink and let the user open in Drive.",
  inputSchema: DriveGetFileInput,
  outputSchema: DriveGetFileOutput,
  isAvailable: gwsAvailable,
  execute: async ({ fileId }, ctx) => {
    const auth = await requireActiveToken(ctx, 'drive.readonly')
    if ('error' in auth) return auth

    // 1. Fetch metadata
    const metaUrl = new URL(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    )
    metaUrl.searchParams.set('fields', 'id,name,mimeType,size,modifiedTime,webViewLink')
    const metaResp = await fetch(metaUrl, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!metaResp.ok) return { error: `Drive meta failed: ${metaResp.status}` }
    const meta = (await metaResp.json()) as {
      id: string
      name: string
      mimeType: string
      size?: string
      modifiedTime?: string
      webViewLink?: string
    }

    const base = {
      fileId: meta.id,
      name: meta.name,
      mimeType: meta.mimeType,
      sizeBytes: meta.size ? Number(meta.size) : undefined,
      modifiedTime: meta.modifiedTime,
      url: meta.webViewLink,
    }

    // 2. Decide whether we can read content
    const isGoogleDoc = meta.mimeType === 'application/vnd.google-apps.document'
    const isGoogleSheet = meta.mimeType === 'application/vnd.google-apps.spreadsheet'
    const isTextShape =
      meta.mimeType.startsWith('text/') ||
      meta.mimeType === 'application/json' ||
      meta.mimeType === 'application/xml' ||
      meta.mimeType === 'application/javascript' ||
      meta.mimeType === 'text/csv' ||
      meta.mimeType === 'application/vnd.google-apps.script+json'

    if (isGoogleSheet) {
      return {
        ...base,
        notSupported: true,
        notSupportedReason:
          'Google Sheets — use sheets_list_tabs + sheets_read_range instead.',
      }
    }
    if (!isTextShape && !isGoogleDoc) {
      return {
        ...base,
        notSupported: true,
        notSupportedReason: `Binary or unsupported type (${meta.mimeType}). Open in Drive to view.`,
      }
    }

    // Refuse oversized text files BEFORE buffering into a Worker heap.
    // Workers have 128 MB RAM shared with WASM, and the model doesn't
    // need a 10 MB CSV inline — point the agent at the webViewLink.
    const MAX_BYTES = 512_000
    if (!isGoogleDoc && base.sizeBytes != null && base.sizeBytes > MAX_BYTES) {
      return {
        ...base,
        notSupported: true,
        notSupportedReason: `File is ${(base.sizeBytes / 1024).toFixed(0)} KB — too large for inline read. Cap is ${MAX_BYTES / 1024} KB. Open in Drive for the full file.`,
      }
    }

    // 3. Fetch content — stream a bounded number of bytes even for
    // text files where Content-Length wasn't reported, so a misreported
    // size can't surprise us with a heap blowout.
    if (isGoogleDoc) {
      const exportUrl = new URL(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`,
      )
      exportUrl.searchParams.set('mimeType', 'text/plain')
      const resp = await fetch(exportUrl, { headers: { Authorization: `Bearer ${auth.token}` } })
      if (!resp.ok) return { error: `Drive export failed: ${resp.status}` }
      const content = await readCappedText(resp, MAX_BYTES)
      return { ...base, content }
    } else {
      const getUrl = new URL(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      )
      getUrl.searchParams.set('alt', 'media')
      const resp = await fetch(getUrl, { headers: { Authorization: `Bearer ${auth.token}` } })
      if (!resp.ok) return { error: `Drive get failed: ${resp.status}` }
      const content = await readCappedText(resp, MAX_BYTES)
      return { ...base, content }
    }
  },
  render: {
    icon: FileDown,
    displayName: 'Drive — Get File',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.notSupported) return 'not readable'
      return truncate(output.name, 40)
    },
  },
}

// ─── drive_create_folder ─────────────────────────────────────────

const DriveCreateFolderInput = z.object({
  name: z.string().min(1).max(200),
  parentId: z
    .string()
    .optional()
    .describe('Optional parent folder id. Defaults to "My Drive" root.'),
})

const DriveCreateFolderOutput = z.union([
  z.object({
    ok: z.literal(true),
    folderId: z.string(),
    name: z.string(),
    url: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export type DriveCreateFolderInput = z.infer<typeof DriveCreateFolderInput>
export type DriveCreateFolderOutput = z.infer<typeof DriveCreateFolderOutput>

export const driveCreateFolderDefinition: ToolDefinition<
  DriveCreateFolderInput,
  DriveCreateFolderOutput
> = {
  name: 'drive_create_folder',
  description:
    'Create a folder in Google Drive. Defaults to the root of My Drive unless parentId is given. Privileged — confirm name and location with the user.',
  inputSchema: DriveCreateFolderInput,
  outputSchema: DriveCreateFolderOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async ({ name, parentId }, ctx) => {
    const auth = await requireActiveToken(ctx, 'drive.file')
    if ('error' in auth) {
      // Fall back to full drive scope if drive.file isn't granted
      const full = await requireActiveToken(ctx, 'drive')
      if ('error' in full) return auth
      return createFolderWithToken(full.token, name, parentId)
    }
    return createFolderWithToken(auth.token, name, parentId)
  },
  render: {
    icon: FolderPlus,
    displayName: 'Drive — New Folder',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return truncate(output.name, 30)
      return null
    },
  },
}

async function createFolderWithToken(
  token: string,
  name: string,
  parentId?: string,
): Promise<DriveCreateFolderOutput> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) body['parents'] = [parentId]
  const resp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const errBody = await resp.text()
    return { error: `Folder create failed: ${resp.status} ${errBody.slice(0, 200)}` }
  }
  const json = (await resp.json()) as { id?: string; name?: string; webViewLink?: string }
  if (!json.id) return { error: 'Folder create returned no id' }
  return {
    ok: true as const,
    folderId: json.id,
    name: json.name ?? name,
    url: json.webViewLink,
  }
}

// ─── tasks_list ──────────────────────────────────────────────────

const TasksListInput = z.object({
  taskListId: z
    .string()
    .optional()
    .describe('Task list id. Omit to list from the default "@default" list.'),
  showCompleted: z.boolean().default(false).optional(),
  maxResults: z.number().int().min(1).max(100).default(50).optional(),
})

const TaskItem = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().optional(),
  status: z.string(),
  due: z.string().optional(),
  completed: z.string().optional(),
  updated: z.string().optional(),
})

const TasksListOutput = z.union([
  z.object({
    taskListId: z.string(),
    count: z.number(),
    tasks: z.array(TaskItem),
  }),
  z.object({ error: z.string() }),
])

export type TasksListInput = z.infer<typeof TasksListInput>
export type TasksListOutput = z.infer<typeof TasksListOutput>

export const tasksListDefinition: ToolDefinition<TasksListInput, TasksListOutput> = {
  name: 'tasks_list',
  description:
    "List tasks from the user's Google Tasks. Omit taskListId to use the default list. Set showCompleted=true to include completed items. Useful for surfacing TODOs in a chat.",
  inputSchema: TasksListInput,
  outputSchema: TasksListOutput,
  isAvailable: gwsAvailable,
  execute: async ({ taskListId = '@default', showCompleted = false, maxResults = 50 }, ctx) => {
    const auth = await requireActiveToken(ctx, 'tasks.readonly')
    if ('error' in auth) {
      const full = await requireActiveToken(ctx, 'tasks')
      if ('error' in full) return auth
      return listTasksWithToken(full.token, taskListId, showCompleted, maxResults)
    }
    return listTasksWithToken(auth.token, taskListId, showCompleted, maxResults)
  },
  render: {
    icon: ListTodo,
    displayName: 'Tasks — List',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.count === 0) return 'no tasks'
      return `${output.count} ${output.count === 1 ? 'task' : 'tasks'}`
    },
  },
}

async function listTasksWithToken(
  token: string,
  taskListId: string,
  showCompleted: boolean,
  maxResults: number,
): Promise<TasksListOutput> {
  const url = new URL(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
  )
  url.searchParams.set('maxResults', String(maxResults))
  url.searchParams.set('showCompleted', String(showCompleted))
  url.searchParams.set('showHidden', 'false')
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) return { error: `Tasks list failed: ${resp.status}` }
  const json = (await resp.json()) as {
    items?: Array<{
      id: string
      title?: string
      notes?: string
      status?: string
      due?: string
      completed?: string
      updated?: string
    }>
  }
  const tasks = (json.items ?? []).map((t) => ({
    id: t.id,
    title: t.title ?? '(no title)',
    notes: t.notes,
    status: t.status ?? 'needsAction',
    due: t.due,
    completed: t.completed,
    updated: t.updated,
  }))
  return { taskListId, count: tasks.length, tasks }
}

// ─── tasks_create ────────────────────────────────────────────────

const TasksCreateInput = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  due: z
    .string()
    .optional()
    .describe('ISO 8601 due date (time component ignored by Google Tasks)'),
  taskListId: z.string().default('@default').optional(),
})

const TasksCreateOutput = z.union([
  z.object({
    ok: z.literal(true),
    taskId: z.string(),
    title: z.string(),
    taskListId: z.string(),
  }),
  z.object({ error: z.string() }),
])

export type TasksCreateInput = z.infer<typeof TasksCreateInput>
export type TasksCreateOutput = z.infer<typeof TasksCreateOutput>

export const tasksCreateDefinition: ToolDefinition<TasksCreateInput, TasksCreateOutput> = {
  name: 'tasks_create',
  description:
    "Add a task to the user's Google Tasks. Defaults to the default list unless taskListId is given. Privileged — confirm the title and due date with the user.",
  inputSchema: TasksCreateInput,
  outputSchema: TasksCreateOutput,
  isAvailable: gwsAvailable,
  needsApproval: true,
  execute: async ({ title, notes, due, taskListId = '@default' }, ctx) => {
    const auth = await requireActiveToken(ctx, 'tasks')
    if ('error' in auth) return auth

    const body: Record<string, unknown> = { title }
    if (notes) body['notes'] = notes
    if (due) body['due'] = due

    const resp = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    if (!resp.ok) {
      const errBody = await resp.text()
      return { error: `Tasks create failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    const json = (await resp.json()) as { id?: string; title?: string }
    if (!json.id) return { error: 'Tasks create returned no id' }
    return {
      ok: true as const,
      taskId: json.id,
      title: json.title ?? title,
      taskListId,
    }
  },
  render: {
    icon: ListPlus,
    displayName: 'Tasks — Create',
    summary: (output) => {
      if ('error' in output) return 'failed'
      if (output.ok) return truncate(output.title, 30)
      return null
    },
  },
}

/**
 * All Google Workspace tool definitions — imported by the aggregator.
 * Order here determines the order shown to the model in the tool catalog.
 */
export const googleWorkspaceDefinitions = [
  // Gmail: read
  gmailSearchDefinition,
  gmailGetMessageDefinition,
  gmailListLabelsDefinition,
  // Gmail: write
  gmailDraftDefinition,
  gmailReplyDefinition,
  gmailSendDefinition,
  // Drive
  driveSearchDefinition,
  driveGetFileDefinition,
  driveCreateFolderDefinition,
  // Calendar: read
  calendarUpcomingDefinition,
  calendarListEventsDefinition,
  calendarGetEventDefinition,
  calendarFindFreeSlotDefinition,
  // Calendar: write
  calendarCreateDefinition,
  calendarUpdateEventDefinition,
  calendarDeleteEventDefinition,
  // Docs
  docsSearchDefinition,
  docsGetDefinition,
  docsCreateDefinition,
  docsAppendDefinition,
  docsCreateFromMarkdownDefinition,
  // Sheets
  sheetsListTabsDefinition,
  sheetsReadRangeDefinition,
  sheetsAppendRowDefinition,
  sheetsWriteRangeDefinition,
  // Tasks
  tasksListDefinition,
  tasksCreateDefinition,
] as ToolDefinition<unknown, unknown>[]

// ─── shared helpers ──────────────────────────────────────────────

/**
 * Read an HTTP response body as text, stopping after `maxBytes` have been
 * buffered. Appends a `[...truncated]` marker if the stream was cut short.
 * Prevents a misreported Content-Length from letting a 50 MB file
 * blow past the 128 MB Worker heap limit.
 */
async function readCappedText(resp: Response, maxBytes: number): Promise<string> {
  if (!resp.body) return await resp.text()
  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const chunks: string[] = []
  let bytesRead = 0
  let truncated = false
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        if (bytesRead + value.byteLength > maxBytes) {
          const room = Math.max(0, maxBytes - bytesRead)
          if (room > 0) chunks.push(decoder.decode(value.subarray(0, room), { stream: true }))
          truncated = true
          break
        }
        bytesRead += value.byteLength
        chunks.push(decoder.decode(value, { stream: true }))
      }
    }
    chunks.push(decoder.decode())
  } finally {
    try {
      await reader.cancel()
    } catch {
      // noop — reader may already be closed
    }
  }
  return chunks.join('') + (truncated ? '\n[...truncated]' : '')
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Build an RFC 5322-compliant MIME message. Critical: the blank line
 * between headers and body must survive — earlier implementations used
 * `.filter(Boolean)` on an array that contained the blank separator,
 * which dropped it whenever cc/bcc were empty and produced a malformed
 * message whose body was treated as a header by strict parsers.
 */
interface MimeMessageInput {
  to: string
  subject: string
  body: string
  cc?: string[]
  bcc?: string[]
  extraHeaders?: string[]
}

/**
 * Split a comma-separated address header value into individual addresses,
 * respecting that "Name, With Comma <x@y>" contains a comma inside the
 * display name. Pragmatic parse — good enough for headers we control
 * or that come from Google.
 */
function splitAddresses(raw: string): string[] {
  if (!raw) return []
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of raw) {
    if (ch === '<') depth++
    else if (ch === '>') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      const trimmed = buf.trim()
      if (trimmed) out.push(trimmed)
      buf = ''
    } else {
      buf += ch
    }
  }
  const last = buf.trim()
  if (last) out.push(last)
  return out
}

/**
 * Case-insensitive comparison of an RFC 5322 address (optionally
 * display-name-wrapped) against a bare email address.
 */
function addressEquals(addr: string, email: string): boolean {
  const m = addr.match(/<([^>]+)>/)
  const extracted = (m && m[1] ? m[1] : addr).trim().toLowerCase()
  return extracted === email.toLowerCase()
}

function buildMimeMessage({ to, subject, body, cc, bcc, extraHeaders }: MimeMessageInput): string {
  const headerLines: string[] = [`To: ${to}`]
  if (cc && cc.length > 0) headerLines.push(`Cc: ${cc.join(', ')}`)
  if (bcc && bcc.length > 0) headerLines.push(`Bcc: ${bcc.join(', ')}`)
  headerLines.push(`Subject: ${subject}`)
  if (extraHeaders && extraHeaders.length > 0) {
    for (const h of extraHeaders) if (h) headerLines.push(h)
  }
  headerLines.push('Content-Type: text/plain; charset=UTF-8')
  // Exactly one blank line separates headers from body, per RFC 5322
  return headerLines.join('\r\n') + '\r\n\r\n' + body
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/**
 * Walk a Gmail message payload, extract the best-effort plain-text body
 * and attachment metadata. Gmail payloads are recursive MIME trees — we
 * prefer text/plain parts, fall back to stripping HTML from text/html
 * when no plain part exists.
 */
interface GmailPayloadPart {
  partId?: string
  mimeType?: string
  filename?: string
  body?: { size?: number; data?: string; attachmentId?: string }
  headers?: Array<{ name: string; value: string }>
  parts?: GmailPayloadPart[]
}

interface GmailApiMessage {
  id: string
  threadId?: string
  snippet?: string
  labelIds?: string[]
  payload?: GmailPayloadPart
}

function extractGmailBody(
  payload: GmailPayloadPart | undefined,
): { body: string; attachments: Array<{ attachmentId: string; filename: string; mimeType: string; sizeBytes: number }> } {
  if (!payload) return { body: '', attachments: [] }
  const attachments: Array<{
    attachmentId: string
    filename: string
    mimeType: string
    sizeBytes: number
  }> = []
  let plainText = ''
  let htmlFallback = ''

  const visit = (part: GmailPayloadPart): void => {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        sizeBytes: part.body.size ?? 0,
      })
    }
    if (part.mimeType === 'text/plain' && part.body?.data && !plainText) {
      plainText = decodeGmailBase64(part.body.data)
    } else if (part.mimeType === 'text/html' && part.body?.data && !htmlFallback) {
      htmlFallback = stripHtml(decodeGmailBase64(part.body.data))
    }
    for (const child of part.parts ?? []) visit(child)
  }
  visit(payload)

  return { body: plainText || htmlFallback, attachments }
}

function decodeGmailBase64(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface GoogleCalendarApiEvent {
  id?: string
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  hangoutLink?: string
  attendees?: Array<{ email?: string }>
}

function normaliseCalendarEvent(e: GoogleCalendarApiEvent): z.infer<typeof CalendarEvent> {
  return {
    id: e.id ?? '',
    summary: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    location: e.location,
    meetLink: e.hangoutLink,
    attendees: (e.attendees ?? []).map((a) => a.email ?? '').filter(Boolean),
  }
}

// ─── Google Docs helpers ─────────────────────────────────────────

interface GoogleDocsTextRun {
  content?: string
  textStyle?: { bold?: boolean; italic?: boolean }
}
interface GoogleDocsParagraphElement {
  textRun?: GoogleDocsTextRun
}
interface GoogleDocsParagraph {
  elements?: GoogleDocsParagraphElement[]
  paragraphStyle?: { namedStyleType?: string }
}
interface GoogleDocsStructuralElement {
  paragraph?: GoogleDocsParagraph
  sectionBreak?: unknown
}
interface GoogleDocsApiDoc {
  documentId?: string
  title?: string
  revisionId?: string
  body?: { content?: GoogleDocsStructuralElement[] }
}

/**
 * Walk a Google Docs document and return a plain-text / markdown-ish
 * representation. Preserves heading levels as `# / ## / ###` prefixes;
 * preserves paragraphs as blank-line-separated blocks. Skips tables,
 * images, inline objects — v1 deliberately keeps this simple.
 */
function flattenGoogleDoc(doc: GoogleDocsApiDoc): string {
  const parts: string[] = []
  for (const elem of doc.body?.content ?? []) {
    if (!elem.paragraph) continue
    const style = elem.paragraph.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT'
    const text = (elem.paragraph.elements ?? [])
      .map((e) => e.textRun?.content ?? '')
      .join('')
      .replace(/\n$/, '')
    if (!text.trim()) {
      parts.push('')
      continue
    }
    switch (style) {
      case 'HEADING_1':
        parts.push(`# ${text.trim()}`)
        break
      case 'HEADING_2':
        parts.push(`## ${text.trim()}`)
        break
      case 'HEADING_3':
        parts.push(`### ${text.trim()}`)
        break
      case 'HEADING_4':
      case 'HEADING_5':
      case 'HEADING_6':
        parts.push(`#### ${text.trim()}`)
        break
      default:
        parts.push(text)
    }
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Fallback when the user only has drive.readonly scope — export the doc
 * as plain text via the Drive API and synthesise a matching response.
 * Loses heading structure but recovers SOMETHING rather than erroring.
 */
async function readDocViaDriveExport(
  docId: string,
  token: string,
): Promise<DocsGetOutput> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(docId)}/export`,
  )
  url.searchParams.set('mimeType', 'text/plain')
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) return { error: `Doc export failed: ${resp.status}` }
  const content = await resp.text()

  // Fetch title separately
  const metaUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(docId)}`)
  metaUrl.searchParams.set('fields', 'name')
  const metaResp = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } })
  const meta = metaResp.ok ? ((await metaResp.json()) as { name?: string }) : undefined

  return {
    docId,
    title: meta?.name ?? '(untitled)',
    content,
    degraded: true,
  }
}

/**
 * Append markdown-ish content to an existing Google Doc. Builds a
 * `batchUpdate` request that inserts text at the end, then re-styles
 * heading lines via `updateParagraphStyle`. Table / image support
 * deliberately omitted for v1.
 */
async function appendToGoogleDoc(
  token: string,
  docId: string,
  content: string,
): Promise<{ ok: true } | { error: string }> {
  // Fetch current end-of-body index so we know where to insert
  const docResp = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}?fields=body(content(endIndex))`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!docResp.ok) return { error: `Append lookup failed: ${docResp.status}` }
  const doc = (await docResp.json()) as {
    body?: { content?: Array<{ endIndex?: number }> }
  }
  const lastElement = doc.body?.content?.[doc.body.content.length - 1]
  // endIndex of the final element includes a trailing newline — inserting
  // AT endIndex-1 puts us just before the implicit terminator.
  const insertAt = Math.max(1, (lastElement?.endIndex ?? 2) - 1)

  // Strip markdown heading prefixes BEFORE inserting and compute the
  // style request ranges against the stripped text. This avoids a hairy
  // bug where updateParagraphStyle + deleteContentRange requests had
  // indices that shifted under each other's effects — multi-heading
  // appends styled the wrong ranges or rejected outright.
  //
  // The heading lines below use the stripped text; the agent just needs
  // to see the heading styled in Docs after the call.
  const rawLines = (content.endsWith('\n') ? content : content + '\n').split('\n')
  const processed: Array<{ text: string; heading: string | null }> = rawLines.map((line) => {
    const heading = detectHeading(line)
    if (!heading) return { text: line, heading: null }
    return { text: line.slice(heading.prefixLen), heading: heading.style }
  })

  // Leading newline so we don't merge into the last existing paragraph.
  const strippedText =
    '\n' + processed.map((p) => p.text).join('\n')

  // Walk the stripped text to compute each heading paragraph's range in
  // post-insert coordinates. cursor starts at insertAt + 1 (past the
  // leading newline we added).
  let cursor = insertAt + 1
  const styleRequests: Array<Record<string, unknown>> = []
  for (const p of processed) {
    const lineLen = p.text.length + 1 // +1 for the trailing newline
    if (p.heading) {
      styleRequests.push({
        updateParagraphStyle: {
          range: { startIndex: cursor, endIndex: cursor + lineLen },
          paragraphStyle: { namedStyleType: p.heading },
          fields: 'namedStyleType',
        },
      })
    }
    cursor += lineLen
  }

  // Phase 1: insert the stripped text (no prefixes left to delete).
  const applyInsert = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{ insertText: { location: { index: insertAt }, text: strippedText } }],
      }),
    },
  )
  if (!applyInsert.ok) {
    const errBody = await applyInsert.text()
    return { error: `Docs append insert failed: ${applyInsert.status} ${errBody.slice(0, 200)}` }
  }

  // Phase 2: apply heading styles. updateParagraphStyle never shifts
  // indices so they can run in any order against the post-insert state.
  if (styleRequests.length > 0) {
    const applyStyle = await fetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests: styleRequests }),
      },
    )
    if (!applyStyle.ok) {
      const errBody = await applyStyle.text()
      return { error: `Docs append style failed: ${applyStyle.status} ${errBody.slice(0, 200)}` }
    }
  }
  return { ok: true }
}

function detectHeading(line: string): { style: string; prefixLen: number } | null {
  if (line.startsWith('### ')) return { style: 'HEADING_3', prefixLen: 4 }
  if (line.startsWith('## ')) return { style: 'HEADING_2', prefixLen: 3 }
  if (line.startsWith('# ')) return { style: 'HEADING_1', prefixLen: 2 }
  return null
}

function resolveRange(range: CalendarRange, now: Date): [Date, Date] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000)

  switch (range) {
    case 'today':
      return [startOfDay(now), endOfDay(now)]
    case 'tomorrow': {
      const t = addDays(now, 1)
      return [startOfDay(t), endOfDay(t)]
    }
    case 'thisWeek': {
      const dayOfWeek = now.getDay() // 0 = Sun
      const weekStart = addDays(now, -dayOfWeek)
      const weekEnd = addDays(weekStart, 6)
      return [startOfDay(weekStart), endOfDay(weekEnd)]
    }
    case 'nextWeek': {
      const dayOfWeek = now.getDay()
      const weekStart = addDays(now, 7 - dayOfWeek)
      const weekEnd = addDays(weekStart, 6)
      return [startOfDay(weekStart), endOfDay(weekEnd)]
    }
    case 'thisMonth': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return [monthStart, monthEnd]
    }
  }
}
