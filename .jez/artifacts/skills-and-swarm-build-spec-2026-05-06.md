---
date: 2026-05-06
status: active
companion: skills-and-swarm-plan-2026-05-06.md (the why and shape)
owner: jez+claude
---

# Skills + swarm — build spec

Companion to `skills-and-swarm-plan-2026-05-06.md`. The plan covers
*why*; this covers *how* — file paths, schemas, signatures, prompts,
verification gates per phase.

A future Claude session opening this cold should be able to start
construction without asking architectural questions. They might ask
"which voice?" but never "which file?".

---

## Phase A — Skills `always_active` + imperative prompt + UI toggle

### Goal

Skills marked `always_active: true` get their full SKILL.md body
baked into the system prompt every chat turn — no `load_skill` call
needed. Toggle is per-user via the Skills UI. Catalog header reads
imperative ("Before answering, scan…") not suggestive.

### Files to modify

#### 1. `src/server/lib/ai/skills/registry.ts`

Add `alwaysActive: boolean` to `SkillSummary` interface (line ~25).
Parse from metadata JSON same way `disableModelInvocation` is parsed
(currently lines 134-150):

```ts
return [...merged.values()].map((r) => {
  let disableModelInvocation = false
  let alwaysActive = false
  try {
    const fm = JSON.parse(r.metadata || '{}') as {
      disable_model_invocation?: boolean
      always_active?: boolean
    }
    disableModelInvocation = fm.disable_model_invocation === true
    alwaysActive = fm.always_active === true
  } catch {
    // ignore malformed metadata
  }
  return {
    name: r.name,
    description: r.description,
    source: r.source,
    userId: r.userId,
    isPersonal: r.userId === userId,
    disableModelInvocation,
    alwaysActive,
  }
})
```

