/**
 * Skills Registry
 *
 * Indexes skills from multiple sources in D1 and resolves their content on demand.
 *
 * Sources:
 * - bundled: shipped in /skills directory at repo root, available via static imports
 * - r2: stored in the SKILLS R2 bucket (user-uploaded)
 * - github: fetched from a GitHub repo, cached in R2
 *
 * Progressive disclosure: only metadata (name + description) is loaded into the
 * system prompt by default. Full body is loaded via load_skill tool on demand.
 */
import { drizzle } from 'drizzle-orm/d1'
import { isAllowedGitHubUrl } from '@/server/lib/ssrf'
import { and, eq, or } from 'drizzle-orm'
import { BUNDLED_USER_ID, skills } from '@/server/modules/skills/db/schema'
import { parseSkill, type ParsedSkill } from './loader'
import { getBundledSkill, getBundledSkillResource, listBundledSkills } from './bundled'

interface SkillsEnv {
  DB: D1Database
  SKILLS?: R2Bucket
}

export interface SkillSummary {
  name: string
  description: string
  source: 'bundled' | 'r2' | 'github'
  /** Which userId owns this row — `'bundled'` for the shared default,
   *  or the caller's userId if they have a personal override. */
  userId: string
  /** True if this is the caller's personal override (vs the bundled default). */
  isPersonal: boolean
  /** Skills with disable_model_invocation=true are hidden from the model catalog. */
  disableModelInvocation?: boolean
  /**
   * Skills with always_active=true have their full SKILL.md body baked
   * into the chat agent's system prompt every turn — the model never
   * needs to call load_skill for these. Use for baseline / persona /
   * style skills that should apply to every conversation. The full body
   * costs tokens on every turn; use sparingly. See plan
   * `.jez/artifacts/skills-and-swarm-plan-2026-05-06.md`.
   */
  alwaysActive?: boolean
}

/** Re-export for external consumers that need to distinguish bundled rows. */
export { BUNDLED_USER_ID }

/**
 * A skill loaded with enough context for the agent to act on it:
 * parsed body + frontmatter, resource listing, and a stable directory
 * identifier the agent can use for relative-path resolution.
 *
 * `directory` is a logical identifier — it points at a bundled glob
 * path, an R2 prefix, or a GitHub URL depending on the source. The
 * `fetchResource` closure knows how to resolve a relative path within
 * that directory back to raw content.
 */
export interface LoadedSkill extends ParsedSkill {
  name: string
  source: 'bundled' | 'r2' | 'github'
  /** Owner userId — 'bundled' for shared defaults, or the user's id. */
  userId: string
  /** True if this row is the caller's personal override (vs the bundled default). */
  isPersonal: boolean
  directory: string
  /** Paths relative to the skill directory for all sibling files. */
  resources: string[]
  /** Load a sibling resource by its relative path. */
  fetchResource: (relativePath: string) => Promise<string | null>
}

// Module-level sync flag — auto-sync bundled skills once per worker isolate
let bundledSyncedThisIsolate = false

/**
 * Sync bundled skills to D1 exactly once per worker isolate. Idempotent.
 * Call from any endpoint that needs the registry to reflect the current
 * set of bundled skills (dashboard list, system-prompt catalog, etc.).
 *
 * Silent on failure — never throws — so this is safe to call without
 * try/catch from hot paths.
 */
export async function ensureBundledSynced(env: SkillsEnv): Promise<void> {
  if (bundledSyncedThisIsolate) return
  try {
    await syncBundledSkills(env)
    bundledSyncedThisIsolate = true
  } catch (error) {
    console.error('Failed to auto-sync bundled skills:', error)
  }
}

/**
 * Get all enabled skills (metadata only) for the given user. Returns
 * the union of:
 *   - the user's personal overrides (user_id === userId), AND
 *   - bundled skills whose name is NOT overridden by the user.
 *
 * Shape per row includes `isPersonal` so the UI can distinguish "this
 * is your copy" from "this is the shared default."
 *
 * Auto-syncs bundled skills on first call per isolate. Idempotent.
 */
