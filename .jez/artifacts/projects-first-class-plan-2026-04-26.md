# Projects First-Class — Build Plan

**Created:** 2026-04-26
**Status:** Draft — awaiting one more discussion round before Phase 0 starts
**Source:** Discussion between Jez and Claude (Opus 4.7) in vite-flare-starter session, 2026-04-26
**Conversation transcript:** `~/.claude/projects/-Users-jez-Documents-vite-flare-starter/<conversation-id>.jsonl`

---

## Goal

Promote vite-flare-starter's `projects` from a chat-grouping concept (today: dropdown in chat sidebar) to a first-class destination matching claude.ai's pattern — top-level nav, dedicated index and detail pages, persistent context (Memory, Instructions, Files, Conversations), org-aware sharing.

**Memory becomes the headline feature.** Multi-entry, three-scope (project/user/org), populated by both automated summarisation jobs and active agent tools the user can invoke ("remember that I prefer terse responses").

The starter ends up substantially stronger as a pattern library for any fork — Sprinta, future PM tools, future CRM tools — that wants AI memory and configurable persistent context.

## What changed from earlier thinking

| Earlier plan (Sprinta agent) | Revised plan (this discussion) |
|---|---|
| Rename `projects` → `chat_projects` upstream | Keep `projects` table, promote it to first-class |
| Build Sprinta-specific table from scratch | Sprinta forks later with its own namespaced table (`sprinta_projects`) |
| Memory parked indefinitely | Memory unparked, structured as multi-entry three-scope |
| Per-project tool toggles | Dropped — Jez confirmed all-tools-on default |
| Folders for chats | Skip permanently — search + auto-tags do the job |

## Out of scope (parked)

- **Memory-as-MCP** — exposing the starter's memory module over MCP for external clients (e.g. virtual-team specialists). Re-evaluate when there's a concrete external client.
- **Per-project tool overrides** (the `toolOverrides` JSON column originally proposed). Drop entirely.
- **Folders** for chats. Don't build.
- **Conversation backfill** — forks adopting Memory v1 don't backfill historical chats. Memory starts from the next chat onward. Document this clearly in release notes.
- **Memory editing UI beyond delete** — read-only display + delete button in v1. Edit is a complexity trap (versioning, conflict with auto-job).

## Phase 0 — Contract decisions (locked)

| # | Decision | Locked answer |
|---|---|---|
| 1 | `orgId` (nullable) on `projects`? | Yes — supports both personal and team projects |
| 2 | Files in projects: shared with general files module, or project-scoped? | Add nullable `projectId` to existing `files` table. One module, two surfaces. |
| 3 | Tool toggles per project | Drop entirely — no column, no UI |
| 4 | Memory storage | New `memories` table with scope discriminator (project/user/org) |
| 5 | Folders | Skip permanently |
| 6 | `starred` boolean on projects | Yes |
| 7 | Project ownership / sharing schema | Add `orgId`; reuse existing `userId` as `createdBy`. Sharing UI in Phase 5. |
| 8 | Auto-tagging on conversations | Add `tags` JSON column. Tagging bundled into existing describe LLM call (no extra cost). |
| 9 | Memory layout | D1 table, multi-entry, scope/type/name/description/content. Soft cap ~80 lines per entry; agent prompted to split when bloated. |
| 10 | User memory privacy | Always private to the user. Never auto-promoted to org. Never injected into chats started by other users on shared projects. |
| 11 | Memory editing UI | Read-only display + delete button in v1. |
| 12 | Memory update trust pattern | 3-way approval pattern (Reject / Approve / Approve & always allow). Default `memoryUpdateMode = 'ask'` for new projects. Reuses existing `approvals` module. |
| 13 | Memory privacy zones | `is_private` flag on memory entries. Private entries never auto-injected, only available via explicit `load_memory` agent tool. |
| 14 | Project deletion semantics | Soft delete (sets `archived_at`). Hard delete via "Permanently delete" action in archive view. Conversations survive (lose `project_id`). |
| 15 | Project templates | Bundled in code at `src/shared/config/project-templates.ts`. Forks customise. Templates carry name, systemPrompt, starter memory entries. |

## Schema changes (Phase 0 migration)

