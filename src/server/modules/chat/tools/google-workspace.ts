/**
 * Google Workspace agent tools — native integration.
 *
 * Exposes Gmail search/send, Drive search, and Calendar read/create. All
 * tools are omitted from the toolkit when the user has no active Google
 * Workspace connection — agents won't offer what they can't use.
 *
 * Access tokens are fetched (and refreshed if within 5 min of expiry)
 * on every tool call via `getAccessToken`. If the refresh fails, the tool
 * returns a friendly "reconnect" prompt rather than silently erroring.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { googleWorkspaceTokens } from '@/server/modules/google-workspace/db/schema'
import {
  getAccessToken,
  isGoogleWorkspaceEnabled,
  type GoogleWorkspaceEnv,
} from '@/server/modules/google-workspace/tokens'

interface BuildCtx {
  env: GoogleWorkspaceEnv
  userId: string
}

const RECONNECT_HINT =
  'The Google Workspace connection needs re-authorization. Ask the user to visit Connectors → Google Workspace → Reconnect.'

/**
 * Check if the user has an active connection with the required scope.
 * Returns either a live access token or an error object. Agents should
 * return the error as the tool result — surfaces clearly in chat.
 */
async function requireActiveToken(
  ctx: BuildCtx,
  requiredScope: string,
): Promise<{ token: string } | { error: string }> {
  const db = drizzle(ctx.env.DB)
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

  const token = await getAccessToken(ctx.env, ctx.userId)
  if (!token) return { error: RECONNECT_HINT }
  return { token }
}

export function buildGoogleWorkspaceTools(ctx: BuildCtx) {
  // Gate the whole module behind env config. Forks without Google OAuth
  // wired don't see any of these tools in the toolkit.
  if (!isGoogleWorkspaceEnabled(ctx.env)) return {}

  return {
    gmail_search: tool({
      description:
        "Search the user's Gmail. Uses Gmail search syntax (e.g. 'from:jez@jezweb.net after:2026/04/01'). Returns message subject, from, date, snippet — no full body (use gmail_read for that).",
      inputSchema: z.object({
        query: z.string().min(1).max(500).describe('Gmail search query'),
        limit: z.number().int().min(1).max(50).default(10).optional(),
      }),
      execute: async ({ query, limit = 10 }) => {
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

        // Fetch each message's headers in parallel — minimal format
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
        return {
          query,
          count: messages.filter(Boolean).length,
          messages: messages.filter(Boolean),
        }
      },
    }),

    gmail_send: tool({
      description:
        "Send an email from the user's Gmail account. Always confirm the recipient, subject, and body with the user before sending — this ends up in their sent folder.",
      // needsApproval is honoured by createAgentUIStreamResponse — a dialog
      // prompts the user to approve before the tool actually fires.
      needsApproval: true,
      inputSchema: z.object({
        to: z.string().email(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(10000).describe('Plain-text body'),
        cc: z.array(z.string().email()).optional(),
      }),
      execute: async ({ to, subject, body, cc }) => {
        const auth = await requireActiveToken(ctx, 'gmail.send')
        if ('error' in auth) return auth

        // Gmail wants RFC 822 raw message, base64url-encoded.
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
        return { ok: true, messageId: json.id, to, subject }
      },
    }),

    drive_search: tool({
      description:
        "Search the user's Google Drive. Returns file names, ids, mime types, and modified times. Use drive_read to fetch a file's content.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "Drive query — supports 'name contains \"foo\"' and full-text 'fullText contains \"foo\"'. Defaults to fullText if plain text is passed.",
          ),
        limit: z.number().int().min(1).max(50).default(10).optional(),
      }),
      execute: async ({ query, limit = 10 }) => {
        const auth = await requireActiveToken(ctx, 'drive.readonly')
        if ('error' in auth) return auth

        // Heuristic: if the query doesn't already include a field operator,
        // wrap it in fullText contains "…". Otherwise pass through verbatim.
        const q = /\b(name|fullText|mimeType|modifiedTime|trashed)\s+(contains|=|!=|>|<)\b/.test(
          query,
        )
          ? query
          : `fullText contains ${JSON.stringify(query)}`

        const url = new URL('https://www.googleapis.com/drive/v3/files')
        url.searchParams.set('q', q)
        url.searchParams.set('pageSize', String(limit))
        url.searchParams.set(
          'fields',
          'files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress))',
        )
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${auth.token}` },
        })
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
    }),

    calendar_upcoming: tool({
      description:
        "List the user's upcoming calendar events (default: next 10 events across the primary calendar). Use before suggesting a meeting time or answering 'what's on my schedule?'",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(10).optional(),
        days: z
          .number()
          .int()
          .min(1)
          .max(60)
          .default(14)
          .optional()
          .describe('Days forward to look (default 14).'),
      }),
      execute: async ({ limit = 10, days = 14 }) => {
        const auth = await requireActiveToken(ctx, 'calendar.events')
        if ('error' in auth) return auth

        const now = new Date()
        const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
        const url = new URL(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        )
        url.searchParams.set('timeMin', now.toISOString())
        url.searchParams.set('timeMax', end.toISOString())
        url.searchParams.set('maxResults', String(limit))
        url.searchParams.set('singleEvents', 'true')
        url.searchParams.set('orderBy', 'startTime')
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${auth.token}` },
        })
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
    }),

    calendar_create: tool({
      description:
        'Create a calendar event on the primary calendar. Always confirm the time, attendees, and details with the user before creating — attendees will receive invites immediately.',
      needsApproval: true,
      inputSchema: z.object({
        summary: z.string().min(1).max(200).describe('Event title'),
        start: z
          .string()
          .describe('Start time — RFC 3339 / ISO 8601 (e.g. "2026-04-25T14:00:00+10:00")'),
        end: z
          .string()
          .describe('End time — RFC 3339 / ISO 8601'),
        description: z.string().max(5000).optional(),
        attendees: z.array(z.string().email()).max(50).optional(),
        location: z.string().max(500).optional(),
      }),
      execute: async ({ summary, start, end, description, attendees, location }) => {
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
        return { ok: true, eventId: json.id, url: json.htmlLink, summary, start, end }
      },
    }),
  }
}

function base64UrlEncode(str: string): string {
  // Node / Workers both have btoa. We encode UTF-8 first to handle non-ASCII.
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
