/**
 * Projects API — first-class workspaces with org awareness, starring,
 * memory mode, AI-assisted scaffolding, and template instantiation.
 *
 * Endpoints:
 *   GET    /api/projects                  — list active projects
 *   GET    /api/projects/:id              — single project + conversations
 *   POST   /api/projects                  — create blank/from-fields
 *   POST   /api/projects/from-template    — create from a bundled template
 *   POST   /api/projects/scaffold         — AI-assisted draft (preview, no save)
 *   POST   /api/projects/from-scaffold    — create from a saved scaffold draft
 *   PATCH  /api/projects/:id              — update fields (name, sysprompt, etc.)
 *   DELETE /api/projects/:id              — delete (chats survive via SET NULL)
 *   POST   /api/projects/:id/star         — star
 *   DELETE /api/projects/:id/star         — unstar
 *   POST   /api/projects/:id/archive      — archive
 *   DELETE /api/projects/:id/archive      — restore
 *   GET    /api/projects/templates        — list bundled templates
 *
 * See `.jez/artifacts/projects-first-class-plan-2026-04-26.md`.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, sql } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { projects } from './db/schema'
import membershipRoutes, { isProjectMember } from './membership'
import { conversations } from '@/server/modules/conversations/db/schema'
import { memories } from '@/server/modules/memories/db/schema'
import { PROJECT_TEMPLATES, getTemplate } from '@/shared/config/project-templates'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

// ---------------------------------------------------------------------------
// LIST + GET
// ---------------------------------------------------------------------------

/**
 * GET /api/projects — list user's active projects with conversation counts.
 *
 * Returns ordered by starred DESC, position ASC, then updatedAt DESC.
 * Archived projects excluded by default.
 */
app.get('/', async (c) => {
  const userId = c.get('userId')
  const includeArchived = c.req.query('includeArchived') === '1'
  const sortBy = c.req.query('sort') ?? 'activity' // 'activity' | 'name' | 'created'
  const search = c.req.query('q')?.toLowerCase() ?? null
  const d = drizzle(c.env.DB)

  const rows = await d
    .select({
      id: projects.id,
      orgId: projects.orgId,
      name: projects.name,
      description: projects.description,
      systemPrompt: projects.systemPrompt,
      defaultModel: projects.defaultModel,
      color: projects.color,
      position: projects.position,
      starred: projects.starred,
      archived: projects.archived,
      archivedAt: projects.archivedAt,
      memoryUpdateMode: projects.memoryUpdateMode,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      conversationCount: sql<number>`COUNT(${conversations.id})`.as('conversation_count'),
    })
    .from(projects)
    .leftJoin(conversations, eq(conversations.projectId, projects.id))
    .where(
      includeArchived
        ? eq(projects.userId, userId)
        : and(eq(projects.userId, userId), eq(projects.archived, 0)),
    )
    .groupBy(projects.id)

  let filtered = rows
  if (search) {
    filtered = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        (r.description ?? '').toLowerCase().includes(search),
    )
  }

  filtered.sort((a, b) => {
    // Starred first, always
    if (a.starred !== b.starred) return b.starred - a.starred
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'created') {
      const aT = a.createdAt ? new Date(a.createdAt as unknown as number).getTime() : 0
      const bT = b.createdAt ? new Date(b.createdAt as unknown as number).getTime() : 0
      return bT - aT
    }
    // Default: activity (updatedAt DESC)
    const aT = a.updatedAt ? new Date(a.updatedAt as unknown as number).getTime() : 0
    const bT = b.updatedAt ? new Date(b.updatedAt as unknown as number).getTime() : 0
    return bT - aT
  })

  return c.json({
    projects: filtered.map((r) => ({
      ...r,
      createdAt: r.createdAt ? new Date(r.createdAt as unknown as number).toISOString() : null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt as unknown as number).toISOString() : null,
      archivedAt: r.archivedAt ? new Date(r.archivedAt as unknown as number).toISOString() : null,
    })),
  })
})

/** GET /api/projects/templates — list bundled project templates */
app.get('/templates', async (c) => {
  return c.json({
    templates: PROJECT_TEMPLATES.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      emoji: t.emoji,
      color: t.color,
      includes: t.includes,
    })),
  })
})

