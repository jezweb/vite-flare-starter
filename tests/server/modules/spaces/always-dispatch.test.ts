/**
 * P2-002 — always-mode agent dispatch fires on zero-mention top-level
 * messages.
 *
 * The bug: `dispatchMentions` early-returned on `mentions.length === 0`
 * AND the route call site (`/api/spaces/:id/messages`) only invoked
 * dispatch when `mentions.length > 0`. Spaces seeded with an
 * always-mode agent (e.g. AdminAgent in /admin) appeared silent
 * because plain user messages with zero @-mentions never reached the
 * always-agent fan-out.
 *
 * This test pins the routing decision: when a space has an
 * always-mode agent member and a top-level message arrives with zero
 * mentions, the dispatcher MUST traverse to the always-fan-out
 * branch. We assert by counting `runOnce` invocations on a stub DO
 * namespace.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { dispatchMentions } from '@/server/modules/spaces/dispatch'

const SPACE_ID = 'space-always-dispatch-test'
const SENDER = 'user-always-test'

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const stmt = env.DB.prepare(sql)
  await (params.length > 0 ? stmt.bind(...params).run() : stmt.run())
}

async function ensureSchema(): Promise<void> {
  // Minimal subset of the conversation_members + conversation_messages
  // schema needed by dispatchMentions + runAlwaysAgents.
  await runSql(`CREATE TABLE IF NOT EXISTS conversation_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    user_id TEXT,
    agent_class TEXT,
    agent_name TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    notification_level TEXT NOT NULL DEFAULT 'all',
    pinned_to_sidebar INTEGER NOT NULL DEFAULT 0,
    reply_mode TEXT
  )`)
  await runSql(`CREATE TABLE IF NOT EXISTS conversation_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    parts TEXT,
    metadata TEXT,
    parent_message_id TEXT,
    quoted_message_id TEXT,
    thread_count INTEGER NOT NULL DEFAULT 0,
    last_thread_at INTEGER,
    pinned_at INTEGER,
    pinned_by_user_id TEXT,
    starred_by_user_ids TEXT,
    reactions TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`)
}

async function clearTables(): Promise<void> {
  await runSql(`DELETE FROM conversation_members WHERE conversation_id = ?`, [SPACE_ID])
  await runSql(`DELETE FROM conversation_messages WHERE conversation_id = ?`, [SPACE_ID])
}

interface StubCalls {
  setOwnerCalls: number
  runOnceCalls: number
  lastInput: string | null
}

function makeStubNamespace(reply: string): {
  namespace: unknown
  calls: StubCalls
} {
  const calls: StubCalls = { setOwnerCalls: 0, runOnceCalls: 0, lastInput: null }
  const stub = {
    setOwner: async (_userId: string) => {
      calls.setOwnerCalls += 1
    },
    runOnce: async (input: { input: string }) => {
      calls.runOnceCalls += 1
      calls.lastInput = input.input
      return { text: reply }
    },
  }
  const namespace = {
    idFromName: (name: string) => ({ toString: () => name }),
    get: (_id: unknown) => stub,
  }
  return { namespace, calls }
}

beforeAll(async () => {
  await ensureSchema()
})

describe('P2-002 — always-mode dispatch on zero-mention top-level message', () => {
  beforeEach(async () => {
    await clearTables()
  })

  it('fires the always-mode agent when the user sends a plain message with no mentions', async () => {
    // Seed the space with one always-mode agent member.
    await runSql(
      `INSERT INTO conversation_members
       (conversation_id, kind, agent_class, agent_name, reply_mode)
       VALUES (?, 'agent', 'AdminAgent', 'admin', 'always')`,
      [SPACE_ID]
    )
    // Seed a triggering top-level message — needed because runAlwaysAgents
    // calls loadContextMessages which selects from conversation_messages.
    const triggerId = 'msg-trigger-1'
    await runSql(
      `INSERT INTO conversation_messages (id, conversation_id, role, parts)
       VALUES (?, ?, 'user', ?)`,
      [triggerId, SPACE_ID, JSON.stringify([{ type: 'text', text: 'diagnostic ping' }])]
    )

    const { namespace, calls } = makeStubNamespace('Pong! Always-mode reply.')
    const broadcasts: string[] = []
    const dispatchEnv = {
      DB: env.DB,
      AdminAgent: namespace,
    } as unknown as Parameters<typeof dispatchMentions>[0]['env']

    const result = await dispatchMentions({
      env: dispatchEnv,
      spaceId: SPACE_ID,
      senderUserId: SENDER,
      triggerMessageId: triggerId,
      parentMessageId: null,
      mentions: [], // <-- zero mentions, like a plain user message
      inputText: 'diagnostic ping',
      broadcastNewMessage: async (mid) => {
        broadcasts.push(mid)
      },
    })

    expect(calls.runOnceCalls).toBe(1)
    expect(calls.setOwnerCalls).toBe(1)
    expect(calls.lastInput).toBe('diagnostic ping')
    expect(result.replyMessageIds.length).toBe(1)
    expect(broadcasts.length).toBe(1)
  })

  it('does NOT fire always-mode agent for in-thread messages (top-level only)', async () => {
    await runSql(
      `INSERT INTO conversation_members
       (conversation_id, kind, agent_class, agent_name, reply_mode)
       VALUES (?, 'agent', 'AdminAgent', 'admin', 'always')`,
      [SPACE_ID]
    )

    const { namespace, calls } = makeStubNamespace('should not fire')
    const dispatchEnv = {
      DB: env.DB,
      AdminAgent: namespace,
    } as unknown as Parameters<typeof dispatchMentions>[0]['env']

    const result = await dispatchMentions({
      env: dispatchEnv,
      spaceId: SPACE_ID,
      senderUserId: SENDER,
      triggerMessageId: 'msg-thread-trigger',
      parentMessageId: 'msg-thread-parent', // <-- in-thread
      mentions: [],
      inputText: 'reply inside thread',
      broadcastNewMessage: async () => {},
    })

    expect(calls.runOnceCalls).toBe(0)
    expect(result.replyMessageIds.length).toBe(0)
  })

  it('skips agents in non-always reply modes when no @-mention is present', async () => {
    // mention-mode agent should NOT fire on a zero-mention message
    await runSql(
      `INSERT INTO conversation_members
       (conversation_id, kind, agent_class, agent_name, reply_mode)
       VALUES (?, 'agent', 'AdminAgent', 'admin', 'mention')`,
      [SPACE_ID]
    )

    const { namespace, calls } = makeStubNamespace('should not fire')
    const dispatchEnv = {
      DB: env.DB,
      AdminAgent: namespace,
    } as unknown as Parameters<typeof dispatchMentions>[0]['env']

    const result = await dispatchMentions({
      env: dispatchEnv,
      spaceId: SPACE_ID,
      senderUserId: SENDER,
      triggerMessageId: 'msg-no-mention-trigger',
      parentMessageId: null,
      mentions: [],
      inputText: 'no mentions here',
      broadcastNewMessage: async () => {},
    })

    expect(calls.runOnceCalls).toBe(0)
    expect(result.replyMessageIds.length).toBe(0)
  })

  it('caps always-agent fan-out at 2 per message', async () => {
    // 3 always-mode agents — only first 2 should fire (ALWAYS_CAP=2).
    await runSql(
      `INSERT INTO conversation_members
       (conversation_id, kind, agent_class, agent_name, reply_mode)
       VALUES (?, 'agent', 'AdminAgent', 'a1', 'always'),
              (?, 'agent', 'AdminAgent', 'a2', 'always'),
              (?, 'agent', 'AdminAgent', 'a3', 'always')`,
      [SPACE_ID, SPACE_ID, SPACE_ID]
    )
    // Trigger message
    await runSql(
      `INSERT INTO conversation_messages (id, conversation_id, role, parts)
       VALUES ('msg-cap-trigger', ?, 'user', ?)`,
      [SPACE_ID, JSON.stringify([{ type: 'text', text: 'cap test' }])]
    )

    const { namespace, calls } = makeStubNamespace('reply')
    const dispatchEnv = {
      DB: env.DB,
      AdminAgent: namespace,
    } as unknown as Parameters<typeof dispatchMentions>[0]['env']

    await dispatchMentions({
      env: dispatchEnv,
      spaceId: SPACE_ID,
      senderUserId: SENDER,
      triggerMessageId: 'msg-cap-trigger',
      parentMessageId: null,
      mentions: [],
      inputText: 'cap test',
      broadcastNewMessage: async () => {},
    })

    expect(calls.runOnceCalls).toBe(2) // capped at 2
  })
})