```sql
-- Projects: add org, star, archive timestamp, memory mode
ALTER TABLE projects ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN starred INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN archived_at INTEGER;
ALTER TABLE projects ADD COLUMN memory_update_mode TEXT NOT NULL DEFAULT 'ask';
-- memory_update_mode: 'ask' | 'auto' | 'never'

-- Conversations: tags + memory processed flag
ALTER TABLE conversations ADD COLUMN tags TEXT;  -- JSON array, nullable
ALTER TABLE conversations ADD COLUMN memory_processed_at INTEGER;

-- Files: optional project scoping
ALTER TABLE files ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

-- Skills: optional org scoping (used in Phase 5 for org-shared skills)
ALTER TABLE skills ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

-- User-level memory pref (for user-scope memory)
ALTER TABLE user ADD COLUMN memory_update_mode TEXT NOT NULL DEFAULT 'ask';

-- New memories table
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,              -- 'project' | 'user' | 'org'
  scope_id TEXT NOT NULL,           -- project_id, user_id, or org_id
  name TEXT NOT NULL,               -- short slug ('jez-style', 'quoting-process')
  description TEXT NOT NULL,        -- one-liner for the index
  type TEXT NOT NULL,               -- 'fact' | 'preference' | 'decision' | 'context' | 'reference'
  content TEXT NOT NULL,
  is_private INTEGER NOT NULL DEFAULT 0,   -- privacy zone (Extension C); never auto-injected
  source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX memories_scope_idx ON memories(scope, scope_id);
CREATE INDEX memories_scope_type_idx ON memories(scope, scope_id, type);
CREATE INDEX memories_scope_private_idx ON memories(scope, scope_id, is_private);
```

## Build phases

| # | Phase | Effort | Headline work |
|---|---|---|---|
| 0 | Contract migration | 0.5d | Schema only, no UI |
| 1 | Projects first-class + nav cleanup + Artifacts list + templates + AI-assisted creation + gap resolutions | 3d | Top-level nav, index page, detail page, create modal (Blank / AI-assisted / Template tabs), sidebar slim, user-menu rework, all-artifacts list, move-conversation-to-project, mobile spec, archive toggle, recent-activity feed |
| 2 | Files in projects | 1d | Upload to project, capacity meter, files context-injected into chats |
| 3 | Memory v1 (the big one) | 4d | Memory table, three-scope summarisation job, "turning the page" trigger + cron + manual button, progressive-disclosure injection, agent tools, **provenance UI**, **privacy zones**, **auto-suggested memories chip**, **memory diff + approval queue (3-way trust)** |
| 4 | + menu + MCP resources picker | 1d | Restructure `+` menu to claude.ai grouping, MCP resource picker as input |
| 5 | Org awareness & sharing | 2d | Your/Team/Shared tabs, share modal, byline, org-shared skills, org activity view |
| 6 | Universal search expansion | 1d | Palette searches projects + tagged conversations + memories, scoped search within a project |
| 7 | Inspirations doc | 0.5d | `docs/INSPIRATIONS.md` capturing claude.ai / Claude Code / Gemini / t3.chat lineage |
|   | **Total** | **~13 days** | |

Each phase is a single focused session. Ship → audit → fix in the same session per the productive-work-loop pattern. Phase 3 may stretch to 4-5 days when audit findings land.

## Phase 1 UI specification

UI element-level spec per screen. Borrowed copy is verbatim from claude.ai for visual parity unless otherwise noted.

### Sidebar (left nav) — after cleanup

**Add:**
- "Projects" item between "AI Chat" and "Files" (icon: cube/box)

**Remove from sidebar (move to user menu):**
- Settings (already in user menu — drop the duplicate)
- Admin Panel (already in user menu — drop the duplicate)
- Components (move to user menu under "Dev" subgroup, admin-only visibility)
- Style Guide (move to user menu under "Dev" subgroup, admin-only visibility)

**Final sidebar order:**
Home · AI Chat · Projects · Files · Skills · Activity · Notifications

**User menu (top-right avatar dropdown) — final order:**
Settings · Admin Panel (admin only) · My artifacts · Dev (Components, Style Guide — admin only) · Sign out

### Index page (`/dashboard/projects`)

**Layout:**
- Page header: "Projects" h1 (large) on left, "+ New project" button (filled, white-on-dark) on right
- Below header: search input "Search projects…" (full width, prominent)
- Below search: sort dropdown right-aligned ("Sort by Activity ▾" — options: Activity, Name, Created)
- Tabs reserved for Phase 5 — render single "Your projects" tab that's just visual padding for now
- Card grid below: 2 columns at `lg:`, 1 column on mobile, 16px gap

**Card design:**
- Border + soft background (`bg-card`)
- Top-right: star icon button (filled when starred, outline otherwise, click toggles)
- Top-left: project name (h3, bold)
- Below name: description (3-line clamp, muted)
- Bottom: "Updated X ago" (small, muted)
- Hover: subtle lift, border accent
- Click anywhere on card → detail page

**Empty state** (no projects yet):
- Centred icon
- Headline: "No projects yet"
- Body: "Create your first project to organise chats with persistent memory, instructions, and files."
- Button: "+ New project"

### Create project modal

**Triggered from:** "+ New project" button on index, or `Cmd+K → Create project`

- Modal title: **"Create a personal project"** (verbatim claude.ai)
- Tab row at top: **"Blank" / "AI-assisted" / "From template"** (Blank is default; AI-assisted in the middle as the recommended path)

