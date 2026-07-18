/**
 * agents:skills interop — expose our D1-indexed skills registry as an SDK
 * `SkillSource`.
 *
 * The starter's registry does things the SDK's global sources can't
 * (per-user overrides, enable/disable, always_active, config-diff edits),
 * so we do NOT swap onto `agents/skills` storage. Instead this adapter
 * makes our registry mountable by any SDK surface that consumes
 * `SkillSource[]` — the SDK `SkillRegistry`, a `@cloudflare/think` agent
 * (`skills: [userSkillSource(env, userId)]`), or the SDK script runner —
 * without duplicating skill content anywhere.
 *
 * The adapter is per-(env, user): a source built for one user resolves
 * that user's personal overrides over the bundled defaults, exactly like
 * the chat catalog. `disable_model_invocation` skills are excluded from
 * `list()` (parity with the chat system-prompt catalog) but still load by
 * name, mirroring how routine hooks reach them today.
 */
import type {
  SkillSource,
  SkillDescriptor,
  SkillContent,
  SkillResource,
  SkillResourceDescriptor,
} from 'agents/skills'
import { listSkills, loadSkill } from './registry'

interface SkillsEnv {
  DB: D1Database
  SKILLS?: R2Bucket
}

/** Classify a resource path the way the SDK expects. */
function resourceKind(path: string): SkillResourceDescriptor['kind'] {
  if (path.startsWith('scripts/')) return 'script'
  if (path.startsWith('references/')) return 'reference'
  if (path.startsWith('assets/')) return 'asset'
  return 'file'
}

/** Cheap stable hash (FNV-1a) for the fingerprint contract. */
function fingerprintOf(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function userSkillSource(env: SkillsEnv, userId: string): SkillSource {
  // Fingerprint reflects the catalog surface (names + descriptions +
  // source), computed lazily on first list() and refreshed via refresh().
  let fingerprint = 'unloaded'

  const list = async (): Promise<SkillDescriptor[]> => {
    const summaries = await listSkills(env, userId)
    const visible = summaries.filter((s) => !s.disableModelInvocation)
    fingerprint = fingerprintOf(
      JSON.stringify(visible.map((s) => [s.name, s.description, s.source, s.isPersonal]))
    )
    return visible.map((s) => ({
      name: s.name,
      description: s.description,
      sourceId: `vfs:${s.source}`,
      metadata: {
        source: s.source,
        isPersonal: s.isPersonal,
        ...(s.alwaysActive ? { always_active: true } : {}),
      },
    }))
  }

  const load = async (name: string): Promise<SkillContent | null> => {
    const skill = await loadSkill(env, name, userId)
    if (!skill) return null
    return {
      name: skill.name,
      description: skill.frontmatter.description,
      body: skill.body,
      sourceId: `vfs:${skill.source}`,
      metadata: { ...skill.frontmatter, source: skill.source, isPersonal: skill.isPersonal },
      resources: skill.resources.map((path) => ({
        path,
        kind: resourceKind(path),
        encoding: 'text' as const,
      })),
    }
  }

  return {
    id: `vfs:${userId}`,
    get fingerprint() {
      return fingerprint
    },
    list,
    load,
    async readResource(name: string, path: string): Promise<SkillResource | null> {
      const skill = await loadSkill(env, name, userId)
      if (!skill || !skill.resources.includes(path)) return null
      const content = await skill.fetchResource(path)
      if (content === null) return null
      return { path, kind: resourceKind(path), encoding: 'text', content }
    },
    async refresh() {
      await list()
    },
  }
}
