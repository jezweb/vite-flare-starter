/**
 * Skills API Routes
 *
 * CRUD for the skills registry. Bundled skills are auto-registered on
 * the sync endpoint. R2 and GitHub skills can be added via the API.
 */
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { skills } from './db/schema'
import {
  listSkills,
  loadSkill,
  syncBundledSkills,
  addGitHubSkill,
  uploadSkillToR2,
} from '@/server/lib/ai/skills/registry'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

/** GET / — list all skills */
app.get('/', async (c) => {
  const db = drizzle(c.env.DB)
  const all = await db.select().from(skills)
  return c.json({ skills: all, count: all.length })
})

/** GET /summary — list skill metadata only (for AI consumption) */
app.get('/summary', async (c) => {
  const items = await listSkills(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket })
  return c.json({ skills: items, count: items.length })
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

/** POST /github — add a skill from a GitHub URL */
app.post('/github', async (c) => {
  const body = await c.req.json() as { url?: string }
  if (!body.url) return c.json({ error: 'url required' }, 400)
  try {
    const result = await addGitHubSkill(c.env as unknown as { DB: D1Database; SKILLS?: R2Bucket }, body.url)
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

/** DELETE /:name — delete a skill from the registry */
app.delete('/:name', async (c) => {
  const name = c.req.param('name')
  const db = drizzle(c.env.DB)
  await db.delete(skills).where(eq(skills.name, name))
  return c.json({ success: true, name, deleted: true })
})

export default app
