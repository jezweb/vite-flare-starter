# Adding Realtime Features

Guide for implementing WebSockets, live updates, and collaborative features using Cloudflare Durable Objects.

**Time estimate**: 4-6 hours for basic realtime, 8-12 hours for collaborative features

---

## When to Use Realtime

**Use WebSockets when:**
- Live notifications
- Chat applications
- Collaborative editing
- Real-time dashboards
- Presence indicators

**Use polling when:**
- Updates every 30+ seconds are acceptable
- Simple status checks
- Lower complexity is preferred

---

## Architecture Overview

```
┌─────────┐     ┌─────────────┐     ┌──────────────────┐
│ Browser │────▶│   Worker    │────▶│  Durable Object  │
│   WS    │◀────│  (Router)   │◀────│  (State + Logic) │
└─────────┘     └─────────────┘     └──────────────────┘
```

- **Worker**: Routes requests, handles auth, proxies to Durable Objects
- **Durable Object**: Maintains state, manages WebSocket connections

---

## Setup

### 1. Enable Durable Objects

```jsonc
// wrangler.jsonc
{
  "durable_objects": {
    "bindings": [
      { "name": "ROOMS", "class_name": "ChatRoom" },
      { "name": "PRESENCE", "class_name": "PresenceTracker" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_classes": ["ChatRoom", "PresenceTracker"] }
  ]
}
```

### 2. Update Types

```typescript
// src/server/env.d.ts
interface Env {
  ROOMS: DurableObjectNamespace
  PRESENCE: DurableObjectNamespace
}
```

---

## Chat Room Durable Object

```typescript
// src/server/durable-objects/chat-room.ts
import { DurableObject } from 'cloudflare:workers'

interface ChatMessage {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
}

interface WebSocketSession {
  userId: string
  userName: string
}

export class ChatRoom extends DurableObject {
  sessions: Map<WebSocket, WebSocketSession> = new Map()
  messages: ChatMessage[] = []

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    // Restore messages from storage
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<ChatMessage[]>('messages')
      if (stored) {
        this.messages = stored
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request)
    }

    // HTTP endpoints
    switch (url.pathname) {
      case '/messages':
        return Response.json({ messages: this.messages.slice(-100) })

      case '/send':
        return this.handleSend(request)

      default:
        return new Response('Not found', { status: 404 })
    }
  }

  async handleWebSocket(request: Request): Promise<Response> {
    // Parse user info from query params (set by Worker after auth)
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const userName = url.searchParams.get('userName')

    if (!userId || !userName) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Create WebSocket pair
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    // Accept with hibernation for efficiency
    this.ctx.acceptWebSocket(server)

    // Store session info
    this.sessions.set(server, { userId, userName })

    // Send recent messages
    server.send(JSON.stringify({
      type: 'history',
      messages: this.messages.slice(-50),
    }))

    // Broadcast join
    this.broadcast({
      type: 'user_joined',
      userId,
      userName,
      timestamp: Date.now(),
    }, server)

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const session = this.sessions.get(ws)
    if (!session) return

    try {
      const data = JSON.parse(message as string)

      switch (data.type) {
        case 'message':
          await this.handleMessage(session, data.content)
          break

        case 'typing':
          this.broadcast({
            type: 'typing',
            userId: session.userId,
            userName: session.userName,
          }, ws)
          break
      }
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  }

  async webSocketClose(ws: WebSocket) {
    const session = this.sessions.get(ws)
    if (session) {
      this.broadcast({
        type: 'user_left',
        userId: session.userId,
        userName: session.userName,
        timestamp: Date.now(),
      })
      this.sessions.delete(ws)
    }
  }

  async handleMessage(session: WebSocketSession, content: string) {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      userId: session.userId,
      userName: session.userName,
      content: content.substring(0, 2000), // Limit length
      timestamp: Date.now(),
    }

    // Store message
    this.messages.push(message)
    if (this.messages.length > 1000) {
      this.messages = this.messages.slice(-500) // Keep last 500
    }
    await this.ctx.storage.put('messages', this.messages)

    // Broadcast to all
    this.broadcast({ type: 'message', message })
  }

  async handleSend(request: Request): Promise<Response> {
    // For HTTP-based sending (alternative to WebSocket)
    const { userId, userName, content } = await request.json<{
      userId: string
      userName: string
      content: string
    }>()

    await this.handleMessage({ userId, userName }, content)
    return Response.json({ success: true })
  }

  broadcast(data: object, exclude?: WebSocket) {
    const message = JSON.stringify(data)

    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(message)
        } catch (error) {
          // Socket closed, will be cleaned up
        }
      }
    }
  }
}
```

