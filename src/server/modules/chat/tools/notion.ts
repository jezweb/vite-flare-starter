/**
 * Notion agent tools — native Notion API integration via OAuth.
 *
 * Tools:
 *   notion_search          — POST /v1/search
 *   notion_get_page        — GET /v1/pages/:id + /v1/blocks/:id/children → markdown
 *   notion_get_database    — GET /v1/databases/:id (schema inspection)
 *   notion_query_database  — POST /v1/databases/:id/query
 *   notion_create_page     — POST /v1/pages  (destructive)
 *   notion_append_blocks   — PATCH /v1/blocks/:id/children  (destructive)
 *
 * Notion API quirks:
 *   - Every request needs a `Notion-Version` header (pin to 2022-06-28 — stable).
 *   - Blocks are recursive — we flatten one level deep to keep context sane.
 *   - Pagination uses `start_cursor`/`has_more`; we surface `nextCursor`
 *     on the output so the agent can ask for more.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import {
  Database,
  FileText,
  Plus,
  Search,
  StickyNote,
} from 'lucide-react'
import { notionTokens } from '@/server/modules/notion/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

const RECONNECT_HINT =
  'Notion needs reconnection. Ask the user to visit Connectors → Notion → Reconnect.'

interface NotionEnv {
  DB: D1Database
  NOTION_CLIENT_ID?: string
  NOTION_CLIENT_SECRET?: string
}

function notionEnvOf(ctx: AgentContext): NotionEnv {
  return ctx.env as unknown as NotionEnv
}

function isNotionEnabled(env: NotionEnv): boolean {
  return !!(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET)
}

function userHasNotion(): (ctx: AgentContext) => Promise<boolean> {
  return async (ctx) => {
    const env = notionEnvOf(ctx)
    if (!isNotionEnabled(env)) return false
    const db = drizzle(env.DB)
    const [row] = await db
      .select({ status: notionTokens.status })
      .from(notionTokens)
      .where(eq(notionTokens.userId, ctx.userId))
      .limit(1)
    return row?.status === 'active'
  }
}

async function requireNotionToken(
  ctx: AgentContext,
): Promise<{ token: string } | { error: string }> {
  const env = notionEnvOf(ctx)
  const db = drizzle(env.DB)
  const [row] = await db
    .select({ accessToken: notionTokens.accessToken, status: notionTokens.status })
    .from(notionTokens)
    .where(eq(notionTokens.userId, ctx.userId))
    .limit(1)
  if (!row) {
    return {
      error:
        'Notion is not connected for this user. Ask them to visit Connectors → Notion → Connect.',
    }
  }
  if (row.status !== 'active') return { error: RECONNECT_HINT }
  return { token: row.accessToken }
}

async function notionCall<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const resp = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await resp.text()
  if (!resp.ok) {
    try {
      const j = JSON.parse(text) as { message?: string; code?: string }
      return {
        ok: false,
        error: `Notion ${init.method ?? 'GET'} ${path}: ${j.code ?? resp.status} ${j.message ?? ''}`.trim(),
      }
    } catch {
      return { ok: false, error: `Notion ${init.method ?? 'GET'} ${path}: ${resp.status} ${text.slice(0, 120)}` }
    }
  }
  try {
    return { ok: true, data: JSON.parse(text) as T }
  } catch {
    return { ok: false, error: `Notion returned non-JSON: ${text.slice(0, 120)}` }
  }
}

// ─── TYPES ──────────────────────────────────────────────────────────────

interface NotionRichText {
  type?: string
  plain_text?: string
  text?: { content?: string }
}

interface NotionBlock {
  id: string
  type: string
  has_children?: boolean
  // dynamic shape per block type — we normalise below
  [key: string]: unknown
}

/**
 * Flatten Notion's rich-text array to plain text. Good-enough for search
 * snippets + markdown output. Preserves line breaks but drops annotations.
 */
function richTextToString(rich: unknown): string {
  if (!Array.isArray(rich)) return ''
  return rich
    .map((r: NotionRichText) => r.plain_text ?? r.text?.content ?? '')
    .join('')
}

/**
 * Extract the user-visible title from a page object. Notion's page title
 * lives on whichever property has `type === 'title'` in the properties
 * bag — could be called "Name", "Title", or anything custom.
 */
function pageTitle(page: { properties?: Record<string, unknown> }): string {
  const props = page.properties ?? {}
  for (const v of Object.values(props)) {
    const prop = v as { type?: string; title?: unknown }
    if (prop.type === 'title') return richTextToString(prop.title)
  }
  return ''
}

