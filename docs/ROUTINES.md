# Routines

Recurring agent workflows. The user-facing pattern for "watch X periodically and surface findings". Per issue #50.

## Mental model

> A Routine fires its target agent on a schedule, with a tool allow-list, optional skills, and lifecycle hooks. Findings dispatched by the agent land in the unified Inbox.

This is the **canonical** pattern for recurring AI work. The lower-level primitives (`scheduled-agents`, `webhook-agents`) stay for cases where you need sub-routine timers or custom event ingestion. For "watch and emit", **start with a Routine**.

The vocabulary is convergent with OpenClaw + Claude Code Routines (April 2026 launch) — channels, skills, recurring agents are the same primitives.

## Anatomy

```
Routine
  ├── Identity     name + description
  ├── Target       agentClass + agentName  (existing AutonomousAgent subclass)
  ├── Schedule     baseInterval + minInterval/maxInterval + adjustMode
  ├── Behaviour
  │   ├── input template      injected each fire as the agent's user message
  │   ├── tools allowed       allow-list filter on the agent's full toolset
  │   ├── skills loaded       SKILL.md bodies auto-injected as system prompt
  │   └── hooks               skillId per lifecycle event (slice 4: SessionEnd only)
  └── Audit
      ├── routine_runs              one row per fire (started/finished/outcome)
      ├── routine_cadence_changes   audit log of self-adjusted intervals
      └── agent_runs                joined for cost/tokens/steps detail
```

## Lifecycle

```
cron tick (every 15 min)
  → processDueRoutines()
    → for each due routine (max 5/tick):
        → fireRoutine()
          → start routine_runs row
          → look up agent DO stub (env[agentClass].get(idFromName(agentName)))
          → setToolsAllowed(routine.toolsAllowed)
          → setSkillsLoaded(routine.skillsLoaded)
          → setHooks(routine.hooks)
          → runOnce({ input: composedInput, trigger: 'schedule' })
              → AutonomousAgent loads skills via buildExtraInstructions
              → tool calls dispatch findings via channels (inbox_add etc.)
              → SessionEnd hook fires the configured skill, returns hookSummary
          → finishRoutineRun(outcome, summary)  (uses hookSummary if present)
  → next fire reads getRecentRunSummaries(routineId, 5)
    → composes a "Recent runs" tail block prepended to the input template
```

The **run-summary tail** keeps token cost flat across hundreds of fires. Each run produces a 1-paragraph summary; the next fire only sees the most recent K. No archival, no MemGPT-style overlay.

## Channels-as-tools

The agent's only output mechanism is calling tools. Five "channel" tools ship as part of the chat toolkit:

| Tool | Purpose | Approval-gated? |
|---|---|---|
| `inbox_add` | Drop a finding into the user's Inbox | No |
| `notify` | Bell ping for time-sensitive informational alerts | No |
| `approval_queue` | Stage a destructive action behind user review | No (queueing IS the gate) |
| `space_send` | Post into a Space the user is a member of | No |
| `webhook_post` | POST JSON to an arbitrary URL | **Yes** |

Routines opt in to a subset via `toolsAllowed`. A `routine-health-check` routine, for example, only needs `inbox_add` + `find_tools`.

## Skills + hooks

A **skill** is a markdown SKILL.md procedure the agent reads. Three default routine-grade skills ship:

| Skill | Use as | Purpose |
|---|---|---|
| `route-finding` | SessionEnd hook | Pick channel(s) for the finding + emit a 1-line run summary |
| `score-importance` | Loaded skill | Calibrate `inbox_add` importance (high / medium / low) consistently |
| `enrich-error` | Loaded skill | Rewrite raw errors (401, 5xx, BudgetExceeded) into actionable findings |

Plus `routine-health-check` — a meta-watcher skill loaded by the seeded "Routine health" routine.

The agent's `buildExtraInstructions` auto-fetches every name in `state.skillsLoaded` via the central `loadSkill` registry and injects them as `## Skills` blocks into the system prompt. Hooks fire skills at lifecycle events. Slice 4 fires `SessionEnd` only — output flows out via `RunOnceResult.hookSummary` and becomes `routine_runs.outputSummary`. PreToolUse / PostToolUse / SessionStart land when the per-step loop callback is exposed.

