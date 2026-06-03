/**
 * Skills API Routes
 *
 * CRUD for the skills registry. Bundled skills are auto-registered on
 * the sync endpoint. R2 and GitHub skills can be added via the API.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq, or } from 'drizzle-orm'
import { generateText } from 'ai'
import { DEFAULT_MODEL, resolveModel } from '@/server/lib/ai'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { BUNDLED_USER_ID, skills } from './db/schema'
import {
  listSkills,
  loadSkill,
  syncBundledSkills,
  ensureBundledSynced,
  addGitHubSkill,
  addGitHubSkillDirectory,
  addSkillFromZip,
  uploadSkillToR2,
} from '@/server/lib/ai/skills/registry'
import { createProposal } from '@/server/modules/config-diff/storage'
import { loadCurrentContent } from '@/server/modules/config-diff/apply'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

/**
 * GET / — list skills visible to the caller.
 *
 * Returns the union of:
 *   - the user's personal overrides (skills.user_id === caller), AND
 *   - bundled skills whose name is NOT overridden by the caller.
 *
 * Each row has `isPersonal: boolean` so the UI can distinguish "yours"
 * from "bundled default". ensureBundledSynced (idempotent per isolate)
 * keeps the bundled rows fresh.
 */
app.get('/', async (c) => {
  const userId = c.get('userId')
  await ensureBundledSynced(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket })
  const db = drizzle(c.env.DB)
  const rows = await db
    .select()
    .from(skills)
    .where(or(eq(skills.userId, userId), eq(skills.userId, BUNDLED_USER_ID)))

  // Prefer the user's override when both exist for the same name.
  const personalByName = new Map(rows.filter((r) => r.userId === userId).map((r) => [r.name, r]))
  const merged: typeof rows = []
  for (const r of rows) {
    if (r.userId === userId) merged.push(r)
    else if (!personalByName.has(r.name)) merged.push(r)
  }

  const withFlag = merged.map((r) => ({
    ...r,
    isPersonal: r.userId === userId,
  }))
  return c.json({ skills: withFlag, count: withFlag.length })
})

/** GET /summary — list skill metadata only (for AI consumption) */
app.get('/summary', async (c) => {
  const userId = c.get('userId')
  const items = await listSkills(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }, userId)
  return c.json({ skills: items, count: items.length })
})

/**
 * GET /:name/resources/* — read a bundled resource (script, reference,
 * asset) by relative path. Path is the rest of the URL after `/resources/`;
 * we accept slashes so `scripts/extract.py` works without extra encoding.
 *
 * MUST be declared BEFORE `/:name` so Hono doesn't match this as a skill
 * name like "foo/resources/bar.py".
 */
app.get('/:name/resources/*', async (c) => {
  const name = c.req.param('name')
  const userId = c.get('userId')
  const fullPath = c.req.path
  const marker = `/skills/${name}/resources/`
  const idx = fullPath.indexOf(marker)
  if (idx === -1) return c.json({ error: 'Malformed resource path' }, 400)
  const rawPath = fullPath.slice(idx + marker.length)
  const relPath = decodeURIComponent(rawPath)
  const skill = await loadSkill(
    c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket },
    name,
    userId
  )
  if (!skill) return c.json({ error: 'Skill not found' }, 404)
  if (!skill.resources.includes(relPath)) {
    return c.json(
      {
        error: `"${relPath}" is not a listed resource of skill "${name}".`,
        available: skill.resources,
      },
      404
    )
  }
  const content = await skill.fetchResource(relPath)
  if (content === null) {
    return c.json({ error: `Resource "${relPath}" could not be loaded.` }, 500)
  }
  return c.json({ name, path: relPath, content })
})

/** GET /:name — get full skill content + resource listing */
app.get('/:name', async (c) => {
  const name = c.req.param('name')
  const userId = c.get('userId')
  const skill = await loadSkill(
    c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket },
    name,
    userId
  )
  if (!skill) return c.json({ error: 'Skill not found' }, 404)
  return c.json({
    name: skill.name,
    description: skill.frontmatter.description,
    source: skill.source,
    userId: skill.userId,
    isPersonal: skill.isPersonal,
    directory: skill.directory,
    resources: skill.resources,
    frontmatter: skill.frontmatter,
    body: skill.body,
    warnings: skill.warnings,
  })
})

