# Goanna interop

How vite-flare-starter and [goanna](https://github.com/jezweb/goanna) — Jez's filesystem-markdown agent framework — relate.

> **TL;DR**: skills (`SKILL.md` agentskills.io spec) are wire-compatible. Persona blocks adopt goanna's file-family conventions. Findings + learnings + reflect + librarian skills are ported. Storage stays D1; no filesystem markdown sync needed.

## What's compatible by design

Drop a `SKILL.md` into goanna's `<agent>/skills/` and it works. Drop the same file into vite-flare-starter's `skills/` and it works. Same frontmatter, same body conventions.

Goanna calls this out as deliberate — it adopts agentskills.io as the universal skill spec, and so does this project (see [`docs/AGENT_TOOLKIT.md`](./AGENT_TOOLKIT.md) for the bundled skills system).

## Concept mapping

| Goanna | vite-flare-starter |
|---|---|
| `<agent>/AGENTS.md` | `static metadata` on the AutonomousAgent class + auto-seeded `state.blocks.identity` on first owner-bind |
| `<agent>/SOUL.md` (always-injected personality) | `state.blocks.soul` — conventional name, top-level `## Soul` section in system prompt |
| `<agent>/IDENTITY.md` | `state.blocks.identity` — auto-seeded from agent metadata |
| `<agent>/STYLE.md` | `state.blocks.style` |
| `<agent>/USER.md` | `state.blocks.user` |
| `<agent>/MEMORY.md` (warm cache, soft cap ~2KB) | `state.blocks.memory` |
| `<agent>/memory/YYYY-MM-DD.md` (raw daily logs) | `agent_runs` table — already captures the chronicle |
| `<agent>/findings/` | `entities` rows where `entityType = 'finding'` + `fields.agentName` |
| `<agent>/learnings/` | `entities` rows where `entityType = 'learning'` + `fields.sourceFindingId` lineage |
| `<agent>/HEARTBEAT.md` | Routines + `scheduled-agents` |
| `den/knowledge/` | Existing user-scoped entities (e.g. `note` type) |
| `den/playbooks/` | Existing user-scoped entities (or skills, depending on shape) |
| `den/contacts/` | Existing entities with `type = 'contact'` |
| `den/clients/` | Existing entities with `type = 'client'` |
| `den/comms/<identity>/` | Spaces + per-user notifications + Inbox |
| Reflection cycle | `reflect-daily` routine template + `skills/reflect/SKILL.md` |
| Coaching/curation review | `librarian-weekly` routine template + `skills/librarian-curate/SKILL.md` |
| `boss` / `worker` / `librarian` flat trinity | Existing AdminAgent / AssistantAgent / ResearcherAgent / WriterAgent classes (no exact map; roles fluid) |
| Umbrella + manager | Multi-tenant **orgs** (existing primitive) |

## Persona conventions

The five conventional `state.blocks` names (`soul`, `identity`, `user`, `memory`, `style`) render in stable order with semantic headings before any user-defined blocks. See [`docs/AGENTS.md`](./AGENTS.md) § "Persona conventions" for the render order + auto-seed behaviour.

A goanna agent's filled-in file family (SOUL.md → STYLE.md → USER.md → MEMORY.md → IDENTITY.md) maps onto these block names directly:

```typescript
// Equivalent of `cp ~/goanna/boss/{SOUL,IDENTITY,USER,MEMORY,STYLE}.md → vite-flare`
await agent.setBlock('soul', soulMd)
await agent.setBlock('identity', identityMd)
await agent.setBlock('user', userMd)
await agent.setBlock('memory', memoryMd)
await agent.setBlock('style', styleMd)
```

## Findings + learnings pipeline

Two-stage discipline ported verbatim:

```
Agent at work
   │
   ▼
record_finding(body, ...)    ← agent surfaces an observation (status: open)
   │
   ▼ (recurrence detected)
status: recurred, recurrenceCount: N
   │
   ▼ (reflect skill, daily)
promote_finding(findingId)   ← stable enough → new learning row, finding becomes 'promoted'
   │
   ▼ (librarian-curate skill, weekly)
entity_create({ type: 'note', ... [Librarian] ... })  ← cross-agent knowledge
```

Storage: all rows in the existing `entities` table. No new schema. See [`src/server/modules/chat/tools/findings.ts`](../src/server/modules/chat/tools/findings.ts) for the field-blob shape.

## Page shapes

Goanna's [`CONVENTIONS.md`](https://github.com/jezweb/goanna/blob/main/CONVENTIONS.md) defines page shapes (frontmatter + body sections) for each entity type. Adopt these conventions when filling D1 entities, even though the storage isn't a markdown file:

| Page type | Frontmatter (goes in `entities.fields` JSON) | Body sections (in `fields.body`) |
|---|---|---|
| Entity (clients, contacts) | `slug`, `status`, `services`, `last_updated` | Who they are / What we host / Key contacts / Recent context / **Gotchas** |
| Concept (knowledge) | `topic`, `last_updated`, `applies_to` | Lead with rule, tables for if-X-use-Y, code blocks, Gotchas |
| Procedure (playbooks) | `name`, `when_to_use`, `last_updated` | Numbered steps with verification after each |
| Investigation (research) | `investigation`, `date`, `status` | Question / Findings / Sources / Next steps |
| Decision (ADR) | `decision`, `number`, `status`, `deciders` | Context / Decision / Consequences / Alternatives |
| Finding | `category`, `tags`, `agentClass`, `agentName`, `recurrenceCount` | Body — lead with the pattern; add context only if non-obvious |
| Learning | Plus `sourceFindingId` | Distilled — lead with the rule, anti-patterns table, code |

The `Gotchas` section is the load-bearing part on entity pages — what saves another agent 30 minutes of reconstruction. Use 🚩 for genuine warnings.

## Going further

If goanna's conventions stabilise to v1.0 and we want a stronger bridge, the **export/import** seam is at `entities` rows + `state.blocks`:

- `pnpm goanna:export ~/goanna-out` could serialise each user's entities + their agent block state into goanna folder shape
- `pnpm goanna:import ~/goanna-in` could read a goanna folder and write entities + blocks

Not built. Wait until goanna's spec stabilises and there's a real use case (e.g. user runs goanna offline on holiday, syncs back to vite-flare).

## Status

- 2026-05-04 — slices 0-4 shipped. See [`.jez/artifacts/goanna-adoption-plan-2026-05-04.md`](../.jez/artifacts/goanna-adoption-plan-2026-05-04.md) for slice-by-slice detail and remaining work.
- Goanna stays at v0.2 (still being dogfooded). When it stabilises, revisit this doc to lock in any drift.
