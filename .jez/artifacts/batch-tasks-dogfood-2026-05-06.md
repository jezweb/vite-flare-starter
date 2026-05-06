---
date: 2026-05-06
status: complete (text-items path proven; file-upload path deferred)
companion: skills-and-swarm-plan-2026-05-06.md
owner: jez+claude
---

# Phase C — batch-tasks live dogfood

End-to-end test of the batch-tasks swarm shipped earlier today.
Verified the full chain: chat agent → tool discovery → tool fire →
Workflow → per-item AI calls → D1 results → JobDetailPage rendering.

## Verdict

**Pass with one fix found and shipped mid-test.** Core swarm works
end-to-end. Approval gate fires at the right threshold. Workflow
runs to completion in seconds for trivial items. Bug found in
`find_tools`; fixed and re-verified.

## Test 1 — 3-item smoke (no approval needed)

| Step | Verified |
|------|----------|
| Chat agent searched for `start_batch_task` via `find_tools` | ✗→✓ (bug found, see below) |
| Tool fired with 3 inline text items | ✓ |
| Job row created, Workflow instance kicked off | ✓ |
| All 3 items processed in parallel | ✓ |
| Per-item results written to D1 (real one-sentence summaries, not garbage) | ✓ |
| JobDetailPage shows status flipped queued → running → completed | ✓ |
| Item labels render in UI ("Q1 financial report" etc — agent provided friendly labels) | ✓ |

End-to-end time for 3 simple text items: ~10 seconds.

### Sample output (verbatim from D1)

| Input | Result |
|-------|--------|
| "Q1 financial report shows revenue grew 23% year-over-year, driven by AI product subscriptions." | "AI product subscriptions fueled a 23% year-over-year revenue increase in Q1 2026." |
| "Bug report: users on Safari report the chat input scrolls awkwardly when very long…" | "Safari's chat input scrolls awkwardly when users paste very long content." |
| "Meeting note: Sarah will lead the new onboarding video project. Target ship date end of June…" | "Sarah is leading a new onboarding video project with an approved budget from James, set to be completed by the end of June." |

Sonnet 4.6 followed the system prompt's "no preamble, just the
result" instruction cleanly across all 3 items. attempts: 1 each
(no retries needed).

## Test 2 — 7-item job (approval gate)

| Step | Verified |
|------|----------|
| Tool fired with 7 inline text items | ✓ |
| `find_tools` returned 8 matches for "batch task" (was 0 before the fix) | ✓ |
| Approval card rendered with full proposal (instruction + items array, friendly labels) | ✓ |
| Approve / Deny buttons present and enabled | ✓ |
| Workflow execution after approval | not verified — see harness note |

### Harness note — synthetic Approve click doesn't register

`button.click()` and `dispatchEvent(PointerEvent)` from JavaScript
both failed to trigger the approval handler. Same Chrome MCP /
React-handler limitation documented in
`~/.claude/rules/ai-sdk-tool-approval-autosubmit.md` and the
yesterday's chat-migration audit's "harness quirks" section.

Real-mouse user clicks work end-to-end (verified previously in this
codebase). This is a harness limitation, not an app bug. Approval
flow itself was confirmed:
- Card renders with full proposal data
- Buttons are present and enabled
- The threshold (>5 items) fires correctly

## Bug found + fixed mid-test

**`find_tools` did single-substring match on multi-word queries.**

The chat agent searched for `"swarm batch task"` — three tokens. The
old algorithm treated this as one literal:

```ts
if (nameLower.includes(q)) score += 30  // q = "swarm batch task" — never matches
```

Fix (committed in `357c4f0`):
- Tokenise the query on whitespace; drop tokens <2 chars as noise
- Score each tool per-token, sum across tokens
- Same weight ratios (exact name > name-includes > description-includes > word-prefix)

Companion: beefed up `start_batch_task` description with explicit
synonyms (swarm, fan-out, parallel, batch process) and trigger
phrases ("for each", "do this for all of"). Same shape the bundled
skills already use.

Verified post-fix:
- Search for "batch task" → 8 matches (was 0)
- Search for "swarm" → matches start_batch_task via the synonym in description
- Search for "batch" alone → still works (single-token case unchanged)

## What this dogfood did NOT prove

Deferred to a future session — needs real test files:

- **PDF / DOCX / XLSX flow via env.AI.toMarkdown.** All 3 items in
  Test 1 were inline text. The Workflow's `loadItemContent` branch
  for `r2_file` mime types wasn't exercised. Needs real file uploads.

- **Image vision via Sonnet.** Same as above — needs an image in R2.

- **Real 50+ item swarm.** Tested with 3 + 7. Concurrency window
  (CONCURRENCY=8 per window) wasn't stressed. At 50 items we'd see
  6 windows of 8; at 100 we'd see 13. Not exercised.

- **Cancel button mid-run.** Test 1 finished too fast to cancel;
  Test 2 stalled at the approval card.

- **Per-item retry after step.do() failure.** Items succeeded first
  attempt. The retry path (limit: 3, exponential backoff) wasn't
  exercised because nothing failed.

- **Cost gate / model override.** Default Sonnet was fine; agent
  passing a different `model` param wasn't tested.

These all sit behind real-file-upload + a deliberate failure
injection. Worth a follow-up dogfood with Jez attaching 8 real PDFs
when there's a use case in front of him.

## Other live observations

- The `/dashboard/jobs` empty state reads cleanly. Nav entry under
  Work + Insights → Artifacts entry both shipped this morning are
  live and rendering.
- `/api/jobs/:id` returns the full job + items shape; UI auto-refresh
  polled it every 3s while the job was running.
- The chat agent's `Reviewed (step 2 of 3)` indicator shows the AI
  SDK's tool-discovery → tool-call flow correctly.

## Action items from this dogfood

1. ✓ Fix `find_tools` multi-word query bug (commit `357c4f0`)
2. ✓ Beef up `start_batch_task` description with synonyms (same commit)
3. ⏸ Future dogfood with real PDF / image / DOCX inputs to exercise
   `env.AI.toMarkdown` and vision paths
4. ⏸ Sweep other tool descriptions for missing trigger phrases —
   the lesson generalises (per-token search + skill-style triggers
   also help bundled tools the agent should pick up reflexively)
