---
date: 2026-05-06
status: active
companion: skills-and-swarm-build-spec-2026-05-06.md
owner: jez+claude
---

# Skills activation + swarm patterns — plan

Multi-phase plan covering four bodies of work that emerged on
2026-05-06: making skills actually fire (Phases A+B), proving the
batch-tasks swarm works (Phase C), shipping the Worker→Reviewer
quality-loop pattern from OpenSwarm (Phase D), and upgrading agent
memory to hybrid scoring + curation (Phase E).

Companion build spec lives at
`.jez/artifacts/skills-and-swarm-build-spec-2026-05-06.md` — file
paths, schemas, signatures, prompts, verification gates.

## Executive summary

**Skills aren't activating reliably today** because the system prompt
treats them as a passive menu the agent might browse. The fix is three
knobs: (1) `always_active` flag for baseline skills that bake into
every prompt, (2) trigger-first descriptions, (3) imperative
catalog-header language. ~2 hours of work for a step-change in
skill-following behaviour.

**Batch-tasks shipped 2026-05-06** but hasn't been dogfooded. One
end-to-end test with mixed file types (PDF / image / text / DOCX)
is the gate before claiming the swarm works.

**Worker→Reviewer is the high-ROI pattern from OpenSwarm.** It's a
formal review loop with structured verdicts (APPROVE/REVISE/REJECT),
capped iterations, and per-role model overrides. Generalises beyond
code review to any quality-gated AI output. Fits as a `with_review`
tool wrapper any agent can invoke. Compounds with batch-tasks — "do
50 things, but review each output."

**Memory hybrid scoring** is the small one. Replace pure cosine in
`recallSemantic` with a weighted formula (similarity + importance +
recency + frequency). 30 minutes, real impact. Background curation
routines (decay, consolidation, contradiction detection) come after.

## Why each piece exists

### A — Skills always_active

Today's bundled set has 24 skills as bullet points in the system
prompt. The agent has to scan, match, decide to load, then follow.
Every step is friction. For "baseline" skills (writing tone, user
preferences, project glossary, persona), there's no ambiguity — they
should ALWAYS apply. Baking the body into the prompt removes 4 of the
5 friction points. Token cost is real but small for short baseline
skills (~500 tokens each), and we already pay it via `User Preferences`
and `Project instructions` blocks; this just makes the same pattern
available for any user-marked skill.

### B — Description discipline + length trim

Most bundled descriptions are already trigger-first ("Use when..."),
but a few meta-skills (`librarian-curate`, `route-finding`) have
multi-sentence descriptions that bloat the catalog. The catalog is
read top-to-bottom by the model on every turn. Short, actionable
descriptions read better; padded ones get glossed over. Sweep + tighten.

### C — Batch-tasks dogfood

We shipped the swarm 2026-05-06 but haven't run a real job. Until we
do, the rest of the plan is unanchored — Worker→Reviewer composes
WITH batch-tasks, so we want batch-tasks proven first. The dogfood
also exercises `env.AI.toMarkdown` for PDFs, the approval gate at >5
items, the auto-refresh polling, and the cancel button.

### D — Worker→Reviewer pattern

OpenSwarm's pair pipeline is the most generalisable thing in their
repo. We have ad-hoc `delegate_to_writer` (sequential, no quality
gate). Real workflows want: draft → review → if revise, rewrite with
notes → cap at N iterations → ship or escalate. This is general — fits
email drafting, code generation, report writing, document summarisation,
batch-task per-item review.

Right shape: a `with_review` tool that any agent can call, NOT 4 new
agent classes. Reviewer criteria comes from a Skill (so the user can
edit it). Per-role model overrides + escalation policy as parameters.

### E — Memory hybrid scoring + curation

Two layers:

1. **Hybrid scoring** — change `recallSemantic` to weight
   `0.55*similarity + 0.20*importance + 0.15*recency + 0.10*frequency`.
   We already store importance + created_at; add `recall_count`
   column for frequency. Real impact for agents that have run for
   weeks — old-but-important memories stop getting beaten by recent
   noise.

2. **Background curation routines** — three nightly skills:
   - `decay-memory` — halve importance after N days of no recall
   - `consolidate-memory` — group similar memories, merge to summary
   - `detect-contradiction` — flag pairs that disagree on the same fact

These are SKILLS run by Routines, not new agent classes — exactly
the "trust skills + agents over elaborate code" pattern.

## Sequencing

| Phase | Subject | Effort | Depends on | Recommended order |
|-------|---------|--------|------------|-------------------|
| A | Skills always_active + imperative prompt + UI toggle | ~1.5h | nothing | NOW (this session) |
| B | Description sweep + length trim | ~30min | A (so we can dogfood activation rate together) | NOW |
| C | Batch-tasks live dogfood | ~30min | shipped 2026-05-06 | Next session — needs real attention |
| D | Worker→Reviewer `with_review` tool | ~3h | C (proven swarm); A+B (skills work) | After C |
| E1 | Memory hybrid scoring | ~30min | nothing | After C, before D, or interleaved |
| E2 | Memory curation routines | ~2h | E1 | After E1 |

**Recommended path:** A+B this session → C+E1 next short session →
D in a dedicated session → E2 when the curation need feels real.

