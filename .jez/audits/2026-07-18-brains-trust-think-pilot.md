---
date: 2026-07-18
status: complete
owner: claude
---

# Brains-trust — Think pilot (`ThinkPilotAgent`, commit 72a0157)

Panel: `openai/gpt-5.6-sol` + `google/gemini-3.1-pro-preview` via OpenRouter.
Scope: `think-pilot-agent.ts`, `ThinkPilotPage.tsx`, `/agents/*` access-policy
excerpt. No Criticals; Gemini explicitly cleared authz/tenancy/path-traversal.

## Accepted → fixed (follow-up commit)

| Finding | Reviewer | Fix |
|---|---|---|
| **High — unbounded instance creation.** `owner-colon` accepts any `<userId>:anything`; each pilot DO registers a daily scheduled LLM task on boot → per-user standing-spend amplification. | GPT-5.6 | New `owner-single` policy: instance must be exactly `<userId>:main`, enforced at the route gate before DO creation. |
| **Low — tool input hidden after completion.** ToolPart rendered `getToolInput` only pre-completion; transcript lost what the agent actually wrote. | Gemini | Input now rendered in all states. |
| **Medium — D1 insert vs ledger settle not atomic.** Crash between the notification insert and settlement can re-run the insert on recovery. | GPT-5.6 | Documented in-code (proportionate for a demo notification); guidance for forks: stable op id + UNIQUE/ON CONFLICT in the external store. |
| **(UX) idempotency semantics unclear to the model.** | Gemini (partial) | `record_note` description now states immutability per noteId + the ActionKeyConflict behaviour. |

## Rejected (with evidence)

- **"Agent cannot read /notes/ — morning-brief will fail"** (Gemini High):
  wrong. `workspaceBash=false` only gates the bash tool; Think's
  `createWorkspaceTools` still registers `read`/`write`/`edit`/`list`
  (verified in `dist/tools/workspace.js:72-74`).
- **"Idempotency key silently drops updates"** (Gemini): refuted live —
  same key + different input throws a visible `ActionKeyConflict` in the
  transcript (screenshot `.jez/screenshots/think-pilot-live-2026-07-18.png`);
  replay only happens for identical input.
- **"Edge 524 after ~100s idle"** (Gemini Low): turns stream over the agents
  SDK WebSocket, not buffered HTTP through the edge; SDK heartbeats apply.
  Not actioned.
- **Clear-history-during-stream + input-cleared-before-send-settles**
  (GPT-5.6 Lows): real but proportionate to a pilot demo surface; noted,
  not actioned.
