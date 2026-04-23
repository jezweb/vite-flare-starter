/**
 * Microsoft Workspace agent tools — native Microsoft Graph integration.
 *
 * Mirrors the shape of `google-workspace.ts` so the agent's toolkit
 * surface is consistent across identity providers:
 *   outlook_search, outlook_get_message, outlook_send
 *   onedrive_search, onedrive_get_file
 *   msoffice_calendar_list, msoffice_calendar_create
 *
 * Each tool has a per-user availability check (`isAvailable`) — if the
 * fork hasn't configured Microsoft OAuth, OR the current user hasn't
 * connected, the tool is omitted from the agent's toolkit entirely. This
 * is the same graceful-degradation pattern the rest of the toolkit uses.
 *
 * Access tokens are refreshed transparently in `getAccessToken()` when
 * within 5 minutes of expiry — tool calls never see a stale token.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import {
  Mail,
  MailOpen,
  MailCheck,
  FolderOpen,
  FileDown,
  CalendarSearch,
  CalendarPlus,
} from 'lucide-react'
import { microsoftWorkspaceTokens } from '@/server/modules/microsoft-workspace/db/schema'
import {
  getAccessToken,
  isMicrosoftWorkspaceEnabled,
  type MicrosoftWorkspaceEnv,
} from '@/server/modules/microsoft-workspace/tokens'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

const RECONNECT_HINT =
  'The Microsoft Workspace connection needs re-authorization. Ask the user to visit Connectors → Microsoft Workspace → Reconnect.'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

function mswEnv(ctx: AgentContext): MicrosoftWorkspaceEnv {
  return ctx.env as unknown as MicrosoftWorkspaceEnv
}

/**
 * Return a live access token OR a user-friendly error object. Tools
 * surface the error verbatim, so the agent can explain the missing
 * consent without inventing a cryptic message.
 */
async function requireActiveToken(
  ctx: AgentContext,
  requiredScope: string,
): Promise<{ token: string } | { error: string }> {
  const env = mswEnv(ctx)
  const db = drizzle(env.DB)
  const [row] = await db
    .select({
      scope: microsoftWorkspaceTokens.scope,
      status: microsoftWorkspaceTokens.status,
    })
    .from(microsoftWorkspaceTokens)
    .where(eq(microsoftWorkspaceTokens.userId, ctx.userId))
    .limit(1)

  if (!row) {
    return {
      error:
        'Microsoft Workspace is not connected for this user. Ask them to visit Connectors → Microsoft Workspace → Connect.',
    }
  }
  if (row.status !== 'active') {
    return { error: RECONNECT_HINT }
  }
  if (!row.scope.split(' ').includes(requiredScope)) {
    return {
      error: `This action needs the '${requiredScope}' Microsoft scope. The current consent doesn't include it — the user should reconnect to upgrade.`,
    }
  }

  const token = await getAccessToken(env, ctx.userId)
  if (!token) return { error: RECONNECT_HINT }
  return { token }
}

/**
 * Per-tool availability — checked at every agent request. Tools disappear
 * from the toolkit when the user has no connection with the needed scope.
 */
function userHasScope(scope: string): (ctx: AgentContext) => Promise<boolean> {
  return async (ctx) => {
    const env = mswEnv(ctx)
    if (!isMicrosoftWorkspaceEnabled(env)) return false
    const db = drizzle(env.DB)
    const [row] = await db
      .select({ scope: microsoftWorkspaceTokens.scope, status: microsoftWorkspaceTokens.status })
      .from(microsoftWorkspaceTokens)
      .where(eq(microsoftWorkspaceTokens.userId, ctx.userId))
      .limit(1)
    if (!row || row.status !== 'active') return false
    return row.scope.split(' ').includes(scope)
  }
}

// ─── OUTLOOK — SEARCH ──────────────────────────────────────────────────

const OutlookSearchInput = z.object({
  query: z.string().optional().describe('Microsoft Graph $search query (KQL). Example: "from:sarah AND attachment"'),
  maxResults: z.number().int().min(1).max(50).default(10).optional(),
})

