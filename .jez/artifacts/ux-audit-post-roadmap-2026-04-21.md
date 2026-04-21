# Post-Roadmap Delivery Audit — 2026-04-21

Audit after executing the full `.jez/artifacts/roadmap-2026-04-21.md` plan
in one session. Covers Phase 1 audit fixes, Phase 2 map polish, Phase 3
email, Phase 4 RAG, and Phase 5 MCP connectors.

**Deployed**: `https://vite-flare-starter.webfonts.workers.dev`
**Commits this session**:

- `2a5277b` feat: Phase 1 audit fixes + Phase 2 map polish
- `be1fefa` feat(email): Phase 3 — service wrapper, templates, admin invite + log viewer
- `b0f5b08` feat(rag): Phase 4 — file ingestion + semantic search
- `d2f29b5` feat(connectors): Phase 5 — per-user MCP connections + per-tool policies

Migrations applied (local + remote):

- `0014_add_email_log.sql` — outbound email audit trail
- `0015_files_index_status.sql` — RAG ingestion status columns
- `0016_mcp_connections.sql` — user MCP connections + tool policies

---

## What shipped

### Phase 1 — Morning audit fixes (13 findings)

| Tag | Fix | Files |
|-----|-----|-------|
| H1 | Strip `<skill_content>` from title summariser input | `conversations/routes.ts` |
| A1 | Same strip on activity-feed entity name | `chat/routes.ts` |
| H2 | Lenient `parseSkillActivation` regex (whitespace, attr order) | `SkillActivationBlock.tsx` |
| M1 | Slash-command autocomplete wired into PromptInput | `ChatPage.tsx`, `SkillsSlashMenu.tsx` |
| M2 | Empty state gated on `!isLoading` | `ChatPage.tsx` |
| L1 | `whitespace-nowrap` on `/skill-name` code pills | `SkillsPage.tsx` |
| L2 | `title` + `aria-label` on sidebar + theme toggles | `site-header.tsx` |
| T1 | HSL placeholder shows "hue saturation% lightness%" | `ThemeVisualEditor.tsx` |
| T2 | TOKEN_DESCRIPTIONS tooltip per theme token | `ThemeVisualEditor.tsx` |
| T3 | Global subtle `::placeholder` + helper text | `index.css`, `PreferencesSection.tsx` |
| A2 | NotificationsPage at `/dashboard/notifications` + View all link | `NotificationsPage.tsx`, `NotificationBell.tsx` |
| ADM1 | Deploy-time flags card in admin Features tab | `FeaturesTabContent.tsx` |
| ADM2 | Session cleanup scheduled() with hourly 30-day backstop | `auth/cleanup.ts`, `server/index.ts` |

### Phase 2 — Map polish

| Tag | Fix |
|-----|-----|
| MAP-5 | FocusController pans when visible, caps at zoom 13 when off-screen |
| MAP-6 | MapPin "Local" chip + local-search example prompt on empty state |

### Phase 3 — Email integration (1.5-2 days compressed to ~4 hours)

- `src/server/modules/email/service.ts` — dual-path wrapper (Email Service → SendEmail → Resend → console)
- 8 typed templates (passwordReset, emailVerification, magicLink, invite, welcome, notification, emailChange, deleteAccount)
- `email_log` D1 table with user/template/status/tags indexes
- better-auth refactored to use `sendEmail()` — drops inline Resend + HTML duplication
- `POST /api/admin/invites` sends templated invite with sign-up URL
- `send_email` agent tool with `needsApproval: true` + 10/day rate limit
- `queue.ts` reference impl for async sends
- Admin → Emails tab with template/status/to filters + Send test dialog

### Phase 4 — RAG over user files

- `ingestFile()`: R2 → convertToMarkdown → chunk → embed → Vectorize upsert
- Chunk-aware markdown splitter (paragraph → line → sentence boundaries, 1400 chars + 200 overlap)
- `deleteFileVectors()` reconstructs ID range from `indexChunks` count
- `/api/files` now fires ingest via `executionCtx.waitUntil`
- `/api/files/:id/reindex` + `/api/files/:id` delete cleanly
- `search_files` agent tool scoped by `userId + type=file`
- FileList shows Indexed / Indexing… / Index failed pills
- Graceful fallback when `VECTORS` binding is unbound

