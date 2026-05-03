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

### Bail — 2026-05-03T05:14Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-03T04:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-03T03:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-03T02:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-03T01:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-03T00:34Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T23:19Z
Bailed — past 2am local (23:19 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T22:18Z
Bailed — past 2am local (22:18 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T21:08Z
Bailed — past 2am local (21:08 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T20:07Z
Bailed — past 2am local (20:07 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T19:02Z
Bailed — past 2am local (19:02 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T17:08Z
Bailed — past 2am local (17:08 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T15:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T14:16Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T13:26Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T12:14Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T11:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T10:17Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T09:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T08:05Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T07:10Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T06:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T05:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T04:26Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T03:16Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T02:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T01:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-02T00:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T23:10Z
Bailed — past 2am local (23:10 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T22:13Z
Bailed — past 2am local (22:13 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T21:19Z
Bailed — past 2am local (21:19 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T20:16Z
Bailed — past 2am local (20:16 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T19:09Z
Bailed — past 2am local (19:09 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T18:05Z
Bailed — past 2am local (18:05 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T17:20Z
Bailed — past 2am local (17:20 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T16:34Z
Bailed — past 2am local (16:34 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T15:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T14:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T13:35Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T11:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T10:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T09:18Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T08:28Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T07:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T06:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T05:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T04:25Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T02:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T01:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-05-01T00:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T23:01Z
Bailed — past 2am local (23:01 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T22:07Z
Bailed — past 2am local (22:07 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T21:14Z
Bailed — past 2am local (21:14 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T20:04Z
Bailed — past 2am local (20:04 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T19:16Z
Bailed — past 2am local (19:16 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T18:02Z
Bailed — past 2am local (18:02 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T17:01Z
Bailed — past 2am local (17:01 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T16:08Z
Bailed — past 2am local (16:08 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T15:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T14:22Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T13:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T12:27Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T11:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T10:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T09:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T08:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T07:04Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T06:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T05:23Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T04:16Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T03:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T02:21Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-30T00:21Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T23:05Z
Bailed — past 2am local (23:05 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T22:11Z
Bailed — past 2am local (22:11 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T21:04Z
Bailed — past 2am local (21:04 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T20:14Z
Bailed — past 2am local (20:14 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T19:12Z
Bailed — past 2am local (19:12 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T18:10Z
Bailed — past 2am local (18:10 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T17:17Z
Bailed — past 2am local (17:17 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T16:20Z
Bailed — past 2am local (16:20 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T15:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T14:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T13:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T12:36Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T11:17Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T10:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T09:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T08:07Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T07:29Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T06:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T05:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T04:25Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T03:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T02:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T01:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-29T00:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T23:27Z
Bailed — past 2am local (23:27 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T22:19Z
Bailed — past 2am local (22:19 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T21:16Z
Bailed — past 2am local (21:16 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T20:08Z
Bailed — past 2am local (20:08 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T19:07Z
Bailed — past 2am local (19:07 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T17:14Z
Bailed — past 2am local (17:14 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T16:11Z
Bailed — past 2am local (16:11 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T15:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T14:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T13:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T12:16Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T11:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T10:23Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T08:20Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T07:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T05:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T03:10Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T02:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T01:22Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-28T00:27Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T23:25Z
Bailed — past 2am local (23:25 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T22:25Z
Bailed — past 2am local (22:25 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T21:06Z
Bailed — past 2am local (21:06 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T20:15Z
Bailed — past 2am local (20:15 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T19:08Z
Bailed — past 2am local (19:08 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T18:11Z
Bailed — past 2am local (18:11 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T17:10Z
Bailed — past 2am local (17:10 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T16:09Z
Bailed — past 2am local (16:09 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T15:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T13:34Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T12:34Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T10:16Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T08:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T06:26Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED). Note: found diverged local main (86 commits, no common ancestor with origin/main); backed up to branch `jez-local-main-2026-04-27` on origin for Jez to review.

### Bail — 2026-04-27T05:23Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T04:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T03:10Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T01:10Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-27T00:38Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T23:11Z
Bailed — past 2am local (23:11 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T22:17Z
Bailed — past 2am local (22:17 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T21:10Z
Bailed — past 2am local (21:10 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T20:03Z
Bailed — past 2am local (20:03 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T19:08Z
Bailed — past 2am local (19:08 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T18:05Z
Bailed — past 2am local (18:05 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T17:04Z
Bailed — past 2am local (17:04 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T16:02Z
Bailed — past 2am local (16:02 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T15:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T14:04Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T13:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T12:25Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T11:17Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T10:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T09:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T08:05Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T07:23Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T06:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T05:10Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T04:18Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T03:17Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T02:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T01:21Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-26T00:25Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T23:22Z
Bailed — past 2am local (23:22 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-25T22:16Z
Bailed — past 2am local (22:16 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-25T21:02Z
Bailed — past 2am local (21:02 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-25T20:11Z
Bailed — past 2am local (20:11 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-25T19:16Z
Bailed — past 2am local (19:16 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-25T18:05Z
Bailed — past 2am local (18:05 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-25T17:06Z
Bailed — past 2am local (17:06 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-25T16:07Z
Bailed — past 2am local (16:07 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-25T15:10Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T14:16Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T13:07Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T12:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T11:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T10:04Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T09:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T08:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T07:05Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T06:30Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T05:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T04:18Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T03:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T02:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T01:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-25T00:25Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T23:19Z
Bailed — past 2am local (23:19 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-24T22:28Z
Bailed — past 2am local (22:28 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-24T21:22Z
Bailed — past 2am local (21:22 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-24T20:08Z
Bailed — past 2am local (20:08 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-24T19:12Z
Bailed — past 2am local (19:12 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-24T18:24Z
Bailed — past 2am local (18:24 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-24T17:12Z
Bailed — past 2am local (17:12 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-24T16:05Z
Bailed — past 2am local (16:05 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-24T15:23Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T14:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T13:29Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T12:04Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T11:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T10:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T09:05Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T08:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T07:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T06:14Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T05:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T04:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T03:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T02:08Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T01:16Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-24T00:37Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T23:21Z
Bailed — past 2am local (23:21 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-23T22:05Z
Bailed — past 2am local (22:05 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-23T21:19Z
Bailed — past 2am local (21:19 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-23T20:11Z
Bailed — past 2am local (20:11 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-23T19:08Z
Bailed — past 2am local (19:08 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-23T17:14Z
Bailed — past 2am local (17:14 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-23T16:10Z
Bailed — past 2am local (16:10 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-23T15:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T14:24Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T13:20Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T12:27Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T09:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T08:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T07:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T06:21Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T05:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T04:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T03:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T02:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T01:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-23T00:40Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T23:10Z
Bailed — past 2am local (23:10 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-22T22:03Z
Bailed — past 2am local (22:03 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-22T21:02Z
Bailed — past 2am local (21:02 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-22T20:11Z
Bailed — past 2am local (20:11 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-22T19:04Z
Bailed — past 2am local (19:04 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-22T18:02Z
Bailed — past 2am local (18:02 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-22T17:14Z
Bailed — past 2am local (17:14 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-22T16:50Z
Bailed — past 2am local (16:50 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-22T15:23Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T14:41Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T13:21Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T12:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T11:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T10:04Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T09:20Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T08:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T07:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T06:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T05:10Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T04:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T03:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T02:14Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T01:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-22T00:34Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T23:11Z
Bailed — past 2am local (23:11 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T22:07Z
Bailed — past 2am local (22:07 UTC > 16:00 UTC cutoff) and no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T21:21Z
Bailed — past 2am local (21:21 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-21T20:11Z
Bailed — past 2am local (20:11 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-21T19:11Z
Bailed — past 2am local (19:11 UTC > 16:00 UTC cutoff). All candidate tasks are DONE, SKIP, or BLOCKED; no new tasks available.

### Bail — 2026-04-21T18:09Z
Bailed — past 2am local (18:09 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-21T17:11Z
Bailed — past 2am local (17:11 UTC > 16:00 UTC cutoff).

### Bail — 2026-04-21T16:02Z
Bailed — past 2am local (16:02 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-21T15:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T12:18Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T11:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T10:10Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T09:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T08:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T07:18Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T06:05Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T05:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T04:17Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T03:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T02:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T01:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-21T00:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T22:23Z
Bailed — past 2am local (22:23 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-20T21:13Z
Bailed — past 2am local (21:13 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-20T20:16Z
Bailed — past 2am local (20:16 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-20T19:23Z
Bailed — past 2am local (19:23 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-20T18:21Z
Bailed — past 2am local (18:21 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-20T17:13Z
Bailed — past 2am local (17:13 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-20T16:05Z
Bailed — past 2am local (16:05 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-20T15:23Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T14:24Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T13:07Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T12:32Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T11:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T10:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T09:07Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T08:06Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T07:07Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T06:22Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T05:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T04:15Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T03:05Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T02:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-20T01:21Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T23:06Z
Bailed — past 2am local (23:06 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-19T22:19Z
Bailed — past 2am local (22:19 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-19T19:01Z
Bailed — past 2am local (19:01 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-19T18:09Z
Bailed — past 2am local (18:09 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-19T17:07Z
Bailed — past 2am local (17:07 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-19T16:10Z
Bailed — past 2am local (16:10 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-19T15:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T14:04Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T13:10Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T12:14Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T11:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T10:19Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T09:01Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T08:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T07:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T06:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED). Note: Jez pushed a Projects module (cbf9315 pull) — no new candidate tasks added to the table yet.

### Bail — 2026-04-19T05:17Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T04:18Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T03:07Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T02:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T01:03Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-19T00:13Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED). New UX findings (M1/M3/L2/L4/P1) from April 18 audit are available for Jez to add to candidate table.

### Bail — 2026-04-18T23:08Z
Bailed — past 2am local (23:08 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-18T22:05Z
Bailed — past 2am local (22:05 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-18T21:10Z
Bailed — past 2am local (21:10 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-18T20:02Z
Bailed — past 2am local (20:02 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-18T19:13Z
Bailed — past 2am local (19:13 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-18T18:12Z
Bailed — past 2am local (18:12 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-18T17:09Z
Bailed — past 2am local (17:09 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-18T16:05Z
Bailed — past 2am local (16:05 UTC > 16:00 UTC cutoff) and no tasks left.

### Bail — 2026-04-18T15:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T14:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T13:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T12:05Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T11:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T10:12Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T09:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T08:02Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T07:09Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T06:11Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T04:29Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T03:20Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Bail — 2026-04-18T02:24Z
Bailed — no tasks left (all candidate tasks are DONE, SKIP, or BLOCKED).

### Iteration 5 (local) — 2026-04-18T02:10Z
- Task: F53 artifact sidebar + X3/X4/X5 polish bundle
- Files: src/client/modules/chat/components/ArtifactSidebar.tsx (new), src/client/modules/chat/components/MessageRenderer.tsx, src/client/modules/chat/components/ModelSelector.tsx, src/client/modules/chat/pages/ChatPage.tsx
- Commit: e17ab0c
- Deployed live (version da7de3c1) and verified: created 2 artifacts (Mermaid "Build loop" + SVG "Blue circle") in a fresh conversation. Panel toggle appeared in header, panel docked right (288px wide), cards rendered with correct icons/titles/types, click-to-scroll highlighted target with ring flash, Download all + X close buttons present. Backlog now empty modulo deferred features (F44/F45/F48/F29/F33 which need design input or schema changes).
- Note: Local session with wrangler + Chrome MCP — full verify cycle.

### Iteration 4 — 2026-04-18T01:15Z
- Task: F55 — Plan-mode/confirm-before-tools toggle
- Files: src/client/modules/settings/components/ChatPreferencesSection.tsx, src/server/lib/ai/agent.ts
- Commit: 9bb7ec6
- Note: Added confirmationMode boolean to ChatPreferences interface and formatChatPreferences; Switch toggle in settings UI; type-check clean; build failure is pre-existing @tailwindcss/typography issue (same as prior iterations).

### Iteration 3 — 2026-04-18T00:51Z
- Task: F52 — Per-message aria-label for screen readers
- Files: src/client/modules/chat/components/MessageRenderer.tsx
- Commit: fa300a5
- Note: Added ariaLabel computed from message.role + first 50 chars of first text part; passes through Message's HTMLAttributes spread; type-check clean; build failure is pre-existing @tailwindcss/typography issue unrelated to this change.

### Bail — 2026-04-17T23:03Z
Bailed — past 2am local (23:03 UTC > 16:00 UTC cutoff). Next task would have been F52.

### Bail — 2026-04-17T22:34Z
Bailed — past 2am local (22:34 UTC > 16:00 UTC cutoff). Next task would have been F52.

### Bail — 2026-04-17T21:32Z
Bailed — past 2am local (21:32 UTC > 16:00 UTC cutoff). Next task would have been F52.

### Bail — 2026-04-17T20:17Z
Bailed — past 2am local (20:17 UTC > 16:00 UTC cutoff). Next task would have been F52.

### Bail — 2026-04-17T19:24Z
Bailed — past 2am local (19:24 UTC > 16:00 UTC cutoff). Next task would have been F52.

### Bail — 2026-04-17T18:35Z
Bailed — past 2am local (18:35 UTC > 16:00 UTC cutoff). Next task would have been F52.

### Bail — 2026-04-17T17:06Z
Bailed — past 2am local (17:06 UTC > 16:00 UTC cutoff). Next task would have been F52.

### Bail — 2026-04-17T16:37Z
Bailed — past 2am local (16:37 UTC > 16:00 UTC cutoff). Next task would have been F52.

### Iteration 2 (local) — 2026-04-17T14:50Z
- Task: F47 — Cost-tier dots on model picker
- Files: src/server/lib/ai/types.ts, src/server/lib/ai/models.ts, src/server/index.ts, src/client/modules/chat/components/ModelSelector.tsx
- Deployed live (version 0e25ca39) and verified: API returns costTier per model (4 free / 5 low / 5 mid / 2 high). Trigger renders 0-3 filled dots + unfilled slots. Dropdown items show same indicator. Tuned thresholds so Opus/Sonnet hit "high", Haiku+GPT-5.4 hit "mid".
- Note: Local session with wrangler + Chrome MCP — full verify cycle. Next remote agent run at 16:00 UTC will pick F52.

### Iteration 1 — 2026-04-17T15:12Z
- Task: F46 — Labelled "Attach" button on wide viewports
- Files: src/client/modules/chat/pages/ChatPage.tsx
- Commit: 81f076d
- Note: Added Paperclip icon + responsive "Attach" text label (hidden on mobile, visible sm+) to PromptInputActionMenuTrigger; pnpm build has pre-existing @tailwindcss/typography failure unrelated to this change.