export async function listSkills(env: SkillsEnv, userId: string): Promise<SkillSummary[]> {
  const db = drizzle(env.DB)

  await ensureBundledSynced(env)

  const rows = await db
    .select({
      userId: skills.userId,
      name: skills.name,
      description: skills.description,
      source: skills.source,
      metadata: skills.metadata,
    })
    .from(skills)
    .where(
      and(
        eq(skills.enabled, true),
        or(eq(skills.userId, userId), eq(skills.userId, BUNDLED_USER_ID))
      )
    )

  // Index user's overrides by name, then prefer them over bundled.
  const personalByName = new Map(rows.filter((r) => r.userId === userId).map((r) => [r.name, r]))
  const merged = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (row.userId === userId) {
      merged.set(row.name, row)
    } else if (!personalByName.has(row.name)) {
      merged.set(row.name, row)
    }
  }

  return [...merged.values()].map((r) => {
    let disableModelInvocation = false
    let alwaysActive = false
    try {
      const fm = JSON.parse(r.metadata || '{}') as {
        disable_model_invocation?: boolean
        always_active?: boolean
      }
      disableModelInvocation = fm.disable_model_invocation === true
      alwaysActive = fm.always_active === true
    } catch {
      // ignore malformed metadata
    }
    return {
      name: r.name,
      description: r.description,
      source: r.source,
      userId: r.userId,
      isPersonal: r.userId === userId,
      disableModelInvocation,
      alwaysActive,
    }
  })
}

/**
 * Load full bodies for every always-active skill the user has. These
 * get baked into the chat agent's system prompt instead of being
 * gated behind a load_skill call. Skills with both always_active and
 * disable_model_invocation are excluded (contradictory shape).
 *
 * Returns ordered alphabetically by name for stable prompt ordering
 * (otherwise prompt-cache keys would churn whenever D1 row order changes).
 */
export async function loadAlwaysActiveSkills(
  env: SkillsEnv,
  userId: string
): Promise<LoadedSkill[]> {
  const summaries = await listSkills(env, userId)
  const candidates = summaries
    .filter((s) => s.alwaysActive && !s.disableModelInvocation)
    .map((s) => s.name)
    .sort()
  const loaded = await Promise.all(candidates.map((name) => loadSkill(env, name, userId)))
  return loaded.filter((s): s is LoadedSkill => s !== null)
}

/**
 * Load a specific skill with its content + resource listing.
 *
 * Resolution: user's personal override wins, falls back to bundled row.
 * Returns null if neither exists (or the row is disabled).
 *
 * Returns an object shaped for agentskills.io structured activation:
 * body, directory identifier, and a list of sibling resources the model
 * can request on demand via fs tools.
 */
export async function loadSkill(
  env: SkillsEnv,
  name: string,
  userId: string
): Promise<LoadedSkill | null> {
  const db = drizzle(env.DB)
  // Pull both rows in one query, pick the user's override if present.
  const rows = await db
    .select()
    .from(skills)
    .where(
      and(eq(skills.name, name), or(eq(skills.userId, userId), eq(skills.userId, BUNDLED_USER_ID)))
    )

  const row =
    rows.find((r) => r.userId === userId) ?? rows.find((r) => r.userId === BUNDLED_USER_ID)
  if (!row || !row.enabled) return null

  let content: string
  let directory: string
  let resources: string[] = []
  let fetchResource: (relativePath: string) => Promise<string | null>

  switch (row.source) {
    case 'bundled': {
      content = await getBundledSkill(row.path)
      directory = `bundled:${row.name}`
      const bundled = (await listBundledSkills()).find((s) => s.name === row.name)
      resources = bundled?.resources ?? []
      fetchResource = (rel) => getBundledSkillResource(row.name, rel)
      break
    }

    case 'r2': {
      if (!env.SKILLS) throw new Error('SKILLS R2 bucket not configured')
      const obj = await env.SKILLS.get(row.path)
      if (!obj) return null
      content = await obj.text()
      // R2 skills live under `${name}/...` — list siblings under that prefix.
      const prefix = row.path.replace(/\/SKILL\.md$/, '/')
      directory = `r2:${prefix}`
      const list = await env.SKILLS.list({ prefix })
      resources = list.objects
        .map((o) => o.key.slice(prefix.length))
        .filter((k) => k && k !== 'SKILL.md')
      fetchResource = async (rel) => {
        const obj = await env.SKILLS!.get(`${prefix}${rel}`)
        return obj ? obj.text() : null
      }
      break
    }

    case 'github': {
      // Fetch with simple cache via R2 if available
      if (env.SKILLS) {
        const cacheKey = `github-cache/${row.path.replace(/[^a-zA-Z0-9-]/g, '_')}`
        const cached = await env.SKILLS.get(cacheKey)
        if (cached) {
          content = await cached.text()
        } else {
          const response = await fetch(row.path)
          if (!response.ok)
            throw new Error(`Failed to fetch skill from ${row.path}: ${response.status}`)
          content = await response.text()
          await env.SKILLS.put(cacheKey, content)
        }
      } else {
        const response = await fetch(row.path)
        if (!response.ok)
          throw new Error(`Failed to fetch skill from ${row.path}: ${response.status}`)
        content = await response.text()
      }
      directory = `github:${row.path}`
      // Flat-file GitHub fetch — no sibling resources today. Directory
      // import (phase 1b) will populate resources by listing the tree.
      resources = []
      fetchResource = async () => null
      break
    }

    default:
      return null
  }

  const parsed = parseSkill(content, { expectedName: row.name })
  return {
    ...parsed,
    name: row.name,
    source: row.source,
    userId: row.userId,
    isPersonal: row.userId === userId,
    directory,
    resources,
    fetchResource,
  }
}