/** Get the title for a database row with a `title` property. */
function dbRowTitle(row: { properties?: Record<string, unknown> }): string {
  return pageTitle(row)
}

/**
 * Very-basic Notion-blocks → markdown converter. Unknown block types
 * fall through with `[type]` placeholder so the agent still sees
 * something structured.
 */
function blocksToMarkdown(blocks: NotionBlock[]): string {
  const lines: string[] = []
  for (const b of blocks) {
    const block = b as unknown as Record<string, unknown>
    const payload = block[b.type] as { rich_text?: unknown; checked?: boolean; language?: string } | undefined
    const rich = richTextToString(payload?.rich_text)
    switch (b.type) {
      case 'heading_1':
        lines.push(`# ${rich}`)
        break
      case 'heading_2':
        lines.push(`## ${rich}`)
        break
      case 'heading_3':
        lines.push(`### ${rich}`)
        break
      case 'bulleted_list_item':
        lines.push(`- ${rich}`)
        break
      case 'numbered_list_item':
        lines.push(`1. ${rich}`)
        break
      case 'to_do':
        lines.push(`- [${payload?.checked ? 'x' : ' '}] ${rich}`)
        break
      case 'quote':
        lines.push(`> ${rich}`)
        break
      case 'code':
        lines.push('```' + (payload?.language ?? ''))
        lines.push(rich)
        lines.push('```')
        break
      case 'paragraph':
        lines.push(rich || '')
        break
      case 'divider':
        lines.push('---')
        break
      default:
        lines.push(rich ? rich : `[${b.type}]`)
    }
  }
  return lines.join('\n\n').replace(/\n\n\n+/g, '\n\n').trim()
}

// ─── SEARCH ─────────────────────────────────────────────────────────────

const SearchInput = z.object({
  query: z.string().describe('Free-text search across the user\'s Notion workspace.'),
  filterBy: z
    .enum(['page', 'database'])
    .optional()
    .describe('Only return pages or only databases.'),
  pageSize: z.number().int().min(1).max(100).default(20).optional(),
})

const SearchOutput = z.union([
  z.object({
    results: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        object: z.enum(['page', 'database']),
        url: z.string(),
        lastEdited: z.string().optional(),
      }),
    ),
    count: z.number(),
    nextCursor: z.string().nullable().optional(),
  }),
  z.object({ error: z.string() }),
])

export const notionSearchDefinition: ToolDefinition<
  z.infer<typeof SearchInput>,
  z.infer<typeof SearchOutput>
> = {
  name: 'notion_search',
  description:
    "Search the user's Notion workspace for pages and databases. Returns id, title, type, url.",
  inputSchema: SearchInput,
  outputSchema: SearchOutput,
  isAvailable: userHasNotion(),
  execute: async ({ query, filterBy, pageSize = 20 }, ctx) => {
    const auth = await requireNotionToken(ctx)
    if ('error' in auth) return auth
    const body: Record<string, unknown> = { query, page_size: pageSize }
    if (filterBy) body['filter'] = { property: 'object', value: filterBy }
    const res = await notionCall<{
      results: Array<{
        object: 'page' | 'database'
        id: string
        url?: string
        last_edited_time?: string
        properties?: Record<string, unknown>
        title?: unknown
      }>
      next_cursor: string | null
    }>(auth.token, '/search', { method: 'POST', body: JSON.stringify(body) })
    if (!res.ok) return { error: res.error }
    const results = res.data.results.map((r) => ({
      id: r.id,
      title:
        r.object === 'database'
          ? richTextToString(r.title) || pageTitle(r)
          : pageTitle(r),
      object: r.object,
      url: r.url ?? '',
      lastEdited: r.last_edited_time,
    }))
    return {
      results,
      count: results.length,
      nextCursor: res.data.next_cursor,
    }
  },
  render: { icon: Search, displayName: 'Notion — Search' },
}

// ─── GET PAGE ──────────────────────────────────────────────────────────

const GetPageInput = z.object({
  pageId: z.string().describe('Notion page id (from notion_search results).'),
})

const GetPageOutput = z.union([
  z.object({
    id: z.string(),
    title: z.string(),
    url: z.string(),
    lastEdited: z.string().optional(),
    markdown: z.string(),
    hasMoreBlocks: z.boolean(),
  }),
  z.object({ error: z.string() }),
])

