# Inspirations & Design Lineage

This document captures what vite-flare-starter borrowed, deliberately differs on, and ignored from leading AI chat products. It exists so a future fork (or session) understands *why* the starter looks the way it does, not just what it does.

**Last updated:** 2026-04-26 — projects-first-class build
**Scope:** Surfaces shipped through the projects-first-class plan (Phases 0-7)

---

## Why this doc exists

Most agentic web apps converge on similar patterns because they all read the same handful of leaders' surfaces. We've done the same — claude.ai is the headline reference, with cherry-picks from t3.chat, Gemini, Qwen, and Claude Code's auto-memory system. This doc names those references explicitly so:

1. Forks know where to look when they want to extend a pattern
2. Future-us doesn't relitigate decisions we already made
3. We can identify our own genuine differentiation when we make it

Source artefacts (gitignored, in `.jez/artifacts/`):
- `chat-ergonomics-audit-2026-04-17.md` — 42 findings comparing claude.ai vs the starter
- `chat-ui-cross-app-comparison-2026-04-17.md` — findings 43-50+ adding t3.chat, Gemini, Qwen
- `ux-extracts/claude-ai/` — pattern library + copy corpus + screenshots
- `projects-first-class-plan-2026-04-26.md` — the Phase 0-7 build plan

---

## What we lifted from claude.ai (almost wholesale)

### Projects as first-class

The Projects pattern is the headline borrow. claude.ai treats Projects as:
- A top-level nav destination (not a feature inside chat)
- A container for instructions + memory + files + conversations
- A workspace-level system prompt that stacks above per-chat overrides

We mirror this almost exactly:
- `/dashboard/projects` as a first-class destination in the sidebar
- `/dashboard/projects/:id` with two-column layout (chat input + list / Memory + Instructions + Files context column)
- Project's `systemPrompt` injected into chats started in the project
- Memory layer added on top (see `Memory architecture` below)

The naming choice was deliberate. We considered `Workspaces`, `Spaces`, `Gems`, `Boards` — all valid, all common in the space. We picked **Projects** because claude.ai users have the muscle memory and our shape is functionally identical. If a future fork builds a different *kind* of project (e.g. Sprinta-style work tracker), they namespace their table — `sprinta_projects` — and rename only at the UI layer if the collision becomes visible.

### Two-column project detail layout

Left column: chat input + chats list. Right column: Memory / Instructions / Files context strip.

Pulled from claude.ai's `/projects/:id` view (image #24, #30 in the screenshot set). On mobile the right column collapses below the chat column.

### "Create a personal project" modal copy

Verbatim:
- Modal title: "Create a personal project"
- Field 1: "What are you working on?" — placeholder "Name your project"
- Field 2: "What are you trying to achieve?" — placeholder "Describe your project, goals, subject, etc..."

Borrowing copy verbatim is cheap, gets the visual feel right, and avoids a second-guessing loop on "what should we say". Direct copy where it doesn't matter; differentiate where it does.

### Empty state phrasings

Direct lifts:
- Memory: "Project memory will show here after a few chats."
- Instructions: "Add instructions to tailor Claude's responses"
- Files: "Add PDFs, documents, or other text to reference in this project."
- Detail empty: "Start a chat to keep conversations organised and re-use project knowledge."

Light AU adaptations: `organize` → `organise` per Jez's spelling preference. claude.ai uses US spelling at source.

### Star pattern + "More" hide

claude.ai stars projects (filled vs outline) and stashes secondary features (Code, Customize, Design) behind a "More" expansion in the sidebar.

We star (Phase 1 ships this). We did NOT copy the "More" pattern — instead, secondary admin/dev affordances live in the user-menu dropdown. Reason: our sidebar is already lean, and "More" tends to grow over time. User-menu is bounded by what's relevant to *the user*, not what's relevant to *the product*.

### Set Instructions modal

Verbatim title and help text:

> Provide Claude with relevant instructions and information for chats within {project name}. This will work alongside user preferences and the selected style in a chat.

The "user preferences" link points to `/dashboard/settings`. "Selected style" is a future feature we haven't built — kept the wording for parity. If we never ship styles, drop the phrase later.

### Privacy badge ("Only you")

Memory section header carries an "Only you" badge with a lock icon. Direct lift from claude.ai's per-section visibility indicators.

When org sharing lands (Phase 5), additional badges follow the same pattern: "All project users" for shared sections.

