/**
 * saveChat storage-layer owner check (#95 defense-in-depth).
 *
 * The chat-agent entry point already authorises the user, but the
 * storage layer must independently refuse to write messages into a
 * conversation the acting user is not a member of — so no future
 * caller can regress into a cross-user write.
 *
 * Migrations don't auto-apply in the vitest harness — tables created
 * in beforeAll with only the columns saveChat/isMember touch.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import { createD1ChatStorage } from '@/server/modules/conversations/storage'
import type { UIMessage } from 'ai'

const OWNER = 'user-owner'
const MEMBER = 'user-member'
const STRANGER = 'user-stranger'
const CONV = 'conv-save-chat-1'

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const stmt = env.DB.prepare(sql)
  await (params.length > 0 ? stmt.bind(...params).run() : stmt.run())
}

const msg = (id: string): UIMessage =>
  ({ id, role: 'user', parts: [{ type: 'text', text: `hello ${id}` }] }) as UIMessage

beforeAll(async () => {
  await runSql(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, updated_at INTEGER
  )`)
  await runSql(`CREATE TABLE IF NOT EXISTS conversation_messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL,
    parts TEXT NOT NULL, metadata TEXT, parent_message_id TEXT,
    thread_count INTEGER NOT NULL DEFAULT 0, last_thread_at INTEGER,
    reactions TEXT, pinned_at INTEGER, pinned_by_user_id TEXT,
    starred_by_user_ids TEXT, quoted_message_id TEXT, created_at INTEGER
  )`)
  await runSql(`CREATE TABLE IF NOT EXISTS conversation_members (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    conversation_id TEXT NOT NULL, kind TEXT NOT NULL, user_id TEXT,
    agent_class TEXT, agent_name TEXT, reply_mode TEXT,
    role TEXT NOT NULL DEFAULT 'member', joined_at INTEGER NOT NULL DEFAULT 0,
    last_read_at INTEGER, notification_level TEXT NOT NULL DEFAULT 'all',
    pinned_to_sidebar INTEGER NOT NULL DEFAULT 0, invited_by_user_id TEXT,
    blocked_at INTEGER
  )`)
  await runSql(`INSERT OR REPLACE INTO conversations (id, user_id) VALUES (?, ?)`, [CONV, OWNER])
  await runSql(
    `INSERT INTO conversation_members (id, conversation_id, kind, user_id, role) VALUES
     ('m-owner', ?, 'user', ?, 'owner'), ('m-member', ?, 'user', ?, 'member')`,
    [CONV, OWNER, CONV, MEMBER]
  )
})

describe('saveChat owner check (#95)', () => {
  const storage = () => createD1ChatStorage(env.DB)

  it('allows the owner to save messages', async () => {
    await storage().saveChat({ conversationId: CONV, messages: [msg('m1')], userId: OWNER })
    const rows = await env.DB.prepare(
      'SELECT id FROM conversation_messages WHERE conversation_id = ?'
    )
      .bind(CONV)
      .all()
    expect(rows.results.map((r) => r['id'])).toContain('m1')
  })

  it('allows a non-owner space member to save messages', async () => {
    await storage().saveChat({ conversationId: CONV, messages: [msg('m2')], userId: MEMBER })
  })

  it('rejects a non-member — nothing is written', async () => {
    await expect(
      storage().saveChat({ conversationId: CONV, messages: [msg('m3')], userId: STRANGER })
    ).rejects.toThrow(/not a member/)
    const rows = await env.DB.prepare('SELECT id FROM conversation_messages WHERE id = ?')
      .bind('m3')
      .all()
    expect(rows.results).toHaveLength(0)
  })

  it('rejects writes to a nonexistent conversation (fail closed)', async () => {
    await expect(
      storage().saveChat({ conversationId: 'conv-missing', messages: [msg('m4')], userId: OWNER })
    ).rejects.toThrow(/not a member/)
  })

  it('falls back to legacy conversations.user_id when no member rows exist', async () => {
    await runSql(`INSERT OR REPLACE INTO conversations (id, user_id) VALUES ('conv-legacy', ?)`, [
      OWNER,
    ])
    await storage().saveChat({
      conversationId: 'conv-legacy',
      messages: [msg('m5')],
      userId: OWNER,
    })
    await expect(
      storage().saveChat({
        conversationId: 'conv-legacy',
        messages: [msg('m6')],
        userId: STRANGER,
      })
    ).rejects.toThrow(/not a member/)
  })
})
