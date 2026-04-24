# UX audit — Skills + slash-command + Files regression

**Date:** 2026-04-20 (executed overnight, completed 2026-04-21)
**Commit audited:** `4619298` (deployed version `902abc3e`)
**URL:** https://vite-flare-starter.webfonts.workers.dev
**Viewport:** 1213×644 effective (baseline — Chrome reserved some chrome)
**Persona:** Jezweb team member — tech-savvy, builds AI agents daily, uses Claude Code + Chrome + wrangler all day, high UX standards. Thinks in terms of "does this look as polished as claude.ai or linear?"
**Scope (as requested by Jez):**
1. `/dashboard/skills` page (install/upload/toggle/preview)
2. Chat slash-command activation (`/skill-name`)
3. `/dashboard/files` regression after prefix migration

Evidence captured with Chrome MCP (authenticated session). All API + DOM assertions recorded in-line.

---

## Coverage

| Area | Threads walked | Elements tested | Ratio |
|------|:-:|:-:|:-:|
| Skills page (`/dashboard/skills`) | 5 threads (browse, install GH, install bad URL, upload dialog, toggle, preview) | 12 of 14 core elements | 86% |
| Chat slash (`/dashboard/chat`) | 1 thread (`/web-research …`) | 3 of 3 | 100% |
| Files regression (`/dashboard/files`) | 1 thread (view empty state + upload dialog) | 4 of 6 (didn't commit a live upload) | 67% |

---

## Findings (ranked)

### 🔴 HIGH — H1: User's chat message shows raw skill body + `<skill_content>` tag as visible markdown

**Where:** chat transcript after a `/web-research …` activation.
**What I saw:** the user bubble displays the literal string `<skill_content name="web-research" directory="bundled:web-research">` followed by the entire skill body rendered as markdown (headings "Web Research", "When to use", "Steps", bullet lists, code fences). The user's actual question ("what's new with Claude Sonnet 4.6 this month") is buried at the very bottom of an enormous bubble. Scrollbar on the right confirms the user message is ~3 screens tall.
**Why it matters:** phase 2 promised "`/skill-name` feels Claude-Code-native." Native means the command is a *control* not *content*. The UI makes it look like the user pasted the whole SKILL.md as their message. Anyone scrolling back through a saved conversation will see a wall of unrelated text before the AI response. Copy-paste of that message (e.g. sharing a screenshot) leaks skill-authoring detail.
**What claude.ai does instead:** slash commands either (a) show the command as a compact pill above the prompt, or (b) silently inject into the model's system context without appearing in the user's bubble at all.
**Fix options:**
1. Server-side: store the user message as just the post-slash text. Send the skill body as a `system`-role message preceding it. Best fidelity.
2. Client-side in `MessageRenderer`: detect `<skill_content …>…</skill_content>` at the start of a user message → collapse behind a `/web-research` pill; clicking the pill expands. Minimal server change.
3. Lowest-effort stopgap: strip `<skill_content>…</skill_content>` from the rendered user message but keep it in `parts` for the model. Users would see "Using /web-research." + their text.

Recommend option 2 for the starter — it's the most obviously "right" and keeps the skill body accessible if a user wants to see what got injected.

### 🟠 MEDIUM — M1: New bundled skills are invisible until user hits "Sync bundled"

**Where:** first load of `/dashboard/skills` after a deploy that added bundled skills.
**What I saw:** after deploying commit `4619298` which adds `csv-analyse`, `git-diff-summariser`, `meeting-notes`, the UI listed 14 skills (old bundled) + 1 (newly-installed r2 `/pdf`). The 3 new bundled skills only appeared after I manually clicked "Sync bundled".
**Root cause (verified by code read):** `useSkillsList()` calls `GET /api/skills` which does `db.select()` directly — never invokes `syncBundledSkills()`. Only `GET /api/skills/summary` (used by the agent's catalog) calls `listSkills()` which syncs. The dashboard uses the non-syncing endpoint.
**Fix:** make `GET /api/skills` also trigger sync (same idempotent flag). Or, run a sync on every page mount via a small `useEffect(sync.mutate, [])` — but that's ugly. Better: change the server endpoint.

### 🟠 MEDIUM — M2: Header description collides with action buttons at 1213–1440px

**Where:** top of `/dashboard/skills`.
**What I saw:** description text ("Reusable agent procedures — compatible with the agentskills.io spec. Use `/skill-name` in chat to activate one explicitly.") wraps to 4 lines. Word "explicitly." is orphaned on its own line. Visually bumps into the Sync bundled / Install / Upload button row because there's no reserved gutter.
**Why it matters:** first-impression page. A crowded header reads as "not finished".
**Fix:** give the description `max-w-prose` (~65ch) and drop it to a second line, or move it below the button row. Buttons are more important than the description for a page Jez visits repeatedly.

### 🟠 MEDIUM — M3: Upload dialog has two input modes but one submit button

**Where:** skills page → "Upload" button → dialog.
**What I saw:** dialog has a file picker (`Zip archive`) and a separate textarea (`Paste SKILL.md`) with a big "OR" divider. Only one submit button at the bottom: "Upload SKILL.md". The file picker auto-uploads on selection (no button). The label "Upload SKILL.md" only applies to the paste-inline mode — confusing when looking at the file picker half.
**Fix:** rename the submit button to just "Upload" (generic), or split into two buttons ("Upload zip" / "Upload pasted") only enabled when their respective input has content. Also add a visible note like "Zip uploads automatically when you pick a file" next to the file picker so users don't hunt for a submit button there.

### 🟡 LOW — L1: Preview dialog's resource list looks clickable but isn't

**Where:** skills page → Preview a skill that has resources (e.g. `/pdf`).
**What I saw:** resources are listed with `<ExternalLink>` icons and monospace filenames. Looks like links. Clicking does nothing — they're `<li>` items not `<a>`.
**Fix:** either (a) make them actually clickable — click opens a nested sub-dialog showing the resource's content, loaded via `read_skill_resource`; (b) swap the external-link icon for a plain file icon to signal "static list" intent.

### 🟡 LOW — L2: Preview body is nested-scrollable (two scrollbars)

**Where:** same preview dialog.
**What I saw:** the dialog itself has a vertical scrollbar, and inside it the body `<pre>` has its own scrollbar capped at `max-h-[40vh]`. Combined with the dialog's `max-h-[80vh] overflow-y-auto`, scrolling inside the body often scrolls both independently, which is disorienting.
**Fix:** remove the inner `max-h-[40vh] overflow-y-auto` — let the outer dialog be the only scroll container. The body becomes as tall as it needs to be.

### 🟡 LOW — L3: "Install from GitHub" error message could be more actionable

**Where:** install dialog, after submitting `not-a-url`.
**What I saw:** error "Could not parse GitHub directory URL: not-a-url". Accurate, but doesn't help the user recover.
**Fix:** append an example: "Try `https://github.com/owner/repo/tree/main/skill-name` or `owner/repo/skill-name`."

### 🟡 LOW — L4: "/pdf" imported from anthropics/skills has a short slash-command-clashing name

**Where:** after installing `https://github.com/anthropics/skills/tree/main/skills/pdf`, the skill lands as `/pdf` in our registry.
**What I saw:** the name honours what the upstream author declared in SKILL.md frontmatter. That's correct behaviour. But `/pdf` is vague — users who later install a different PDF skill will need to rename or delete the earlier one. Also conflicts conceptually with the bundled `/document-qa` which already handles PDFs.
**Why I'm flagging it:** not a bug in our system — a gap in user guidance. The starter's default skill catalog is already strong for PDF QA; a user newly enthused to "install skills" might install the anthropic ones and end up with weird overlap.
**Fix (non-code):** the install dialog could warn when an install would create a name collision or install something that overlaps with a bundled skill. Lower priority.

### 🟡 LOW — L5: `<p>` headers show odd first-line wrap behaviour

**Where:** header paragraph "Reusable agent procedures — compatible with the agentskills.io spec."
**What I saw:** `agentskills.io spec.` hyperlink is rendered with a period glued to "spec" inside the anchor, making the full stop look like it's part of the URL.
**Fix:** move the period outside the anchor or add a trailing space.

### 🟢 WORKS WELL

- **GitHub directory install is genuinely good.** Installing `anthropics/skills/tree/main/skills/pdf` pulled 10+ resources (LICENSE.txt, forms.md, reference.md, scripts/*.py) into R2 in a single shot. Preview dialog listed them all correctly. No server errors in console; no 4xx/5xx in network panel.
- **Toggle behaviour is airtight.** Switch aria-label flips between "Disable skill" / "Enable skill" based on `aria-checked`. Card receives `opacity-60`. Label text switches "Enabled"/"Disabled".
- **Bundled skills correctly omit the delete button.** Only r2 / github sources expose trash can. Good information hierarchy.
- **Error states degrade gracefully.** Invalid GitHub URL → clear inline red error. 404 on GitHub path → "No SKILL.md found at …". Nothing crashed the dialog.
- **Slash activation itself works end-to-end.** The model actually loaded the skill and followed its instructions — called `web_search` for 4 queries, then cited sources from anthropic.com/claudelab.net/youtube.com. The *agent side* works.
- **Files page empty state is clean.** Nice stat cards (Total / Storage / Folders) plus dropzone. Upload dialog has max-size hint (10 MB) and drag-and-drop affordance.
- **No console errors.** Entire session produced only one info-level Sentry "DSN not configured" message. No React warnings, no 4xx/5xx network requests.

---

## Scenario battery

Ran 4 of the 8 battery scenarios. Other 4 were out of scope (scoped audit).

1. **First contact** — ✅ If I didn't know what "agentskills.io" was, the header description and `/skill-name` hint are enough to grasp the gist. The bundled skills' `/` prefix hints at slash-command syntax too.
2. **Wrong turn recovery** — ✅ Bad GitHub URL + bad path both recoverable inside the dialog without losing the typed URL.
3. **Returning user** — ⚠️ Second visit, the 3 new bundled skills still weren't visible until I hit Sync (M1 above). Breaks the returning-user "faster the second time" principle.
4. **Destructive confidence** — ⚠️ Delete on `/pdf` (r2 skill) uses a plain `confirm()` browser dialog. Text is clear ("Delete skill "pdf"? This removes it from the registry and R2.") but using `confirm()` feels unrefined vs the rest of the shadcn UI. Not tested (didn't delete; would have re-tested install).

---

## Network / console

No issues.

| Status | Count | Notes |
|--------|:-:|-------|
| 2xx | all | Every API call under /api/skills/* returned 200 |
| 3xx | 0 | |
| 4xx | 0 | |
| 5xx | 0 | |
| Console errors | 0 | Only one INFO Sentry disabled notice |

---

## Priority recommendations

| # | Fix | Effort | Impact |
|---|-----|:-:|:-:|
| 1 | H1 — hide `<skill_content>` wrapper in user bubbles (pill-ify) | 1–2 hrs | High |
| 2 | M1 — sync bundled on `GET /api/skills` too | 5 min | High |
| 3 | M2 — constrain header description width; don't collide with buttons | 5 min | Medium |
| 4 | M3 — rename upload submit button + add "auto-uploads on pick" hint | 15 min | Medium |
| 5 | L2 — drop inner `max-h-[40vh] overflow-y-auto` on preview body | 2 min | Low |
| 6 | L3 — add example URL to GitHub parse error | 2 min | Low |
| 7 | L4 — warn on install name collision with bundled skill | 30 min | Low |
| 8 | L5 — period outside the anchor tag | 1 min | Low |
| 9 | L1 — make resource list clickable to open sub-preview | 1–2 hrs | Low |

Top 3 together: ~2 hours of focused work, covers the only Serious finding plus two visible Medium annoyances.

---

## Fix-and-verify loop

Offering: I can implement #1–#5 now (about 90 minutes), rebuild + redeploy, then re-walk the chat and skills pages to confirm every issue is gone. Or pause here for you to steer which ones are in scope.

---

*Audit ran on Chrome MCP with live session. Evidence captured via DOM snapshots, screenshots, and direct fetch() to the deployed API. No destructive actions taken — installed one test skill (`/pdf`) but didn't delete anything.*