/**
 * Sync bundled skills to the registry. Call on startup or via admin action.
 * Also cleans up bundled entries that no longer exist.
 */
export async function syncBundledSkills(
  env: SkillsEnv
): Promise<{ added: number; updated: number; removed: number }> {
  const db = drizzle(env.DB)
  const bundled = await listBundledSkills()
  // Pull EVERY row owned by the bundled sentinel regardless of source.
  // The previous version filtered to source='bundled' which missed
  // orphaned r2/github rows under the same name + userId, and the
  // subsequent INSERT hit a UNIQUE constraint on (userId, name).
  // We treat any pre-existing row at (BUNDLED_USER_ID, name) as the
  // target and upsert it back to source='bundled'.
  const existing = await db.select().from(skills).where(eq(skills.userId, BUNDLED_USER_ID))

  const existingByName = new Map(existing.map((s) => [s.name, s]))
  const bundledNames = new Set(bundled.map((s) => s.name))

  let added = 0
  let updated = 0
  let removed = 0

  for (const b of bundled) {
    const existing = existingByName.get(b.name)
    const metadata = JSON.stringify(b.frontmatter)
    if (!existing) {
      await db.insert(skills).values({
        userId: BUNDLED_USER_ID,
        name: b.name,
        description: b.description,
        source: 'bundled',
        path: b.path,
        metadata,
      })
      added++
    } else {
      // Upsert path — handles three cases:
      //   1. existing.source === 'bundled' but description/metadata
      //      drifted → rewrite the rendered fields.
      //   2. existing.source === 'r2' / 'github' (orphan) → upgrade
      //      back to bundled with the bundled path.
      //   3. nothing changed → skip the write.
      const sourceChanged = existing.source !== 'bundled'
      const descriptionChanged = existing.description !== b.description
      const metadataChanged = existing.metadata !== metadata
      const pathChanged = existing.path !== b.path
      if (sourceChanged || descriptionChanged || metadataChanged || pathChanged) {
        await db
          .update(skills)
          .set({
            source: 'bundled',
            path: b.path,
            description: b.description,
            metadata,
            updatedAt: new Date(),
          })
          .where(eq(skills.id, existing.id))
        updated++
      }
    }
  }

  // Remove bundled rows no longer in the source. User overrides with
  // the same name are left intact — the user keeps their copy even if
  // the upstream bundled version goes away. (We only delete rows whose
  // current source is 'bundled'; orphaned r2 rows for names that
  // are no longer bundled are deliberately preserved — the user
  // uploaded them deliberately.)
  for (const e of existing) {
    if (e.source === 'bundled' && !bundledNames.has(e.name)) {
      await db.delete(skills).where(eq(skills.id, e.id))
      removed++
    }
  }

  return { added, updated, removed }
}

/**
 * Register a skill from a GitHub URL.
 *
 * @example
 *   addGitHubSkill(env, 'https://raw.githubusercontent.com/anthropics/skills/main/skill-name/SKILL.md')
 */
