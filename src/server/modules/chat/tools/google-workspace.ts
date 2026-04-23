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
  Calendar,
  CalendarPlus,
  CalendarSearch,
  CalendarClock,
  CalendarCheck,
  CalendarX,
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

    const headers = [
      `To: ${to}`,
      cc && cc.length > 0 ? `Cc: ${cc.join(', ')}` : '',
      bcc && bcc.length > 0 ? `Bcc: ${bcc.join(', ')}` : '',
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ]
      .filter(Boolean)
      .join('\r\n')
    const raw = base64UrlEncode(headers)

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

    // 1. Fetch the original message's headers to derive reply target
    const metaUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
    )
    metaUrl.searchParams.set('format', 'metadata')
    for (const h of ['From', 'To', 'Cc', 'Subject', 'Message-ID', 'References', 'In-Reply-To']) {
      metaUrl.searchParams.append('metadataHeaders', h)
    }
    const metaResp = await fetch(metaUrl, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!metaResp.ok) return { error: `Reply lookup failed: ${metaResp.status}` }
    const meta = (await metaResp.json()) as {
      threadId?: string
      payload?: { headers?: Array<{ name: string; value: string }> }
    }
    const hdr = (name: string) =>
      meta.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value

    const origFrom = hdr('From') ?? ''
    const origTo = hdr('To') ?? ''
    const origCc = hdr('Cc') ?? ''
    const origSubject = hdr('Subject') ?? ''
    const origMessageIdHeader = hdr('Message-ID') ?? hdr('Message-Id') ?? ''
    const origRefs = hdr('References') ?? ''

    const to = origFrom
    // replyAll: include the Original To and Cc minus our own address.
    // We can't know the user's primary email cheaply here, so we include all
    // and let Gmail dedupe (it does).
    const cc = replyAll
      ? [origTo, origCc].filter(Boolean).join(', ')
      : ''
    const subject = /^re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`
    const references = origRefs
      ? `${origRefs} ${origMessageIdHeader}`.trim()
      : origMessageIdHeader

    const headers = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : '',
      `Subject: ${subject}`,
      origMessageIdHeader ? `In-Reply-To: ${origMessageIdHeader}` : '',
      references ? `References: ${references}` : '',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ]
      .filter(Boolean)
      .join('\r\n')
    const raw = base64UrlEncode(headers)

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
  start: z.string().optional().describe('ISO 8601 start. Required if range is not set.'),
  end: z.string().optional().describe('ISO 8601 end. Required if range is not set.'),
  limit: z.number().int().min(1).max(100).default(25).optional(),
  calendarId: z.string().default('primary').optional(),
  query: z.string().max(200).optional().describe('Free-text search within event summary/description'),
})

const CalendarListEventsOutput = z.union([
  z.object({
    count: z.number(),
    rangeStart: z.string(),
    rangeEnd: z.string(),
    events: z.array(CalendarEvent),
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
    "List calendar events in a specific range. Use `range` presets (today, tomorrow, thisWeek, nextWeek, thisMonth) for natural date windows, or pass explicit start/end ISO timestamps. Falls back to the primary calendar unless calendarId is given.",
  inputSchema: CalendarListEventsInput,
  outputSchema: CalendarListEventsOutput,
  isAvailable: gwsAvailable,
  execute: async ({ range, start, end, limit = 25, calendarId = 'primary', query }, ctx) => {
    const auth = await requireActiveToken(ctx, 'calendar.events')
    if ('error' in auth) return auth

    const now = new Date()
    let rangeStart: Date
    let rangeEnd: Date
    if (range) {
      ;[rangeStart, rangeEnd] = resolveRange(range, now)
    } else {
      if (!start || !end) return { error: 'Either `range` or both `start` and `end` are required.' }
      rangeStart = new Date(start)
      rangeEnd = new Date(end)
    }

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    )
    url.searchParams.set('timeMin', rangeStart.toISOString())
    url.searchParams.set('timeMax', rangeEnd.toISOString())
    url.searchParams.set('maxResults', String(limit))
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    if (query) url.searchParams.set('q', query)
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) return { error: `Calendar list failed: ${resp.status}` }
    const json = (await resp.json()) as { items?: GoogleCalendarApiEvent[] }
    const events = (json.items ?? []).map(normaliseCalendarEvent)
    return {
      count: events.length,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      events,
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
      const hour = startDate.getHours()

      // Enforce working hours on local timezone
      if (hour < whStart || hour + durationMinutes / 60 > whEnd) {
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
  // Calendar: read
  calendarUpcomingDefinition,
  calendarListEventsDefinition,
  calendarGetEventDefinition,
  calendarFindFreeSlotDefinition,
  // Calendar: write
  calendarCreateDefinition,
  calendarUpdateEventDefinition,
  calendarDeleteEventDefinition,
] as ToolDefinition<unknown, unknown>[]

// ─── shared helpers ──────────────────────────────────────────────

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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
