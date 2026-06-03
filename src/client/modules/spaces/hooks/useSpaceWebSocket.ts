/**
 * useSpaceWebSocket — connect to SpaceAgent DO for live message + presence.
 *
 * The DO route prefix is /agents/space-agent/<spaceId>. We use the
 * agents-SDK `useAgent` hook so cookies travel with the upgrade
 * (same-origin, default browser behaviour). The hook returns:
 *   - online: array of userIds currently connected
 *   - connected: boolean — whether the WS is open
 *
 * New `message` frames flow into the TanStack Query cache via
 * onMessage so the existing useSpaceMessages query reflects them
 * without a refetch round-trip. Welcome / presence frames update
 * the local online roster.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAgent } from 'agents/react'
import type { SpaceMessage } from './useSpaces'

interface SpaceWelcome {
  type: 'welcome'
  spaceId: string
  online: string[]
}
interface SpacePresence {
  type: 'presence'
  online: string[]
}
interface SpaceMessageFrame {
  type: 'message'
  message: SpaceMessage
}
interface SpaceDeleteFrame {
  type: 'message_deleted'
  messageId: string
}

type Frame = SpaceWelcome | SpacePresence | SpaceMessageFrame | SpaceDeleteFrame

export function useSpaceWebSocket(spaceId: string | undefined) {
  const qc = useQueryClient()
  const [online, setOnline] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  // Avoid re-subscribing inside the agent hook on every render — useAgent
  // captures props on first call. We mutate refs instead.
  const onlineRef = useRef<string[]>([])
  onlineRef.current = online

  const handleMessage = useCallback(
    (ev: MessageEvent) => {
      try {
        const data = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as Frame
        if (data.type === 'welcome') {
          setOnline(Array.isArray(data.online) ? data.online : [])
          setConnected(true)
          return
        }
        if (data.type === 'presence') {
          setOnline(Array.isArray(data.online) ? data.online : [])
          return
        }
        if (data.type === 'message' && data.message) {
          // Push the new message into the top-level + thread caches.
          // Idempotent: skip if we've already inserted by id (a
          // concurrent message reaction broadcast or the sender's own
          // POST response can race).
          const msg = data.message
          const isThread = !!msg.parentMessageId
          qc.setQueryData<{ messages: SpaceMessage[] }>(
            ['spaces', spaceId, 'messages', isThread ? msg.parentMessageId : 'top'],
            (prev) => {
              if (!prev) return prev
              const existingIdx = prev.messages.findIndex((m) => m.id === msg.id)
              if (existingIdx >= 0) {
                // Update in place — covers reaction broadcasts on
                // already-rendered messages.
                const next = prev.messages.slice()
                next[existingIdx] = msg
                return { messages: next }
              }
              return { messages: [...prev.messages, msg] }
            }
          )
          // Also bump the parent message's threadCount in the top-level
          // cache when this is a thread reply.
          if (isThread) {
            qc.setQueryData<{ messages: SpaceMessage[] }>(
              ['spaces', spaceId, 'messages', 'top'],
              (prev) => {
                if (!prev) return prev
                return {
                  messages: prev.messages.map((m) =>
                    m.id === msg.parentMessageId
                      ? {
                          ...m,
                          threadCount: (m.threadCount ?? 0) + 1,
                          lastThreadAt: Math.floor(Date.now() / 1000),
                        }
                      : m
                  ),
                }
              }
            )
          }
        } else if (data.type === 'message_deleted') {
          // Remove the row from every cached bucket — top-level and
          // any open thread. Also strip thread replies whose parent is
          // the deleted message (cascade is server-side via FK, but
          // this keeps the UI in sync without a refetch).
          const queries = qc.getQueriesData<{ messages: SpaceMessage[] }>({
            queryKey: ['spaces', spaceId, 'messages'],
          })
          for (const [key, value] of queries) {
            if (!value || !Array.isArray(value.messages)) continue
            qc.setQueryData(key, {
              messages: value.messages.filter(
                (m) => m.id !== data.messageId && m.parentMessageId !== data.messageId
              ),
            })
          }
        }
      } catch {
        /* ignore non-JSON frames */
      }
    },
    [qc, spaceId]
  )

  const agent = useAgent({
    agent: 'SpaceAgent',
    name: spaceId ?? 'pending',
    onMessage: handleMessage,
    onClose: () => setConnected(false),
  })

  // Mark disconnected if the spaceId changes (useAgent will tear down the old WS).
  useEffect(() => {
    setConnected(false)
  }, [spaceId])

  return { online, connected, agent }
}