/** GET /api/projects/:id — single project with its conversations */
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)

  // Phase 5 dual-read: members can also fetch shared projects.
  if (!(await isProjectMember(c.env.DB, id, userId))) {
    return c.json({ error: 'Project not found' }, 404)
  }
  const [project] = await d.select().from(projects).where(eq(projects.id, id)).limit(1)
  if (!project) return c.json({ error: 'Project not found' }, 404)

  const convs = await d
    .select({
      id: conversations.id,
      title: conversations.title,
      summary: conversations.summary,
      starred: conversations.starred,
      model: conversations.model,
      tags: conversations.tags,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.projectId, id))
    .orderBy(desc(conversations.starred), desc(conversations.updatedAt))

  return c.json({
    project: {
      ...project,
      createdAt: project.createdAt
        ? new Date(project.createdAt as unknown as number).toISOString()
        : null,
      updatedAt: project.updatedAt
        ? new Date(project.updatedAt as unknown as number).toISOString()
        : null,
      archivedAt: project.archivedAt
        ? new Date(project.archivedAt as unknown as number).toISOString()
        : null,
    },
    conversations: convs.map((v) => ({
      ...v,
      updatedAt: v.updatedAt ? new Date(v.updatedAt as unknown as number).toISOString() : null,
    })),
  })
})

// ---------------------------------------------------------------------------
// CREATE — blank, from-template, AI scaffold
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().max(8000).optional(),
  defaultModel: z.string().max(120).optional(),
  color: z.string().max(40).optional(),
})

/** POST /api/projects — create a new (blank) project */
app.post('/', zValidator('json', createSchema), async (c) => {
  const userId = c.get('userId')
  const input = c.req.valid('json')
  const d = drizzle(c.env.DB)

  // New projects land at the top (position 0) and push siblings down by 1.
  await d
    .update(projects)
    .set({ position: sql`${projects.position} + 1` })
    .where(eq(projects.userId, userId))

  const id = crypto.randomUUID()
  await d.insert(projects).values({
    id,
    userId,
    name: input.name,
    description: input.description ?? null,
    systemPrompt: input.systemPrompt ?? null,
    defaultModel: input.defaultModel ?? null,
    color: input.color ?? null,
    position: 0,
  })

  return c.json({ id, success: true }, 201)
})

const fromTemplateSchema = z.object({
  templateSlug: z.string(),
  name: z.string().min(1).max(100).optional(), // override name
})

/** POST /api/projects/from-template — instantiate a bundled template */
app.post('/from-template', zValidator('json', fromTemplateSchema), async (c) => {
  const userId = c.get('userId')
  const input = c.req.valid('json')
  const tpl = getTemplate(input.templateSlug)
  if (!tpl) return c.json({ error: 'Template not found' }, 404)
  const d = drizzle(c.env.DB)

  await d
    .update(projects)
    .set({ position: sql`${projects.position} + 1` })
    .where(eq(projects.userId, userId))

  const id = crypto.randomUUID()
  const now = new Date()
  await d.insert(projects).values({
    id,
    userId,
    name: input.name ?? tpl.name,
    description: tpl.description,
    systemPrompt: tpl.systemPrompt,
    color: tpl.color ?? null,
    position: 0,
  })

  // Insert starter memories scoped to the new project. Marked as type='context'
  // unless the template specifies otherwise. source_conversation_id is null —
  // these are template-seeded, not extracted from a chat.
  if (tpl.starterMemories.length > 0) {
    await d.insert(memories).values(
      tpl.starterMemories.map((m) => ({
        id: crypto.randomUUID(),
        scope: 'project' as const,
        scopeId: id,
        name: m.name,
        description: m.description,
        type: m.type,
        content: m.content,
        createdAt: now,
        updatedAt: now,
      })),
    )
  }

  return c.json({
    id,
    success: true,
    suggestedFirstPrompts: tpl.suggestedFirstPrompts,
  }, 201)
})

const scaffoldSchema = z.object({
  prompt: z.string().min(3).max(2000),
})