**Blank tab:**
- Field 1: label "What are you working on?" — input `Name your project`
- Field 2: label "What are you trying to achieve?" — textarea `Describe your project, goals, subject, etc...` (3 rows visible)
- Footer: Cancel (ghost) / Create project (filled)
- On submit: POST to API, redirect to detail page

**AI-assisted tab** (Extension F — see Phase 3 Extensions, but the UI lives in the Phase 1 modal):

- Single textarea: "Describe what you want this project to help you with…"
  - Placeholder examples that rotate: *"a project to write emails to clients"*, *"help me plan and review fortnightly newsletters"*, *"researching new suppliers for a B2B parts business"*
- Below textarea: "Generate project ✨" button (filled)
- On submit: LLM call → renders a preview card with name, description, system prompt, starter memory entries, suggested first prompts — all editable
- Footer changes to: Back (regenerate from a different description) / Cancel / Create project
- See "Extension F" below for the LLM details and quality bar

**From template tab:**
- Card grid of bundled templates (Quoting / Content Writing / SEO Reporting / Prospecting / Customer Support — sourced from common Jezweb workflows, configurable per fork via `src/shared/config/project-templates.ts`)
- Each template card: name, description, "Includes:" chip row showing what comes preloaded (instructions / starter memory entries / suggested files)
- Click card → fills name+description+systemPrompt fields, switches to Blank tab pre-filled, user can edit before creating
- After creation: starter memory entries are inserted into the new project's memories with `type='context'`

### Detail page (`/dashboard/projects/:id`)

**Top bar (above content):**
- "← All projects" back link (top-left)

**Header row:**
- Left: project name (h1) + description (muted, below name)
- Right (button cluster): ellipsis menu, star button (filled when starred), "Share" button
- Phase 1 ellipsis menu items: Edit project, Archive project, Delete project
- Phase 1 share button: opens placeholder modal "Sharing comes in Phase 5" — keep the button visible so the layout's right

**Two-column layout below header (`lg:grid-cols-3`, left col spans 2, right col spans 1):**

**Left column — primary chat surface:**

- **Quick chat input card:**
  - Textarea placeholder: "How can I help you today?"
  - Bottom row: `+` button (left), model picker + voice button (right)
  - Model picker shows project's `defaultModel` (or user default)
- **Below input:**
  - In Phase 1 (no chats yet): centred message "Start a chat to keep conversations organized and re-use project knowledge." (verbatim claude.ai)
  - When chats exist: "Your chats" header + chat list (one row per chat: title, last-message-ago)
- **No Activity tab in v1.** Decided: tabs imply equal weight; Activity is a 1% case. Instead:
  - **Recent activity feed at the foot of the project detail page** — last 5 events (chat created, file added, memory updated, instructions edited), with "View all activity →" link to a dedicated page reached via the ellipsis menu's "View activity" item
  - Existing audit log captures all events server-side regardless

**Right column — context (sticky on lg+):**

- **Memory section:**
  - Header: "Memory" + "Only you" badge (lock icon)
  - Phase 1 body: empty state "Project memory will show here after a few chats." (verbatim claude.ai, italic muted)
  - Phase 3 wires the entries list and "Last updated · Regenerate" controls
- **Instructions section:**
  - Header: "Instructions" + "+" edit button (top-right)
  - Body: project's `systemPrompt` content (rendered) OR placeholder "Add instructions to tailor Claude's responses" (verbatim claude.ai)
  - Click `+` opens Set Instructions modal
- **Files section:**
  - Header: "Files" + "+" add button (top-right)
  - Phase 1 body: empty state with file-stack icon + "Add PDFs, documents, or other text to reference in this project." (verbatim claude.ai)
  - Phase 2 wires upload, capacity meter, file cards

### Set instructions modal

**Title:** **"Set project instructions"** (verbatim claude.ai)

**Help text** (verbatim claude.ai, with the project name interpolated):
> Provide Claude with relevant instructions and information for chats within {project name}. This will work alongside user preferences and the selected style in a chat.

