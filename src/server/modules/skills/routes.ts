/**
 * Skills API Routes
 *
 * CRUD for the skills registry. Bundled skills are auto-registered on
 * the sync endpoint. R2 and GitHub skills can be added via the API.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { generateText } from 'ai'
import { DEFAULT_MODEL, resolveModel } from '@/server/lib/ai'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { skills } from './db/schema'
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
 * GET / — list all skills (including disabled).
 *
 * Uses ensureBundledSynced (idempotent per worker isolate) so freshly-
 * deployed bundled skills show up without the user having to hit
 * "Sync bundled" manually.
 */
app.get('/', async (c) => {
  await ensureBundledSynced(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket })
  const db = drizzle(c.env.DB)
  const all = await db.select().from(skills)
  return c.json({ skills: all, count: all.length })
})

/** GET /summary — list skill metadata only (for AI consumption) */
app.get('/summary', async (c) => {
  const items = await listSkills(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket })
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
  const fullPath = c.req.path
  const marker = `/skills/${name}/resources/`
  const idx = fullPath.indexOf(marker)
  if (idx === -1) return c.json({ error: 'Malformed resource path' }, 400)
  const rawPath = fullPath.slice(idx + marker.length)
  const relPath = decodeURIComponent(rawPath)
  const skill = await loadSkill(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }, name)
  if (!skill) return c.json({ error: 'Skill not found' }, 404)
  if (!skill.resources.includes(relPath)) {
    return c.json({
      error: `"${relPath}" is not a listed resource of skill "${name}".`,
      available: skill.resources,
    }, 404)
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
  const skill = await loadSkill(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }, name)
  if (!skill) return c.json({ error: 'Skill not found' }, 404)
  return c.json({
    name: skill.name,
    description: skill.frontmatter.description,
    source: skill.source,
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
  const body = await c.req.json() as { url?: string; mode?: 'auto' | 'single' | 'directory' }
  if (!body.url) return c.json({ error: 'url required' }, 400)
  const mode = body.mode ?? 'auto'
  const looksLikeRawSingle = /raw\.githubusercontent\.com\/.+\/SKILL\.md(\?.*)?$/i.test(body.url)
  const useDirectory = mode === 'directory' || (mode === 'auto' && !looksLikeRawSingle)
  try {
    if (useDirectory) {
      const result = await addGitHubSkillDirectory(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }, body.url)
      return c.json({ success: true, mode: 'directory', ...result })
    }
    const result = await addGitHubSkill(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }, body.url)
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
  try {
    const formData = await c.req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return c.json({ error: 'file field required (multipart)' }, 400)
    if (file.size > 20 * 1024 * 1024) return c.json({ error: 'zip exceeds 20 MB' }, 400)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await addSkillFromZip(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }, bytes)
    return c.json({ success: true, ...result })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

/** POST /upload — upload a SKILL.md to R2 */
app.post('/upload', async (c) => {
  const body = await c.req.json() as { content?: string; overwrite?: boolean }
  if (!body.content) return c.json({ error: 'content required' }, 400)
  try {
    const result = await uploadSkillToR2(
      c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket },
      body.content,
      { overwrite: body.overwrite }
    )
    return c.json({ success: true, ...result })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

/** PATCH /:name — enable/disable a skill */
app.patch('/:name', async (c) => {
  const name = c.req.param('name')
  const body = await c.req.json() as { enabled?: boolean }
  const db = drizzle(c.env.DB)
  await db
    .update(skills)
    .set({ enabled: body.enabled ?? true, updatedAt: new Date() })
    .where(eq(skills.name, name))
  return c.json({ success: true, name, enabled: body.enabled ?? true })
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
  const env = c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }
  const before = await loadCurrentContent(env, { kind: 'skill', id: name })
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
    const cleaned = text.trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim()
    if (cleaned === before) {
      return c.json({ error: 'The rewrite matched the original — try a different instruction.' }, 422)
    }
    const userId = c.get('userId')
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
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    )
  }
})

/** DELETE /:name — delete a skill from the registry */
app.delete('/:name', async (c) => {
  const name = c.req.param('name')
  const db = drizzle(c.env.DB)
  await db.delete(skills).where(eq(skills.name, name))
  return c.json({ success: true, name, deleted: true })
})

export default app