## Cadence self-adjust

Routines can let the agent suggest a new cadence (e.g. "no findings 3 fires in a row, slow me down"). The `adjustMode` field gates this:

| Mode | Behaviour |
|---|---|
| `direct` | Agent proposal applied immediately (clamped to min/max) |
| `suggested` | Proposal logged in `routine_cadence_changes` but interval stays put |
| `fixed` | Agent has no influence; cadence is whatever the user set |

Default is `suggested` — keeps the user in the loop without ignoring the agent's signal.

## Connection Profiles

Same MCP connection (e.g. Gmail) can have multiple instances (`personal`, `work`). The `personalityLabel` field labels each, and `allowedAgentNames` restricts which agents may use it. `getUserMcpTools(env, userId, agentName)` honours the filter so routines automatically scope to the right identity.

UI affordance: per-connection ProfilePanel on the connection sheet (`/dashboard/connectors → click connection → profile section`).

## Building a routine

Three options:

### 1. From the UI

`/dashboard/routines/new` — single-page form. Agent class + instance name + interval + skills + tools + SessionEnd hook. Saves immediately, fires on the next cron tick (or click Fire now).

### 2. From the seed-examples endpoint

`POST /api/routines/seed-examples` — creates two disabled examples (Routine health meta-watcher + YouTube digest). Edit them in the UI to enable. A button appears on the empty Routines page.

### 3. From code

Direct REST POST to `/api/routines`:

```ts
await apiClient.post('/api/routines', {
  name: 'Stuck-tickets sweeper',
  description: 'Daily sweep for tickets older than 7 days',
  agentClass: 'AssistantAgent',
  agentName: `stuck-tickets-${userId.slice(0, 8)}`,
  triggerKind: 'schedule',
  baseInterval: 24 * 60 * 60,
  inputTemplate: { input: 'Sweep entities of type=ticket and emit findings.' },
  skillsLoaded: ['enrich-error', 'score-importance'],
  toolsAllowed: ['inbox_add', 'find_tools', 'entity_search'],
  hooks: { SessionEnd: 'route-finding' },
  enabled: true,
})
```

## Worked examples (bundled)

- **Routine health (meta)** — daily AssistantAgent, watches `routine_runs` for errors/drift/cost, surfaces issues via `inbox_add`. Loads `routine-health-check` + `score-importance`.
- **YouTube digest** — every-6h AssistantAgent, watches a Google Chat space for YouTube links, fetches transcripts, summarises, posts back to the space. Loads `summarise-url` + `route-finding`. Disabled by default until the user wires their Google Chat connector.

Both seeded by `POST /api/routines/seed-examples`.

## Worked example — Daily scanner with grouping

Pattern: scan a data table for rows matching a condition (e.g. expiring records), **group by a shared key**, and emit ONE finding per group instead of N. Surface a clear next-action label so the user can act from the Inbox.

```ts
{
  id: 'expiring-records-scanner',
  name: 'Expiring records scanner',
  agentClass: 'AssistantAgent',
  agentNameSlug: 'expiring-records-scanner',
  baseInterval: 24 * 60 * 60,        // daily
  adjustMode: 'fixed',                // user-set cadence wins
  defaultEnabled: true,
  inputText:
    'Scan for upcoming records due for action. Call list_expiring_records ' +
    'with daysAhead=14. For each row returned, emit one inbox_add finding ' +
    'with the entity name, type, days until expiry, and a clear next-action ' +
    'label like "Draft review email". Skip entities that already have an ' +
    'in-flight draft. Group multiple-record clients (same renewal_batch_id) ' +
    'into a single combined finding. If nothing is due, do not emit anything.',
  skillsLoaded: ['expiry-scan'],
  toolsAllowed: ['list_expiring_records', 'inbox_add', 'find_tools'],
  sessionEndSkill: null,
  // Optional: clamp first fire to 8am AEST so users see findings on arrival
  // localFireHour: 8,
}
```