---

## Presence Tracker

```typescript
// src/server/durable-objects/presence.ts
import { DurableObject } from 'cloudflare:workers'

interface UserPresence {
  userId: string
  userName: string
  status: 'online' | 'away' | 'busy'
  lastSeen: number
}

export class PresenceTracker extends DurableObject {
  presence: Map<string, UserPresence> = new Map()

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request)
    }

    switch (url.pathname) {
      case '/list':
        return Response.json({
          users: Array.from(this.presence.values()),
        })

      case '/update':
        return this.handleUpdate(request)

      default:
        return new Response('Not found', { status: 404 })
    }
  }

  async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const userName = url.searchParams.get('userName')

    if (!userId || !userName) {
      return new Response('Unauthorized', { status: 401 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.ctx.acceptWebSocket(server, [userId])

    // Set user online
    this.presence.set(userId, {
      userId,
      userName,
      status: 'online',
      lastSeen: Date.now(),
    })

    // Send current presence
    server.send(JSON.stringify({
      type: 'presence_list',
      users: Array.from(this.presence.values()),
    }))

    // Broadcast update
    this.broadcast({
      type: 'presence_update',
      user: this.presence.get(userId),
    }, server)

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const tags = this.ctx.getTags(ws)
    const userId = tags[0]
    if (!userId) return

    try {
      const data = JSON.parse(message as string)

      if (data.type === 'status') {
        const user = this.presence.get(userId)
        if (user) {
          user.status = data.status
          user.lastSeen = Date.now()
          this.broadcast({ type: 'presence_update', user })
        }
      }

      if (data.type === 'heartbeat') {
        const user = this.presence.get(userId)
        if (user) {
          user.lastSeen = Date.now()
        }
      }
    } catch (error) {
      console.error('Presence message error:', error)
    }
  }

  async webSocketClose(ws: WebSocket) {
    const tags = this.ctx.getTags(ws)
    const userId = tags[0]
    if (userId) {
      this.presence.delete(userId)
      this.broadcast({ type: 'presence_remove', userId })
    }
  }

  async handleUpdate(request: Request): Promise<Response> {
    const { userId, status } = await request.json<{
      userId: string
      status: 'online' | 'away' | 'busy'
    }>()

    const user = this.presence.get(userId)
    if (user) {
      user.status = status
      user.lastSeen = Date.now()
      this.broadcast({ type: 'presence_update', user })
    }

    return Response.json({ success: true })
  }

  broadcast(data: object, exclude?: WebSocket) {
    const message = JSON.stringify(data)
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(message)
        } catch {}
      }
    }
  }
}
```

---

## Worker Routes

```typescript
// src/server/modules/realtime/routes.ts
import { Hono } from 'hono'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

// WebSocket upgrade for chat room
app.get('/rooms/:roomId/ws', async (c) => {
  const roomId = c.req.param('roomId')
  const userId = c.get('userId')
  const user = c.get('user')

  // Get or create Durable Object for this room
  const id = c.env.ROOMS.idFromName(roomId)
  const room = c.env.ROOMS.get(id)

  // Forward with user info
  const url = new URL(c.req.url)
  url.pathname = '/'
  url.searchParams.set('userId', userId)
  url.searchParams.set('userName', user.name)

  return room.fetch(url.toString(), {
    headers: c.req.raw.headers,
  })
})

// Get room messages via HTTP
app.get('/rooms/:roomId/messages', async (c) => {
  const roomId = c.req.param('roomId')
  const id = c.env.ROOMS.idFromName(roomId)
  const room = c.env.ROOMS.get(id)

  const url = new URL(c.req.url)
  url.pathname = '/messages'

  return room.fetch(url.toString())
})

// Send message via HTTP (alternative to WebSocket)
app.post('/rooms/:roomId/messages', async (c) => {
  const roomId = c.req.param('roomId')
  const userId = c.get('userId')
  const user = c.get('user')
  const { content } = await c.req.json<{ content: string }>()

  const id = c.env.ROOMS.idFromName(roomId)
  const room = c.env.ROOMS.get(id)

  const url = new URL(c.req.url)
  url.pathname = '/send'

  return room.fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, userName: user.name, content }),
  })
})

// Presence WebSocket
app.get('/presence/ws', async (c) => {
  const userId = c.get('userId')
  const user = c.get('user')

  // Single global presence tracker
  const id = c.env.PRESENCE.idFromName('global')
  const presence = c.env.PRESENCE.get(id)

  const url = new URL(c.req.url)
  url.pathname = '/'
  url.searchParams.set('userId', userId)
  url.searchParams.set('userName', user.name)

  return presence.fetch(url.toString(), {
    headers: c.req.raw.headers,
  })
})

// Get online users
app.get('/presence/list', async (c) => {
  const id = c.env.PRESENCE.idFromName('global')
  const presence = c.env.PRESENCE.get(id)

  const url = new URL(c.req.url)
  url.pathname = '/list'

  return presence.fetch(url.toString())
})

export default app
```