/**
 * POST /api/projects/scaffold — AI-assisted project draft.
 *
 * Returns a draft (no DB writes) the user can edit before committing.
 * Uses a cheap Workers AI model (Gemma 4 26B) with structured output.
 * Personalised by injecting the user's user-scope memory index.
 */
app.post('/scaffold', zValidator('json', scaffoldSchema), async (c) => {
  const userId = c.get('userId')
  const { prompt } = c.req.valid('json')
  const d = drizzle(c.env.DB)

  // Load user-scope memory index for personalisation (overview only — names + descriptions)
  const userMemories = await d
    .select({
      name: memories.name,
      description: memories.description,
      type: memories.type,
    })
    .from(memories)
    .where(and(eq(memories.scope, 'user'), eq(memories.scopeId, userId), eq(memories.isPrivate, 0)))
    .limit(20)

  const userContextBlock = userMemories.length > 0
    ? `\n\nUSER CONTEXT (about this user, use to personalise output):\n${userMemories
        .map((m) => `- ${m.name}: ${m.description}`)
        .join('\n')}`
    : ''

  const systemPrompt = `You help users create well-structured AI projects in this app.
The user describes what they want; produce a draft project they can edit.

QUALITY BAR:
- name: short and concrete (3-6 words). Specific, not generic.
- description: 1-2 sentences explaining purpose.
- systemPrompt: 100-300 words. Concrete role + tone + output format. No platitudes.
- starterMemories: 3-5 entries. Each captures a fact/preference/context the
  assistant should hold from session 1. Skip platitudes; be specific.
- suggestedFirstPrompts: 2-3 starter prompts the user could click on day 1.

EXAMPLE OUTPUT for input "a project to write emails to clients":
{
  "name": "Client Email Drafting",
  "description": "Drafts and refines emails to clients for project updates, quote follow-ups, and check-ins.",
  "systemPrompt": "You are an assistant helping draft professional emails to clients. Tone: warm, direct, no jargon. Default structure: short greeting, 2-3 short paragraphs, clear ask, sign-off. Always suggest the subject line. Produce drafts only — never offer to send.",
  "starterMemories": [
    {"name": "email-tone", "description": "Tone for client emails", "type": "context", "content": "Warm, direct. EN-AU spelling. No em-dashes. Match the formality of the original thread."},
    {"name": "email-structure", "description": "Default structure", "type": "context", "content": "Greeting → 2-3 short paragraphs → clear ask → sign-off."},
    {"name": "always-draft-only", "description": "Never sends", "type": "preference", "content": "Always produce drafts the user can copy and send themselves."}
  ],
  "suggestedFirstPrompts": [
    "Draft an email to a client letting them know their project is delayed by a week",
    "Help me write a follow-up email to a quote I sent two weeks ago",
    "Draft a welcome email for a new client onboarding"
  ]
}${userContextBlock}

Output MUST be a single JSON object matching the schema. No markdown fences, no commentary.`

  try {
    const result = await c.env.AI.run('@cf/google/gemma-4-26b-a4b-it' as never, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.6,
    } as never) as { response?: string }

    const text = (result.response ?? '').trim()

    // Strip code fences if model added them anyway
    const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')

    const parsed = JSON.parse(cleaned) as {
      name: string
      description: string
      systemPrompt: string
      starterMemories: Array<{ name: string; description: string; content: string; type: string }>
      suggestedFirstPrompts: string[]
    }

    // Light validation — coerce types defensively
    const draft = {
      name: String(parsed.name ?? 'New project').slice(0, 100),
      description: String(parsed.description ?? '').slice(0, 500),
      systemPrompt: String(parsed.systemPrompt ?? '').slice(0, 8000),
      starterMemories: Array.isArray(parsed.starterMemories)
        ? parsed.starterMemories
            .filter((m) => m && typeof m === 'object')
            .slice(0, 8)
            .map((m) => ({
              name: String(m.name ?? '').slice(0, 80),
              description: String(m.description ?? '').slice(0, 200),
              content: String(m.content ?? '').slice(0, 4000),
              type: ['fact', 'preference', 'decision', 'context', 'reference'].includes(String(m.type))
                ? (m.type as 'fact' | 'preference' | 'decision' | 'context' | 'reference')
                : 'context',
            }))
            .filter((m) => m.name && m.content)
        : [],
      suggestedFirstPrompts: Array.isArray(parsed.suggestedFirstPrompts)
        ? parsed.suggestedFirstPrompts
            .filter((p) => typeof p === 'string')
            .slice(0, 5)
            .map((p) => p.slice(0, 300))
        : [],
    }

    return c.json({ success: true, draft })
  } catch (err) {
    console.error(JSON.stringify({ event: 'project_scaffold_error', error: String(err) }))
    return c.json(
      {
        success: false,
        error: 'Could not generate a draft. Try simplifying your description or use Blank/Template instead.',
      },
      500,
    )
  }
})

const fromScaffoldSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().max(8000).optional(),
  color: z.string().max(40).optional(),
  starterMemories: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        description: z.string().min(1).max(200),
        content: z.string().min(1).max(4000),
        type: z.enum(['fact', 'preference', 'decision', 'context', 'reference']),
      }),
    )
    .optional(),
})

/** POST /api/projects/from-scaffold — create from edited AI scaffold */
app.post('/from-scaffold', zValidator('json', fromScaffoldSchema), async (c) => {
  const userId = c.get('userId')
  const input = c.req.valid('json')
  const d = drizzle(c.env.DB)

  await d
    .update(projects)
    .set({ position: sql`${projects.position} + 1` })
    .where(eq(projects.userId, userId))

  const id = crypto.randomUUID()
  const now = new Date()
  await d.insert(projects).values({
    id,
    userId,
    name: input.name,
    description: input.description ?? null,
    systemPrompt: input.systemPrompt ?? null,
    color: input.color ?? null,
    position: 0,
  })

  if (input.starterMemories && input.starterMemories.length > 0) {
    await d.insert(memories).values(
      input.starterMemories.map((m) => ({
        id: crypto.randomUUID(),
        scope: 'project' as const,
        scopeId: id,
        name: m.name,
        description: m.description,
        type: m.type,
        content: m.content,
        createdAt: now,
        updatedAt: now,
      })),
    )
  }

  return c.json({ id, success: true }, 201)
})

// ---------------------------------------------------------------------------
// UPDATE / DELETE
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  systemPrompt: z.string().max(8000).nullable().optional(),
  defaultModel: z.string().max(120).nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  position: z.number().int().optional(),
  memoryUpdateMode: z.enum(['ask', 'auto', 'never']).optional(),
})

/** PATCH /api/projects/:id — rename / edit / change memory mode */
app.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const input = c.req.valid('json')
  const d = drizzle(c.env.DB)

  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.systemPrompt !== undefined) patch.systemPrompt = input.systemPrompt
  if (input.defaultModel !== undefined) patch.defaultModel = input.defaultModel
  if (input.color !== undefined) patch.color = input.color
  if (input.position !== undefined) patch.position = input.position
  if (input.memoryUpdateMode !== undefined) patch.memoryUpdateMode = input.memoryUpdateMode

  await d
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))

  return c.json({ success: true })
})

/** DELETE /api/projects/:id — delete the project. Conversations survive (SET NULL FK). */
app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)

  await d
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// STAR / ARCHIVE
// ---------------------------------------------------------------------------

app.post('/:id/star', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)
  await d
    .update(projects)
    .set({ starred: 1, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
  return c.json({ success: true, starred: true })
})

app.delete('/:id/star', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)
  await d
    .update(projects)
    .set({ starred: 0, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
  return c.json({ success: true, starred: false })
})

app.post('/:id/archive', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)
  await d
    .update(projects)
    .set({ archived: 1, archivedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
  return c.json({ success: true, archived: true })
})

app.delete('/:id/archive', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const d = drizzle(c.env.DB)
  await d
    .update(projects)
    .set({ archived: 0, archivedAt: null })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
  return c.json({ success: true, archived: false })
})

// Mount the project_members sub-router. Hono mounts under the same
// base path ('/api/projects') so endpoints land at /:id/members.
app.route('/', membershipRoutes)

export default app