Add a new exported helper `loadAlwaysActiveSkills(env, userId)` that
returns `LoadedSkill[]` (full bodies, not just summaries). Reuses
`listSkills` to find the names, then `loadSkill` per name. Skills
that have BOTH `always_active: true` AND `disable_model_invocation:
true` should NOT be included (contradictory — user-only-invokable
shouldn't be auto-baked).

#### 2. `src/server/modules/chat/chat-agent.ts`

Around line 631 where `availableSkills` is fetched, also fetch
always-active full bodies:

```ts
// ─── 8. Skill catalog (Level 1 progressive disclosure) ───────────
const availableSkills = (
  await listSkills(this.env as { DB: D1Database; SKILLS?: R2Bucket }, userId)
).filter((s) => !s.disableModelInvocation)
const skillsCatalog = availableSkills.length > 0
  ? availableSkills
      .filter((s) => !s.alwaysActive)  // baseline skills are baked above; not in the on-demand catalog
      .map((s) => `- **${s.name}**: ${s.description}`)
      .join('\n')
  : null

// ─── 8b. Always-active skill bodies (Level 1.5 — baked baseline) ─
const alwaysActiveSkills = await loadAlwaysActiveSkills(
  this.env as { DB: D1Database; SKILLS?: R2Bucket },
  userId,
)
const baselineBlock = alwaysActiveSkills.length > 0
  ? alwaysActiveSkills
      .map((s) => `### Skill: ${s.name}\n\n${s.body}`)
      .join('\n\n---\n\n')
  : null
```

Then in section 10 (extraSections assembly):

```ts
if (baselineBlock) {
  extraSections['Active Skills'] = [
    'These skills are always active for this user — apply them throughout the conversation.',
    '',
    baselineBlock,
  ].join('\n')
}
if (skillsCatalog) {
  extraSections['Available Skills'] = [
    'Before answering complex requests, scan the skills below and load any that match the user\'s task. Specialist work (research, drafting, code review, document analysis, comparing options) almost always has a matching skill — load it FIRST rather than improvising. If no skill matches, proceed normally.',
    '',
    skillsCatalog,
  ].join('\n')
}
```

The `Active Skills` section should be ABOVE `Available Skills` in
the prompt (baseline first). Section ordering in `buildSystemPrompt`
is determined by `Object.keys(extraSections)`, so adding `Active
Skills` BEFORE the catalog assignment is the simplest way.

#### 3. `src/client/modules/skills/components/SkillEditor.tsx`

Add an "Always active" toggle to the editor card next to the
"Bundled — edits create a personal override" warning chip. Use the
existing `Switch` from shadcn/ui. Toggling triggers a save with the
frontmatter updated to include or remove `always_active: true`.

```tsx
<div className="flex items-center gap-2 text-sm">
  <Switch
    id="always-active"
    checked={alwaysActive}
    onCheckedChange={handleToggleAlwaysActive}
  />
  <Label htmlFor="always-active" className="cursor-pointer">
    Always active in chat
  </Label>
  {alwaysActive && (
    <span className="text-xs text-muted-foreground">
      Adds ~{estimatedTokens} tokens to every chat
    </span>
  )}
</div>
```

`estimatedTokens` is a rough approximation: `Math.ceil(body.length / 4)`.

`handleToggleAlwaysActive` updates the YAML frontmatter via the
existing skill-save flow (config-diff approval). The diff shows the
single-line frontmatter change — same flow we already have for body
edits.

#### 4. `src/client/modules/skills/pages/SkillsPage.tsx`

Optional: add an "Always active" badge to skill cards in list view
when `s.alwaysActive === true`. Read from the existing skills
listing data. Visible signal that this skill is loaded into every
chat — helps users notice when their token budget is creeping up.

### Files to create

None — flag piggybacks on existing metadata column, no new tables,
no new endpoints (frontmatter edit reuses existing skill-save flow).

### Verification gates

- Mark `code-review` as `always_active: true` via the UI toggle.
- Open a fresh chat, ask "tell me what skills are loaded".
- Check the system prompt assembly — should see `## Active Skills`
  block with the full code-review body, AND the `Available Skills`
  catalog WITHOUT code-review listed.
- Type-check + build clean.

---

## Phase B — Description sweep + length trim

### Goal

Every bundled SKILL.md description: ≤200 chars, starts with "Use
when…", names trigger phrases. Catalog stays scannable for the
model.

### Files to modify

All `skills/*/SKILL.md` frontmatter blocks. Names stay; only
descriptions change.

Targets that need attention (>200 chars or weak triggers):

- `librarian-curate` — currently a multi-sentence essay. Tighten to
  one line: `Use when running the weekly cross-agent curation routine. Reads recent learnings, promotes stable patterns to shared knowledge, writes weekly digest into Inbox.`
- `route-finding` — multi-sentence. Tighten: `Use as a SessionEnd hook on routines that emit findings. Picks the right channel (inbox_add, notify, approval_queue, space_send, webhook_post) for a given run output.`
- `routine-health-check` — meta-skill with implementation details in
  description. Tighten: `Use when scanning routines for error rates, drift, or runaway cost. Surfaces routine_health findings into the user's Inbox.`
- `enrich-error` — also long. Tighten while preserving the example:
  `Use as a SessionEnd hook on routines where transient errors are common. Turns "Error: 401" into actionable findings like "Gmail token expired — reconnect at /dashboard/connectors".`
- Any others over 200 chars on a re-scan.

### Files to create

None.

### Verification gates

- `for d in skills/*/SKILL.md; do wc -L "$d"; done` — every
  description line ≤200 chars.
- Open chat, ask "list available skills" — descriptions render
  cleanly without wrapping in the model's mental view (check via
  wrangler tail showing the catalog injection).
- Activation rate spot-check: prompts like "review this code:
  ..." should now reliably trigger `load_skill` for `code-review`.

---

## Phase C — Batch-tasks live dogfood

### Goal

Run a real 8-item mixed-file batch task end-to-end. Capture the
`/dashboard/jobs/:id` page state + the chat agent's reply.

### Steps

1. Upload 8 mixed files via /dashboard/files:
   - 2 PDFs (a 1-page invoice + a 5-page contract)
   - 2 images (a screenshot + a photo of a printed receipt)
   - 2 plain text or markdown files
   - 2 DOCX or HTML files

2. Open a fresh chat. Attach all 8 files to the first message.
3. Send: "For each of these files, extract the key information
   into a one-paragraph summary."
4. The agent should call `start_batch_task` with task_kind='extract'
   and items as `r2_file` refs.
5. Approval card appears (8 items > 5). Approve.
6. Navigate to `/dashboard/jobs/:id`. Watch progress.
7. When complete, return to chat. Agent should summarise results.

### What to verify

- Workflow actually fires (Status moves from queued → running →
  completed/failed).
- Per-item status updates visible (3s auto-refresh polling).
- PDFs flow through `env.AI.toMarkdown` correctly (check item.result
  contains real extraction, not "unsupported").