Three details earn their place:

1. **`inputText` reads like a spec, not a chat prompt.** Detailed paragraph spelling out what to call, when to skip, when to group, when to emit nothing. The agent doesn't need creativity here — it needs precise instructions.
2. **`adjustMode: 'fixed'`** confirms the schedule is intentional. The agent can't slow itself down even if it sees no findings for a week.
3. **Group key in the prompt.** "Same renewal_batch_id → one combined finding" is the rule that turns 5 noisy findings into 1 actionable one.

Worked production example: rightcover's `renewal-scanner` template (`src/shared/config/routine-templates.ts`) — daily at 8am AEST, scans `policies` for renewals due in 14 days, groups multi-policy clients, emits one Inbox row per client with "Draft review email" as the next action.

## Worked example — Email triage routine

Pattern: a routine wakes on interval, picks up rows from an inbound table where `status=pending`, runs slow extraction work, emits findings, marks the row complete. Decoupled from the email handler so neither is fragile.

```ts
{
  id: 'inbound-triage',
  name: 'Inbound email triage',
  agentClass: 'AssistantAgent',
  agentNameSlug: 'inbound-triage',
  baseInterval: 30 * 60,             // every 30 minutes
  adjustMode: 'fixed',
  defaultEnabled: false,             // off until the upstream handler is wired
  inputText:
    'Check for inbound emails with status=pending. For each one with PDF ' +
    'attachments, identify the contact, run analyse_document on each ' +
    'attachment, then emit an inbox_add finding summarising what was found. ' +
    'Mark the inbound_email row as complete on success, or status=error ' +
    'with the error message on failure.',
  skillsLoaded: ['document-analyser'],
  toolsAllowed: ['analyse_document', 'inbox_add', 'find_tools'],
  sessionEndSkill: null,
}
```

Two timing tiers, by design:

| Step | Latency budget | Where |
|---|---|---|
| Email handler — parse + persist | < 1s | `Worker.email()` export |
| Triage routine — analyse + emit | seconds–minutes | This routine |

The handler stays fast and reliable (no LLM in the request path). The routine does the slow extraction work where retries, observability, and budget gating apply naturally. They're decoupled by the `status` field on the inbound row.

Upstream pairing: see [`docs/ADDING_EMAIL_INBOUND.md`](./ADDING_EMAIL_INBOUND.md) for the email handler that produces the `inbound_emails` rows this routine consumes.

Worked production example: rightcover's `inbound-triage` template — every 30 min, processes `inbound_emails` forwarded to `inbox@rightcover.au`, runs `analyse_policy` on each PDF, surfaces extraction results to the Inbox.

## Per-routine budget

`dailyBudgetUsd` field caps cost over a rolling 24h window. Combines with `AutonomousAgent.dailyBudgetUsd` — whichever is tighter wins. Budget exhaustion produces a `routine_runs` row with `outcome='budget_exceeded'`; the routine-health watcher surfaces these as findings.

## Files

| File | Role |
|---|---|
| `src/server/modules/routines/db/schema.ts` | Tables: routines, routine_runs, routine_cadence_changes |
| `src/server/modules/routines/storage.ts` | CRUD + run lifecycle + run-summary tail composer |
| `src/server/modules/routines/scheduler.ts` | `processDueRoutines()` (cron) + `fireRoutine()` |
| `src/server/modules/routines/routes.ts` | REST: list / create / detail / patch / fire / runs / cadence + seed-examples |
| `src/server/modules/chat/tools/channels.ts` | The 5 channel tools |
| `src/server/modules/inbox/db/schema.ts` | inbox_items table |
| `src/server/modules/inbox/routes.ts` | Unified findings + approvals query |
| `src/client/modules/routines/pages/RoutinesPage.tsx` | Index |
| `src/client/modules/routines/pages/NewRoutinePage.tsx` | Setup form |
| `src/client/modules/routines/pages/RoutineDetailPage.tsx` | Config + run history |
| `src/client/modules/inbox/pages/InboxPage.tsx` | Unified review surface |
| `skills/route-finding/SKILL.md` | SessionEnd hook procedure |
| `skills/score-importance/SKILL.md` | Importance calibration |
| `skills/enrich-error/SKILL.md` | Error → finding rewrite |
| `skills/routine-health-check/SKILL.md` | Meta-watcher procedure |
| `src/shared/agent/metadata.ts` | AgentMetadata interface — every AutonomousAgent declares displayName + description |
| `src/server/lib/agents/registry.ts` | listRegisteredAgents() — backs the AgentPicker |
| `src/server/lib/agents/routes.ts` | GET /api/agents/registered |
| `src/shared/format/agent.ts` | Translation layer (formatAgentClass / formatOutcome / formatTrigger etc.) — single source of truth for enum → human label |
| `src/client/modules/routines/components/RoutinePickers.tsx` | AgentPicker, SkillsPicker, SingleSkillPicker, ToolsPicker — all consume discovery endpoints |
| `~/.claude/rules/trust-skills-not-elaborate-code.md` | The lesson banked in the design phase |

