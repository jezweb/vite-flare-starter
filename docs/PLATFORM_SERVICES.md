# Cloudflare Platform Services — When to Reach for What

The starter ships with D1, R2, AI, Images, and Media bindings preconfigured.
This file is a reference for the rest — what to enable in `wrangler.jsonc`
when your fork needs them.

---

## Already configured

| Service | Binding | What it does | Used by |
|---|---|---|---|
| **D1** | `DB` | SQLite database | Auth, all modules |
| **R2** | `AVATARS`, `FILES` | Object storage | Avatars, file uploads |
| **Workers AI** | `AI` | LLM inference (free tier) | Chat module |
| **Images** | `IMAGES` | Image transforms (resize, crop, bg removal, face crop, format) | Image processing module |
| **Media** | `MEDIA` | Video transforms (resize, clip, frame extraction, audio extraction) | Media processing module |

---

## Durable Objects

Stateful agents, WebSocket sessions, per-user state. Already scaffolded via
`VoiceInputExample` (enable with `VITE_FEATURE_VOICE_AGENT=true`). See
[`DO_AGENTS.md`](./DO_AGENTS.md) for the full wiring.

Use for: AI agent conversation loops, real-time collaboration, scheduled
tasks via `DO.alarm()`, WebSocket hibernation (80-95% cost reduction vs
keeping a Worker invocation alive).

---

## Queues

```jsonc
"queues": {
  "producers": [{ "binding": "JOBS", "queue": "job-queue" }],
  "consumers": [{ "queue": "job-queue", "max_batch_size": 10 }]
}
```

Use for: background email sending, webhook delivery, image processing,
anything that shouldn't block the request.

---

## Vectorize

```jsonc
// Create first:
// npx wrangler vectorize create vite-flare-starter-vectors --dimensions=768 --metric=cosine
// npx wrangler vectorize create-metadata-index vite-flare-starter-vectors --property-name=userId --type=string
"vectorize": [{ "binding": "VECTORS", "index_name": "vite-flare-starter-vectors" }]
```

Use for: knowledge base search, RAG, similar item discovery. The
`semantic_search` and `vectorize_content` agent tools auto-use Vectorize
when the binding is present, falling back to in-memory comparison.

**Critical:** Create metadata indexes BEFORE inserting vectors — they're
not retroactive.

---

## KV

```jsonc
"kv_namespaces": [{ "binding": "CACHE", "id": "..." }]
```

Use for: session cache, rate-limit state, frequently-read config, API
response caching. Not for large objects (use R2) or complex queries
(use D1).

---

## Browser Rendering

```jsonc
"browser": { "binding": "BROWSER" }
```

Use for: screenshots, PDF generation, web scraping, visual testing. REST
API available for simple screenshot/PDF without Puppeteer.

---

## Cron Triggers

```jsonc
"triggers": { "crons": ["0 6 * * *"] }
```

Handler is `scheduled(event, env, ctx)` in your Worker. For per-user
schedules use Durable Object alarms instead (they can be set dynamically).

---

## Hyperdrive

```jsonc
// npx wrangler hyperdrive create my-hyperdrive --connection-string="postgres://user:pass@host:5432/db"
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "..." }]
```

Use for: connecting to external PostgreSQL, MySQL, etc. from Workers with
connection pooling and query caching. Not needed for D1. Relevant when a
fork talks to an existing DB (legacy systems, data warehouses, managed
Postgres on AWS/GCP/Neon). Works with standard Postgres drivers.

---

## Cloudflare Stream

Not a binding — Stream API via REST or dashboard.

```bash
curl -X POST -H "Authorization: Bearer $CF_TOKEN" \
  -F file=@video.mp4 "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/stream"
```

Full video hosting platform with adaptive bitrate encoding, HLS/DASH
playback, signed URLs, upload-from-users (one-time URLs), analytics.

Stream (platform) vs Media (binding) — Stream is YouTube-in-a-box,
Media is on-the-fly transforms of your own R2 files.

---

## Containers

Long-running compute for heavy ML inference, video processing, anything
exceeding Worker CPU limits. No wrangler binding yet — launch via the
dashboard or API and talk to them from your Worker over HTTP.
