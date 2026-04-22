# Projects / Folders — design + plan

**Status**: **Phase 0, 1, 2 shipped.** Phase 3 (knowledge files) and Phase 4 (vectorised knowledge) still pending.
**Target audience**: Jez + future sessions
**Scope**: grouping conversations by topic/client/context, with shared instructions and (later) shared files

## Shipped as of 2026-04-18

| Phase | Commit | Notes |
|-------|--------|-------|
| Phase 0 — About Me bump | `6c44a58` | Settings → Chat Prefs → About You, 2000 chars, markdown-preserved |
| Phase 1 — Schema + CRUD + sidebar | `298e281` + `d3875b3` | Migration 0013, projects table, sidebar section, move-to-project submenu, delete w/ count |
| Phase 2 — Project page + inheritance | `11342b9` (rebased `4625698`) | /dashboard/projects/:id, server-side system-prompt + model cascade, in-project pill with detach |
| Phase 2 polish — colours + native scrollbar | `949e718` | 6-colour picker, swapped Radix ScrollArea for native overflow-y-auto |

**Live now**: deploy version `ac73590d-ebbb-4e20-8cb1-6f65af272eb8`.

**Still pending**: Phase 3 (knowledge files), Phase 4 (vectorised knowledge), stretch items (team projects, templates, project-level MCP).

## Why

Today every conversation lives in one flat list. When you've had 50+ chats, finding "that thing about the Drizzle migration" gets hard even with search. More importantly, every new chat starts from a blank system prompt — no way to say "chats about Clark Forklifts should always use Australian spelling and know about their service packages".

Projects solve three problems:

1. **Organisation** — group chats by topic, client, subject, or mode of work.
2. **Shared context** — a project-level system prompt and (Phase 3+) attached files are auto-applied to every new chat inside the project.
3. **Separation** — "personal" vs "client A" vs "client B" without accidentally bleeding context.

Peer apps have converged on this pattern: claude.ai Projects, ChatGPT Projects, t3.chat Folders, Cursor Workspaces.

## How peer apps do it

| App | Model | Per-project instructions? | Per-project files? | Sidebar layout |
|-----|-------|---------------------------|---------------------|----------------|
| claude.ai | Projects (page per project) | Yes ("Project instructions") | Yes ("Knowledge") | Projects section + recent convos |
| ChatGPT | Projects (sidebar + dedicated page) | Yes ("Instructions") | Yes ("Files") | Projects above chats |
| t3.chat | Folders (lightweight) | No | No | Inline folder rows, expandable |
| Cursor | Workspaces | N/A (tied to repo) | Repo files | Separate window |

Claude.ai's pattern is the most complete. ChatGPT's is close. t3.chat's is the MVP floor — just organisation, nothing fancy.

My pick: **start at t3.chat's floor, end at claude.ai's ceiling**, broken into four phases so we can ship value every 1-2 hours.

## Data model

One new table, one column addition on `conversations`.

```ts
// src/server/modules/projects/db/schema.ts
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  /** Project-wide system prompt, injected on every new conversation in this project. */
  systemPrompt: text('system_prompt'),
  /** Default model for new convos in this project. Falls back to user default. */
  defaultModel: text('default_model'),
  /** Optional colour for visual tagging in the sidebar (hex or tailwind token). */
  color: text('color'),
  /** Sidebar sort order within a user's list. Lower numbers appear first. */
  position: integer('position').notNull().default(0),
  archived: integer('archived').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('projects_user_id_idx').on(table.userId),
  index('projects_user_position_idx').on(table.userId, table.position),
])

// On conversations table — new nullable FK
projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
```

**Key choices:**

- `onDelete: 'set null'` on the FK — deleting a project returns its conversations to the ungrouped pool rather than nuking them. Claude.ai-style. (Contrast: ChatGPT asks — we could promote to "ask" in Phase 2.)
- `archived` flag instead of soft-delete — archived projects don't appear in the sidebar but are still accessible from an archive view.
- `position` for user-controlled ordering. Phase 1 ships with no UI for reordering; position is just a default-0 tiebreaker.
- No `shared`/`team` fields — single-user scope for v1.

Migration is straightforward: one new table + one `ALTER TABLE conversations ADD project_id text` + one index.

## API surface

Standard Hono routes under `/api/projects`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects` | List user's projects (with conversation count per project) |
| POST | `/api/projects` | Create `{ name, description?, systemPrompt? }` |
| GET | `/api/projects/:id` | Single project with its conversations |
| PATCH | `/api/projects/:id` | Update name/description/instructions/model/color/position |
| DELETE | `/api/projects/:id` | Delete (unassigns conversations due to FK) |
| POST | `/api/projects/:id/archive` | Archive (hides from sidebar) |
| POST | `/api/projects/:id/unarchive` | Restore |

On conversations:

| Method | Path | Purpose |
|--------|------|---------|
| PATCH | `/api/conversations/:id` (existing) | Accept `projectId: string \| null` in body to move/unmove |

On the chat route itself (Phase 2):

- `POST /api/chat` reads `body.projectId` and loads the project's `systemPrompt` + `defaultModel` server-side. Client can't spoof it — same pattern we already use for conversation-level systemPrompt (see chat routes.ts comment `systemPrompt is intentionally server-controlled`).

## UX

### Sidebar

Inserts above the existing Starred section:

```
[+] New chat
[Search...]