---

## Client Integration

### WebSocket Hook

```typescript
// src/client/lib/use-websocket.ts
import { useEffect, useRef, useCallback, useState } from 'react'

interface UseWebSocketOptions {
  url: string
  onMessage?: (data: unknown) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  reconnect?: boolean
  reconnectInterval?: number
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnect = true,
  reconnectInterval = 3000,
}: UseWebSocketOptions) {
  const ws = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const reconnectTimeout = useRef<NodeJS.Timeout>()

  const connect = useCallback(() => {
    // Use wss:// in production, ws:// in development
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const fullUrl = `${protocol}//${window.location.host}${url}`

    ws.current = new WebSocket(fullUrl)

    ws.current.onopen = () => {
      setIsConnected(true)
      onOpen?.()
    }

    ws.current.onclose = () => {
      setIsConnected(false)
      onClose?.()

      if (reconnect) {
        reconnectTimeout.current = setTimeout(connect, reconnectInterval)
      }
    }

    ws.current.onerror = (error) => {
      onError?.(error)
    }

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage?.(data)
      } catch {
        onMessage?.(event.data)
      }
    }
  }, [url, onMessage, onOpen, onClose, onError, reconnect, reconnectInterval])

  const send = useCallback((data: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current)
    }
    ws.current?.close()
  }, [])

  useEffect(() => {
    connect()
    return disconnect
  }, [connect, disconnect])

  return { isConnected, send, disconnect }
}
```

### Chat Component

```tsx
// src/client/modules/chat/components/ChatRoom.tsx
import { useState, useEffect, useRef } from 'react'
import { useWebSocket } from '@/lib/use-websocket'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Message {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
}

export function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { isConnected, send } = useWebSocket({
    url: `/api/realtime/rooms/${roomId}/ws`,
    onMessage: (data: any) => {
      switch (data.type) {
        case 'history':
          setMessages(data.messages)
          break

        case 'message':
          setMessages(prev => [...prev, data.message])
          break

        case 'user_joined':
          // Show notification
          break

        case 'user_left':
          // Show notification
          break
      }
    },
  })

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    send({ type: 'message', content: input })
    setInput('')
  }

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex items-center gap-2 p-4 border-b">
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-muted-foreground">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <ScrollArea className="flex-1 p-4">
        {messages.map(msg => (
          <div key={msg.id} className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{msg.userName}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm">{msg.content}</p>
          </div>
        ))}
        <div ref={scrollRef} />
      </ScrollArea>

      <div className="flex gap-2 p-4 border-t">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          disabled={!isConnected}
        />
        <Button onClick={handleSend} disabled={!isConnected}>
          Send
        </Button>
      </div>
    </div>
  )
}
```

---

## Export Durable Objects

```typescript
// src/server/index.ts
export { ChatRoom } from './durable-objects/chat-room'
export { PresenceTracker } from './durable-objects/presence'
```

---

## Common Gotchas

### 1. Hibernation

Use `acceptWebSocket()` with hibernation for efficient idle connections:

```typescript
this.ctx.acceptWebSocket(server) // Hibernates when idle
```

### 2. Authentication

WebSocket upgrade happens before your auth middleware. Pass auth info via query params or validate in the Durable Object.

### 3. Message Order

Messages within a single Durable Object are guaranteed in order. Cross-object ordering needs external coordination.

### 4. Billing

Durable Objects bill for:
- Duration (active time)
- Requests
- Storage

Hibernation significantly reduces duration costs.

---

## Resources

- [Durable Objects Docs](https://developers.cloudflare.com/durable-objects/)
- [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/api/websockets/)
- [Durable Objects Tutorial](https://developers.cloudflare.com/durable-objects/get-started/)

---

**Created**: 2026-01-03
**Author**: Jeremy Dawes (Jezweb)
