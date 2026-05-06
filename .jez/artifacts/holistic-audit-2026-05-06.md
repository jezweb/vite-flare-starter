---
date: 2026-05-06
status: in-progress (chat tools section pending sub-agent return)
companion: skills-and-swarm-plan-2026-05-06.md
owner: jez+claude
---

# Holistic audit — tools / skills / UI / artifacts

Pre-Phase-B sweep of the agent's surface area to flag gaps before
shipping description fixes. Four areas reviewed: chat tools, bundled
skills, Skills UI, artifacts handling.

The chat-tools section is being filled in by a parallel
sub-agent — its report lands at
`.jez/artifacts/chat-tools-audit-2026-05-06.md`.

## TL;DR — what's worth fixing

| # | Finding | Effort | Phase |
|---|---------|--------|-------|
| 1 | 6 meta-skills bloat the catalog (~1500 chars). Mark `disable_model_invocation: true` since they only run as routine hooks. | 5 min | B |
| 2 | Skills UI has no search/filter — 23 skills, scrolling only. | 30 min | B+ |
| 3 | Skills UI has no category groups (user-facing vs meta-skill). | 30 min | B+ |
| 4 | No system-prompt preview — can't debug what the agent actually sees. | 1 hour | new task |
| 5 | Artifacts page exists but isn't in the sidebar — only via user menu. | 5 min | B+ |
| 6 | No usage stats per skill (which fire? which don't?). | 1 hour | new task |
| 7 | No "tools the agent has" page — opaque to users + debugging. | 1 hour | new task |

## Bundled skills audit

23 skills currently bundled. The catalog is reasonable in size but
~25% of it is meta-skills that the model should never auto-load.

### User-facing (17)

These should stay in the catalog AND benefit from Phase B description
discipline:

`code-review` · `compare-options` · `create-report` · `csv-analyse` ·
`document-qa` · `draft-email` · `extract-structured-data` ·
`fact-check` · `git-diff-summariser` · `meeting-notes` ·
`morning-brief` · `plan-task` · `remember-conversation` ·
`rewrite-for-audience` · `save-research-doc` · `summarise-url` ·
`web-research`

Most of these already have decent "Use when..." descriptions.
Phase B is a polish + length-trim sweep, not a rewrite.

### Meta-skills (6) — should be `disable_model_invocation: true`

These only fire as routine hooks (SessionEnd, daily reflection,
weekly curation). The model should NEVER auto-load them from the
catalog. Mark them invisible:

| Skill | Used by |
|-------|---------|
| `enrich-error` | SessionEnd hook on error-prone routines |
| `librarian-curate` | Weekly cross-agent curation routine |
| `reflect` | Daily end-of-day distillation routine |
| `route-finding` | SessionEnd hook on routines emitting findings |
| `routine-health-check` | Daily routine-health monitoring |
| `score-importance` | Pre-finding-write hook |

**Action**: add `disable_model_invocation: true` to each meta-skill's
frontmatter. Catalog drops by ~1500 chars (~750 tokens) per chat
turn. Cumulative win across thousands of turns.

### Description length distribution

After the meta-skills are removed from the catalog, every remaining
description is already ≤250 chars. The sweep target ("≤200 chars")
is achievable with light edits to 4-5 of the longer ones.

## Skills UI audit (`/dashboard/skills`)

### What's there

- Card view + list view (toggleable)
- Per-skill enable/disable switch
- Edit detail page with Source / Overview / History tabs
- Side-by-side preview (recently shipped)
- AI Sparkle rewrite via popover
- Install from GitHub URL
- Upload SKILL.md
- Bundled-override warning chip on user edits

### What's missing — ranked by impact

1. **Search box** — 23 skills means "find draft-email" requires
   Cmd+F or scrolling. A 1-line `<Input>` filtering on name +
   description would solve it. ~10min.

2. **Category groups** — meta-skills mixed with user-facing. After
   marking meta-skills invisible (above) they vanish from the
   catalog AND can be filtered on the Skills page via a category
   tag in frontmatter (`category: "meta"` / `"user"` / etc).
   ~30min.

3. **"Always active" toggle** — Phase A planned. Surface the
   server-side flag in the UI.

4. **Token cost preview** — when a user marks a skill always-active,
   show "+~480 tokens per chat." Same calculation as the editor
   estimate. ~10min once toggle exists.

5. **"Used N times" / "Last used" stats** — surface from
   `agent_runs` audit. Helps users prune unused skills + see which
   are pulling weight. ~1 hour (needs a join query or new index).

6. **Skill testing affordance** — "Open in chat" button that
   pre-fills a chat input with `/skill-name` so users can probe
   without context switching. ~10min.

7. **Bulk operations** — disable all / enable all / mark category
   always-active. Low priority; nice when forks have 50+ skills.

### What's working well

- The Source/Overview/History tabs are a real win — clear separation
  of "what does it say" / "edit it" / "what changed."
- AI Sparkle for rewriting descriptions has the right placement
  (top-right of editor).
- The bundled-override pattern is intuitive — edit a bundled skill,
  approve the diff, your override shadows the default.

## Artifacts handling audit

### What's there

- `create_artifact` + `edit_artifact` tools (HTML / SVG / Mermaid)
- Sandboxed iframe rendering inline in chat
- `_artifact: true` marker pattern intercepted by `MessageRenderer`
- `/api/chat/artifacts` endpoint scans messages for past artifacts
- `ArtifactsPage` at `/dashboard/artifacts` with search + type filter
- Storage approach: artifacts live INSIDE message JSON, not a
  separate table (acceptable for v1, would need an index table at
  10k+ artifacts)

### Gaps

1. **No sidebar entry** — page exists but is only reachable via
   user-menu → "My artifacts". Should be a sidebar item under
   Insights (alongside Files). ~2min.

2. **No "save artifact to files"** — user can't easily get the HTML
   content out. They have to view the source tab + copy. A "Save
   to /dashboard/files" button on the artifact card would close
   the loop. ~30min.

3. **No version history per artifact** — `edit_artifact` overwrites.
   The audit data is there (in messages), but the UI shows only the
   latest. Past versions would help "wait, the third revision was
   better." ~2 hours.

4. **Limited types** — no Markdown artifact (would solve "render this
   long-form report formatted"); no code-only artifact (renders as
   syntax-highlighted code, no execution). Both are easy adds.
   ~1 hour each.

5. **No artifact sharing** — once shipped, the user can't send the
   artifact to a colleague without copying chat URL. A
   "share read-only" button generating a public viewer link would
   be a real product feature. ~3 hours (needs auth gate + R2
   public link). Skip for v1.

6. **CDN-dependent** — artifacts pull Chart.js etc from jsdelivr.
   Offline = broken. Out of scope for v1; document the dependency.

### What's working well

- The sandboxed iframe approach is the right call — full HTML
  flexibility without XSS into the parent page.
- Code/preview toggle is intuitive.
- Streaming generation reads naturally — user sees the artifact
  pop in mid-response.

## Cross-cutting concerns

### Transparency / debuggability

The agent has a system prompt that includes:
- Persona / instructions
- Active Skills (Phase A — newly added)
- Available Skills catalog
- User Preferences
- Project instructions
- Memory block

The user has NO way to see this assembled prompt. Debugging "why
isn't the agent doing X?" requires `wrangler tail` + manual log
scraping. A `/dashboard/debug/system-prompt` page (admin-only) that
fetches the assembled prompt for a given user + conversation would
be a real ergonomic win. ~1 hour.

### Tool catalog visibility

`/api/chat/catalog` exists but only routine setup wizards consume it.
A user-facing "What can the AI do?" surface would help users
discover tools without trial-and-error. ~1 hour for a basic page +
search.

### Skill activation rate metric

Sub-question that determines if Phase A+B succeeded: are users'
skills actually firing more often after the changes? Need a small
metric: count `load_skill` calls per chat per week, grouped by
skill name. The data is in `agent_runs` already. Surface it on the
Observability page.

## Verdict

**Phase B should expand to include:**
- Mark 6 meta-skills `disable_model_invocation: true` (5min)
- Surface ArtifactsPage in sidebar (2min)
- Add search input to Skills page (10min)

**New tasks worth queuing (post-Phase B, before Phase C dogfood):**
- System-prompt preview page
- Tool catalog page
- Per-skill usage stats

**Low-priority fast follows:**
- Markdown artifact type
- Code-only artifact type
- "Save artifact to files" button

The chat-tools agent's report will likely add more — particularly
around naming consistency and approval gating. Will merge findings
when it returns.