(For v1 the "user preferences" link points to `/dashboard/settings`. "Selected style" is a future feature; keep the help text for parity even though styles aren't built yet.)

**Body:**
- Large textarea (10+ rows) bound to `systemPrompt`
- Placeholder: "Break down large tasks and ask clarifying questions when needed." (verbatim claude.ai)

**Footer:** Cancel / Save instructions

### Artifacts list (`/dashboard/artifacts`)

Reached from user menu → "My artifacts".

- Header: "My artifacts" h1
- Filter row: search input + type filter (All / Code / Image / Document / etc) + sort dropdown
- Card list (single column, dense): each artifact shows title, type badge, "from {conversation title}" link, generated-X-ago
- Click → opens artifact in source conversation context

## Phase 1 — explicitly OUT of build

These appear in claude.ai screenshots but we are deliberately NOT building them in Phase 1 (or at all):

| claude.ai shows | Why we're not building |
|---|---|
| Tool toggle row on project page ("Some tools are off · Turn on" with tool icon strip) | All tools always on per Phase 0 decision #3. No toggle UI. |
| "Use style" item in `+` menu | claude.ai's writing-styles is a separate feature we haven't designed. Skip. |
| "More" sidebar expansion (with Code/Customize/Design hidden) | We're putting dev/admin in the user menu instead. No "More" pattern. |
| Per-section visibility badges ("Only you" / "All project users") | Phase 1 ships "Only you" on Memory only (it's always private). Other badges in Phase 5 with sharing. |
| "Created by you · Shared with your org" byline | "Created by you" in Phase 1; the "Shared with…" suffix in Phase 5. |
| Per-chat share within shared project (image #30 "Your chats are private until shared" notice) | Phase 5 with full sharing model. |
| Project pin order (drag to reorder starred projects in sidebar) | Out of scope. Default sort is Activity. |
| Project image / icon | Out of scope. Cards rely on name + description. |

## Phase 1 — copy reference (verbatim from claude.ai)

For find-and-paste during build:

- Empty index: "Create your first project to organise chats with persistent memory, instructions, and files."
- Create modal title: "Create a personal project"
- Create modal field 1: "What are you working on?" / placeholder "Name your project"
- Create modal field 2: "What are you trying to achieve?" / placeholder "Describe your project, goals, subject, etc..."
- Detail page empty chats: "Start a chat to keep conversations organized and re-use project knowledge."
- Memory empty: "Project memory will show here after a few chats."
- Instructions placeholder: "Add instructions to tailor Claude's responses"
- Files empty: "Add PDFs, documents, or other text to reference in this project."
- Set instructions title: "Set project instructions"
- Set instructions help: "Provide Claude with relevant instructions and information for chats within {project name}. This will work alongside user preferences and the selected style in a chat."
- Set instructions placeholder: "Break down large tasks and ask clarifying questions when needed."

UK/AU spelling: "organise" not "organize" everywhere we re-write copy. claude.ai uses US spelling in the source — convert on the way through, except where verbatim is genuinely needed for visual parity.

## Phase 2 / 3 / 4 / 5 UI spec — TBD per phase

Detailed UI element specs land just before each phase starts. Re-reading the screenshots fresh at that point catches things this plan would otherwise have to predict months ahead. Reasoning:

- Phase 2 (Files): the file picker structure (Upload / Add text / GitHub / Drive / connectors) is straightforward but the capacity meter + file card design deserves a fresh look at images #26, #30
- Phase 3 (Memory): the Memory section wiring (entries list, expand-on-click, regenerate, delete) is a fresh design problem; the placeholder above is the v1 entry-point, not the full design
- Phase 4 (`+` menu + MCP resources): claude.ai's `+` menu structure is image #27; the MCP resource picker is image #28
- Phase 5 (Sharing): "Created by you · Shared with your org" + "All project users" badges + per-chat privacy notice is image #30

## Sidebar cleanup detail

**Drop from sidebar:**
- Settings (already in user menu)
- Admin Panel (already in user menu)
- Components (admin/dev only — moves to user menu Dev group)
- Style Guide (admin/dev only — moves to user menu Dev group)

**User menu rework — final structure:**

```
[avatar] Jeremy Dawes
         jeremy@jezweb.net
─────────────────────────
Settings
Admin Panel              (admin only)
My artifacts
─────────────────────────
Dev                      (admin only, expandable)
  Components
  Style Guide
─────────────────────────
Sign out
```

**Notifications:** keep in sidebar OR convert to top-bar bell only — see open question #9.

## Phase 1 — gap resolutions

Concrete answers for the 10 implicit gaps surfaced in the holistic review. Each one a small Phase 1 addition:

| # | Gap | Resolution |
|---|---|---|
| 1 | Move existing chat to a project | Right-click on a chat in the chat sidebar → context menu → "Move to project ▸" → submenu listing user's projects + "Remove from project". Also available via ellipsis on chat row. |
| 2 | Project picker on global chat input | Add a small "Project: None ▾" pill near the model picker on the chat input on `/dashboard/chat`. Click → dropdown of user's projects + "None". Default: None. |
| 3 | Search within a project | Phase 6 — Universal search palette respects an active project context. When viewing a project page, palette opens with `scope:this-project` filter pre-set; user can clear it for global. |
| 4 | Project notification settings | Phase 5 (sharing) — single per-project toggle "Notify me about activity in this project". Default on for owned projects, off for shared-with-me. |
| 5 | First-run empty state for brand-new app | `/dashboard` renders a special empty state when `conversations = 0 AND projects = 0`: two CTAs side by side — "Start a quick chat" / "Create a project". |
| 6 | Conversation conversion (existing chat → project) | Same affordance as #1. |
| 7 | Mobile responsive for two-column detail page | At `<lg` viewports, right column (Memory / Instructions / Files) collapses to BELOW the chat column. Tap-to-expand sections to keep mobile compact. |
| 8 | Project deletion semantics | Soft delete for v1 (sets `archived=1` + `archivedAt` timestamp; hard-delete via separate "Permanently delete" action in archived view). Conversations belonging to the project lose their `project_id` (set NULL — chats survive) on hard-delete. |
| 9 | Chat in archived project | Archived projects are hidden from the index by default. Chats within them remain accessible from the chat sidebar (filed under "No project"). The project detail page shows a banner "This project is archived. Restore it to add chats." |
| 10 | Instructions vs Memory conceptually | **Instructions** = always-injected static text the user wrote (`systemPrompt` column). **Memory** = LLM-extracted summary that evolves. Both inject into system prompt but they're different concepts. UI keeps them visually distinct. Phase 3 confirms this with separate sections, not merged. |

## Phase 3 — extensions (folded into the 4d effort)

Five extensions are part of Phase 3, not separate phases. Each a half-day or less:

### Extension A: Memory provenance UI

Each memory entry surfaces:
- "Last updated X ago" (top of expanded view)
- "From: {conversation title}" link → opens source conversation
- "Type: {fact|preference|decision|context|reference}" pill

Schema already has `source_conversation_id` and `updated_at`. UI cost only.

### Extension B: Auto-suggested memories chip (active flow)

When the agent detects a memorable assertion mid-chat ("My business hours are Mon-Fri 9-5"), it can call the `memory_add` tool with `mode: 'suggest'`. Instead of writing immediately, the chat surfaces an inline chip:

> 💡 Add to memory: *"Business hours are Mon-Fri 9-5 (user)"* — [Add] [Dismiss] [Always add suggestions automatically]

Same three-way trust pattern as the diff approval (see Extension E). User trains the system over time.

### Extension C: Memory privacy zones

New column on `memories`: `is_private` (default 0). Memory entries flagged private (e.g. "remember my account number is X") are NEVER auto-injected into system prompts — they're available only via explicit `load_memory(name)` tool call by the agent. Use cases: account numbers, passwords-mention-not-value, sensitive client data.

UI: lock icon toggle on each memory entry. Auto-job is instructed in its prompt to flag entries it judges sensitive (account numbers, financial data, anything that looks like a credential reference) — user reviews and confirms.

### Extension D: Project templates (UI in Phase 1, content authoring in Phase 3)

Bundled at `src/shared/config/project-templates.ts`. Each template provides:
- name, description, default systemPrompt
- starter memory entries (`type='context'`, scope=project, applied at project creation)
- suggested file types/names (placeholder list, not actual files)

Five starter templates (configurable per fork): Quoting, Content Writing, SEO Reporting, Prospecting, Customer Support.

Phase 1 builds the create-from-template UX. Phase 3 finalises the seeded memory-entry content (depends on memory v1 shipping first).

### Extension E: Memory diff + 3-way approval (the trust-builder)

**Reuses the existing `approvals` module.** When the auto-job produces memory updates, behaviour depends on the project's `memoryUpdateMode` setting:

| Mode | Behaviour |
|---|---|
| `'ask'` (default for new projects) | Job submits a proposal to the approvals queue. User sees it on `/dashboard/approvals` AND as a banner on the project page. Three buttons: Reject, Approve, Approve & always allow. |
| `'auto'` | Updates apply immediately, no queue. |
| `'never'` | Auto-job is skipped entirely for this scope. (Manual "Regenerate" still works.) |

**The proposal card shows:**
- For each ADD: full content preview
- For each UPDATE: existing memory + line-by-line diff of new content
- For each REMOVE: existing entry + reason given by the job

**The "Approve & always allow" button** flips `memoryUpdateMode` to `'auto'` on this project. From then on, this scope's memory updates apply without asking. User can revoke from project settings.

**Rejection behaviour:** the conversation gets `memoryProcessedAt = now()` (treated as processed-rejected). The cron won't keep re-attempting it. User can manually trigger via "Regenerate" button if they change their mind.

**Schema addition (move into Phase 0):**
```sql
ALTER TABLE projects ADD COLUMN memory_update_mode TEXT NOT NULL DEFAULT 'ask';
-- Values: 'ask' | 'auto' | 'never'
```

User memory and org memory have analogous settings on the user/org records (added in Phase 5 for the org case; user-level setting in Phase 3).

`★ The trust-building pattern matters` — This isn't just a confirmation dialog. It's a deliberate UX investment: new users see what the system intends to do BEFORE it acts, gradually flip to auto-mode as confidence grows, and retain a kill-switch (revoke). Same shape as MCP tool approval. Same pattern works for: auto-tagging (could become an approval too — but we judge it low-risk and skip the approval), title refinement (low-risk, skip), memory removals (high-risk, ALWAYS goes through approval even in auto-mode). Document this in the Phase 3 implementation.

### Extension F: AI-assisted project creation

UX lives in the Phase 1 create modal (third tab). Implementation is straightforward LLM-backed scaffolding — no new schema needed since outputs map directly to existing project + memory inserts.

**Flow:**

1. User types description: "a project to write emails to clients"
2. User clicks "Generate project ✨"
3. Server route `POST /api/projects/scaffold` calls cheap model (Workers AI Nemotron 3) with structured output
4. Response renders inline as a preview card with editable fields:
   - Project name
   - Description
   - System prompt (rendered in expandable section, edit opens an inline editor)
   - Starter memory entries (chips with name + content preview, click to edit, X to remove)
   - Suggested first prompts (3 chips, click to copy to clipboard for after creation, X to remove)
5. User can: edit any field inline / click "← Back" to revise the description / click "Create project" to apply
6. On Create: project row inserted, memory rows inserted (all with `type='context'` and `source_conversation_id=null`), redirect to detail page. Suggested first prompts shown as chips at top of the empty chats area.

**LLM call structure:**

```typescript
{
  systemPrompt: `You help users create well-structured AI projects in this app.
The user describes what they want; produce a draft project they can edit.

Output JSON matching the schema. Quality bar:
- name: short and concrete (3-6 words). Specific, not generic.
- description: 1-2 sentences explaining purpose.
- systemPrompt: 100-300 words. Concrete role + tone + output format.
- starterMemories: 3-5 entries. Each captures a fact/preference/context the
  assistant should hold from session 1. Skip platitudes; be specific.
- suggestedFirstPrompts: 2-3 starter prompts the user could click on day 1.

If you have org/user context from the prompt context, use it. Match
EN-AU spelling, no em-dashes, warm-direct tone unless context says otherwise.`,
  context: {
    userMemories: [...],   // injected (overview only, names + descriptions)
    orgMemories: [...],    // injected if org membership
    userInput: "a project to write emails to clients",
  },
  outputSchema: ScaffoldProjectSchema,  // Zod
}
```

**Output schema:**

```typescript
{
  name: string,
  description: string,
  systemPrompt: string,
  starterMemories: Array<{
    name: string,
    description: string,
    type: 'fact' | 'preference' | 'decision' | 'context' | 'reference',
    content: string,
  }>,
  suggestedFirstPrompts: string[],
}
```

**Worked example** (input: *"a project to write emails to clients"*):

```json
{
  "name": "Client Email Drafting",
  "description": "Drafts and refines emails to clients for project updates, quote follow-ups, and check-ins.",
  "systemPrompt": "You are an assistant helping draft professional emails to clients. Tone: warm, direct, no jargon. Match Australian English (no em-dashes, casual register, EN-AU spelling). Default structure: short greeting, 2-3 short paragraphs, clear ask or next step, sign-off. When given a context, draft 2 versions (formal/casual) unless told otherwise. Always suggest the subject line. Ask before sending — produce drafts only.",
  "starterMemories": [
    {"name": "client-email-tone", "description": "Tone guide for client emails", "type": "context", "content": "Warm, direct, EN-AU spelling. No em-dashes. Avoid jargon. Match the formality of the original thread."},
    {"name": "email-structure", "description": "Default structure for client emails", "type": "context", "content": "Greeting → 2-3 short paragraphs → clear ask or next step → sign-off."},
    {"name": "always-draft-only", "description": "Never sends, only drafts", "type": "preference", "content": "Always produce drafts the user can copy and send themselves. Never offer to send via an email tool unless asked."}
  ],
  "suggestedFirstPrompts": [
    "Draft an email to a client letting them know their project is delayed by a week",
    "Help me write a follow-up email to a quote I sent two weeks ago",
    "I need to onboard a new client. Draft a welcome email."
  ]
}
```

**Failure modes:**

- LLM output fails schema validation → retry once with stricter prompt → on second failure, fall back to Blank tab with the user's description copied into the description field
- LLM call timeout (>20s) → cancel + fall back as above
- User rejects the preview entirely → "← Back" returns them to the textarea with their description preserved

**Personalisation via context injection:**

If the user has user-scope memories ("about Jez: prefers EN-AU, no em-dashes, warm-direct tone") OR is in an org with org-scope memories ("Jezweb: Australian web agency"), those get injected into the LLM call as context. The generated project naturally inherits the user's voice and the org's framing.

This is the platform showing off what it can do: the AI-assist uses the memory system to make the project, then the project uses the memory system as it runs. Memory begets memory.

**Effort:** ~half day. New API route, one LLM call, the preview card UI. Folds into the Phase 1 budget without bumping the day count — the create modal is already in scope.

**Why this earns its keep:**

- Templates handle 5-10 known workflows; AI-assist handles the long tail
- Lower-friction path than blank for users who know what they want but not how to phrase a system prompt
- Personalised via existing memory context — every fork's users get appropriately-toned scaffolding without us shipping per-fork templates
- Excellent first-impression demo when someone tries the starter for the first time

## Phase 3 implementation answers (from discussion)

**Pacing — three triggers, each conversation processed exactly once:**

| Trigger | Detection | Action |
|---|---|---|
| Reactive (primary) | New conversation starts in a scope (project or personal) → previous conversation is candidate | Run job on prior conversation if `memoryProcessedAt IS NULL AND messageCount >= 3`, fire-and-forget via `ctx.waitUntil` |
| Idle timeout (cron) | Cron every 15 min: `last_message_at < now - 30 min AND memoryProcessedAt IS NULL AND messageCount >= 3` | Run job (catches users who close tab without starting a new chat) |
| Manual | Button on project page | Run job synchronously, return updated memory |

**One LLM call, three outputs:**

```typescript
{
  refinedTitle?: string,    // only if current title is generic/auto
  tags: string[],           // 0-5 short tags
  memoryUpdates: Array<{
    scope: 'project' | 'user' | 'org',
    action: 'add' | 'update' | 'remove',
    name: string,
    description: string,
    type: 'fact' | 'preference' | 'decision' | 'context' | 'reference',
    content: string,
    targetMemoryId?: string,
  }>
}
```

Default model: Workers AI Nemotron 3 or Gemma 4 (free tier). Quality upgrade: Haiku 4.5 via OpenRouter (~$0.005 per regen) if the cheap models prove insufficient.

**Failure modes:**

- Schema validation fails → retry once with stricter prompt → on second failure, log + skip + flag conversation for manual regen
- Cap input at ~10K tokens (most recent N chats + current memory)
- Don't crash the chat flow on memory failure. Memory is best-effort.

**Injection (progressive disclosure):**

System prompt at chat start includes a memory index (name + description per entry). Full content fetched on demand by agent via `load_memory(name)` tool — same pattern as `load_skill`.

```
## Memory (overview)

### About Jez (user)
- jez-style: Prefers terse, EN-AU spelling, no em-dashes
- jez-projects: Currently building Sprinta + vite-flare-starter

### About Jezweb (org)
- jezweb-business: Newcastle web agency, mostly WordPress/Cloudflare

### About this project
- quoting-process: 3-stage quote workflow with proposal templates
```

**Active agent tools (Phase 3 ships these):**

- `memory_search(query, scope?, type?)` — find relevant memories during a chat
- `memory_add(scope, name, description, type, content)` — capture facts the user explicitly asks to remember
- `memory_update(id, ...)` — refine existing memory
- `memory_remove(id)` — soft-delete (or hard-delete — see open question 3)
- `load_memory(name)` — fetch full content of a specific memory

**Privacy boundary:**

- User memories: always private to the user
- Project memories: visible to project members
- Org memories: visible to org members
- User memories NEVER inject into chats started by another user, even on shared projects

**Toggle:**

Per-project setting "Use project memory: yes/no", default yes. Per-conversation override later if needed.

**UI:**

Project detail page has a Memory section showing entries (name + description + last-updated). Click to expand full content. Delete button per entry. "Regenerate now" button for manual trigger.

No notifications when memory updates — too noisy. Optional small "memory updated" pill in conversation list.

**Tagging:**

Free-form, capped at 5 per conversation, model decides. Bundled into the existing describe LLM call (no extra cost). See open question 2.

## Open questions for the next discussion round

Most decisions are now locked. Remaining genuine forks:

1. **Tags vocabulary**: free-form vs constrained taxonomy? Lean **free-form, capped at 5 per conversation**, model decides.
2. **Org sharing UI**: claude.ai's "Created by you · Shared with your org" pattern, or simpler "private/shared" toggle? Lean **claude.ai pattern**.
3. **Memory regen mid-conversation**: if user is mid-conversation and trigger fires for the prior chat, do we update memory mid-stream? Lean **fire-and-forget background, no impact on current chat**.
4. **Cron infrastructure**: which Workers cron mechanism — `triggers` in `wrangler.jsonc`, or a Cloudflare Workflow? Lean **wrangler triggers** (simpler, fits the existing pattern).
5. **Notifications in sidebar**: keep Notifications as sidebar item, or remove and rely on the top-bar bell only? `NotificationBell.tsx` already exists. Lean **drop the sidebar item, rely on the bell** to cut nav noise further.
6. **AI-assisted project creation**: build into the create modal (tab #3) for v1, or defer? Lean **build it now** — see "AI-assisted project creation" section below.
7. **Create modal tab structure**: three tabs (Blank / From template / AI-assisted), or two with AI-assisted as the default first-run path? Lean **three tabs**, conventional and discoverable.

### Resolved (locked from earlier rounds)

- ~~Memory toggle default~~: replaced by `memoryUpdateMode = 'ask'` (3-way trust pattern, Extension E)
- ~~Memory entry deletion~~: hard delete in v1
- ~~Memory section empty state~~: borrow claude.ai's copy verbatim
- ~~Activity tab~~: skip in v1, foot-of-page feed via ellipsis menu
- ~~Project archive view~~: "Show archived" toggle on index page

## What's NOT in this plan but might come later

- Memory-as-MCP (exposing memories to external agents)
- Memory editing UI (currently read-only + delete only)
- Memory versioning / audit trail beyond `source_conversation_id` + `updated_at`
- Cross-project memory linking (memories that reference each other)
- Per-conversation memory disable
- Org permission roles beyond owner/member
- Per-org branding/theming
- Conversation cost dashboard at org level
- Memory search across scopes from chat with dedicated UI (the `memory_search` tool helps but no command-palette result type yet)
- Quick-switch project (`Cmd+Shift+P` to change a chat's project)
- Project pin order / drag-reorder

These are all reasonable future evolutions. None blocking v1.

## Future ideas — on the record

Bigger ideas worth naming so they don't get lost. These aren't commitments; they're flagged for future consideration based on what we learn from v1 use:

| Idea | Why it matters | Why parked for now |
|---|---|---|
| **Memory analytics dashboard** | Which memories get loaded most, which are stale, which the agent never reads. Telemetry for memory quality. | Need real usage data first. After 2-3 months of v1 use. |
| **Cron-driven content** ("every Monday morning, summarise last week's project chats") | Recurring agent work scoped to a project. Already partly possible via scheduled-agents module. | Combinatorial complexity. Park. |
| **Voice-to-memory** | "Hey Claude, remember that Troy's office hours are Tuesday 9-11" via voice button → `memory_add`. | Existing voice button + `memory_add` tool would already do this. Discovery problem, not a build. |
| **External integration as project context** | Auto-sync a Notion page, Google Doc, or GitHub repo as project memory/files. | Big build — needs OAuth refresh, polling/webhooks, conflict resolution. Park. |
| **Multi-user real-time collaboration** | Two project members live in the same chat, see each other typing/cursor. | Cloudflare DOs + WebSockets make it cheap to prototype but expensive to make right. Park. |
| **Project versioning / forking** | Snapshot a project (memory + instructions + files) as a "version", branch from it. | Niche power feature. Park. |
| **Memory granted to specific tools** | Tool `web_search` has access to memory `search-preferences` only. Fine-grained grants. | Premature. All-tools-see-all-memory is right v1 default. Park. |
| **Public/embeddable project chats** | Like SharePoint/Notion public links — share a project's chat output as a public page. | Different audience (publishing), different threat model. Park. |
| **Org-level usage / cost dashboard** | Org admins see who's spending which tokens on which models. | Real product feature, separate work stream. Park. |
| **Project import from claude.ai export** | Lower the switching cost. Importer parses claude.ai project export, creates project + memory entries from instructions. | Niche signal-of-quality but no urgent demand. Park. |
| **Memory promotion suggestions** | Auto-job notices a project memory appearing across multiple projects, suggests promoting to user memory. | Clever but easy to over-fire. Re-evaluate after Phase 3 ships and we see real cross-project memory shape. |
| **Cross-project memory references** | Memory entry can `@memory:jez-style` reference another. Auto-pulls in dependent memory when referenced. | Solves a real problem but adds complexity. Park. |
| **Trust pattern generalisation** | The 3-way approval (reject / approve / always) used for memory diffs could apply to: auto-tagging, auto-titling, file ingestion summaries, agent-proposed actions. | Memory is the v1 use case; if it lands well, the pattern can extend without rebuilding the queue. |
| **Memory toggle per conversation** | Within a project, override memory injection for a specific conversation. | Niche; project-level toggle covers 95%. Park. |
| **Memory sharing across projects (explicit user opt-in)** | Mark a project memory as "share with my other projects". Different from auto-promotion — user-controlled. | Park; revisit if multi-project users hit this need. |

## Sources

- claude.ai screenshots reviewed in conversation (sidebar, projects index, project detail, file picker, MCP resource picker, instructions modal)
- `~/Documents/vite-flare-starter/.jez/artifacts/chat-ergonomics-audit-2026-04-17.md` — 42 findings comparing claude.ai vs starter
- `~/Documents/vite-flare-starter/.jez/artifacts/chat-ui-cross-app-comparison-2026-04-17.md` — findings 43-50+ adding t3.chat, Gemini, Qwen
- `~/Documents/vite-flare-starter/.jez/artifacts/ux-extracts/claude-ai/` — pattern library + copy corpus + screenshots
- `~/Documents/virtual-team/marcus/specialists/procool/` — virtual-team architecture reference (memory layering)
- `~/Documents/virtual-team/shared/umbrella-coexistence.md` — auto-memory scoping discussion
- `src/server/modules/projects/db/schema.ts` — current `projects` table
- `src/client/components/CommandPalette.tsx` — universal search chassis (already plumbed, conversations only today)