export async function addGitHubSkill(
  env: SkillsEnv,
  url: string,
  userId: string = BUNDLED_USER_ID
): Promise<{ name: string; description: string }> {
  // SSRF guard: only fetch GitHub-hosted skill URLs, never an arbitrary
  // user-supplied host (which could target internal services / metadata).
  if (!isAllowedGitHubUrl(url)) {
    throw new Error('Skill URL must be a GitHub URL (github.com / raw.githubusercontent.com)')
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  const content = await response.text()
  const parsed = parseSkill(content)

  const db = drizzle(env.DB)
  const existing = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.name, parsed.frontmatter.name)))
    .get()

  if (existing) {
    await db
      .update(skills)
      .set({
        description: parsed.frontmatter.description,
        source: 'github',
        path: url,
        metadata: JSON.stringify(parsed.frontmatter),
        updatedAt: new Date(),
      })
      .where(eq(skills.id, existing.id))
  } else {
    await db.insert(skills).values({
      userId,
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      source: 'github',
      path: url,
      metadata: JSON.stringify(parsed.frontmatter),
    })
  }

  return { name: parsed.frontmatter.name, description: parsed.frontmatter.description }
}

/**
 * Register a skill from a GitHub **directory** URL, pulling SKILL.md plus
 * all sibling files (scripts/, references/, assets/). Cached into R2 so
 * subsequent loads don't re-fetch. Matches the phase 1B spec: makes any
 * `anthropics/skills/<name>` style directory install unmodified.
 *
 * Accepted URL formats:
 *   https://github.com/{owner}/{repo}/tree/{ref}/{path}
 *   https://github.com/{owner}/{repo}/blob/{ref}/{path}/SKILL.md
 *   owner/repo/{path}                    (defaults ref = main)
 *   owner/repo#{ref}/{path}              (explicit ref)
 *
 * Requires the SKILLS R2 bucket to be bound (it's where siblings land).
 */
export async function addGitHubSkillDirectory(
  env: SkillsEnv,
  input: string,
  userId: string = BUNDLED_USER_ID
): Promise<{ name: string; description: string; files: string[] }> {
  if (!env.SKILLS)
    throw new Error('SKILLS R2 bucket required for directory imports — bind it in wrangler.jsonc')

  const spec = parseGitHubSpec(input)
  if (!spec) {
    throw new Error(
      `Could not parse GitHub directory URL: "${input}". Try a format like ` +
        `"https://github.com/owner/repo/tree/main/skill-name" or the shorthand ` +
        `"owner/repo/skill-name".`
    )
  }

  // Walk the tree at {owner}/{repo}/{path}@{ref}
  const files = await listGitHubTree(spec)
  const skillMd = files.find((f) => f.path === 'SKILL.md')
  if (!skillMd)
    throw new Error(
      `No SKILL.md found at ${spec.owner}/${spec.repo}/${spec.path} (ref: ${spec.ref})`
    )

  // Fetch SKILL.md first to validate and get the skill name
  const skillMdContent = await fetchGitHubBlob(spec, skillMd.path)
  const parsed = parseSkill(skillMdContent)
  const skillName = parsed.frontmatter.name

  // Cap total download size at 10 MB to keep runaway repos from draining
  // the R2 bucket. If this proves too low for real skills we can raise it.
  const MAX_TOTAL = 10 * 1024 * 1024
  let totalBytes = 0

  // Upload every file into R2 under `${userId}/${skillName}/<relativePath>`
  // — userId scoping keeps one user's install separate from another's.
  const r2Prefix = `${userId}/${skillName}`
  for (const file of files) {
    const content = await fetchGitHubBlob(spec, file.path)
    totalBytes += content.length
    if (totalBytes > MAX_TOTAL) {
      throw new Error(`Directory exceeds 10 MB limit; import aborted at ${file.path}.`)
    }
    const r2Key = `${r2Prefix}/${file.path}`
    await env.SKILLS.put(r2Key, content, {
      httpMetadata: { contentType: guessMimeType(file.path) },
    })
  }

  // Register the skill pointing to R2 source.
  const db = drizzle(env.DB)
  const existing = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.name, skillName)))
    .get()
  const values = {
    description: parsed.frontmatter.description,
    source: 'r2' as const,
    path: `${r2Prefix}/SKILL.md`,
    metadata: JSON.stringify({
      ...parsed.frontmatter,
      _origin: `github:${spec.owner}/${spec.repo}@${spec.ref}/${spec.path}`,
    }),
  }
  if (existing) {
    await db
      .update(skills)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(skills.id, existing.id))
  } else {
    await db.insert(skills).values({ userId, name: skillName, ...values })
  }

  return {
    name: skillName,
    description: parsed.frontmatter.description,
    files: files.map((f) => f.path),
  }
}