export const notionGetPageDefinition: ToolDefinition<
  z.infer<typeof GetPageInput>,
  z.infer<typeof GetPageOutput>
> = {
  name: 'notion_get_page',
  description:
    'Read a Notion page: returns title + body rendered as markdown (top-level blocks only; nested children are summarised).',
  inputSchema: GetPageInput,
  outputSchema: GetPageOutput,
  isAvailable: userHasNotion(),
  execute: async ({ pageId }, ctx) => {
    const auth = await requireNotionToken(ctx)
    if ('error' in auth) return auth
    const pageRes = await notionCall<{
      id: string
      url?: string
      last_edited_time?: string
      properties?: Record<string, unknown>
    }>(auth.token, `/pages/${encodeURIComponent(pageId)}`)
    if (!pageRes.ok) return { error: pageRes.error }

    const blocksRes = await notionCall<{
      results: NotionBlock[]
      has_more: boolean
    }>(auth.token, `/blocks/${encodeURIComponent(pageId)}/children?page_size=100`)
    if (!blocksRes.ok) return { error: blocksRes.error }

    return {
      id: pageRes.data.id,
      title: pageTitle(pageRes.data),
      url: pageRes.data.url ?? '',
      lastEdited: pageRes.data.last_edited_time,
      markdown: blocksToMarkdown(blocksRes.data.results),
      hasMoreBlocks: blocksRes.data.has_more,
    }
  },
  render: { icon: FileText, displayName: 'Notion — Page' },
}

// ─── GET DATABASE (schema) ────────────────────────────────────────────

const GetDatabaseInput = z.object({
  databaseId: z.string().describe('Notion database id.'),
})

const GetDatabaseOutput = z.union([
  z.object({
    id: z.string(),
    title: z.string(),
    url: z.string(),
    properties: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        options: z.array(z.string()).optional(),
      }),
    ),
  }),
  z.object({ error: z.string() }),
])

export const notionGetDatabaseDefinition: ToolDefinition<
  z.infer<typeof GetDatabaseInput>,
  z.infer<typeof GetDatabaseOutput>
> = {
  name: 'notion_get_database',
  description:
    'Inspect a Notion database schema — returns all property names, types, and select/multi-select options. Useful before querying.',
  inputSchema: GetDatabaseInput,
  outputSchema: GetDatabaseOutput,
  isAvailable: userHasNotion(),
  execute: async ({ databaseId }, ctx) => {
    const auth = await requireNotionToken(ctx)
    if ('error' in auth) return auth
    const res = await notionCall<{
      id: string
      url?: string
      title?: unknown
      properties?: Record<
        string,
        {
          type: string
          select?: { options?: Array<{ name: string }> }
          multi_select?: { options?: Array<{ name: string }> }
          status?: { options?: Array<{ name: string }> }
        }
      >
    }>(auth.token, `/databases/${encodeURIComponent(databaseId)}`)
    if (!res.ok) return { error: res.error }
    const properties = Object.entries(res.data.properties ?? {}).map(
      ([name, prop]) => ({
        name,
        type: prop.type,
        options:
          prop.select?.options?.map((o) => o.name) ??
          prop.multi_select?.options?.map((o) => o.name) ??
          prop.status?.options?.map((o) => o.name),
      }),
    )
    return {
      id: res.data.id,
      title: richTextToString(res.data.title),
      url: res.data.url ?? '',
      properties,
    }
  },
  render: { icon: Database, displayName: 'Notion — Database' },
}

// ─── QUERY DATABASE ───────────────────────────────────────────────────

const QueryDatabaseInput = z.object({
  databaseId: z.string(),
  filter: z.unknown().optional().describe('Notion filter object (see API docs).'),
  sorts: z.unknown().optional().describe('Notion sort array.'),
  pageSize: z.number().int().min(1).max(100).default(20).optional(),
})

const QueryDatabaseOutput = z.union([
  z.object({
    rows: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string(),
        properties: z.record(z.string(), z.string()),
      }),
    ),
    count: z.number(),
    nextCursor: z.string().nullable().optional(),
  }),
  z.object({ error: z.string() }),
])

export const notionQueryDatabaseDefinition: ToolDefinition<
  z.infer<typeof QueryDatabaseInput>,
  z.infer<typeof QueryDatabaseOutput>