- Cancel button works mid-job (start a 50-item job, hit cancel,
  verify status flips to `cancelled` between windows).
- Chat agent gets the job result back via `getJob` polling or a
  follow-up turn ("how's the batch going?").

### Files to create

`.jez/artifacts/batch-tasks-dogfood-2026-05-06.md` — the dogfood
report with screenshots from `/dashboard/jobs/:id` and the chat.
Note any bugs found; create issues.

---

## Phase D — `with_review` tool (Worker→Reviewer pattern)

### Goal

Generic quality-loop tool: any agent invokes `with_review({ task,
worker_model, reviewer_model, criteria, max_iters })` and gets a
draft → review → revise loop with structured verdicts.

### Files to create

#### 1. `src/server/modules/chat/tools/with-review.ts`

```ts
export const withReviewDefinition: ToolDefinition<...> = {
  name: 'with_review',
  description:
    "Run an AI task through a worker→reviewer quality loop. Worker drafts, Reviewer scores against criteria, returns APPROVE/REVISE/REJECT. On REVISE, Worker rewrites with reviewer notes (capped at max_iters). Use for high-quality outputs: emails before send, reports, code generation, summaries that matter.",
  inputSchema: z.object({
    task: z.string().min(20).describe('What the worker should produce. Plain English.'),
    criteria: z.union([
      z.object({ skill: z.string() }).describe('Reviewer criteria from a Skill name'),
      z.object({ inline: z.string().min(20) }).describe('Reviewer criteria as inline prompt'),
    ]),
    worker_model: z.string().optional().describe('Default: anthropic/claude-haiku-4.5'),
    reviewer_model: z.string().optional().describe('Default: anthropic/claude-sonnet-4.6'),
    escalate_model: z.string().optional().describe('Used after 2 failed iterations. Default: anthropic/claude-sonnet-4.6 (same as reviewer)'),
    max_iters: z.number().int().min(1).max(5).optional().default(3),
    context: z.string().optional().describe('Additional context to pass to both worker and reviewer'),
  }),
  outputSchema: z.union([
    z.object({
      ok: z.literal(true),
      verdict: z.enum(['APPROVE', 'REJECT']),
      iterations: z.number(),
      final_text: z.string(),
      review_notes: z.array(z.string()),  // every reviewer note across iterations
      models_used: z.object({ worker: z.string(), reviewer: z.string() }),
    }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]),
  needsApproval: false,
  isAvailable: (ctx) => !!(ctx.env as { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY,
  execute: async (input, ctx) => { /* loop logic — see below */ },
  render: { icon: GitPullRequest, displayName: 'Worker + Reviewer' },
}
```

Loop logic shape:

```ts
async function runReviewLoop(input, ctx) {
  let draft = await runWorker(input.task, input.context, input.worker_model, ctx)
  const notes: string[] = []
  for (let i = 1; i <= input.max_iters; i++) {
    const reviewerModel = i >= 3 ? input.escalate_model : input.reviewer_model
    const review = await runReviewer(draft, criteria, input.context, reviewerModel, ctx)
    notes.push(review.note)
    if (review.verdict === 'APPROVE') {
      return { ok: true, verdict: 'APPROVE', iterations: i, final_text: draft, review_notes: notes, ... }
    }
    if (review.verdict === 'REJECT') {
      return { ok: true, verdict: 'REJECT', iterations: i, final_text: draft, review_notes: notes, ... }
    }
    // REVISE — feed notes back to worker
    draft = await runWorker(input.task, `${input.context}\n\nPrevious draft:\n${draft}\n\nReviewer notes:\n${review.note}`, input.worker_model, ctx)
  }
  // Hit max_iters without APPROVE — escalate verdict
  return { ok: true, verdict: 'REJECT', iterations: input.max_iters, final_text: draft, review_notes: notes, ... }
}
```

`runWorker` and `runReviewer` are local helpers that use AI SDK's
`generateText` with `resolveModel(env, modelId)` from
`@/server/lib/ai/providers`.

Reviewer system prompt — fixed shape that asks for structured
verdict:

```
You are reviewing the worker's draft against the criteria below.
Respond with EXACTLY ONE LINE in this format:
  VERDICT: APPROVE — <one-sentence reason>
  VERDICT: REVISE — <specific change needed>
  VERDICT: REJECT — <why this can't be fixed by revision>

Criteria:
{criteria}

Context:
{context}

Worker's draft:
{draft}
```

