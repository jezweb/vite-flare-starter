/**
 * Hono RPC Clients
 *
 * Type-safe API clients generated from server route types.
 * Non-streaming endpoints only — streaming chat uses AI SDK's DefaultChatTransport.
 *
 * @example
 * import { chatRpc } from '@/client/lib/rpc'
 *
 * const res = await chatRpc.usage.$get()
 * const data = await res.json()
 */
import { hc } from 'hono/client'
import type { ChatRoutes } from '@/server/modules/chat/routes'

export const chatRpc = hc<ChatRoutes>('/api/chat', {
  init: { credentials: 'include' },
})