/** POST /sync — sync bundled skills to the registry */
app.post('/sync', async (c) => {
  const result = await syncBundledSkills(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket })
  return c.json({ success: true, ...result })
})

/**
 * POST /github — add a skill from a GitHub URL. Auto-detects format:
 *  - Raw URL ending in SKILL.md → single-file import (flat, no siblings)
 *  - Directory URL (tree/blob) OR shorthand (owner/repo/path) → full
 *    directory import with scripts/references/assets copied into R2.
 */
app.post('/github', async (c) => {
  const userId = c.get('userId')
  const body = (await c.req.json()) as { url?: string; mode?: 'auto' | 'single' | 'directory' }
  if (!body.url) return c.json({ error: 'url required' }, 400)
  const mode = body.mode ?? 'auto'
  const looksLikeRawSingle = /raw\.githubusercontent\.com\/.+\/SKILL\.md(\?.*)?$/i.test(body.url)
  const useDirectory = mode === 'directory' || (mode === 'auto' && !looksLikeRawSingle)
  try {
    if (useDirectory) {
      const result = await addGitHubSkillDirectory(
        c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket },
        body.url,
        userId
      )
      return c.json({ success: true, mode: 'directory', ...result })
    }
    const result = await addGitHubSkill(
      c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket },
      body.url,
      userId
    )
    return c.json({ success: true, mode: 'single', ...result })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

/**
 * POST /upload-zip — upload a zip archive containing a skill directory.
 * Expects multipart form-data with field `file`. The zip must contain
 * SKILL.md at the root (or inside a single wrapping folder).
 */
app.post('/upload-zip', async (c) => {
  const userId = c.get('userId')
  try {
    const formData = await c.req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return c.json({ error: 'file field required (multipart)' }, 400)
    if (file.size > 20 * 1024 * 1024) return c.json({ error: 'zip exceeds 20 MB' }, 400)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await addSkillFromZip(
      c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket },
      bytes,
      userId
    )
    return c.json({ success: true, ...result })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

/** POST /upload — upload a SKILL.md to R2 */
app.post('/upload', async (c) => {
  const userId = c.get('userId')
  const body = (await c.req.json()) as { content?: string; overwrite?: boolean }
  if (!body.content) return c.json({ error: 'content required' }, 400)
  try {
    const result = await uploadSkillToR2(
      c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket },
      body.content,
      userId,
      { overwrite: body.overwrite }
    )
    return c.json({ success: true, ...result })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

/**
 * PATCH /:name — enable/disable a skill.
 *
 * Scoped to the caller's own row. If the user only has the bundled
 * copy (no personal override yet), the enable flag is stored as a
 * thin personal override row pointing at the same path, so the
 * toggle is per-user rather than global.
 */
app.patch('/:name', async (c) => {
  const userId = c.get('userId')
  const name = c.req.param('name')
  const body = (await c.req.json()) as { enabled?: boolean }
  const enabled = body.enabled ?? true
  const db = drizzle(c.env.DB)

  // Try the user's own row first.
  const mine = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.name, name)))
    .get()
  if (mine) {
    await db.update(skills).set({ enabled, updatedAt: new Date() }).where(eq(skills.id, mine.id))
    return c.json({ success: true, name, enabled })
  }

  // No personal row yet — create a thin override from the bundled copy.
  const bundled = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, BUNDLED_USER_ID), eq(skills.name, name)))
    .get()
  if (!bundled) return c.json({ error: 'Skill not found' }, 404)
  await db.insert(skills).values({
    userId,
    name: bundled.name,
    description: bundled.description,
    source: bundled.source,
    path: bundled.path,
    metadata: bundled.metadata,
    enabled,
  })
  return c.json({ success: true, name, enabled })
})