Don't bundle D into the same session as A+B — different concerns,
different surfaces. D deserves its own context window (it'll also
read this plan + spec cold to rebuild context).

## Open decisions

1. **Where do `always_active` skill bodies sit in the system prompt?**
   Options:
   - (a) Top of prompt, before the catalog (model sees baseline first)
   - (b) Below the catalog (model establishes "what's available" then
         the active ones)
   - (c) Inline within each `extraSection` (one per skill)
   
   **My vote: (a)** — baseline-first matches how prefs + memory are
   ordered today. Build spec assumes (a).

2. **`always_active` token budget cap?**
   No limit feels right initially — user marks 2-3 baseline skills,
   bodies are ~500 tokens each, total ~1.5K tokens. If anyone marks
   12 skills always-active they have a different problem.
   
   **My vote: no cap, but show estimated tokens in the UI toggle.**

3. **`with_review` reviewer criteria — Skill, prompt param, or both?**
   - (a) Always from a Skill (forces the user to write a review skill)
   - (b) Prompt param (any string)
   - (c) Either — Skill name OR prompt string
   
   **My vote: (c)** — Skill is the durable shape, but for one-off
   "review this for tone" the inline prompt avoids friction. Build
   spec gives both shapes.

4. **Worker model default for `with_review`?**
   - Sonnet (matches batch-tasks default — quality-first)
   - Haiku (cheap default, escalate to Sonnet on revise)
   
   **My vote: Haiku worker, Sonnet reviewer, Sonnet escalation
   after 2 failed revisions.** Matches OpenSwarm's pattern; cost-
   aware out of the box; user can override per call.

5. **Memory frequency tracking — column or separate table?**
   - Column on existing memories table (simple, atomic increment)
   - Separate `memory_recalls` event log (richer history, costs more)
   
   **My vote: column.** Simple wins. Event log is a Phase E3 feature
   if anyone asks for "how was this memory used".

## Risks

- **Skills always_active token blowback** — if users mark too many
  skills always-active, prompt grows. Mitigation: show token estimate
  in UI, soft-cap at 5 per user (warn, don't block).

- **`with_review` infinite loops** — Reviewer keeps saying REVISE.
  Mitigation: hard cap on iterations (default 3) + cost gate
  (escalate or fail after threshold).

- **Memory hybrid scoring tuning** — the 0.55/0.20/0.15/0.10 weights
  are OpenSwarm's defaults. Might not match our domain. Mitigation:
  expose weights as constants in `agent-memory.ts`, not buried; add
  comment block on how to tune.

- **Description sweep breaking matching** — bundled skills shipped
  with their current descriptions are presumably what existing forks
  rely on. Don't change names; only refine descriptions. Frontmatter
  changes flow through next-deploy without migration.

## What this plan is NOT

- A redesign of the skills system. The Anthropic-compatible SKILL.md
  format stays. Progressive disclosure (Level 1 catalog + Level 2
  body + Level 3 resources) stays. We're adding a flag, not replacing
  the architecture.

- A wholesale OpenSwarm port. We're picking 2 of their patterns
  (Worker→Reviewer, hybrid memory scoring), passing on the rest
  (Linear/Discord/launchd, stuck detector, PR auto-fix) because we
  have alternatives or don't need them.

- A multi-agent swarm framework. AutonomousAgent + delegate_to_X
  + Routines + the new `with_review` tool covers the patterns we
  need without inventing new primitives.

## Cross-cutting concerns

- **Privacy**: skills are scoped per-user (with `bundled` as the
  shared default). `always_active` flag is per-user, not bundled —
  one user's "always-active" doesn't leak to others.

- **Mobile**: Skills UI toggle + token estimate must look fine on
  390px viewports. Existing skills page is responsive; adding one
  switch per card is safe.

- **Cost**: every always_active skill body adds tokens to every
  chat turn. Phase A includes a per-skill estimated-tokens display
  so users see the cost of the toggle they're flipping.

- **Goanna alignment**: Routine-emitted skills (`reflect`,
  `librarian-curate`, `route-finding`) are mostly meta — they
  shouldn't be marked `always_active`. The UI should hint at this.

## Verification gates per phase

- **Phase A done**: a skill marked `always_active` has its body
  visible in the agent's context (verifiable via wrangler tail
  showing the assembled system prompt). The UI toggle works
  end-to-end.

- **Phase B done**: every bundled SKILL.md description is ≤200
  chars and starts with "Use when…". `pnpm type-check` clean.

- **Phase C done**: a real 8-item mixed-file batch task runs
  end-to-end live, with at least one PDF, one image, one text
  file in the set. Deliverable: a screenshot of the JobDetailPage
  showing 8 completed items + the agent's chat reply summarising
  results.

- **Phase D done**: `with_review` runs a 3-iteration draft→review
  loop on a draft email, with verdict transitions visible in the
  agent_runs audit trail.

- **Phase E1 done**: `recallSemantic` returns memories scored by
  the hybrid formula, not pure cosine. Test via the agent-memory
  inspect tool with two contrived memories (one high-importance
  old, one low-importance recent) — check the high-importance
  one ranks first when relevance is comparable.

- **Phase E2 done**: three new SKILL.md files exist
  (`decay-memory`, `consolidate-memory`, `detect-contradiction`)
  + a Routine wired to fire each nightly + observable changes in
  `memories` table after 24 hours of running.