const OutlookSearchOutput = z.union([
  z.object({
    messages: z.array(
      z.object({
        id: z.string(),
        subject: z.string().optional(),
        from: z.string().optional(),
        preview: z.string().optional(),
        receivedAt: z.string().optional(),
        hasAttachments: z.boolean().optional(),
        isRead: z.boolean().optional(),
        webLink: z.string().optional(),
      }),
    ),
    count: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const outlookSearchDefinition: ToolDefinition<
  z.infer<typeof OutlookSearchInput>,
  z.infer<typeof OutlookSearchOutput>
> = {
  name: 'outlook_search',
  description:
    "Search the user's Outlook inbox via Microsoft Graph. Use KQL ($search) for natural-language queries like `from:sarah AND attachment`. Returns subject, sender, preview, received time.",
  inputSchema: OutlookSearchInput,
  outputSchema: OutlookSearchOutput,
  isAvailable: userHasScope('Mail.Read'),
  execute: async ({ query, maxResults = 10 }, ctx) => {
    const auth = await requireActiveToken(ctx, 'Mail.Read')
    if ('error' in auth) return auth
    const url = new URL(`${GRAPH_BASE}/me/messages`)
    url.searchParams.set('$top', String(maxResults))
    url.searchParams.set('$select', 'id,subject,from,bodyPreview,receivedDateTime,hasAttachments,isRead,webLink')
    if (query) url.searchParams.set('$search', `"${query.replace(/"/g, '\\"')}"`)
    else url.searchParams.set('$orderby', 'receivedDateTime desc')

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        // ConsistencyLevel required when using $search.
        ConsistencyLevel: 'eventual',
      },
    })
    if (!resp.ok) {
      return { error: `Outlook search failed: ${resp.status} ${(await resp.text()).slice(0, 200)}` }
    }
    const json = (await resp.json()) as {
      value: Array<{
        id: string
        subject?: string
        from?: { emailAddress?: { address?: string; name?: string } }
        bodyPreview?: string
        receivedDateTime?: string
        hasAttachments?: boolean
        isRead?: boolean
        webLink?: string
      }>
    }
    const messages = json.value.map((m) => ({
      id: m.id,
      subject: m.subject,
      from: m.from?.emailAddress
        ? `${m.from.emailAddress.name ?? ''} <${m.from.emailAddress.address ?? ''}>`.trim()
        : undefined,
      preview: m.bodyPreview,
      receivedAt: m.receivedDateTime,
      hasAttachments: m.hasAttachments,
      isRead: m.isRead,
      webLink: m.webLink,
    }))
    return { messages, count: messages.length }
  },
  render: { icon: Mail, displayName: 'Outlook — Search' },
}

// ─── OUTLOOK — GET MESSAGE ─────────────────────────────────────────────

const OutlookGetInput = z.object({
  messageId: z.string().describe('The Graph message id (from outlook_search).'),
})

const OutlookGetOutput = z.union([
  z.object({
    id: z.string(),
    subject: z.string().optional(),
    from: z.string().optional(),
    to: z.array(z.string()).optional(),
    receivedAt: z.string().optional(),
    body: z.string().optional(),
    bodyType: z.enum(['text', 'html']).optional(),
    webLink: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export const outlookGetMessageDefinition: ToolDefinition<
  z.infer<typeof OutlookGetInput>,
  z.infer<typeof OutlookGetOutput>
> = {
  name: 'outlook_get_message',
  description: 'Read a single Outlook message by id, including full body.',
  inputSchema: OutlookGetInput,
  outputSchema: OutlookGetOutput,
  isAvailable: userHasScope('Mail.Read'),
  execute: async ({ messageId }, ctx) => {
    const auth = await requireActiveToken(ctx, 'Mail.Read')
    if ('error' in auth) return auth
    const resp = await fetch(`${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    if (!resp.ok) {
      return { error: `Outlook get failed: ${resp.status} ${(await resp.text()).slice(0, 200)}` }
    }
    const m = (await resp.json()) as {
      id: string
      subject?: string
      from?: { emailAddress?: { address?: string; name?: string } }
      toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>
      receivedDateTime?: string
      body?: { content?: string; contentType?: 'text' | 'html' }
      webLink?: string
    }
    return {
      id: m.id,
      subject: m.subject,
      from: m.from?.emailAddress
        ? `${m.from.emailAddress.name ?? ''} <${m.from.emailAddress.address ?? ''}>`.trim()
        : undefined,
      to: m.toRecipients?.map((r) =>
        r.emailAddress
          ? `${r.emailAddress.name ?? ''} <${r.emailAddress.address ?? ''}>`.trim()
          : '',
      ),
      receivedAt: m.receivedDateTime,
      body: m.body?.content,
      bodyType: m.body?.contentType,
      webLink: m.webLink,
    }
  },
  render: { icon: MailOpen, displayName: 'Outlook — Read' },
}

// ─── OUTLOOK — SEND ────────────────────────────────────────────────────

const OutlookSendInput = z.object({
  to: z.array(z.string().email()).min(1).describe('Recipient email addresses.'),
  cc: z.array(z.string().email()).optional(),
  subject: z.string(),
  body: z.string().describe('Message body. Plain text unless `isHtml: true`.'),
  isHtml: z.boolean().optional().default(false),
})

const OutlookSendOutput = z.union([
  z.object({ sent: z.literal(true), queued: z.boolean().optional() }),
  z.object({ error: z.string() }),
])

export const outlookSendDefinition: ToolDefinition<
  z.infer<typeof OutlookSendInput>,
  z.infer<typeof OutlookSendOutput>
> = {
  name: 'outlook_send',
  description:
    'Send an email from the user\'s Outlook account. DESTRUCTIVE — triggers an approval dialog unless the user explicitly asked to send.',
  inputSchema: OutlookSendInput,
  outputSchema: OutlookSendOutput,
  // Privileged — gated by needsApproval so the UI stops and confirms
  // before firing. Mirrors gmail_send's treatment.
  needsApproval: true,
  isAvailable: userHasScope('Mail.Send'),
  execute: async ({ to, cc, subject, body, isHtml }, ctx) => {
    const auth = await requireActiveToken(ctx, 'Mail.Send')
    if ('error' in auth) return auth
    const payload = {
      message: {
        subject,
        body: { contentType: isHtml ? 'HTML' : 'Text', content: body },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
        ...(cc && cc.length
          ? { ccRecipients: cc.map((address) => ({ emailAddress: { address } })) }
          : {}),
      },
      saveToSentItems: true,
    }
    const resp = await fetch(`${GRAPH_BASE}/me/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    // sendMail returns 202 Accepted on success (fire-and-forget delivery).
    if (resp.status !== 202 && !resp.ok) {
      return { error: `Outlook send failed: ${resp.status} ${(await resp.text()).slice(0, 200)}` }
    }
    return { sent: true, queued: resp.status === 202 }
  },
  render: { icon: MailCheck, displayName: 'Outlook — Send' },
}

// ─── ONEDRIVE — SEARCH ─────────────────────────────────────────────────

const OneDriveSearchInput = z.object({
  query: z.string().describe('Search text — matches filename and content.'),
  maxResults: z.number().int().min(1).max(25).default(10).optional(),
})

const OneDriveSearchOutput = z.union([
  z.object({
    files: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        path: z.string().optional(),
        size: z.number().optional(),
        modifiedAt: z.string().optional(),
        mimeType: z.string().optional(),
        webUrl: z.string().optional(),
        isFolder: z.boolean().optional(),
      }),
    ),
    count: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const onedriveSearchDefinition: ToolDefinition<
  z.infer<typeof OneDriveSearchInput>,
  z.infer<typeof OneDriveSearchOutput>
> = {
  name: 'onedrive_search',
  description:
    "Search the user's OneDrive for files matching a query. Returns file ids, names, paths, sizes, web URLs.",
  inputSchema: OneDriveSearchInput,
  outputSchema: OneDriveSearchOutput,
  isAvailable: userHasScope('Files.Read'),
  execute: async ({ query, maxResults = 10 }, ctx) => {
    const auth = await requireActiveToken(ctx, 'Files.Read')
    if ('error' in auth) return auth
    // Graph's search endpoint lives under /me/drive/root/search(q='...')
    const url = new URL(
      `${GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(query)}')`,
    )
    url.searchParams.set('$top', String(maxResults))
    url.searchParams.set('$select', 'id,name,size,lastModifiedDateTime,file,folder,parentReference,webUrl')

    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) {
      return { error: `OneDrive search failed: ${resp.status} ${(await resp.text()).slice(0, 200)}` }
    }
    const json = (await resp.json()) as {
      value: Array<{
        id: string
        name: string
        size?: number
        lastModifiedDateTime?: string
        file?: { mimeType?: string }
        folder?: object
        parentReference?: { path?: string }
        webUrl?: string
      }>
    }
    const files = json.value.map((f) => ({
      id: f.id,
      name: f.name,
      // Graph paths look like "/drive/root:/Documents" — trim the prefix.
      path: f.parentReference?.path?.replace(/^\/drive\/root:?/, '') ?? undefined,
      size: f.size,
      modifiedAt: f.lastModifiedDateTime,
      mimeType: f.file?.mimeType,
      webUrl: f.webUrl,
      isFolder: !!f.folder,
    }))
    return { files, count: files.length }
  },
  render: { icon: FolderOpen, displayName: 'OneDrive — Search' },
}

// ─── ONEDRIVE — GET FILE (metadata + download URL) ─────────────────────

const OneDriveGetInput = z.object({
  fileId: z.string().describe('OneDrive item id (from onedrive_search).'),
})

const OneDriveGetOutput = z.union([
  z.object({
    id: z.string(),
    name: z.string(),
    size: z.number().optional(),
    modifiedAt: z.string().optional(),
    mimeType: z.string().optional(),
    webUrl: z.string().optional(),
    /** Short-lived pre-authenticated download URL, valid ~1 hour. */
    downloadUrl: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export const onedriveGetFileDefinition: ToolDefinition<
  z.infer<typeof OneDriveGetInput>,
  z.infer<typeof OneDriveGetOutput>
> = {
  name: 'onedrive_get_file',
  description:
    'Get OneDrive file metadata + a short-lived pre-authenticated download URL (1 hour validity). Use the URL to fetch file bytes elsewhere if needed.',
  inputSchema: OneDriveGetInput,
  outputSchema: OneDriveGetOutput,
  isAvailable: userHasScope('Files.Read'),
  execute: async ({ fileId }, ctx) => {
    const auth = await requireActiveToken(ctx, 'Files.Read')
    if ('error' in auth) return auth
    const resp = await fetch(
      `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(fileId)}?$select=id,name,size,lastModifiedDateTime,file,webUrl,@microsoft.graph.downloadUrl`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    )
    if (!resp.ok) {
      return { error: `OneDrive get failed: ${resp.status} ${(await resp.text()).slice(0, 200)}` }
    }
    const f = (await resp.json()) as {
      id: string
      name: string
      size?: number
      lastModifiedDateTime?: string
      file?: { mimeType?: string }
      webUrl?: string
      '@microsoft.graph.downloadUrl'?: string
    }
    return {
      id: f.id,
      name: f.name,
      size: f.size,
      modifiedAt: f.lastModifiedDateTime,
      mimeType: f.file?.mimeType,
      webUrl: f.webUrl,
      downloadUrl: f['@microsoft.graph.downloadUrl'],
    }
  },
  render: { icon: FileDown, displayName: 'OneDrive — Get File' },
}

// ─── MS CALENDAR — LIST ────────────────────────────────────────────────

const MsCalendarListInput = z.object({
  start: z.string().describe('ISO 8601 datetime — range start.'),
  end: z.string().describe('ISO 8601 datetime — range end.'),
  maxResults: z.number().int().min(1).max(100).default(25).optional(),
})

const MsCalendarListOutput = z.union([
  z.object({
    events: z.array(
      z.object({
        id: z.string(),
        subject: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        location: z.string().optional(),
        organizer: z.string().optional(),
        webLink: z.string().optional(),
        isAllDay: z.boolean().optional(),
      }),
    ),
    count: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const msCalendarListDefinition: ToolDefinition<
  z.infer<typeof MsCalendarListInput>,
  z.infer<typeof MsCalendarListOutput>
> = {
  name: 'msoffice_calendar_list',
  description:
    "List events in the user's Outlook calendar between `start` and `end` (ISO 8601 datetimes).",
  inputSchema: MsCalendarListInput,
  outputSchema: MsCalendarListOutput,
  isAvailable: userHasScope('Calendars.ReadWrite'),
  execute: async ({ start, end, maxResults = 25 }, ctx) => {
    const auth = await requireActiveToken(ctx, 'Calendars.ReadWrite')
    if ('error' in auth) return auth
    // calendarView works across recurrences, which is usually what users want.
    const url = new URL(`${GRAPH_BASE}/me/calendarView`)
    url.searchParams.set('startDateTime', start)
    url.searchParams.set('endDateTime', end)
    url.searchParams.set('$top', String(maxResults))
    url.searchParams.set(
      '$select',
      'id,subject,start,end,location,organizer,webLink,isAllDay',
    )
    url.searchParams.set('$orderby', 'start/dateTime')

    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    if (!resp.ok) {
      return { error: `MS Calendar list failed: ${resp.status} ${(await resp.text()).slice(0, 200)}` }
    }
    const json = (await resp.json()) as {
      value: Array<{
        id: string
        subject?: string
        start?: { dateTime?: string; timeZone?: string }
        end?: { dateTime?: string; timeZone?: string }
        location?: { displayName?: string }
        organizer?: { emailAddress?: { name?: string; address?: string } }
        webLink?: string
        isAllDay?: boolean
      }>
    }
    const events = json.value.map((e) => ({
      id: e.id,
      subject: e.subject,
      start: e.start?.dateTime,
      end: e.end?.dateTime,
      location: e.location?.displayName,
      organizer: e.organizer?.emailAddress
        ? `${e.organizer.emailAddress.name ?? ''} <${e.organizer.emailAddress.address ?? ''}>`.trim()
        : undefined,
      webLink: e.webLink,
      isAllDay: e.isAllDay,
    }))
    return { events, count: events.length }
  },
  render: { icon: CalendarSearch, displayName: 'MS Calendar — List' },
}

// ─── MS CALENDAR — CREATE ──────────────────────────────────────────────

const MsCalendarCreateInput = z.object({
  subject: z.string(),
  start: z.string().describe('ISO 8601 datetime for event start.'),
  end: z.string().describe('ISO 8601 datetime for event end.'),
  timeZone: z.string().optional().describe('IANA tz (e.g. "Australia/Sydney"). Defaults to UTC.'),
  location: z.string().optional(),
  attendees: z
    .array(z.string().email())
    .optional()
    .describe('Attendee email addresses — invitations are sent automatically.'),
  body: z.string().optional().describe('Event description / meeting notes.'),
  isOnlineMeeting: z
    .boolean()
    .optional()
    .describe('If true, automatically generate a Teams meeting link.'),
})

const MsCalendarCreateOutput = z.union([
  z.object({
    id: z.string(),
    webLink: z.string().optional(),
    onlineMeetingUrl: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export const msCalendarCreateDefinition: ToolDefinition<
  z.infer<typeof MsCalendarCreateInput>,
  z.infer<typeof MsCalendarCreateOutput>
> = {
  name: 'msoffice_calendar_create',
  description:
    "Create a new event on the user's Outlook calendar with optional attendees and Teams meeting link. DESTRUCTIVE — triggers an approval dialog.",
  inputSchema: MsCalendarCreateInput,
  outputSchema: MsCalendarCreateOutput,
  needsApproval: true,
  isAvailable: userHasScope('Calendars.ReadWrite'),
  execute: async (input, ctx) => {
    const auth = await requireActiveToken(ctx, 'Calendars.ReadWrite')
    if ('error' in auth) return auth
    const tz = input.timeZone ?? 'UTC'
    const payload = {
      subject: input.subject,
      start: { dateTime: input.start, timeZone: tz },
      end: { dateTime: input.end, timeZone: tz },
      ...(input.location ? { location: { displayName: input.location } } : {}),
      ...(input.attendees && input.attendees.length
        ? {
            attendees: input.attendees.map((address) => ({
              emailAddress: { address },
              type: 'required',
            })),
          }
        : {}),
      ...(input.body
        ? { body: { contentType: 'Text', content: input.body } }
        : {}),
      ...(input.isOnlineMeeting
        ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' }
        : {}),
    }
    const resp = await fetch(`${GRAPH_BASE}/me/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      return { error: `MS Calendar create failed: ${resp.status} ${(await resp.text()).slice(0, 200)}` }
    }
    const e = (await resp.json()) as {
      id: string
      webLink?: string
      onlineMeeting?: { joinUrl?: string }
    }
    return { id: e.id, webLink: e.webLink, onlineMeetingUrl: e.onlineMeeting?.joinUrl }
  },
  render: { icon: CalendarPlus, displayName: 'MS Calendar — Create' },
}

/**
 * All Microsoft Workspace tool definitions — register in the chat tool
 * index alongside the Google Workspace set.
 */
export const microsoftWorkspaceDefinitions: ToolDefinition<unknown, unknown>[] = [
  outlookSearchDefinition,
  outlookGetMessageDefinition,
  outlookSendDefinition,
  onedriveSearchDefinition,
  onedriveGetFileDefinition,
  msCalendarListDefinition,
  msCalendarCreateDefinition,
] as unknown as ToolDefinition<unknown, unknown>[]