PROJECTS (3)         ← collapsible, expanded by default
  ▸ Jezweb work (12)
    • Migrating to Drizzle 0.45
    • Chat UX overhaul
    ... [show 5, "+7 more"]
  ▸ Learning React (4)
  ▸ Personal (0)
[+] New project

STARRED (1)
  ...

TODAY (2)
  ...
```

- Each project renders as its own mini-section with its own collapse chevron
- Expanded project shows up to 5 conversations + "N more" affordance
- Adding a new project inline via a floating "+" or at the bottom of the Projects section
- Conversations inside a project **also** appear in the Starred/Today/etc. groups for convos with no project assigned. Projects are *additive* organisation — the flat list still works for projectless chats.

### Project page

`/dashboard/projects/:id`

```
┌─────────────────────────────────────────────────┐
│ Jezweb work               [⚙ edit]  [📦 archive] │
│ Internal Jezweb product tickets, client calls,  │
│ and design reviews.                              │
├─────────────────────────────────────────────────┤
│ Project instructions                    [edit]   │
│ ┌─────────────────────────────────────────────┐ │
│ │ You work for Jezweb. Use EN-AU spelling.   │ │
│ │ Prefer Cloudflare Workers + D1 solutions.  │ │
│ │ ...                                          │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ Knowledge (Phase 3)                      [+ add] │
│   📄 brand-guide.pdf                    [remove] │
│   📄 api-spec.md                        [remove] │
├─────────────────────────────────────────────────┤
│ Conversations (12)              [+ New chat]     │
│   ⭐ Migrating to Drizzle 0.45      2h ago      │
│   • Chat UX overhaul                   1d ago   │
│   ...                                            │
└─────────────────────────────────────────────────┘
```

Same dark aesthetic as the rest of the app. Uses existing cards/inputs.

### Chat view: "in a project" indicator

When a conversation belongs to a project, show a small pill above/beside the transcript:

```
📁 Jezweb work  →  Migrating to Drizzle 0.45
```

Click the pill → navigate to the project page.

### Move a conversation

Ellipsis menu in the existing sidebar gets a new "Move to project..." item → small dropdown listing user's projects + "Remove from project" + "New project..." as the last item.

## Context cascade (added 2026-04-18 review)

Projects are **not** hard isolated. Context layers like CSS, most-specific wins but earlier layers still contribute. Every layer is opt-out per chat.

```
Chat-level system prompt          ← highest priority (if set)
  ↓
Project system prompt             ← when chat has projectId
  ↓
User "About me" profile           ← always, unless chat opts out
  ↓
Chat Preferences (tone/format)    ← existing starter feature
  ↓
