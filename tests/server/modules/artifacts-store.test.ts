/**
 * Artifact store (#40 WorkspacePanel) — version chaining + ownership.
 *
 * The behaviours the panel depends on: create → v1, edit → v2..vN with
 * latestVersion tracked, and the security rule that an edit against a
 * FOREIGN or UNKNOWN artifact id forks a fresh artifact instead of
 * appending to someone else's document.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import {
  createArtifact,
  addArtifactVersion,
  getLatestVersion,
  listVersions,
} from '@/server/modules/artifacts/store'

beforeAll(async () => {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS artifacts (
       id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT,
       type TEXT NOT NULL, title TEXT NOT NULL,
       latest_version INTEGER NOT NULL DEFAULT 1,
       created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
     )`
  ).run()
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS artifact_versions (
       id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL, version INTEGER NOT NULL,
       title TEXT NOT NULL, code TEXT NOT NULL, height INTEGER,
       created_at INTEGER NOT NULL,
       UNIQUE(artifact_id, version)
     )`
  ).run()
  await env.DB.prepare('DELETE FROM artifact_versions').run()
  await env.DB.prepare('DELETE FROM artifacts').run()
})

describe('artifact store', () => {
  it('create → v1; edits chain v2, v3 and update the latest pointer', async () => {
    const created = await createArtifact(env, {
      userId: 'owner-a',
      conversationId: 'conv-1',
      type: 'markdown',
      title: 'Plan',
      code: '# v1',
    })
    expect(created.version).toBe(1)

    const v2 = await addArtifactVersion(env, {
      artifactId: created.artifactId,
      userId: 'owner-a',
      type: 'markdown',
      title: 'Plan (revised)',
      code: '# v2',
    })
    expect(v2).toEqual({ artifactId: created.artifactId, version: 2 })

    const v3 = await addArtifactVersion(env, {
      artifactId: created.artifactId,
      userId: 'owner-a',
      type: 'markdown',
      title: 'Plan (final)',
      code: '# v3',
    })
    expect(v3.version).toBe(3)

    const latest = await getLatestVersion(env, created.artifactId)
    expect(latest?.artifact.latestVersion).toBe(3)
    expect(latest?.version.code).toBe('# v3')
    expect(latest?.artifact.title).toBe('Plan (final)')

    const versions = await listVersions(env, created.artifactId)
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1])
  })

  it("editing someone else's artifact forks a new one instead of appending", async () => {
    const created = await createArtifact(env, {
      userId: 'owner-a',
      type: 'html',
      title: 'Dashboard',
      code: '<html>a</html>',
    })

    const foreign = await addArtifactVersion(env, {
      artifactId: created.artifactId,
      userId: 'attacker-b',
      type: 'html',
      title: 'Hijacked',
      code: '<html>evil</html>',
    })
    // New artifact id, version 1, flagged as a fork — the victim's
    // chain is untouched.
    expect(foreign.artifactId).not.toBe(created.artifactId)
    expect(foreign.version).toBe(1)
    expect(foreign.forked).toBe(true)
    const victim = await getLatestVersion(env, created.artifactId)
    expect(victim?.artifact.latestVersion).toBe(1)
    expect(victim?.version.code).toBe('<html>a</html>')
  })

  it("an edit cannot flip the chain's type (markdown stays markdown)", async () => {
    const created = await createArtifact(env, {
      userId: 'owner-a',
      type: 'markdown',
      title: 'Doc',
      code: '# doc',
    })
    await addArtifactVersion(env, {
      artifactId: created.artifactId,
      userId: 'owner-a',
      type: 'html', // hostile/mistaken type change
      title: 'Doc',
      code: '<script>alert(1)</script>',
    })
    const latest = await getLatestVersion(env, created.artifactId)
    expect(latest?.artifact.type).toBe('markdown') // pinned — renderers never treat it as html
    expect(latest?.version.version).toBe(2)
  })

  it('editing an unknown/legacy id creates a fresh artifact', async () => {
    const result = await addArtifactVersion(env, {
      artifactId: 'legacy-message-id-123',
      userId: 'owner-a',
      type: 'svg',
      title: 'Logo',
      code: '<svg/>',
    })
    expect(result.artifactId).not.toBe('legacy-message-id-123')
    expect(result.version).toBe(1)
  })
})
