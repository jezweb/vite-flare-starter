# Overnight Work Log — Remote Agent Continuation

This file tracks incremental progress made by a scheduled remote agent (runs hourly) between Jez's sessions. Each iteration appends a short entry.

**How to use this log as the remote agent:**

1. Read this file first. Count completed iterations (entries below).
2. If iteration count >= 8, OR current UTC time is > 16:00 UTC (= past 2am Sydney), bail immediately with a single log line: `Bailed — stop condition hit`.
3. Pick ONE task from the `Candidate tasks` list below that isn't marked DONE. Skip any task marked SKIP or BLOCKED.
4. Implement the change in the specified files. Minimise scope — single-file changes preferred.
5. Run `pnpm type-check`. If it fails, revert with `git checkout -- .` and log `Iteration N bailed — type-check failed`. Do NOT commit.
6. Run `pnpm build`. If it fails, revert + log as above.
7. Commit with a clear conventional-commit subject. Push to origin/main.
8. Append an entry to this log with: iteration number, task id, files changed, commit SHA, one-line note.
9. Stop the agent (one iteration per run).

**Hard constraints:**

- Never `git push --force`, `git reset --hard`, `git checkout <ref> -- <file>` against uncommitted changes not your own, `rm -rf`, `wrangler delete`, D1 `DROP`/`DELETE`, or `npx wrangler secret delete`.
- Max 1 commit per iteration.
- Never touch D1 schema (`src/server/modules/*/db/schema.ts`) or add new migrations without Jez's review.
- Never add new dependencies (`pnpm add` is forbidden) — work with what's installed.
- Never modify `CLAUDE.md`, `wrangler.jsonc`, `.env*`, or anything in `.claude/` — those are Jez's.
- Never deploy (`wrangler deploy`). The remote env has no wrangler auth; Jez deploys on waking up.
- If any uncertainty (types, build, linter, scope), revert and log the bail reason.

**Reference docs you should read before picking a task:**

- `.jez/artifacts/chat-ui-cross-app-comparison-2026-04-17.md` — Findings 43-55 from four-app audit (many done; see "Status" below)
- `.jez/artifacts/chat-ergonomics-audit-2026-04-17.md` — Original 42-finding audit
- `.jez/artifacts/chat-improvements-plan-2026-04-17.md` — Phased plan
- `CLAUDE.md` — project stack reference

---

## Candidate tasks (pick ONE per iteration, skip DONE/SKIP/BLOCKED)

| ID | Title | Files likely touched | Status |
|----|-------|----------------------|--------|
| F43 | Flat example questions below chip row | `chat-chips.ts`, `ChatPage.tsx` | DONE (commit 827d8a7) |
| F44 | Optional emoji on chips | `chat-chips.ts`, `ActionChips.tsx` | SKIP — needs Jez's design call on which emoji per chip |
| F46 | Labelled "Attach" button on wide viewports | `ChatPage.tsx` (wrap PromptInputActionMenuTrigger with label span) | DONE (commit 81f076d) |
| F47 | Cost-tier dots on model picker trigger | `ModelSelector.tsx` + server `types.ts` + `models.ts` + `index.ts` — add costTier field, render 3-slot dot indicator | DONE (local iteration 2, version 0e25ca39) |
| F48 | Starred conversations | DB schema + API + UI | BLOCKED — schema change, needs Jez |
| F50 | Collapsible sidebar date groups | `ConversationSidebar.tsx` | DONE (commit 827d8a7) |
| F52 | Per-message aria-label for screen readers | `MessageRenderer.tsx` (add `aria-label` to the Message wrapper with role + first 50 chars of text) | DONE (commit fa300a5) |
| F55 | Plan-mode/confirm-before-tools toggle | `ChatPreferencesSection.tsx` + `agent.ts` (add `confirmationMode` field to `ChatPreferences`, format in system prompt) | DONE (commit 9bb7ec6) |
| X1 | Add FilePen icon to ellipsis "Rename" action | `ConversationSidebar.tsx` (already uses Pencil — this would be a no-op) | SKIP — already done |
| X2 | Rename "Sources" section header in chat to "References" | search src for "Sources" and rename if only in ui labels | SKIP — no matches in client for "Sources" label; was already renamed or doesn't exist |
| X3 | Model selector empty state — show "No models available" when data.models.length === 0 | `ModelSelector.tsx` | DONE (commit e17ab0c) |
| X4 | Tighten copy on error display in input area | `ChatPage.tsx` — the `<div className="rounded-md border border-destructive/50...">` — make messages more actionable | DONE (commit e17ab0c) |
| X5 | Add title tooltip to attached-file pill in transcript | `MessageRenderer.tsx` — `TranscriptFilePill` component — add `title={name}` attribute | DONE (commit e17ab0c) |
| F53 | Artifact sidebar (claude.ai-style right panel) | `ArtifactSidebar.tsx` (new), `ChatPage.tsx`, `MessageRenderer.tsx` — zero-schema-change derivation over messages, lists artifacts + file attachments with download, click-to-scroll | DONE (commit e17ab0c) |

Pick the next AVAILABLE task in ID order. Mark it in-progress in your iteration log; only mark DONE here if your commit succeeds.

---

## Iteration log

*(Append entries here. Newest at top.)*

### Bail — 2026-06-04T07:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-06-04T06:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-06-04T05:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-06-04T04:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-06-04T03:07Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-06-04T02:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-06-04T01:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-06-04T00:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).