Parse the response with a regex:
`/^VERDICT:\s*(APPROVE|REVISE|REJECT)\s*[—-]\s*(.+)$/m`. If no
match, treat as REVISE with the full response as the note.

#### 2. `skills/review-output/SKILL.md`

Default reviewer criteria skill the user can edit:

```yaml
---
name: review-output
description: Default reviewer criteria for the with_review tool. Generic quality bar — accuracy, clarity, no hallucinations, matches user intent.
---

# Review criteria

When reviewing the worker's draft, check:

1. **Accuracy** — every factual claim is grounded in provided context or
   verifiable. No invented stats, names, dates.
2. **Matches intent** — does this actually answer what the user asked
   for? Not the adjacent thing.
3. **Tone matches situation** — if drafting an email, does the tone
   suit the recipient + purpose?
4. **No hallucinations** — no made-up URLs, references, or quotes.
5. **Clarity** — a reasonable reader could act on this without further
   questions.

Verdict guide:
- APPROVE: passes all 5 cleanly
- REVISE: 1-2 specific issues that the worker can fix
- REJECT: fundamentally wrong shape (e.g. answered the wrong question)
```

### Files to modify

#### `src/server/modules/chat/tools/index.ts`

Register the new tool:

```ts
import { withReviewDefinition } from './with-review'
// ...
const allDefinitions: ToolDefinition<unknown, unknown>[] = [
  // ... existing ...
  withReviewDefinition,
]
```

### Verification gates

- Run a `with_review` call from chat: "draft a thank-you email to a
  customer who waited 2 weeks for a refund — review it before
  showing me." Expect 1-3 worker iterations, final draft, review
  notes visible in the tool output.
