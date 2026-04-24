/**
 * Slack agent tools — native Slack Web API integration via user-token OAuth.
 *
 * Tools:
 *   slack_search_messages     — search.messages across the workspace
 *   slack_list_channels       — conversations.list (public + private)
 *   slack_get_channel_history — conversations.history with user-name resolution
 *   slack_get_user            — users.info
 *   slack_post_message        — chat.postMessage (destructive, approval-gated)
 *
 * Slack Web API quirks:
 *   - POST to https://slack.com/api/<method> with either
 *     application/x-www-form-urlencoded or application/json
 *   - Response is always HTTP 200 — check `{ ok: true }` on the JSON;
 *     `error` field has the actual problem.
 *   - No refresh-token rotation for classic user tokens (they're long-lived).
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { MessageSquare, Hash, User, Send, Search } from 'lucide-react'
import { slackTokens } from '@/server/modules/slack/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

const SLACK_API = 'https://slack.com/api'

const RECONNECT_HINT =
  'Slack needs reconnection. Ask the user to visit Connectors → Slack → Reconnect.'

interface SlackEnv {
  DB: D1Database
  SLACK_CLIENT_ID?: string
  SLACK_CLIENT_SECRET?: string
}

function slackEnv(ctx: AgentContext): SlackEnv {
  return ctx.env as unknown as SlackEnv
}

function isSlackEnabled(env: SlackEnv): boolean {
  return !!(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET)
}

/**
 * Per-tool availability — checked on every agent request. Tool
 * disappears from the toolkit if the fork hasn't configured Slack OR
 * the current user hasn't connected.
 */
function userHasSlack(): (ctx: AgentContext) => Promise<boolean> {
  return async (ctx) => {
    const env = slackEnv(ctx)
    if (!isSlackEnabled(env)) return false
    const db = drizzle(env.DB)
    const [row] = await db
      .select({ status: slackTokens.status })
      .from(slackTokens)
      .where(eq(slackTokens.userId, ctx.userId))
      .limit(1)
    return row?.status === 'active'
  }
}

async function requireSlackToken(
  ctx: AgentContext,
): Promise<{ token: string } | { error: string }> {
  const env = slackEnv(ctx)
  const db = drizzle(env.DB)
  const [row] = await db
    .select({ accessToken: slackTokens.accessToken, status: slackTokens.status })
    .from(slackTokens)
    .where(eq(slackTokens.userId, ctx.userId))
    .limit(1)
  if (!row) {
    return {
      error:
        'Slack is not connected for this user. Ask them to visit Connectors → Slack → Connect.',
    }
  }
  if (row.status !== 'active') return { error: RECONNECT_HINT }
  return { token: row.accessToken }
}

/** Shared form-body helper — Slack accepts URL-encoded POST. */
async function slackCall<T>(
  token: string,
  method: string,
  params: Record<string, string | number | undefined>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) body.set(k, String(v))
  }
  const resp = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body,
  })
  const text = await resp.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: `Slack ${method} returned non-JSON: ${text.slice(0, 120)}` }
  }
  const r = json as { ok?: boolean; error?: string }
  if (!r.ok) return { ok: false, error: r.error ?? 'unknown_error' }
  return { ok: true, data: json as T }
}

// ─── SEARCH MESSAGES ────────────────────────────────────────────────────

const SearchMessagesInput = z.object({
  query: z.string().min(1).describe('Full-text search query (Slack operators like `from:@alice` supported).'),
  count: z.number().int().min(1).max(50).default(20).optional(),
})