> = {
  name: 'notion_query_database',
  description:
    'Query a Notion database with filter + sort. Returns rows with properties projected to a flat string map.',
  inputSchema: QueryDatabaseInput,
  outputSchema: QueryDatabaseOutput,
  isAvailable: userHasNotion(),
  execute: async ({ databaseId, filter, sorts, pageSize = 20 }, ctx) => {
    const auth = await requireNotionToken(ctx)
    if ('error' in auth) return auth
    const body: Record<string, unknown> = { page_size: pageSize }
    if (filter) body['filter'] = filter
    if (sorts) body['sorts'] = sorts
    const res = await notionCall<{
      results: Array<{
        id: string
        url?: string
        properties?: Record<string, unknown>
      }>
      next_cursor: string | null
    }>(auth.token, `/databases/${encodeURIComponent(databaseId)}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!res.ok) return { error: res.error }

    const rows = res.data.results.map((r) => {
      const flat: Record<string, string> = {}
      for (const [name, prop] of Object.entries(r.properties ?? {})) {
        flat[name] = projectProperty(prop)
      }
      return {
        id: r.id,
        title: dbRowTitle(r),
        url: r.url ?? '',
        properties: flat,
      }
    })
    return { rows, count: rows.length, nextCursor: res.data.next_cursor }
  },
  render: { icon: Database, displayName: 'Notion — Query' },
}

/**
 * Flatten a Notion property to a single string. Handles the common
 * types; falls back to JSON for anything obscure (relations, etc.).
 */
function projectProperty(prop: unknown): string {
  const p = prop as {
    type?: string
    title?: unknown
    rich_text?: unknown
    number?: number
    select?: { name?: string }
    multi_select?: Array<{ name?: string }>
    status?: { name?: string }
    date?: { start?: string; end?: string }
    checkbox?: boolean
    url?: string
    email?: string
    phone_number?: string
    people?: Array<{ name?: string }>
  }
  switch (p.type) {
    case 'title':
      return richTextToString(p.title)
    case 'rich_text':
      return richTextToString(p.rich_text)
    case 'number':
      return p.number != null ? String(p.number) : ''
    case 'select':
      return p.select?.name ?? ''
    case 'multi_select':
      return (p.multi_select ?? []).map((s) => s.name).filter(Boolean).join(', ')
    case 'status':
      return p.status?.name ?? ''
    case 'date':
      return p.date?.start
        ? p.date.end
          ? `${p.date.start} → ${p.date.end}`
          : p.date.start
        : ''
    case 'checkbox':
      return p.checkbox ? 'true' : 'false'
    case 'url':
      return p.url ?? ''
    case 'email':
      return p.email ?? ''
    case 'phone_number':
      return p.phone_number ?? ''
    case 'people':
      return (p.people ?? []).map((pp) => pp.name).filter(Boolean).join(', ')
    default:
      return ''
  }
}

// ─── CREATE PAGE (destructive) ────────────────────────────────────────

const CreatePageInput = z.object({
  parent: z
    .object({
      databaseId: z.string().optional(),
      pageId: z.string().optional(),
    })
    .describe('Parent location — either databaseId (add a row) or pageId (add a child page).'),
  title: z.string().describe('Page title (plain text).'),
  body: z
    .string()
    .optional()
    .describe('Optional body as markdown. Headings / lists / paragraphs / code blocks supported.'),
})

const CreatePageOutput = z.union([
  z.object({
    created: z.literal(true),
    id: z.string(),
    url: z.string(),
  }),
  z.object({ error: z.string() }),
])

export const notionCreatePageDefinition: ToolDefinition<
  z.infer<typeof CreatePageInput>,
  z.infer<typeof CreatePageOutput>
> = {
  name: 'notion_create_page',
  description:
    'Create a new Notion page under a database (as a new row) or under an existing page. DESTRUCTIVE — triggers approval.',
  inputSchema: CreatePageInput,
  outputSchema: CreatePageOutput,
  needsApproval: true,
  isAvailable: userHasNotion(),
  execute: async ({ parent, title, body }, ctx) => {
    const auth = await requireNotionToken(ctx)
    if ('error' in auth) return auth
    if (!parent.databaseId && !parent.pageId) {
      return { error: 'parent.databaseId OR parent.pageId is required.' }
    }
    const parentPayload = parent.databaseId
      ? { database_id: parent.databaseId }
      : { page_id: parent.pageId! }
    const properties = parent.databaseId
      ? { title: { title: [{ type: 'text', text: { content: title } }] } }
      : { title: [{ type: 'text', text: { content: title } }] }
    const children = body ? markdownToBlocks(body) : []
    const res = await notionCall<{ id: string; url?: string }>(
      auth.token,
      '/pages',
      {
        method: 'POST',
        body: JSON.stringify({ parent: parentPayload, properties, children }),
      },
    )
    if (!res.ok) return { error: res.error }
    return { created: true as const, id: res.data.id, url: res.data.url ?? '' }
  },
  render: { icon: Plus, displayName: 'Notion — Create' },
}

// ─── APPEND BLOCKS (destructive) ──────────────────────────────────────

const AppendBlocksInput = z.object({
  blockId: z.string().describe('Parent block or page id to append to.'),
  markdown: z.string().describe('Markdown content — converted to blocks.'),
})

const AppendBlocksOutput = z.union([
  z.object({ appended: z.literal(true), count: z.number() }),
  z.object({ error: z.string() }),
])

export const notionAppendBlocksDefinition: ToolDefinition<
  z.infer<typeof AppendBlocksInput>,
  z.infer<typeof AppendBlocksOutput>
> = {
  name: 'notion_append_blocks',
  description:
    'Append markdown content to an existing Notion page or block. DESTRUCTIVE — triggers approval.',
  inputSchema: AppendBlocksInput,
  outputSchema: AppendBlocksOutput,
  needsApproval: true,
  isAvailable: userHasNotion(),
  execute: async ({ blockId, markdown }, ctx) => {
    const auth = await requireNotionToken(ctx)
    if ('error' in auth) return auth
    const children = markdownToBlocks(markdown)
    const res = await notionCall<{ results?: unknown[] }>(
      auth.token,
      `/blocks/${encodeURIComponent(blockId)}/children`,
      { method: 'PATCH', body: JSON.stringify({ children }) },
    )
    if (!res.ok) return { error: res.error }
    return { appended: true as const, count: children.length }
  },
  render: { icon: StickyNote, displayName: 'Notion — Append' },
}

/**
 * Basic markdown → Notion blocks. Handles headings, lists, code fences,
 * block quotes, and paragraphs. Inline formatting (bold, links) is
 * passed through as plain text for simplicity — acceptable for the
 * stub-tier integration.
 */
function markdownToBlocks(md: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = []
  const lines = md.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    // Fenced code block
    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!)
        i++
      }
      i++ // skip closing fence
      blocks.push({
        type: 'code',
        code: {
          rich_text: [{ type: 'text', text: { content: codeLines.join('\n') } }],
          language: language || 'plain text',
        },
      })
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push(headingBlock(3, line.slice(4)))
    } else if (line.startsWith('## ')) {
      blocks.push(headingBlock(2, line.slice(3)))
    } else if (line.startsWith('# ')) {
      blocks.push(headingBlock(1, line.slice(2)))
    } else if (/^[-*] /.test(line)) {
      blocks.push({
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: line.slice(2) } }],
        },
      })
    } else if (/^\d+\. /.test(line)) {
      blocks.push({
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{ type: 'text', text: { content: line.replace(/^\d+\. /, '') } }],
        },
      })
    } else if (line.startsWith('> ')) {
      blocks.push({
        type: 'quote',
        quote: {
          rich_text: [{ type: 'text', text: { content: line.slice(2) } }],
        },
      })
    } else {
      blocks.push({
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: line } }],
        },
      })
    }
    i++
  }
  return blocks
}

function headingBlock(level: 1 | 2 | 3, text: string): Record<string, unknown> {
  const type = `heading_${level}`
  return {
    type,
    [type]: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  }
}

// ─── AGGREGATE ─────────────────────────────────────────────────────────

export const notionDefinitions = [
  notionSearchDefinition,
  notionGetPageDefinition,
  notionGetDatabaseDefinition,
  notionQueryDatabaseDefinition,
  notionCreatePageDefinition,
  notionAppendBlocksDefinition,
] as ToolDefinition<unknown, unknown>[]

export type NotionSearchOutput = z.infer<typeof SearchOutput>
export type NotionGetPageOutput = z.infer<typeof GetPageOutput>
export type NotionGetDatabaseOutput = z.infer<typeof GetDatabaseOutput>
export type NotionQueryDatabaseOutput = z.infer<typeof QueryDatabaseOutput>
export type NotionCreatePageOutput = z.infer<typeof CreatePageOutput>
export type NotionAppendBlocksOutput = z.infer<typeof AppendBlocksOutput>

export type { NotionEnv }