---

## Memory architecture (claude.ai + Claude Code hybrid)

### claude.ai contribution: project-scoped memory as a first-class entity

claude.ai's project page shows Memory as a top-level section that auto-summarises across chats. The user sees an overview; the assistant sees full content. We took:
- Section position (top of right column on project detail)
- Auto-summary positioning ("Project memory will show here after a few chats.")
- Implicit "system updates this; user can edit/delete"

### Claude Code contribution: typed entries with index + on-demand load

Claude Code's auto-memory at `~/.claude/projects/.../memory/` stores typed markdown files (user / feedback / project / reference) with a `MEMORY.md` index. We took:
- Multi-entry rather than single-blob storage
- Type discriminator (`fact` / `preference` / `decision` / `context` / `reference`)
- Progressive disclosure: index in system prompt, full body via `load_memory(name)` tool
- Soft cap per entry — agent prompted to split when bloated rather than enforced

### Our addition: three-scope discriminator

claude.ai memory is project-scoped only; Claude Code's auto-memory is user-scoped (per repo+machine). We unified both with a `scope` discriminator on a single `memories` table:
- `scope = 'project'` — visible to project members
- `scope = 'user'` — private to the user, injected on any chat
- `scope = 'org'` — visible to org members (Phase 5 wires this)

One table, three views. Simpler queries; richer composition.

### Our addition: privacy zones (`is_private`)

A flag on memory entries: when `1`, the entry is excluded from system-prompt auto-injection. Available only via explicit `load_memory(name)` tool call. Use cases: account numbers, credentials hint, sensitive client data. Borrowed from no specific source — emerged from the trust-pattern discussion in the plan.

### Deferred (Phase 3 v2)

The auto-job (cron + reactive trigger) and the 3-way trust approval (Reject / Approve / Approve always — borrowed shape from MCP tool approval) are deferred. Phase 3 v1 ships manual entry/edit only. The schema and injection pipeline are in place; v2 just adds the LLM-driven extraction layer + approval queue integration.

---

## Patterns from t3.chat

### Flat example questions in empty state

t3.chat shows BOTH category chips AND 4 example questions as click-to-send chips in the empty state. We adopted the *concept* (suggested first prompts) for project templates — each template ships 2-3 prompts shown as chips on a fresh project's detail page. We did not adopt the model-picker `$$$` pricing pill; our model picker shows tier + name only.

### Labelled "Attach" button

Our chat input retains the icon-only `+` for attachments. t3.chat's "Attach" labelled button is a discoverability win we accepted in principle but didn't ship — defer for Phase 4 chat input rework.

---

## Patterns from Gemini

### Gems / personas

Gemini's "Gems" (`/gems/view`) are configured AI personas with system prompt + tools + docs. claude.ai's Projects do the same job. We use the claude.ai term but the data shape supports the Gem use case identically.

### Emoji on action chips

Gemini uses emoji as visual anchors for action chips (🖼 ✍ 🎓 etc). We accepted this for project template cards — each template carries an optional emoji. claude.ai uses Lucide icons; we mix.

### "Tools" menu picker

Gemini's "Tools" button opens a popover for forced modes (Deep Research, Canvas, Image, etc). Conceptually similar to our `+` menu in chat input. Phase 4 (deferred) is where this could land.

---

## Patterns from Claude Code

### Auto-memory layered storage

Claude Code's `~/.claude/projects/<repo-hash>/memory/` is the inspiration for our memory model. Specifically:
- File-per-entry (we made it row-per-entry)
- `MEMORY.md` index (we make this implicit — the system-prompt injection IS the index)
- Frontmatter typed entries (we use a `type` enum column)
- Soft cap discipline + agent-driven splitting

### Skills with `SKILL.md` format

Already in the starter prior to projects-first-class — `src/server/modules/skills/`. Same Claude-Code-Agent-Skills-compatible format. Not a projects-first-class addition, but worth naming as part of the lineage.

### `load_skill` / `load_memory` symmetry

Both tools are progressive disclosure: a name + description sits in the system prompt; the agent loads the full body on demand. The shape is intentional — same pattern, two surfaces. Future patterns (load_doc, load_resource) follow the same.

---

## Where we deliberately differ

### No "More" sidebar expansion

claude.ai hides Code, Customize, Design under a chevron-collapsed "More" group. We chose the user-menu dropdown for admin/dev affordances instead. Cleaner sidebar, less hidden state.