const SearchMessagesOutput = z.union([
  z.object({
    messages: z.array(
      z.object({
        channel: z.string().optional(),
        user: z.string().optional(),
        text: z.string(),
        ts: z.string(),
        permalink: z.string().optional(),
      }),
    ),
    count: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const slackSearchMessagesDefinition: ToolDefinition<
  z.infer<typeof SearchMessagesInput>,
  z.infer<typeof SearchMessagesOutput>
> = {
  name: 'slack_search_messages',
  description:
    "Search Slack messages the user can see. Supports Slack's query operators (from:@user, in:#channel, has:link, before:YYYY-MM-DD). Returns up to 50 matches.",
  inputSchema: SearchMessagesInput,
  outputSchema: SearchMessagesOutput,
  isAvailable: userHasSlack(),
  execute: async ({ query, count = 20 }, ctx) => {
    const auth = await requireSlackToken(ctx)
    if ('error' in auth) return auth
    const res = await slackCall<{
      messages?: {
        matches?: Array<{
          channel?: { id?: string; name?: string }
          user?: string
          text?: string
          ts?: string
          permalink?: string
        }>
      }
    }>(auth.token, 'search.messages', { query, count, sort: 'timestamp' })
    if (!res.ok) return { error: `Slack search failed: ${res.error}` }
    const matches = res.data.messages?.matches ?? []
    return {
      messages: matches.map((m) => ({
        channel: m.channel?.name ? `#${m.channel.name}` : m.channel?.id,
        user: m.user,
        text: m.text ?? '',
        ts: m.ts ?? '',
        permalink: m.permalink,
      })),
      count: matches.length,
    }
  },
  render: { icon: Search, displayName: 'Slack — Search' },
}

// ─── LIST CHANNELS ──────────────────────────────────────────────────────

const ListChannelsInput = z.object({
  includePrivate: z.boolean().default(true).optional(),
  limit: z.number().int().min(1).max(200).default(100).optional(),
})

const ListChannelsOutput = z.union([
  z.object({
    channels: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        isPrivate: z.boolean(),
        numMembers: z.number().optional(),
        topic: z.string().optional(),
      }),
    ),
    count: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const slackListChannelsDefinition: ToolDefinition<
  z.infer<typeof ListChannelsInput>,
  z.infer<typeof ListChannelsOutput>
> = {
  name: 'slack_list_channels',
  description:
    "List Slack channels the user is in. Returns id, name, privacy, member count. Use slack_get_channel_history afterwards to read messages.",
  inputSchema: ListChannelsInput,
  outputSchema: ListChannelsOutput,
  isAvailable: userHasSlack(),
  execute: async ({ includePrivate = true, limit = 100 }, ctx) => {
    const auth = await requireSlackToken(ctx)
    if ('error' in auth) return auth
    const types = includePrivate ? 'public_channel,private_channel' : 'public_channel'
    const res = await slackCall<{
      channels?: Array<{
        id: string
        name: string
        is_private?: boolean
        num_members?: number
        topic?: { value?: string }
      }>
    }>(auth.token, 'conversations.list', { types, limit, exclude_archived: 'true' })
    if (!res.ok) return { error: `Slack list channels failed: ${res.error}` }
    const channels = (res.data.channels ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      isPrivate: !!c.is_private,
      numMembers: c.num_members,
      topic: c.topic?.value || undefined,
    }))
    return { channels, count: channels.length }
  },
  render: { icon: Hash, displayName: 'Slack — Channels' },
}

// ─── GET CHANNEL HISTORY ───────────────────────────────────────────────

const GetChannelHistoryInput = z.object({
  channelId: z.string().describe('Channel id (from slack_list_channels — e.g. C0123).'),
  limit: z.number().int().min(1).max(100).default(30).optional(),
})

const GetChannelHistoryOutput = z.union([
  z.object({
    channelId: z.string(),
    messages: z.array(
      z.object({
        user: z.string().optional(),
        userName: z.string().optional(),
        text: z.string(),
        ts: z.string(),
        threadTs: z.string().optional(),
        replyCount: z.number().optional(),
      }),
    ),
    count: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const slackGetChannelHistoryDefinition: ToolDefinition<
  z.infer<typeof GetChannelHistoryInput>,
  z.infer<typeof GetChannelHistoryOutput>
> = {
  name: 'slack_get_channel_history',
  description:
    "Read recent messages from a Slack channel. User ids are resolved to names in a single batched users.info call.",
  inputSchema: GetChannelHistoryInput,
  outputSchema: GetChannelHistoryOutput,
  isAvailable: userHasSlack(),
  execute: async ({ channelId, limit = 30 }, ctx) => {
    const auth = await requireSlackToken(ctx)
    if ('error' in auth) return auth
    const res = await slackCall<{
      messages?: Array<{
        user?: string
        text?: string
        ts?: string
        thread_ts?: string
        reply_count?: number
      }>
    }>(auth.token, 'conversations.history', { channel: channelId, limit })
    if (!res.ok) return { error: `Slack channel history failed: ${res.error}` }
    const raw = res.data.messages ?? []

    // Resolve unique user ids → display names (best-effort; continue on error).
    const userIds = [...new Set(raw.map((m) => m.user).filter((u): u is string => !!u))]
    const nameByUser: Record<string, string> = {}
    await Promise.all(
      userIds.map(async (uid) => {
        const u = await slackCall<{
          user?: { profile?: { display_name?: string; real_name?: string } }
        }>(auth.token, 'users.info', { user: uid })
        if (u.ok) {
          const p = u.data.user?.profile
          nameByUser[uid] = p?.display_name || p?.real_name || uid
        }
      }),
    )

    return {
      channelId,
      messages: raw.map((m) => ({
        user: m.user,
        userName: m.user ? nameByUser[m.user] : undefined,
        text: m.text ?? '',
        ts: m.ts ?? '',
        threadTs: m.thread_ts,
        replyCount: m.reply_count,
      })),
      count: raw.length,
    }
  },
  render: { icon: MessageSquare, displayName: 'Slack — History' },
}

// ─── GET USER ───────────────────────────────────────────────────────────

const GetUserInput = z.object({
  userId: z.string().describe('Slack user id (U0123…).'),
})

const GetUserOutput = z.union([
  z.object({
    id: z.string(),
    name: z.string().optional(),
    realName: z.string().optional(),
    title: z.string().optional(),
    email: z.string().optional(),
    timezone: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export const slackGetUserDefinition: ToolDefinition<
  z.infer<typeof GetUserInput>,
  z.infer<typeof GetUserOutput>
> = {
  name: 'slack_get_user',
  description: 'Look up a Slack user by id. Returns name, title, email, timezone.',
  inputSchema: GetUserInput,
  outputSchema: GetUserOutput,
  isAvailable: userHasSlack(),
  execute: async ({ userId }, ctx) => {
    const auth = await requireSlackToken(ctx)
    if ('error' in auth) return auth
    const res = await slackCall<{
      user?: {
        id: string
        name?: string
        real_name?: string
        tz?: string
        profile?: { email?: string; title?: string; display_name?: string; real_name?: string }
      }
    }>(auth.token, 'users.info', { user: userId })
    if (!res.ok) return { error: `Slack users.info failed: ${res.error}` }
    const u = res.data.user
    if (!u) return { error: 'User not found' }
    return {
      id: u.id,
      name: u.profile?.display_name || u.name,
      realName: u.profile?.real_name || u.real_name,
      title: u.profile?.title,
      email: u.profile?.email,
      timezone: u.tz,
    }
  },
  render: { icon: User, displayName: 'Slack — User' },
}

// ─── POST MESSAGE (destructive) ────────────────────────────────────────

const PostMessageInput = z.object({
  channelId: z
    .string()
    .describe('Channel id OR a member dm id (C0…, G0…, D0…). Not a #name.'),
  text: z.string().min(1).describe('Message body (Slack markdown supported).'),
  threadTs: z
    .string()
    .optional()
    .describe('If replying in a thread, the parent message ts.'),
})

const PostMessageOutput = z.union([
  z.object({
    posted: z.literal(true),
    channel: z.string(),
    ts: z.string(),
    permalink: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export const slackPostMessageDefinition: ToolDefinition<
  z.infer<typeof PostMessageInput>,
  z.infer<typeof PostMessageOutput>
> = {
  name: 'slack_post_message',
  description:
    'Post a message to a Slack channel or DM AS THE USER. DESTRUCTIVE — triggers an approval dialog unless the user explicitly asked to send.',
  inputSchema: PostMessageInput,
  outputSchema: PostMessageOutput,
  needsApproval: true,
  isAvailable: userHasSlack(),
  execute: async ({ channelId, text, threadTs }, ctx) => {
    const auth = await requireSlackToken(ctx)
    if ('error' in auth) return auth
    const res = await slackCall<{
      ts?: string
      channel?: string
    }>(auth.token, 'chat.postMessage', {
      channel: channelId,
      text,
      thread_ts: threadTs,
    })
    if (!res.ok) return { error: `Slack post failed: ${res.error}` }

    // Best-effort permalink lookup for the renderer.
    let permalink: string | undefined
    if (res.data.channel && res.data.ts) {
      const pl = await slackCall<{ permalink?: string }>(auth.token, 'chat.getPermalink', {
        channel: res.data.channel,
        message_ts: res.data.ts,
      })
      if (pl.ok) permalink = pl.data.permalink
    }
    return {
      posted: true as const,
      channel: res.data.channel ?? channelId,
      ts: res.data.ts ?? '',
      permalink,
    }
  },
  render: { icon: Send, displayName: 'Slack — Post' },
}

// ─── AGGREGATE ─────────────────────────────────────────────────────────

export const slackDefinitions = [
  slackSearchMessagesDefinition,
  slackListChannelsDefinition,
  slackGetChannelHistoryDefinition,
  slackGetUserDefinition,
  slackPostMessageDefinition,
] as ToolDefinition<unknown, unknown>[]

export type SlackSearchMessagesOutput = z.infer<typeof SearchMessagesOutput>
export type SlackListChannelsOutput = z.infer<typeof ListChannelsOutput>
export type SlackGetChannelHistoryOutput = z.infer<typeof GetChannelHistoryOutput>
export type SlackGetUserOutput = z.infer<typeof GetUserOutput>
export type SlackPostMessageOutput = z.infer<typeof PostMessageOutput>

export type { SlackEnv }
