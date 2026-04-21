# Files + artifacts system audit

**Date:** 2026-04-20
**Question:** Is the files system wired up, useful, and connected to the rest of the system (artifacts, chat attachments, skill outputs)?

## TL;DR

It works, it's user-scoped properly, but there are **three different prefix conventions** in use and **two disconnected "artifact" concepts**. The simplest fix gives us a unified `users/<userId>/…` layout with three top-level folders (`uploads/`, `agent/`, `skills/`) and makes the UI file browser see everything the agent writes. The biggest concrete bug is a broken `downloadUrl` in `generate_docx`.

## What exists today

### Storage (R2)

The `FILES` R2 bucket stores everything that isn't an avatar. Three writer groups, three prefix conventions:

| Writer | Prefix pattern | Example |
|--------|----------------|---------|
| UI upload (`POST /api/files`) | `files/<userId>/<fileId>.<ext>` | `files/abc/xyz.pdf` |
| Agent tools (images, docs, media) | `users/<userId>/<category>/…` | `users/abc/generated/xyz.png` |
| Agent fs_write | `users/<userId>/<user-chosen-path>` | `users/abc/reports/summary.md` |
| Legacy image gen | `generated/<userId>/…` | Migrated on access, both paths supported |

### Metadata (D1 `files` table)

Records exist for **UI uploads only**. Agent-written files have no D1 record — they're discoverable only via R2 listing (`fs_list`) or direct URL guessing.

Columns: `id, userId, name, key, mimeType, size, folder, isPublic, publicUrl, createdAt, updatedAt`

### Access routes

| Route | Purpose | Uses |
|-------|---------|------|
| `GET /api/files` | List UI uploads (D1) | Files dashboard |
| `GET /api/files/:id` | Get UI upload by id | Files dashboard |
| `GET /api/files/:id/download` | Stream by D1 id | UI download button |
| `GET /api/files/download/*` | Stream by R2 key (scoped) | Agent tool results (docx, images, media) |
| `GET /api/files/folders/list` | List distinct folders in D1 | Files dashboard folder tree |

### Chat attachments

Separate from files entirely. Chat attachments are uploaded via the chat endpoint as multipart, parsed into `experimental_attachments` on AI SDK messages, and stored in the **conversation_messages** row (JSON), not in R2. They evaporate with the message. `convertToMarkdown` uses `env.AI.toMarkdown()` to inline their content.

### "Artifacts"

Two completely separate concepts, same name:

1. **In-chat artifacts** (`create_artifact`, `edit_artifact`) — HTML/SVG/Mermaid rendered in sandboxed iframes inline. Ephemeral. Not persisted. Returned with `_artifact: true` marker.
2. **Agent outputs** (`generate_docx`, `generate_image`, `media_*`) — persistent files in R2 under `users/<id>/<category>/`. Retrieved via `/api/files/download/<key>`.

Nothing calls this second thing "artifacts" — it's just "agent-generated files". But the conceptual gap is real.

## Concrete issues

### 1. Bug: `generate_docx` returns broken URL (5 min fix)

`documents.ts:41` returns:
```ts
downloadUrl: `/api/files/${encodeURIComponent(key)}`
```
But the handler that accepts raw keys is `/api/files/download/*`, not `/api/files/*`. So the URL hits `GET /:id` which looks up by D1 id, finds nothing, 404. **Every docx generated is silently un-downloadable from the chat UI.**

Fix: change to `/api/files/download/${encodeURIComponent(key)}`.

### 2. Prefix inconsistency (15 min fix)

UI uploads go to `files/<userId>/…` but the agent's `fs_list` only sees `users/<userId>/…`. Consequence: when a user uploads a PDF via the Files page and then asks the agent "read my latest PDF", the agent's tools can't find it.

**Three options:**

- **A — Pick one prefix everywhere (`users/<userId>/...`).** Change the upload route, migrate existing keys. Most invasive but cleanest.
- **B — Agent tools see both prefixes via a union lister.** fs_list merges `users/<userId>/` and `files/<userId>/uploads/` into one view. Backwards compatible.
- **C — Leave them separate and add a `fs_find_upload` tool.** Minimal, but asks the agent to know the distinction.

Recommend **B** for phase 1 (fast, no migration) then **A** for v2.1 bundled with a migration script.

### 3. No unified artifact concept (20 min design + code)

"Artifact" in this codebase means either ephemeral inline render OR persistent R2 file, depending on context. Agent-generated PDFs/images/CSVs aren't browsable as artifacts anywhere — they're only visible if the user scrolls back through chat or knows to check the Files page.

**Proposal:** Introduce a single artifacts folder convention under the existing `users/<userId>/` tree:

```
users/<userId>/
├── uploads/                 ← UI uploads (migrated from files/ prefix)
├── agent/
│   ├── documents/<filename> ← generate_docx output
│   ├── images/<filename>    ← generate_image output
│   ├── media/<filename>     ← media transform output
│   └── scratch/<path>       ← fs_write default
├── skills/                  ← skill-related scratch (future)
└── sessions/<sessionId>/    ← per-conversation sandbox output (future)
```

Then optionally wire a "Recent agent outputs" panel into the chat UI (or the Files page gets a filter).

### 4. Chat attachments don't land in files (no action, by design)

This is probably correct. Attachments are conversational, not library material. If the user wants to keep one, they can ask the agent "save this to my files".

### 5. Skills + files overlap (future)

When we add phase 2 skill uploads via the UI, R2 keys follow `<name>/SKILL.md` — shared with the `FILES` bucket via the unbound `SKILLS` binding. Currently SKILLS isn't set in production so user-uploaded skills aren't possible. Either:
- Bind a dedicated `SKILLS` R2 bucket (cleanest separation)
- Use `FILES` with a `skills/` prefix under user scope (simpler)

Recommend dedicated bucket for bundling isolation, but it's fine as a `users/<id>/skills/` prefix for MVP.

## Recommended changes for this session

| # | Change | Effort | When |
|---|--------|:---:|------|
| 1 | Fix `generate_docx` downloadUrl path | 5 min | Now — it's a bug |
| 2 | Make `fs_list`/`fs_read` see the `files/<userId>/uploads/` prefix too | 15 min | Now — cheap usefulness win |
| 3 | Document the prefix convention + artifact concept in CLAUDE.md | 10 min | After #2 lands |
| 4 | Migrate `files/` prefix to `users/<userId>/uploads/` | 30 min | Deferred to v2.2 with a migration |
| 5 | Add "Recent outputs" panel to Files page | 1 hr | Phase 3 polish |
| 6 | Dedicated SKILLS R2 bucket or decide on shared prefix | 15 min | Before phase 1B (directory skill uploads) |

## What's working well

- **User scoping is tight.** Every R2 key starts with `users/<userId>/` or `files/<userId>/`, and the download endpoint validates the prefix on every request. No cross-user read path.
- **MIME + size limits on upload** — 10MB, allowlist of types. Good safe default.
- **fs_* tools respect scoping** — `scopedPath` strips `../` and leading `/`.
- **Dual download routes** — one for D1-tracked uploads, one for raw keys produced by agents. Both go through auth.
- **R2 + D1 roles are clear** — R2 holds bytes, D1 holds metadata when needed. Agent outputs skip D1 intentionally for speed.

## Decision needed from Jez

1. Apply fixes 1 + 2 now (confirmed useful) — **yes/no**
2. Defer #4 (prefix migration) to later — **yes/no**
3. Pick one for skills storage: dedicated SKILLS bucket vs FILES+prefix — **which?**