### No Activity tab on project detail

claude.ai shows "Your chats / Activity" tabs on the project page. We considered and rejected — tabs imply equal weight, but Activity is a 1% case. Activity data is captured in the existing audit log; we surface it (or could) as a foot-of-page "Recent activity" feed reached via the ellipsis menu. Phase 1 ships single-pane "Your chats" only.

### No tool toggles per project

claude.ai shows a tool-icon strip on the project page with "Some tools are off · Turn on" affordance. We considered and dropped — Jez confirmed "all tools always on" is the right default. If a future fork needs per-project tool overrides, the column add is trivial.

### No "Use style" item in `+` menu (yet)

claude.ai's writing styles is a separate feature we haven't designed. The `+` menu reference doesn't include a "Use style" item.

### Full-text search instead of JQL-lite

Conversation search uses FTS5 (D1 native). We didn't build a query DSL ("status = open AND priority = high") because saved filter UI + tag chips covers 95% of what users want.

### Memory privacy zones

claude.ai doesn't expose a `is_private` flag on memory. We added one because the use case (credentials hint, account numbers) was real and the cost was a single column.

### Three create paths instead of one

Most products offer "create blank" or "create from template" but not both visibly. claude.ai is single-path (blank). We ship three: Blank / AI-assisted / From template. Reason: the AI-assisted path is the killer feature for new users who know what they want but not how to phrase a system prompt.

---

## Where we ignored claude.ai entirely

- **Per-project file capacity quota (a real limit)** — we show a soft 50MB capacity meter on the project page but don't enforce; quota tracking is out of scope.
- **Per-section visibility for shared projects** — Phase 5 will add "All project users" badges; v1 ships "Only you" only.
- **Per-chat share within shared project** — deferred to Phase 5.
- **Project image / cover** — claude.ai supports an emoji or colour on project cards; we support a colour token only.
- **Project pin order (drag-reorder)** — out of scope. Default sort is Activity; star moves projects to top.
- **Project conversation search (per-project scoped)** — Phase 6 universal search treats projects as one of many result types but doesn't yet scope-filter by project. Future enhancement.

---

## How to read this doc when extending

When adding a new feature that has an obvious analogue in claude.ai / Gemini / t3.chat:

1. **Check the source** — which app does it best, and how?
2. **Decide: borrow, adapt, or differ?**
   - Borrow if the shape works and the cost is low (most empty-state copy)
   - Adapt if the data model needs a tweak (memory's three-scope addition)
   - Differ deliberately and document why (no Activity tab; no More expansion)
3. **Document the choice** — add an entry here so the next person doesn't relitigate.

Don't borrow without thinking; don't differ without reason. Both lazy borrowing and unmotivated divergence cost more than naming the choice.

---

## Sources at a glance

| Pattern | Source app | Where in vite-flare-starter |
|---|---|---|
| Projects as first-class | claude.ai | `/dashboard/projects/*` |
| Two-column project detail | claude.ai | `ProjectPage.tsx` |
| "Create a personal project" modal copy | claude.ai (verbatim) | `CreateProjectModal.tsx` |
| Memory section position + empty copy | claude.ai | `MemorySection.tsx` |
| "Only you" privacy badge | claude.ai | `MemorySection.tsx` header |
| Multi-entry typed memory (with index + on-demand load) | Claude Code | `memories` table + `inject.ts` + `load_memory` tool |
| Skills (SKILL.md format) | Claude Code | `skills` module (pre-existing) |
| Suggested first prompts for new projects | t3.chat (concept) | `project-templates.ts` |
| Emoji on cards | Gemini (concept) | `project-templates.ts` |
| Three-create-path modal (Blank / AI / Template) | Our addition | `CreateProjectModal.tsx` |
| Memory privacy zones | Our addition | `is_private` flag |
| Three-scope memory | Our addition (Claude Code per-user + claude.ai per-project unified) | `memories.scope` discriminator |
| Trust-pattern approval (Reject / Approve / Always) | Our addition (borrowed shape from MCP tool approval) | Deferred to Phase 3 v2 |

---

**Maintained alongside the canonical plan at `.jez/artifacts/projects-first-class-plan-2026-04-26.md`. Update this doc when you ship a feature that has a clear inspiration source or a deliberate divergence — the cost is one entry, the value is the next session not having to re-derive.**
