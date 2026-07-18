/**
 * agents:skills interop adapter — our D1-indexed registry exposed as an
 * SDK `SkillSource` (src/server/lib/ai/skills/sdk-source.ts).
 *
 * Exercises the full bundled path: auto-sync into D1, catalog listing
 * (with disable_model_invocation exclusion), load with resource
 * descriptors, and resource reads — plus interop with the SDK's own
 * `SkillRegistry`, which is what a Think pilot would actually mount.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import { SkillRegistry } from 'agents/skills'
import { userSkillSource } from '@/server/lib/ai/skills/sdk-source'

beforeAll(async () => {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS skills (
       id text PRIMARY KEY NOT NULL,
       user_id text DEFAULT 'bundled' NOT NULL,
       org_id text,
       name text NOT NULL,
       description text NOT NULL,
       source text NOT NULL,
       path text NOT NULL,
       metadata text DEFAULT '{}' NOT NULL,
       enabled integer DEFAULT true NOT NULL,
       created_at integer NOT NULL,
       updated_at integer NOT NULL
     )`
  ).run()
  await env.DB.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS skills_user_name_idx ON skills (user_id, name)`
  ).run()
})

describe('userSkillSource (agents:skills adapter)', () => {
  it('lists the bundled catalog, excluding disable_model_invocation skills', async () => {
    const source = userSkillSource(env, 'user-a')
    const descriptors = await source.list()

    const names = descriptors.map((d) => d.name)
    expect(names).toContain('compare-options')
    expect(names).toContain('web-research')
    // Routine-hook-only meta-skills carry disable_model_invocation and
    // must stay out of any model-facing catalog.
    expect(names).not.toContain('reflect')
    expect(names).not.toContain('route-finding')

    // fingerprint settles after list() and is stable across calls.
    const fp = source.fingerprint
    expect(fp).not.toBe('unloaded')
    await source.list()
    expect(source.fingerprint).toBe(fp)
  })

  it('loads a skill as SkillContent with classified resource descriptors', async () => {
    const source = userSkillSource(env, 'user-a')
    const skill = await source.load('compare-options')
    expect(skill).not.toBeNull()
    expect(skill!.body).toContain('Compare Options')
    const script = skill!.resources?.find((r) => r.path === 'scripts/score.js')
    expect(script?.kind).toBe('script')
  })

  it('reads a script resource with content', async () => {
    const source = userSkillSource(env, 'user-a')
    const resource = await source.readResource!('compare-options', 'scripts/score.js')
    expect(resource?.content).toContain('export default')
    // Unlisted paths refuse (no traversal into arbitrary keys).
    expect(await source.readResource!('compare-options', 'scripts/nope.js')).toBeNull()
  })

  it("mounts in the SDK's own SkillRegistry (Think-pilot shape)", async () => {
    const registry = new SkillRegistry([userSkillSource(env, 'user-a')])
    const prompt = await registry.systemPrompt()
    expect(prompt).toContain('compare-options')

    const loaded = await registry.loadSkill('compare-options')
    expect(loaded?.body).toContain('Compare Options')
  })
})