/**
 * POST /:name/ai-edit — rewrite the skill body from a natural-language
 * instruction. Creates a pending ConfigDiffProposal with source 'ai-sparkle'
 * so the user can review the diff before anything is persisted.
 *
 * Body: { instruction: string, model?: string }
 * Returns: { proposal: ConfigDiffProposal }
 */
app.post('/:name/ai-edit', async (c) => {
  const name = c.req.param('name')
  const body = (await c.req.json().catch(() => ({}))) as {
    instruction?: string
    model?: string
  }
  if (!body.instruction || typeof body.instruction !== 'string') {
    return c.json({ error: 'instruction required' }, 400)
  }
  if (body.instruction.length > 2000) {
    return c.json({ error: 'instruction too long (max 2000 characters)' }, 400)
  }
  const userId = c.get('userId')
  const env = c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }
  const before = await loadCurrentContent(env, { kind: 'skill', id: name }, userId)
  if (!before) return c.json({ error: 'Skill not found' }, 404)

  const modelId = body.model ?? DEFAULT_MODEL
  const systemPrompt = `You edit user skill files (Claude Agent Skills format — SKILL.md).

RULES:
- Output ONLY the full new SKILL.md, starting with the YAML frontmatter block (--- ... ---) and ending with the body.
- Do NOT wrap the output in code fences.
- Do NOT add commentary, explanations, or preamble.
- Preserve the YAML frontmatter shape. The "name" field MUST stay unchanged.
- Follow the user's instruction faithfully. Keep the overall intent unless the user asks to change it.
- If you need to reduce length, remove least-important content first (repeated examples, optional caveats).`

  try {
    const { text } = await generateText({
      model: resolveModel(c.env, modelId),
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Current SKILL.md (${name}):\n\n${before}\n\n---\n\nInstruction: ${body.instruction}\n\nOutput the full rewritten SKILL.md now.`,
        },
      ],
      maxOutputTokens: 4096,
    })
    const cleaned = text
      .trim()
      .replace(/^```[a-z]*\n?|\n?```$/g, '')
      .trim()
    if (cleaned === before) {
      return c.json(
        { error: 'The rewrite matched the original — try a different instruction.' },
        422
      )
    }
    // Enforce: the model MUST NOT rename the skill. Enforcement happens
    // here (not in the system prompt) because models occasionally
    // ignore the instruction. If the returned frontmatter names a
    // different skill, reject rather than silently orphaning the
    // original + creating a new one on apply.
    const returnedName = extractSkillName(cleaned)
    if (returnedName && returnedName !== name) {
      return c.json(
        {
          error: `The rewrite changed the skill name from "${name}" to "${returnedName}". Skill names must stay unchanged — try a different instruction.`,
        },
        422
      )
    }
    const proposal = await createProposal(c.env.DB, userId, {
      resource: { kind: 'skill', id: name, label: `/${name}` },
      before,
      after: cleaned,
      summary: body.instruction.slice(0, 200),
      reason: null,
      format: 'markdown',
      createdBy: { type: 'ai-sparkle', userId, modelId },
    })
    return c.json({ proposal })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

/**
 * DELETE /:name — delete the caller's personal override of a skill.
 *
 * Never deletes the bundled row. If the user has no personal override,
 * returns 404. After deletion, the user sees the bundled version
 * again (the override is "reverted to bundled").
 */
app.delete('/:name', async (c) => {
  const userId = c.get('userId')
  const name = c.req.param('name')
  const db = drizzle(c.env.DB)
  const mine = await db
    .select({ id: skills.id, userId: skills.userId })
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.name, name)))
    .get()
  if (!mine) {
    return c.json(
      {
        error:
          'No personal override of this skill to delete. Bundled skills cannot be removed — they ship with the starter.',
      },
      404
    )
  }
  await db.delete(skills).where(eq(skills.id, mine.id))
  return c.json({ success: true, name, deleted: true })
})

/**
 * Extract the `name:` field from a SKILL.md frontmatter block without
 * a full YAML parse. Used to validate AI-rewritten skill files don't
 * change the skill's identity.
 */
function extractSkillName(source: string): string | null {
  const fm = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return null
  const match = fm[1]?.match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)
  return match?.[1] ?? null
}

export default app