## Why not subclass AutonomousAgent for each routine?

You can. Issue #50 deliberately chose the Routine pattern over per-task agent subclasses because:

1. **Skills + tools are markdown + config.** Anyone can author a routine without writing TypeScript — the skill body is the instruction set.
2. **One DO instance per agent class scales.** A single `AssistantAgent` handles every routine that targets it; the routine name becomes the DO instance name. No new wrangler bindings per use case.
3. **Convergent vocabulary with Claude Code / OpenClaw.** Routines / Skills / Channels are the names users already know.
4. **Cadence + budget + tools are all on the row.** No code change to retune them — edit the routine config.

The companion principle, from `~/.claude/rules/trust-skills-not-elaborate-code.md`:

> "Trust that we can build capable agents that are directed by skills rather than making elaborate fragile constructions that we have to intricately maintain."

## Migration path from scheduled-agents

The existing `SweeperAgent` is recast as a routine target rather than retired. Per issue #50 decision E:

- The class stays in `src/server/modules/autonomous-agents/sweeper-agent.ts` as a worked example of an entity-sweeping agent.
- A future seed adds a routine that targets `SweeperAgent` with the entity-type as input.
- Existing `scheduled-jobs` table stays for sub-routine timers and one-off cron tasks.

When you'd reach for scheduled-agents instead of a routine:

| Reach for scheduled-agents when... | Reach for routines when... |
|---|---|
| You need a sub-routine timer (inside one run, schedule a follow-up) | You want declarative recurring work |
| You're firing a non-AI cron task | The work involves an LLM |
| The cadence is sub-tick (< 15 min) and tightly coupled to an agent loop | Cadence is configurable + bounded |
| You need a single agent class to implement custom alarm logic | The same agent class serves many configurations |

## Status

Slices 1-9 of issue #50 shipped (2026-04-28). Decisions A-F locked. Lesson banked.

Per decision F, this doc + the CLAUDE.md update land after slice 5 has been dogfooded — covered. Connection-profile UI follow-up shipped alongside.

## Self-describing primitives

The routine setup form (and any future picker over agents / skills /
tools) is built on the metadata pattern: every primitive declares
`displayName + description` next to its definition, a discovery
endpoint exposes the catalogue, and pickers consume it.

To add a new agent that appears in the picker:

```ts
export class MyAgent extends AutonomousAgent<Env, AutonomousAgentState> {
  static override readonly className = 'MyAgent'
  static readonly metadata = {
    displayName: 'Friendly name shown in pickers',
    description: 'One sentence — what it does + when to reach for it.',
    category: 'general' as const,
  }
  // ... rest of the class
}
```

Then import it into `src/server/lib/agents/registry.ts` `AGENT_CLASSES`.
That's it — the picker auto-discovers it on next deploy. No second
config file.

Tools categorise via name-prefix heuristics in
`src/server/modules/chat/routes.ts` `categoriseTool()`. Add a new
prefix (or a new explicit branch) when shipping a connector group.

Skills already had `description` in YAML frontmatter — pattern the
others copy.

**Last updated**: 2026-04-28