Base system prompt                ← fork-wide default
```

All layers are concatenated (newline-separated) into the outgoing system prompt. The agent sees the whole stack.

### User "About me" profile

Analogous to ChatGPT's "Custom Instructions" and claude.ai's "Your traits". Free-text field in Settings → Chat Preferences. Up to ~2 KB of markdown. Injected into every chat's system prompt below project-level instructions and above the base.

Example value:

> I'm Jeremy Dawes, CEO of Jezweb. Building on Cloudflare Workers + D1. EN-AU spelling, no em-dashes, warm + direct tone. Prefer React 19 + Tailwind v4. Default to the latest model from each provider.

Stored on existing `user_meta` table (no schema change). Ships **standalone, before any Projects work** — it's a 30-min job and useful on day 1 for every chat.

Per-chat override: a "Include my profile" toggle on the compose footer — default on, sticky. If off, the About-Me layer is skipped for that chat only.

### Three ways to escape project context

Strict isolation kills legitimate use cases. These three escape hatches are explicit, so users never get surprised by stale context leaking in:

1. **`@chat-ref` injection** — typing `@` in the compose box shows recent conversations across *all* projects. Picking one injects that chat's summary + last N turns into the current message only (one-turn window, not permanent).
2. **Cross-project search tool** — alongside `search_this_project` (current project's knowledge), the agent gets `search_my_knowledge` that queries every project's vector index for the current user. The user sees the tool call in the transcript — no silent context bleeding.
3. **Detach from project mid-chat** — the project pill in the chat header has a "×". Click it, `projectId` is cleared for that chat, the project's system prompt stops applying from the next turn. Inverse: a "move to project" menu item to attach.

## Integration points

| Existing feature | How it interacts |
|------------------|------------------|
| Conversation summaries | Summariser continues to run per-conversation. Project description is separate. |
| Starred | Project convos can still be starred. Starred section still pins starred rows regardless of project. |
| Artifacts sidebar | Unchanged — artifacts are per-conversation. Phase 4 idea: project-level artifact archive. |
| Web search + tools | Unchanged — tools are per-user. |
| MCP tools | Phase 3 stretch: per-project MCP servers (each project can enable different tools). |
| Skills | Phase 3 stretch: per-project skill preferences (which skills auto-load). |
| Chat Preferences | About-Me field added as free text. Existing tone/format settings unchanged. |

## Phases

### Phase 0 — User "About me" profile (standalone, 30-45 min)

Ships before any Projects work. Useful on its own from day 1.

- Extend ChatPreferences schema (or `user_meta` `profile` key) with an `aboutMe` string
- Add a `<textarea>` to `ChatPreferencesSection.tsx` with placeholder example + character count
- Server: `buildChatAgent()` reads user's About-Me and prepends to `baseInstructions` when the conversation didn't opt out
- Per-chat "Include profile" toggle on the compose footer (localStorage sticky)

**Ship criteria:** setting "About you: I'm Jez, use EN-AU" in settings causes a fresh chat to follow that preference without restating it.

### Phase 1 — Schema + MVP sidebar (3-4 hours)

- Migration 0013 (projects table + project_id FK + indexes)
- `/api/projects` CRUD + `/api/conversations/:id` patch to accept `projectId`
- Sidebar: Projects section with inline conversation list, create-project inline input, rename/delete via ellipsis
- No dedicated project page yet — project = organisation only

**Ship criteria:** user can create 3 projects, move convos between them, sidebar shows them grouped, deleting a project keeps the convos.

### Phase 2 — Project page + instructions (2-3 hours)

- `/dashboard/projects/:id` page with description + system prompt editor
- Chat route reads `projectId` → loads project.systemPrompt + defaultModel server-side
- "In-project" pill on conversation view
- Move-conversation dropdown in the ellipsis menu
- New chat inside a project button

**Ship criteria:** a conversation inside a project has the project's system prompt applied. Changing the prompt mid-project affects *future* turns only (document this — not mid-chat retrofitting).

### Phase 3 — Knowledge files (3-4 hours)

- Reuse `src/server/modules/files/` — add a `projectId` column to that module's schema
- Project page "Knowledge" section with upload + list
- `buildChatAgent`: when a conversation has `projectId`, inject the project's files into the system prompt as context (markdown-converted via existing `convertToMarkdown` helper)
- Files count toward context budget — truncate with warning if > ~8K tokens

**Ship criteria:** drop a PDF into a project, start a chat in that project, ask a question answered by the PDF, verify the AI references it.

### Phase 4 — Vectorised knowledge (3-4 hours)

- Enable the existing `VECTORS` binding in wrangler.jsonc (index already documented in CLAUDE.md, just uncomment)
- Project upload → chunk + embed via `@cf/baai/bge-base-en-v1.5` → store in Vectorize with `{ userId, projectId }` metadata
- New agent tool `project_search` (when conversation has projectId) — semantic search over that project's knowledge
- Removes the "dump everything in system prompt" context problem — agent pulls only what's relevant per query

**Ship criteria:** a project with 10 PDFs uses less context per turn than Phase 3, agent proactively calls `project_search` when answering.

### Deferred / maybe

- Team projects (shared with other users) — needs auth/RBAC rework
- Project templates (clone a project + its instructions as a starting point)
- Export a project as a markdown bundle
- Project-level MCP server config
- Auto-classify: suggest a project for a new conversation based on content

## Open design questions for Jez

1. **Delete behaviour**: Claude.ai-style set-null (safer) or ChatGPT-style ask? My vote: set-null in Phase 1, add an "also delete N conversations" checkbox in Phase 2.

2. **Sidebar default expansion**: all projects expanded (t3.chat) or collapsed (ChatGPT)? My vote: collapsed with a count badge, matches how we already handle the Older date group.

3. **Sidebar visibility**: show projects even if empty? My vote: yes, so new projects are discoverable.

4. **Max convos shown inline per project**: 5? 10? "Show all"? My vote: 5 + "show all" expand.

5. **Color picker in Phase 1**: YAGNI for now. Skip.

6. **Can a conversation move between projects?** My vote: yes, anytime, via the ellipsis menu. Simple patch.

7. **Phase 4 Vectorize default**: only enable per-project, or also retro-index existing conversations? My vote: per-project only — existing non-project conversations stay unindexed. Avoids the "why is this free-tier account suddenly burning Vectorize credits" surprise.

## Risk / rollback

- Phase 1 is additive (nullable FK, optional table) — completely backwards-compatible with existing conversations.
- If we ship Phase 2 and the server-controlled system prompt breaks something, `GET /api/projects/:id` just returns an empty prompt and chats work exactly as today.
- Phase 3/4 are clearly optional — gate them behind `VITE_FEATURE_PROJECT_KNOWLEDGE` flag so fork users can disable.

## Suggested cadence

Phase 1 in one focused session (half a day). Then review with real use — does the sidebar feel right? Do project names get long? Before committing to Phase 2.

Don't try to ship all four phases in one session. The knowledge files flow (Phase 3) has enough edge cases to deserve its own review loop.

---

**Next step if Jez approves:** I'll start Phase 1 — migration + API + sidebar. Should land today if you give me 3-4 hours of green light.
