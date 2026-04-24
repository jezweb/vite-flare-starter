# Session status — 2026-04-18 AFK window

Jez is back, this is what happened while you were gone.

## Live now

**Version**: `6cae4c56-dc16-4e37-b718-565f86dbe779`
**URL**: https://vite-flare-starter.webfonts.workers.dev

## What shipped (15 commits this session)

### Phase 0 — About Me user profile
- `6c44a58` — Settings → Chat Prefs → About You, 500 → 2000 chars, markdown preserved server-side, richer placeholder

### Phase 1 — Projects schema + sidebar
- `298e281` — Migration 0013 (projects table + conversations.project_id FK ON DELETE SET NULL), full CRUD API, sidebar PROJECTS section with create/rename/delete, move-to-project submenu on chat rows
- `d3875b3` — UX audit (static — no browser), plus L1/L2/M2 fixes (unused var, better empty-state copy, delete-confirm shows conversation count)

### Phase 2 — Project page + system-prompt inheritance
- `11342b9` — `/dashboard/projects/:id` with inline-save editors (name/description/system prompt/default model), conversation list, archive button; **context cascade** wired server-side: chat route reads projectId from stored row for existing conversations, from body for new ones; `buildChatAgent` injects `project.systemPrompt` above user About-Me; project.defaultModel feeds into model precedence
- `4625698` — sidebar project rows now link to their project page (chevron separate from name, claude.ai pattern)

### Phase 2 polish
- `949e718` — **P1**: swapped Radix ScrollArea for native overflow-y-auto so our global thin-pill scrollbar style applies in the sidebar; **P2**: 6-colour project picker (blue/emerald/amber/rose/violet/slate + none), coloured folder icon in the sidebar + project page header
- `c7d68b8` — **security fixes** from sub-agent review: `updateProject` now verifies project ownership before writing the FK (was a missing check); chat-route UUID regex tightened from `[0-9a-f-]+` to strict v4
- `52ae52e` — **M3**: optimistic reorder on project creation so the new row appears at the top immediately instead of flashing at the bottom for ~200ms
- `37817c6` — plan doc updated with Phase 0-2 shipped status

## What's waiting on you

### Needs live verification (Chrome MCP was blocked — multi-browser conflict)
- Click through a fresh conversation in Chrome, confirm:
  - Create 2-3 projects
  - Move chats between them
  - Delete one project with chats inside → confirm chats return to main list
  - Chat inside a project → AI uses the project instructions (set a prompt that says "always answer in pirate"; verify)
  - Colour picker click updates both sidebar icon + page header icon
  - New project appears instantly at top (M3 fix)
  - Sidebar scroll uses the thin pill style from your earlier session

### Needs design input before building
- **Phase 3 — knowledge files**: reuse existing R2 FILES bucket + convertToMarkdown helper. Design questions: per-file size cap, context budget strategy (dump all vs. vectorise), UI for upload/remove, should the agent call a tool to search files or prepend them automatically?
- **Archived projects view**: API endpoint exists (`/api/projects?includeArchived=1`), no UI yet. Where should it live — `/dashboard/projects/archive` or a toggle on the sidebar?
- **Project drag-reorder** (audit P3): position field accepts updates server-side but no UI. dnd-kit vs. up/down arrows vs. "sort by name" toggle?

## Outstanding minor items (low priority)
- **M1** — optimistic move-conversation may briefly mis-order rows. Visual only. Minimal user impact.
- **L5** — prop drilling in `ConversationSidebar` passes 15+ props to `ProjectsSection`. Cosmetic refactor opportunity.
- **Static audit caveat** — everything above was *code-reviewed*, not *clicked through*. The three gaps you'd most want to verify: (1) in-project pill renders correctly and × detaches, (2) system prompt actually reaches the model and influences output, (3) the sidebar scroll pill matches the rest of the app.

## Suggested order when you're back
1. **5-min smoke test** — make a project, chat in it, set instructions, confirm the AI follows them. This is the whole point of the feature.
2. **Pick one of the design-input items** — Phase 3 knowledge is the most valuable; archived view is the easiest; drag reorder is the most fun.
3. If something's broken in step 1, tell me and I'll fix before we move on.
