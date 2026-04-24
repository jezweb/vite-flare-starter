# Durable Object Agents — Voice, Video, Streaming WS

For features that need a persistent stateful connection per-session —
voice capture, live collaboration, multiplayer, real-time dashboards —
use a Durable Object wired via the `agents` SDK.

Use this over polling or a Hono endpoint for anything that needs
>1 message/sec, server→client push, or per-session CPU state. For plain
REST CRUD or infrequent updates, Hono + TanStack Query is simpler.

---

## Voice input (official SDK)

Four pieces to get right — miss any one and you'll lose 30 minutes to a
cryptic error.

### 1. Define the DO class

```typescript
// src/server/modules/voice/voice-agent.ts
import { Agent, type Connection, type ConnectionContext } from 'agents'
import { withVoiceInput, WorkersAINova3STT } from '@cloudflare/voice'

const InputAgent = withVoiceInput(Agent)

export class VoiceInputExample extends InputAgent<any> {
  transcriber = new WorkersAINova3STT((this.env as { AI: Ai }).AI)

  async onConnect(conn: Connection, _ctx: ConnectionContext) {
    conn.send(JSON.stringify({ type: 'welcome' }))
  }

  async onTranscript(text: string, _conn: Connection) {
    this.broadcast(JSON.stringify({ type: 'utterance', text }))
  }
}
```

### 2. Re-export from Worker entry + wrap fetch

```typescript
// src/server/index.ts
import { routeAgentRequest } from 'agents'
export { VoiceInputExample } from './modules/voice/voice-agent'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const agentResponse = await routeAgentRequest(request, env)
    if (agentResponse) return agentResponse
    return app.fetch(request, env, ctx)
  },
}
```

### 3. wrangler.jsonc — binding + SQLite migration + /agents/* routing

```jsonc
{
  "assets": {
    "run_worker_first": ["/api/*", "/agents/*"]
  },
  "durable_objects": {
    "bindings": [
      { "name": "VoiceInputExample", "class_name": "VoiceInputExample" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["VoiceInputExample"] }
  ]
}
```

### 4. Client — useVoiceInput hook

```tsx
import { useVoiceInput } from '@cloudflare/voice/react'

const { transcript, interimTranscript, audioLevel, start, stop, toggleMute } =
  useVoiceInput({ agent: 'VoiceInputExample', name: sessionId })
```

---

## Gotchas table

| Gotcha | Symptom |
|---|---|
| Forgot `/agents/*` in `run_worker_first` | WS hits static assets → 404, DO never touched |
| Forgot `export { VoiceInputExample }` from Worker entry | `wrangler deploy` errors "Durable Object class not found" |
| Class in bindings but missing from `migrations.new_sqlite_classes` | Deploy ok, first request errors "DO storage not provisioned" |
| `useVoiceInput` `isListening` stays false during recording | Not a bug — only flips true once real audio flows. Use your own phase state for the status label. |
| Browser WS URL wrong | Path is `/agents/{kebab-case-class-name}/{instance-name}` — SDK auto-converts the `agent:` prop to kebab-case |

**Reference:** `src/server/modules/voice/voice-agent.ts` + `src/client/modules/voice/pages/VoiceInputExamplePage.tsx`. Gated by `voiceAgent` flag (default OFF, `VITE_FEATURE_VOICE_AGENT=true` to enable).

---

## Video input (no SDK — primitives only)

Cloudflare has no `@cloudflare/video` package (as of 2026-04-22). For
"describe what the user is showing" / "OCR this whiteboard" / "caption
this scene", a sampled-frames-over-WS pattern works today without any
SFU/WebRTC plumbing.

**Shape:**

- Client: `getUserMedia` → `<canvas>` sampled every N seconds → JPEG
  data URL → sent via the `agents` SDK WebSocket as a JSON message
- Server: DO's `onMessage` decodes JSON, calls AI SDK `generateText`
  with a vision-capable model, broadcasts the caption back

DO wiring (binding, migration, class export, `run_worker_first`) is
identical to voice. Only the transport differs — `useAgent` from
`agents/react` instead of `useVoiceInput`.

**Reference:** `src/server/modules/video/video-agent.ts` + `src/client/modules/video/pages/VideoInputExamplePage.tsx`. Gated by `videoAgent` flag (default OFF, `VITE_FEATURE_VIDEO_AGENT=true`).

For 30fps continuous vision (gaze, object tracking), swap the transport
for Cloudflare Realtime SFU + raw WebRTC tracks — keep the DO's agent
logic.

See `.claude/rules/no-sdk-companion-scaffold.md` for the general pattern
of scaffolding a sibling modality when the official SDK doesn't exist yet.