### Phase 5 — MCP Connectors

- AES-GCM encrypted tokens at rest (`TOKEN_ENCRYPTION_KEY` env secret)
- OAuth 2.1 with PKCE + Dynamic Client Registration for public clients
- Bearer token fallback for servers without OAuth
- Probe helper inspects `/.well-known/oauth-authorization-server` + `WWW-Authenticate` header
- ConnectorsPage with Browse modal + Add custom dialog
- ConnectionDetail sheet: read-only vs write-delete risk tiers, three-state picker per tool
- `getUserMcpTools` layers per-user connections on top of env-configured MCPs
- Tool-name prefixing by connector id prevents collisions
- Catalogue with 12 entries (Google Workspace 8x, GitHub, Cloudflare, JezPress, ABR)

---

## Non-breaking defaults verified

Every new feature degrades gracefully when the relevant binding is missing:

| Feature | Missing binding behaviour |
|---------|--------------------------|
| Email send | Falls back to Resend → console log; auth flows never block |
| File RAG | Ingest returns `status: 'skipped'`; search_files tool omitted from toolkit |
| MCP connectors | Auth middleware works; connections page shows empty state |
| Queue consumer | `EMAIL_ASYNC=false` path always sends directly |
| Cron triggers | scheduled() wrapped in per-job try/catch; one broken job doesn't break others |

Matches the starter's "every phase produces a demo-ready artefact" principle.

---

## Remaining follow-ups (non-blocking)

These are opportunistic — none are blocking shipment.

### MCP connectors

- **OAuth state in KV**, not signed cookies. Current impl relies on `SameSite=Lax` surviving the cross-site redirect. Works on Workers today but a KV-backed store would be more robust.
- **Refresh token rotation job** — when `expiresAt` is within 5 min on a request, use `refresh_token` to rotate before calling the MCP. Cheap to add.
- **Connector-sourced RAG** (Phase 5.6) — stubbed via the catalogue. Tying Google Drive documents into the Vectorize ingest pipeline is a natural extension once the first user connects.

### Email

- **Domain setup docs** — CLAUDE.md mentions it but a dedicated `docs/email.md` with DNS record examples would help forkers.
- **Unsubscribe endpoint** — notification template references `unsubscribeUrl` but the signing/handler isn't wired (future-proof only).
- **DKIM / SPF / DMARC verification** against deployed domain — deliverability check before the first real outbound.

### RAG

- **Progress UI during ingestion** — currently "Indexing…" shows as a pill but doesn't animate. Consider a progress bar per file.
- **Deduplication** — re-uploading the same file content should be detected and reuse existing vectors. Hash-based check on upload.
- **Chunk size per mime type** — code files benefit from shorter chunks, markdown from longer. One-size-fits-all 1400 chars is a starting point.

### General

- **Email bindings in wrangler.jsonc** are commented out. Forks should decide which path to use and uncomment.
- **Vectorize index creation** requires `wrangler vectorize create` + metadata indexes BEFORE first insert. Documented in the Phase 4 commit but a one-shot `pnpm setup:rag` script would be nicer.
- **Worker bundle is ~900 KB gzipped** for the ChatPage chunk. The big culprits are mermaid (527KB gzip), cytoscape (189KB gzip), streamdown (143KB gzip). Worth a tree-shaking audit if cold-start matters.

---

## Verification summary

- `pnpm type-check` clean across all commits
- `pnpm build` succeeds
- `pnpm db:migrate:local` + `:remote` both applied cleanly
- `wrangler deploy` succeeded (770 assets, 946 KB gzipped)
- `GET /api/mcp-connections/catalog` returns 200 with 12 entries
- Root page loads (`GET /`)
- Scheduled trigger registered (`*/15 * * * *`)

Task list after audit:

- 27 roadmap tasks completed
- 1 audit task in-progress (this one)
- 0 remaining

**Ship-ready.** Recommend a live walkthrough of (1) chat → `/plan-task`
to confirm H1 end-to-end, (2) Settings → Connectors → Browse for the new
connector UX, (3) file upload → pause 10s → Indexed pill appears (once
Vectorize is enabled).

---

**Last updated**: 2026-04-21, one-session post-roadmap delivery.
