/**
 * Artifact store — the write path used by the create/edit chat tools
 * and the read path used by the routes + share resolver.
 *
 * Ownership rule: an edit only chains onto an artifact within the
 * caller's tenancy scope (their own in per-user mode; the team's in
 * shared mode, mirroring scopeUser). An edit against a foreign or
 * unknown id starts a fresh artifact instead — the tool always
 * succeeds, and a guessed id can't append versions to someone else's
 * document. The chain's TYPE is fixed at creation: edits keep the
 * original type, so a published markdown doc can't be flipped to
 * script-capable html on a later edit.
 *
 * Concurrency: the version number is allocated by an atomic
 * `latest_version + 1` UPDATE…RETURNING (no read-modify-write race),
 * and reads never trust the denormalised pointer — getLatestVersion
 * takes MAX(version) so a failed insert after a pointer bump degrades
 * to "latest existing version", not a broken artifact.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, sql } from 'drizzle-orm'
import { scopeUser, isCondition } from '@/server/lib/tenancy'
import { artifacts, artifactVersions, type ArtifactType } from './db/schema'

export interface ArtifactEnv {
  DB: D1Database
}

interface CreateInput {
  userId: string
  conversationId?: string | null
  type: ArtifactType
  title: string
  code: string
  height?: number
}

const now = () => Math.floor(Date.now() / 1000)

export async function createArtifact(
  env: ArtifactEnv,
  input: CreateInput
): Promise<{ artifactId: string; version: 1 }> {
  const db = drizzle(env.DB)
  const artifactId = crypto.randomUUID()
  const ts = now()
  // One atomic batch — a partial failure can't leave a listed artifact
  // with no content row (D1 applies a batch as an implicit transaction).
  await db.batch([
    db.insert(artifacts).values({
      id: artifactId,
      userId: input.userId,
      conversationId: input.conversationId ?? null,
      type: input.type,
      title: input.title,
      latestVersion: 1,
      createdAt: ts,
      updatedAt: ts,
    }),
    db.insert(artifactVersions).values({
      artifactId,
      version: 1,
      title: input.title,
      code: input.code,
      height: input.height ?? null,
      createdAt: ts,
    }),
  ])
  return { artifactId, version: 1 }
}

/**
 * Append a version to an in-scope artifact; falls back to creating a
 * new artifact when the id is unknown / out of scope / legacy
 * (pre-table edits reference message ids that never had a row).
 * Returns `forked: true` on that fallback so callers can tell a
 * chained edit from a fresh copy.
 */
export async function addArtifactVersion(
  env: ArtifactEnv,
  input: CreateInput & { artifactId: string }
): Promise<{ artifactId: string; version: number; forked?: boolean }> {
  const db = drizzle(env.DB)
  const scopeConditions = [
    eq(artifacts.id, input.artifactId),
    scopeUser(artifacts.userId, input.userId),
  ].filter(isCondition)
  const [owned] = await db
    .select({ id: artifacts.id, type: artifacts.type })
    .from(artifacts)
    .where(and(...scopeConditions))
    .limit(1)
  if (!owned) {
    const created = await createArtifact(env, input)
    return { ...created, forked: true }
  }

  // Atomic version allocation — concurrent edits each get their own
  // number instead of racing a read-modify-write. Type is pinned to
  // the chain's original (see module docblock).
  const [bumped] = await db
    .update(artifacts)
    .set({
      latestVersion: sql`${artifacts.latestVersion} + 1`,
      title: input.title,
      updatedAt: now(),
    })
    .where(eq(artifacts.id, owned.id))
    .returning({ version: artifacts.latestVersion })
  const version = bumped!.version
  await db.insert(artifactVersions).values({
    artifactId: owned.id,
    version,
    title: input.title,
    code: input.code,
    height: input.height ?? null,
  })
  return { artifactId: owned.id, version }
}

/**
 * Latest version row for an artifact, or null. Uses MAX(version), not
 * the denormalised pointer, so a bumped-pointer-without-row state
 * (crashed edit) degrades to the newest REAL version.
 */
export async function getLatestVersion(env: ArtifactEnv, artifactId: string) {
  const db = drizzle(env.DB)
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, artifactId))
    .limit(1)
  if (!artifact) return null
  const [version] = await db
    .select()
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(desc(artifactVersions.version))
    .limit(1)
  if (!version) return null
  return { artifact, version }
}

/**
 * Version METADATA (no code) — full history can be megabytes across
 * dozens of AI iterations, which would blow D1/Worker response limits
 * in one unpaginated read. Fetch a specific version's code via
 * getVersion().
 */
export async function listVersions(env: ArtifactEnv, artifactId: string) {
  const db = drizzle(env.DB)
  return db
    .select({
      version: artifactVersions.version,
      title: artifactVersions.title,
      height: artifactVersions.height,
      createdAt: artifactVersions.createdAt,
    })
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(desc(artifactVersions.version))
}

/** One full version row (with code), or null. */
export async function getVersion(env: ArtifactEnv, artifactId: string, version: number) {
  const db = drizzle(env.DB)
  const [row] = await db
    .select()
    .from(artifactVersions)
    .where(and(eq(artifactVersions.artifactId, artifactId), eq(artifactVersions.version, version)))
    .limit(1)
  return row ?? null
}
