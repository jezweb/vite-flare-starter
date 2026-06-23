/**
 * Atlassian agent tools — Jira + Confluence via OAuth 2.0 (3LO).
 *
 * Jira (5): search, get, create, add_comment, transition.
 * Confluence (3): search, get_page, create_page.
 *
 * Jira body fields use ADF (Atlassian Document Format). Confluence
 * storage format is XHTML. Minimal converters cover the common cases;
 * complex formatting passes through as plain text.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import {
  CheckSquare,
  FileText,
  MessageSquarePlus,
  MoveRight,
  Plus,
  Search,
  Ticket,
} from 'lucide-react'
import { atlassianTokens } from '@/server/modules/atlassian/db/schema'
import { decrypt } from '@/server/lib/crypto'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

const ATLASSIAN_API = 'https://api.atlassian.com'
const RECONNECT_HINT =
  'Atlassian needs reconnection. Ask the user to visit Connectors → Atlassian → Reconnect.'

interface AtlassianEnv {
  DB: D1Database
  ATLASSIAN_CLIENT_ID?: string
  ATLASSIAN_CLIENT_SECRET?: string
  TOKEN_ENCRYPTION_KEY?: string
}

function aEnv(ctx: AgentContext): AtlassianEnv {
  return ctx.env as unknown as AtlassianEnv
}

function isAtlassianEnabled(env: AtlassianEnv): boolean {
  return !!(env.ATLASSIAN_CLIENT_ID && env.ATLASSIAN_CLIENT_SECRET)
}

function userHasAtlassian(): (ctx: AgentContext) => Promise<boolean> {
  return async (ctx) => {
    const env = aEnv(ctx)
    if (!isAtlassianEnabled(env)) return false
    const db = drizzle(env.DB)
    const [row] = await db
      .select({
        status: atlassianTokens.status,
        cloudId: atlassianTokens.accountIdentifier,
      })
      .from(atlassianTokens)
      .where(eq(atlassianTokens.userId, ctx.userId))
      .limit(1)
    return !!row && row.status === 'active' && !!row.cloudId
  }
}

async function requireAtlassianAuth(
  ctx: AgentContext
): Promise<{ token: string; cloudId: string } | { error: string }> {
  const env = aEnv(ctx)
  const db = drizzle(env.DB)
  const [row] = await db
    .select({
      accessToken: atlassianTokens.accessToken,
      status: atlassianTokens.status,
      cloudId: atlassianTokens.accountIdentifier,
    })
    .from(atlassianTokens)
    .where(eq(atlassianTokens.userId, ctx.userId))
    .limit(1)
  if (!row) {
    return {
      error:
        'Atlassian is not connected for this user. Ask them to visit Connectors → Atlassian → Connect.',
    }
  }
  if (row.status !== 'active') return { error: RECONNECT_HINT }
  if (!row.cloudId) {
    return {
      error: 'Atlassian cloud site was not captured during connect. Ask the user to reconnect.',
    }
  }
  // Tokens are stored AES-GCM encrypted (stub-provider callback). Decrypt
  // before use — sending the ciphertext as a Bearer token authenticates nothing.
  const token = await decrypt(row.accessToken, env.TOKEN_ENCRYPTION_KEY)
  if (!token) return { error: RECONNECT_HINT }
  return { token, cloudId: row.cloudId }
}

async function atlassianCall<T>(
  token: string,
  url: string,
  init: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await resp.text()
  if (!resp.ok) {
    return {
      ok: false,
      error: `Atlassian ${init.method ?? 'GET'} ${resp.status}: ${text.slice(0, 200)}`,
    }
  }
  if (!text) return { ok: true, data: {} as T }
  try {
    return { ok: true, data: JSON.parse(text) as T }
  } catch {
    return { ok: false, error: `Atlassian returned non-JSON: ${text.slice(0, 120)}` }
  }
}

const jiraPath = (cloudId: string, rest: string) =>
  `${ATLASSIAN_API}/ex/jira/${cloudId}/rest/api/3${rest}`
const confluencePath = (cloudId: string, rest: string) =>
  `${ATLASSIAN_API}/ex/confluence/${cloudId}/wiki/api/v2${rest}`

// ─── ADF ↔ MARKDOWN (minimal) ──────────────────────────────────────────

interface ADFNode {
  type: string
  content?: ADFNode[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

export function adfToMarkdown(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return ''
  const doc = adf as ADFNode
  if (doc.type !== 'doc' || !Array.isArray(doc.content)) return ''
  return doc.content.map(renderAdfBlock).filter(Boolean).join('\n\n').trim()
}

function renderAdfBlock(node: ADFNode): string {
  switch (node.type) {
    case 'paragraph':
      return renderInline(node.content)
    case 'heading': {
      const level = Math.min(6, Math.max(1, (node.attrs?.['level'] as number) ?? 1))
      return `${'#'.repeat(level)} ${renderInline(node.content)}`
    }
    case 'bulletList':
      return (node.content ?? [])
        .map((li) => `- ${renderInline(li.content?.[0]?.content)}`)
        .join('\n')
    case 'orderedList':
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ${renderInline(li.content?.[0]?.content)}`)
        .join('\n')
    case 'codeBlock':
      return (
        '```' +
        ((node.attrs?.['language'] as string) ?? '') +
        '\n' +
        renderInline(node.content) +
        '\n```'
      )
    case 'blockquote':
      return (node.content ?? []).map((b) => `> ${renderAdfBlock(b)}`).join('\n')
    case 'rule':
      return '---'
    case 'hardBreak':
      return '\n'
    default:
      return renderInline(node.content)
  }
}

function renderInline(content: ADFNode[] | undefined): string {
  if (!content) return ''
  return content
    .map((n) => {
      if (n.type === 'text') {
        let t = n.text ?? ''
        for (const mark of n.marks ?? []) {
          if (mark.type === 'code') t = `\`${t}\``
          else if (mark.type === 'strong') t = `**${t}**`
          else if (mark.type === 'em') t = `*${t}*`
          else if (mark.type === 'link' && mark.attrs?.['href']) {
            t = `[${t}](${mark.attrs['href']})`
          }
        }
        return t
      }
      if (n.type === 'hardBreak') return '\n'
      return renderInline(n.content)
    })
    .join('')
}

export function markdownToAdf(md: string): ADFNode {
  const lines = md.split('\n')
  const content: ADFNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        code.push(lines[i]!)
        i++
      }
      i++
      content.push({
        type: 'codeBlock',
        attrs: language ? { language } : undefined,
        content: [{ type: 'text', text: code.join('\n') }],
      })
      continue
    }
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (m) {
      content.push({
        type: 'heading',
        attrs: { level: m[1]!.length },
        content: [{ type: 'text', text: m[2]! }],
      })
      i++
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const items: ADFNode[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: lines[i]!.replace(/^[-*]\s+/, '') }],
            },
          ],
        })
        i++
      }
      content.push({ type: 'bulletList', content: items })
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: ADFNode[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: lines[i]!.replace(/^\d+\.\s+/, '') }],
            },
          ],
        })
        i++
      }
      content.push({ type: 'orderedList', content: items })
      continue
    }
    if (line.startsWith('> ')) {
      content.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: line.slice(2) }] }],
      })
      i++
      continue
    }
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i]!.trim() && !/^(#|[-*]\s|>\s|\d+\.\s|```)/.test(lines[i]!)) {
      para.push(lines[i]!)
      i++
    }
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: para.join(' ') }],
    })
  }
  return { type: 'doc', version: 1, content } as ADFNode & { version: number }
}

// ─── Confluence storage (XHTML) helpers ────────────────────────────────

export function xhtmlToMarkdown(xhtml: string): string {
  if (!xhtml) return ''
  let md = xhtml
  md = md.replace(/<br\s*\/?>/gi, '\n')
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
  md = md.replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, '**$2**')
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, '*$2*')
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
  md = md.replace(
    /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, text) => `[${text}](${href})`
  )
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
  md = md.replace(/<[^>]+>/g, '')
  md = md
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  return md.replace(/\n{3,}/g, '\n\n').trim()
}

export function markdownToXhtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        code.push(lines[i]!)
        i++
      }
      i++
      out.push(`<pre><code>${escapeXml(code.join('\n'))}</code></pre>`)
      continue
    }
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (m) {
      const level = m[1]!.length
      out.push(`<h${level}>${escapeXml(m[2]!)}</h${level}>`)
      i++
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        items.push(`<li>${escapeXml(lines[i]!.replace(/^[-*]\s+/, ''))}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push(`<li>${escapeXml(lines[i]!.replace(/^\d+\.\s+/, ''))}</li>`)
        i++
      }
      out.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    out.push(`<p>${escapeXml(line)}</p>`)
    i++
  }
  return out.join('\n')
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function siteBrowseUrl(_self: string | undefined, key: string): string {
  if (!key) return ''
  return `https://jira.atlassian.com/browse/${key}`
}

// ─── JIRA: SEARCH ISSUES ───────────────────────────────────────────────

const JiraSearchInput = z.object({
  jql: z
    .string()
    .describe(
      'JQL query (e.g. "assignee = currentUser() AND status != Done ORDER BY updated DESC").'
    ),
  maxResults: z.number().int().min(1).max(50).default(20).optional(),
})

const JiraSearchOutput = z.union([
  z.object({
    issues: z.array(
      z.object({
        key: z.string(),
        summary: z.string(),
        status: z.string().optional(),
        assignee: z.string().optional(),
        priority: z.string().optional(),
        updated: z.string().optional(),
        url: z.string(),
      })
    ),
    count: z.number(),
    total: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const jiraSearchIssuesDefinition: ToolDefinition<
  z.infer<typeof JiraSearchInput>,
  z.infer<typeof JiraSearchOutput>
> = {
  name: 'jira_search_issues',
  description:
    'Search Jira with JQL. Returns key, summary, status, assignee, priority, updated, url.',
  inputSchema: JiraSearchInput,
  outputSchema: JiraSearchOutput,
  isAvailable: userHasAtlassian(),
  execute: async ({ jql, maxResults = 20 }, ctx) => {
    const auth = await requireAtlassianAuth(ctx)
    if ('error' in auth) return auth
    const url = new URL(jiraPath(auth.cloudId, '/search'))
    url.searchParams.set('jql', jql)
    url.searchParams.set('maxResults', String(maxResults))
    url.searchParams.set('fields', 'summary,status,assignee,priority,updated')
    const res = await atlassianCall<{
      issues: Array<{
        key: string
        self: string
        fields: {
          summary?: string
          status?: { name?: string }
          assignee?: { displayName?: string }
          priority?: { name?: string }
          updated?: string
        }
      }>
      total: number
    }>(auth.token, url.toString())
    if (!res.ok) return { error: res.error }
    const issues = res.data.issues.map((it) => ({
      key: it.key,
      summary: it.fields.summary ?? '',
      status: it.fields.status?.name,
      assignee: it.fields.assignee?.displayName,
      priority: it.fields.priority?.name,
      updated: it.fields.updated,
      url: siteBrowseUrl(it.self, it.key),
    }))
    return { issues, count: issues.length, total: res.data.total }
  },
  render: { icon: Search, displayName: 'Jira — Search' },
}

// ─── JIRA: GET ISSUE ──────────────────────────────────────────────────

const JiraGetInput = z.object({
  keyOrId: z.string().describe('Issue key (e.g. PROJ-123) or numeric id.'),
})

const JiraGetOutput = z.union([
  z.object({
    key: z.string(),
    summary: z.string(),
    status: z.string().optional(),
    assignee: z.string().optional(),
    reporter: z.string().optional(),
    priority: z.string().optional(),
    issueType: z.string().optional(),
    description: z.string(),
    updated: z.string().optional(),
    commentCount: z.number().optional(),
    url: z.string(),
  }),
  z.object({ error: z.string() }),
])

export const jiraGetIssueDefinition: ToolDefinition<
  z.infer<typeof JiraGetInput>,
  z.infer<typeof JiraGetOutput>
> = {
  name: 'jira_get_issue',
  description:
    'Read a Jira issue including description (ADF rendered as markdown), status, assignee, comment count.',
  inputSchema: JiraGetInput,
  outputSchema: JiraGetOutput,
  isAvailable: userHasAtlassian(),
  execute: async ({ keyOrId }, ctx) => {
    const auth = await requireAtlassianAuth(ctx)
    if ('error' in auth) return auth
    const res = await atlassianCall<{
      key: string
      self: string
      fields: {
        summary?: string
        status?: { name?: string }
        assignee?: { displayName?: string }
        reporter?: { displayName?: string }
        priority?: { name?: string }
        issuetype?: { name?: string }
        description?: unknown
        updated?: string
        comment?: { total?: number }
      }
    }>(auth.token, jiraPath(auth.cloudId, `/issue/${encodeURIComponent(keyOrId)}`))
    if (!res.ok) return { error: res.error }
    const f = res.data.fields
    return {
      key: res.data.key,
      summary: f.summary ?? '',
      status: f.status?.name,
      assignee: f.assignee?.displayName,
      reporter: f.reporter?.displayName,
      priority: f.priority?.name,
      issueType: f.issuetype?.name,
      description: adfToMarkdown(f.description) || '',
      updated: f.updated,
      commentCount: f.comment?.total,
      url: siteBrowseUrl(res.data.self, res.data.key),
    }
  },
  render: { icon: Ticket, displayName: 'Jira — Issue' },
}

// ─── JIRA: CREATE ISSUE (destructive) ─────────────────────────────────

const JiraCreateInput = z.object({
  projectKey: z.string().describe('Jira project key (e.g. PROJ).'),
  issueType: z.string().default('Task').optional(),
  summary: z.string().min(1),
  description: z.string().optional().describe('Markdown body.'),
  assignee: z.string().optional().describe('Account id of assignee.'),
})

const JiraCreateOutput = z.union([
  z.object({ created: z.literal(true), key: z.string(), id: z.string(), url: z.string() }),
  z.object({ error: z.string() }),
])

export const jiraCreateIssueDefinition: ToolDefinition<
  z.infer<typeof JiraCreateInput>,
  z.infer<typeof JiraCreateOutput>
> = {
  name: 'jira_create_issue',
  description: 'Create a Jira issue. DESTRUCTIVE — triggers approval dialog.',
  inputSchema: JiraCreateInput,
  outputSchema: JiraCreateOutput,
  needsApproval: true,
  isAvailable: userHasAtlassian(),
  execute: async ({ projectKey, issueType = 'Task', summary, description, assignee }, ctx) => {
    const auth = await requireAtlassianAuth(ctx)
    if ('error' in auth) return auth
    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
    }
    if (description) fields['description'] = markdownToAdf(description)
    if (assignee) fields['assignee'] = { accountId: assignee }
    const res = await atlassianCall<{ key: string; id: string }>(
      auth.token,
      jiraPath(auth.cloudId, '/issue'),
      { method: 'POST', body: JSON.stringify({ fields }) }
    )
    if (!res.ok) return { error: res.error }
    return {
      created: true as const,
      key: res.data.key,
      id: res.data.id,
      url: siteBrowseUrl(undefined, res.data.key),
    }
  },
  render: { icon: Plus, displayName: 'Jira — Create' },
}

// ─── JIRA: ADD COMMENT (destructive) ──────────────────────────────────

const JiraCommentInput = z.object({
  keyOrId: z.string(),
  body: z.string().describe('Comment body in markdown.'),
})

const JiraCommentOutput = z.union([
  z.object({ commented: z.literal(true), id: z.string() }),
  z.object({ error: z.string() }),
])

export const jiraAddCommentDefinition: ToolDefinition<
  z.infer<typeof JiraCommentInput>,
  z.infer<typeof JiraCommentOutput>
> = {
  name: 'jira_add_comment',
  description: 'Add a comment to a Jira issue. DESTRUCTIVE — triggers approval.',
  inputSchema: JiraCommentInput,
  outputSchema: JiraCommentOutput,
  needsApproval: true,
  isAvailable: userHasAtlassian(),
  execute: async ({ keyOrId, body }, ctx) => {
    const auth = await requireAtlassianAuth(ctx)
    if ('error' in auth) return auth
    const res = await atlassianCall<{ id: string }>(
      auth.token,
      jiraPath(auth.cloudId, `/issue/${encodeURIComponent(keyOrId)}/comment`),
      { method: 'POST', body: JSON.stringify({ body: markdownToAdf(body) }) }
    )
    if (!res.ok) return { error: res.error }
    return { commented: true as const, id: res.data.id }
  },
  render: { icon: MessageSquarePlus, displayName: 'Jira — Comment' },
}

// ─── JIRA: TRANSITION ISSUE (destructive) ─────────────────────────────

const JiraTransitionInput = z.object({
  keyOrId: z.string(),
  transitionId: z
    .string()
    .optional()
    .describe('Transition id. If omitted, returns the list of available transitions.'),
})

const JiraTransitionOutput = z.union([
  z.object({ transitioned: z.literal(true), transitionId: z.string() }),
  z.object({
    availableTransitions: z.array(
      z.object({ id: z.string(), name: z.string(), toStatus: z.string().optional() })
    ),
  }),
  z.object({ error: z.string() }),
])

export const jiraTransitionIssueDefinition: ToolDefinition<
  z.infer<typeof JiraTransitionInput>,
  z.infer<typeof JiraTransitionOutput>
> = {
  name: 'jira_transition_issue',
  description:
    'Transition a Jira issue (e.g. move to Done). DESTRUCTIVE. Call without `transitionId` first to list available transitions, then call again with the chosen id.',
  inputSchema: JiraTransitionInput,
  outputSchema: JiraTransitionOutput,
  needsApproval: true,
  isAvailable: userHasAtlassian(),
  execute: async ({ keyOrId, transitionId }, ctx) => {
    const auth = await requireAtlassianAuth(ctx)
    if ('error' in auth) return auth
    if (!transitionId) {
      const list = await atlassianCall<{
        transitions: Array<{ id: string; name: string; to?: { name?: string } }>
      }>(auth.token, jiraPath(auth.cloudId, `/issue/${encodeURIComponent(keyOrId)}/transitions`))
      if (!list.ok) return { error: list.error }
      return {
        availableTransitions: list.data.transitions.map((t) => ({
          id: t.id,
          name: t.name,
          toStatus: t.to?.name,
        })),
      }
    }
    const res = await atlassianCall<unknown>(
      auth.token,
      jiraPath(auth.cloudId, `/issue/${encodeURIComponent(keyOrId)}/transitions`),
      { method: 'POST', body: JSON.stringify({ transition: { id: transitionId } }) }
    )
    if (!res.ok) return { error: res.error }
    return { transitioned: true as const, transitionId }
  },
  render: { icon: MoveRight, displayName: 'Jira — Transition' },
}

// ─── CONFLUENCE: SEARCH ───────────────────────────────────────────────

const ConfluenceSearchInput = z.object({
  query: z.string().describe('Title or partial title search.'),
  limit: z.number().int().min(1).max(100).default(20).optional(),
})

const ConfluenceSearchOutput = z.union([
  z.object({
    pages: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        spaceId: z.string().optional(),
        url: z.string().optional(),
      })
    ),
    count: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const confluenceSearchDefinition: ToolDefinition<
  z.infer<typeof ConfluenceSearchInput>,
  z.infer<typeof ConfluenceSearchOutput>
> = {
  name: 'confluence_search',
  description: 'Search Confluence pages by title (Cloud v2 API).',
  inputSchema: ConfluenceSearchInput,
  outputSchema: ConfluenceSearchOutput,
  isAvailable: userHasAtlassian(),
  execute: async ({ query, limit = 20 }, ctx) => {
    const auth = await requireAtlassianAuth(ctx)
    if ('error' in auth) return auth
    const url = new URL(confluencePath(auth.cloudId, '/pages'))
    url.searchParams.set('title', query)
    url.searchParams.set('limit', String(limit))
    const res = await atlassianCall<{
      results: Array<{
        id: string
        title: string
        spaceId?: string
        _links?: { webui?: string }
      }>
    }>(auth.token, url.toString())
    if (!res.ok) return { error: res.error }
    const pages = res.data.results.map((p) => ({
      id: p.id,
      title: p.title,
      spaceId: p.spaceId,
      url: p._links?.webui,
    }))
    return { pages, count: pages.length }
  },
  render: { icon: Search, displayName: 'Confluence — Search' },
}

// ─── CONFLUENCE: GET PAGE ─────────────────────────────────────────────

const ConfluenceGetInput = z.object({
  pageId: z.string(),
})

const ConfluenceGetOutput = z.union([
  z.object({
    id: z.string(),
    title: z.string(),
    spaceId: z.string().optional(),
    markdown: z.string(),
    url: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export const confluenceGetPageDefinition: ToolDefinition<
  z.infer<typeof ConfluenceGetInput>,
  z.infer<typeof ConfluenceGetOutput>
> = {
  name: 'confluence_get_page',
  description: 'Read a Confluence page — returns body as markdown (basic XHTML → md conversion).',
  inputSchema: ConfluenceGetInput,
  outputSchema: ConfluenceGetOutput,
  isAvailable: userHasAtlassian(),
  execute: async ({ pageId }, ctx) => {
    const auth = await requireAtlassianAuth(ctx)
    if ('error' in auth) return auth
    const url = new URL(confluencePath(auth.cloudId, `/pages/${encodeURIComponent(pageId)}`))
    url.searchParams.set('body-format', 'storage')
    const res = await atlassianCall<{
      id: string
      title: string
      spaceId?: string
      body?: { storage?: { value?: string } }
      _links?: { webui?: string }
    }>(auth.token, url.toString())
    if (!res.ok) return { error: res.error }
    return {
      id: res.data.id,
      title: res.data.title,
      spaceId: res.data.spaceId,
      markdown: xhtmlToMarkdown(res.data.body?.storage?.value ?? ''),
      url: res.data._links?.webui,
    }
  },
  render: { icon: FileText, displayName: 'Confluence — Page' },
}

// ─── CONFLUENCE: CREATE PAGE (destructive) ────────────────────────────

const ConfluenceCreateInput = z.object({
  spaceId: z.string().describe('Confluence space id.'),
  title: z.string().min(1),
  body: z.string().describe('Page body in markdown.'),
  parentId: z.string().optional().describe('Optional parent page id.'),
})

const ConfluenceCreateOutput = z.union([
  z.object({ created: z.literal(true), id: z.string(), url: z.string().optional() }),
  z.object({ error: z.string() }),
])

export const confluenceCreatePageDefinition: ToolDefinition<
  z.infer<typeof ConfluenceCreateInput>,
  z.infer<typeof ConfluenceCreateOutput>
> = {
  name: 'confluence_create_page',
  description: 'Create a Confluence page in a space. DESTRUCTIVE — triggers approval.',
  inputSchema: ConfluenceCreateInput,
  outputSchema: ConfluenceCreateOutput,
  needsApproval: true,
  isAvailable: userHasAtlassian(),
  execute: async ({ spaceId, title, body, parentId }, ctx) => {
    const auth = await requireAtlassianAuth(ctx)
    if ('error' in auth) return auth
    const payload: Record<string, unknown> = {
      spaceId,
      status: 'current',
      title,
      body: {
        representation: 'storage',
        value: markdownToXhtml(body),
      },
    }
    if (parentId) payload['parentId'] = parentId
    const res = await atlassianCall<{ id: string; _links?: { webui?: string } }>(
      auth.token,
      confluencePath(auth.cloudId, '/pages'),
      { method: 'POST', body: JSON.stringify(payload) }
    )
    if (!res.ok) return { error: res.error }
    return {
      created: true as const,
      id: res.data.id,
      url: res.data._links?.webui,
    }
  },
  render: { icon: CheckSquare, displayName: 'Confluence — Create' },
}

// ─── AGGREGATE ─────────────────────────────────────────────────────────

export const atlassianDefinitions = [
  jiraSearchIssuesDefinition,
  jiraGetIssueDefinition,
  jiraCreateIssueDefinition,
  jiraAddCommentDefinition,
  jiraTransitionIssueDefinition,
  confluenceSearchDefinition,
  confluenceGetPageDefinition,
  confluenceCreatePageDefinition,
] as ToolDefinition<unknown, unknown>[]

export type JiraSearchOutput = z.infer<typeof JiraSearchOutput>
export type JiraGetOutput = z.infer<typeof JiraGetOutput>
export type JiraCreateOutput = z.infer<typeof JiraCreateOutput>
export type JiraCommentOutput = z.infer<typeof JiraCommentOutput>
export type JiraTransitionOutput = z.infer<typeof JiraTransitionOutput>
export type ConfluenceSearchOutput = z.infer<typeof ConfluenceSearchOutput>
export type ConfluenceGetOutput = z.infer<typeof ConfluenceGetOutput>
export type ConfluenceCreateOutput = z.infer<typeof ConfluenceCreateOutput>