/**
 * Import a skill from an uploaded ZIP archive. Expects the zip to contain
 * exactly one skill at the root: `SKILL.md` plus any number of sibling
 * files/folders. Returns the parsed name + file list.
 *
 * Workers-friendly: uses fflate (no native deps) and stays in memory.
 */
export async function addSkillFromZip(
  env: SkillsEnv,
  zipBytes: Uint8Array,
  userId: string = BUNDLED_USER_ID
): Promise<{ name: string; description: string; files: string[] }> {
  if (!env.SKILLS)
    throw new Error('SKILLS R2 bucket required for zip imports — bind it in wrangler.jsonc')

  const { unzipSync, strFromU8 } = await import('fflate')
  const unzipped = unzipSync(zipBytes)
  const entries = Object.entries(unzipped)
  if (entries.length === 0) throw new Error('Zip file is empty')

  // Some archivers include a wrapping folder. Detect and strip it.
  const firstSegments = new Set(entries.map(([p]) => p.split('/')[0]))
  const wrapper = firstSegments.size === 1 ? `${[...firstSegments][0]}/` : ''

  const filesByPath: Record<string, Uint8Array> = {}
  for (const [p, content] of entries) {
    if (p.endsWith('/')) continue // skip directory entries
    const rel = wrapper && p.startsWith(wrapper) ? p.slice(wrapper.length) : p
    if (!rel) continue
    filesByPath[rel] = content
  }

  const skillMd = filesByPath['SKILL.md']
  if (!skillMd)
    throw new Error('Zip must contain SKILL.md at the root (or inside a single wrapping folder).')

  const skillMdText = strFromU8(skillMd)
  const parsed = parseSkill(skillMdText)
  const skillName = parsed.frontmatter.name

  // 10 MB cap — same as GitHub import
  const MAX_TOTAL = 10 * 1024 * 1024
  let totalBytes = 0
  for (const buf of Object.values(filesByPath)) totalBytes += buf.length
  if (totalBytes > MAX_TOTAL)
    throw new Error(`Zip contents exceed 10 MB limit (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`)

  // Upload each file into R2 under `${userId}/${skillName}/<rel>`
  const r2Prefix = `${userId}/${skillName}`
  for (const [rel, buf] of Object.entries(filesByPath)) {
    const r2Key = `${r2Prefix}/${rel}`
    await env.SKILLS.put(r2Key, buf, { httpMetadata: { contentType: guessMimeType(rel) } })
  }

  // Register the skill
  const db = drizzle(env.DB)
  const existing = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.name, skillName)))
    .get()
  const values = {
    description: parsed.frontmatter.description,
    source: 'r2' as const,
    path: `${r2Prefix}/SKILL.md`,
    metadata: JSON.stringify({ ...parsed.frontmatter, _origin: 'zip-upload' }),
  }
  if (existing) {
    await db
      .update(skills)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(skills.id, existing.id))
  } else {
    await db.insert(skills).values({ userId, name: skillName, ...values })
  }

  return {
    name: skillName,
    description: parsed.frontmatter.description,
    files: Object.keys(filesByPath),
  }
}

// =======================================================================
// GitHub helpers — shared between directory import and single-file import
// =======================================================================

interface GitHubSpec {
  owner: string
  repo: string
  ref: string
  /** The path inside the repo (directory, not including trailing slash) */
  path: string
}

/**
 * Parse several input formats down to a GitHubSpec. Returns null if none match.
 */