- Force a REVISE: pass deliberately weak `task` ("write something
  good"). Reviewer should push back; worker should iterate.
- Force a REJECT: pass `task` and `criteria` that contradict each
  other. Reviewer should reject after 1-2 iterations.
- agent_runs audit shows the iterations.

---

## Phase E1 — Memory hybrid scoring

### Goal

`recallSemantic` returns memories scored by:
`0.55*similarity + 0.20*importance + 0.15*recency + 0.10*frequency`

### Files to modify

#### 1. `src/server/modules/memories/db/schema.ts`

Add a `recall_count` column:

```ts
recallCount: integer('recall_count').notNull().default(0),
```

#### 2. New migration

`pnpm db:generate:named "memory_recall_count"` — generates the
migration file.

#### 3. `src/server/lib/agents/agent-memory.ts`

Locate `recallSemantic` (or the equivalent in this file). Currently
returns vector matches sorted by cosine. Update to:

```ts
const HYBRID_WEIGHTS = {
  similarity: 0.55,
  importance: 0.20,
  recency: 0.15,
  frequency: 0.10,
}

// Recency: 1.0 if just created, 0.0 if 90 days old (linear decay).
function recencyScore(createdAt: Date): number {
  const ageMs = Date.now() - createdAt.getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  return Math.max(0, 1 - ageDays / 90)
}

// Frequency: log-scale, capped. 1.0 at recall_count >= 50.
function frequencyScore(recallCount: number): number {
  return Math.min(1, Math.log1p(recallCount) / Math.log(51))
}

// Importance: stored as 0-100, normalise to 0-1.
function importanceScore(importance: number): number {
  return Math.max(0, Math.min(1, importance / 100))
}

function hybridScore(row, similarity: number): number {
  return HYBRID_WEIGHTS.similarity * similarity
    + HYBRID_WEIGHTS.importance * importanceScore(row.importance ?? 0)
    + HYBRID_WEIGHTS.recency * recencyScore(row.createdAt)
    + HYBRID_WEIGHTS.frequency * frequencyScore(row.recallCount ?? 0)
}
```

Then sort by `hybridScore` descending, take top K.

After returning memories, fire-and-forget bump `recallCount` for the
returned ids (so the next recall can factor in frequency):

```ts
this.ctx.waitUntil(
  drizzle(this.env.DB)
    .update(memories)
    .set({ recallCount: sql`${memories.recallCount} + 1` })
    .where(inArray(memories.id, results.map(r => r.id)))
)
```

### Verification gates

- Insert two memories: one high-importance + 30-days-old, one
  low-importance + 1-day-old. Both with similar text content.
- Query the recall — high-importance should rank first despite
  lower recency.
- Inspect `recall_count` after multiple recalls — should increment.

---

## Phase E2 — Memory curation routines

### Goal

Three nightly routines: decay, consolidate, contradiction-detect.
Each is a Skill loaded by an AssistantAgent run scheduled daily.

### Files to create

#### 1. `skills/decay-memory/SKILL.md`

```yaml
---
name: decay-memory
description: Use when running the nightly memory decay routine. Halves the importance of memories not recalled in 30 days. Prevents the memory store from getting stuck at high importance for facts no longer relevant.
---

# Memory decay

For every memory row WHERE last_recalled_at < now - 30 days AND importance > 0:
  importance = floor(importance / 2)

If importance reaches 0, the memory is still kept (audit) but won't
factor into recall scoring.

Use the `db_query` tool with the SQL above wrapped in an UPDATE.
Return a one-line summary: "Decayed N memories from importance X→Y."
```

#### 2. `skills/consolidate-memory/SKILL.md`

```yaml
---
name: consolidate-memory
description: Use when running the nightly memory consolidation routine. Groups semantically similar memories, merges them into a higher-importance summary, archives the originals. Reduces noise in recall.
---

# Memory consolidation

1. Cluster memories by embedding similarity (>0.85 cosine) within the
   same user.
2. For each cluster of 3+ memories, generate a one-paragraph summary
   that captures the shared meaning.
3. Insert the summary as a new memory with importance = max of the
   cluster + 10.
4. Mark the originals as `archived` (not deleted; the audit trail
   stays).

Output: "Consolidated N clusters into M summary memories."
```

#### 3. `skills/detect-contradiction/SKILL.md`

```yaml
---
name: detect-contradiction
description: Use when running the nightly memory contradiction-detection routine. Finds pairs of memories that disagree on the same topic and surfaces them to the Inbox for human review.
---

# Contradiction detection

1. For each pair of memories with similarity > 0.80 AND
   created within different weeks, check if they assert
   contradictory facts about the same subject.
2. Use Sonnet to make the contradiction call (cheap, JSON output:
   `{ contradicts: bool, summary: string }`).
3. For pairs flagged as contradicting, write a finding to the Inbox
   with both memory ids + the contradiction summary.

Output: "Found N contradiction pairs; surfaced to Inbox."
```

### Routines to configure

Three routines firing nightly at user-local 03:00:
- `Memory decay` (skill: `decay-memory`)
- `Memory consolidate` (skill: `consolidate-memory`)
- `Memory contradiction-detect` (skill: `detect-contradiction`)

All target `AssistantAgent`. All have `toolsAllowed:
[db_query, recall_memory, write_memory, inbox_add]`.

### Verification gates

- Routine UI shows three new routine entries.
- After 24 hours: at least one decay event observable in
  `recall_count` table or memories' importance dropping.
- Contradiction-detection produces 0 or more inbox rows (depends on
  data; shouldn't crash).

---

## Cross-cutting

### Naming conventions

- New tools: snake_case names (`with_review`, `start_batch_task`)
- New skills: kebab-case (`decay-memory`, `review-output`)
- New file paths follow existing module shape
  (`src/server/modules/<module>/` for server,
  `src/client/modules/<module>/` for client)

### Files NOT touched

- The Anthropic skills SKILL.md format. Stays compatible.
- Existing `progressive disclosure` mechanics (Level 1 catalog +
  Level 2 load_skill + Level 3 fs_read).
- The `disable_model_invocation` flag (orthogonal axis).
- The chat agent's tool resolution / approval queue.

### Things to verify before any code starts

- `pnpm type-check` is clean as a baseline (it currently is — last
  verified 2026-05-06 after batch-tasks ship).
- `wrangler tail` works on the live deploy (need this to verify
  Phase A's catalog injection visually).

---

## TL;DR for fast reorientation

If you're a future Claude session opening this cold:

1. **Phase A is the fastest win** — 1.5h, makes skills actually fire.
2. **Phase B is description discipline** — 30min, polish.
3. **Phase C is the dogfood gate** — 30min, prove batch-tasks works.
4. **Phase D is the Worker→Reviewer build** — 3h, generic quality loop.
5. **Phase E1 is hybrid memory scoring** — 30min, formula change.
6. **Phase E2 is curation routines** — 2h, 3 skills + 3 routines.

Recommended sequencing in the plan doc. A+B together this session,
others split.