function parseGitHubSpec(input: string): GitHubSpec | null {
  const trimmed = input.trim().replace(/\/+$/, '')

  // https://github.com/{owner}/{repo}/(tree|blob)/{ref}/{path}
  const urlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(tree|blob)\/([^/]+)\/(.+)$/
  )
  if (urlMatch) {
    const [, owner, repo, kind, ref, rest] = urlMatch
    // If the user linked to the SKILL.md itself, trim back to the parent dir
    const path =
      kind === 'blob' && rest!.endsWith('SKILL.md') ? rest!.replace(/\/SKILL\.md$/, '') : rest!
    return { owner: owner!, repo: repo!, ref: ref!, path }
  }

  // owner/repo/path or owner/repo#ref/path
  const shorthand = trimmed.match(/^([^/]+)\/([^/#]+)(?:#([^/]+))?\/(.+)$/)
  if (shorthand) {
    const [, owner, repo, ref, path] = shorthand
    return { owner: owner!, repo: repo!, ref: ref || 'main', path: path! }
  }

  return null
}

interface GitHubFile {
  path: string // relative to spec.path
  sha: string
  size: number
}

/**
 * List every file under {spec.path} in the repo at the given ref using the
 * GitHub Git Trees API. Recursive. Capped at 1000 entries per GitHub limits.
 */
async function listGitHubTree(spec: GitHubSpec): Promise<GitHubFile[]> {
  const treeUrl = `https://api.github.com/repos/${spec.owner}/${spec.repo}/git/trees/${spec.ref}?recursive=1`
  const resp = await fetch(treeUrl, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'vite-flare-starter-skills',
    },
  })
  if (!resp.ok) throw new Error(`GitHub tree fetch failed: ${resp.status} ${resp.statusText}`)
  const data = (await resp.json()) as {
    tree: Array<{ path: string; type: string; sha: string; size?: number }>
    truncated?: boolean
  }
  if (data.truncated) {
    console.warn(
      `GitHub tree response truncated for ${spec.owner}/${spec.repo}@${spec.ref}; some files may be missing.`
    )
  }
  const prefix = spec.path ? `${spec.path}/` : ''
  return data.tree
    .filter((e) => e.type === 'blob' && (prefix === '' || e.path.startsWith(prefix)))
    .map((e) => ({
      path: prefix ? e.path.slice(prefix.length) : e.path,
      sha: e.sha,
      size: e.size ?? 0,
    }))
    .filter((e) => e.path.length > 0)
}

/**
 * Fetch a single file's raw content from a GitHub repo at the given ref.
 */
async function fetchGitHubBlob(spec: GitHubSpec, relPath: string): Promise<string> {
  const fullPath = spec.path ? `${spec.path}/${relPath}` : relPath
  const rawUrl = `https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${spec.ref}/${fullPath}`
  const resp = await fetch(rawUrl, { headers: { 'User-Agent': 'vite-flare-starter-skills' } })
  if (!resp.ok) throw new Error(`Failed to fetch ${rawUrl}: ${resp.status}`)
  return resp.text()
}

/** Best-effort MIME type from extension. Defaults to octet-stream. */
function guessMimeType(path: string): string {
  const ext = path.toLowerCase().split('.').pop() || ''
  const map: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    py: 'text/x-python',
    sh: 'text/x-shellscript',
    bash: 'text/x-shellscript',
    js: 'text/javascript',
    mjs: 'text/javascript',
    ts: 'text/typescript',
    csv: 'text/csv',
    html: 'text/html',
    xml: 'application/xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
  }
  return map[ext] || 'application/octet-stream'
}

/**
 * Upload a skill to R2.
 */
export async function uploadSkillToR2(
  env: SkillsEnv,
  content: string,
  userId: string,
  options?: { overwrite?: boolean }
): Promise<{ name: string; description: string; path: string }> {
  if (!env.SKILLS) throw new Error('SKILLS R2 bucket not configured')

  const parsed = parseSkill(content)
  const name = parsed.frontmatter.name
  const path = `${userId}/${name}/SKILL.md`

  const db = drizzle(env.DB)
  // Lookup is scoped to (userId, name) — another user owning a row
  // with the same name is fine and does not conflict.
  const existing = await db
    .select()
    .from(skills)
    .where(and(eq(skills.userId, userId), eq(skills.name, name)))
    .get()

  if (existing && !options?.overwrite) {
    throw new Error(`Skill "${name}" already exists for this user. Set overwrite: true to replace.`)
  }

  await env.SKILLS.put(path, content, { httpMetadata: { contentType: 'text/markdown' } })

  if (existing) {
    await db
      .update(skills)
      .set({
        description: parsed.frontmatter.description,
        source: 'r2',
        path,
        metadata: JSON.stringify(parsed.frontmatter),
        updatedAt: new Date(),
      })
      .where(eq(skills.id, existing.id))
  } else {
    await db.insert(skills).values({
      userId,
      name,
      description: parsed.frontmatter.description,
      source: 'r2',
      path,
      metadata: JSON.stringify(parsed.frontmatter),
    })
  }

  return { name, description: parsed.frontmatter.description, path }
}
