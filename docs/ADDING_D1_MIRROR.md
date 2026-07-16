# D1 Mirror — keep an external dataset current locally

The pattern for **mirroring an external reference dataset into D1** so
agent lookups are fast, offline, and free (issue #90). Hitting the source
API per request is slow and rate-limit-prone; a full mirror often exceeds
one Worker invocation's subrequest budget, so the sync runs as a durable
Workflow. The predecessor of this pattern took a board view from 4.5s to
~95ms.

Reference implementation: `src/server/modules/mirror/` (demo source:
restcountries.com, ~250 rows, keyless).

## The moving parts

| Piece | File | Job |
|---|---|---|
| Source adapter | `mirror/source.ts` | **The file you swap.** Returns the full current dataset as `{externalId, name, payload}[]` |
| Workflow | `mirror/workflow.ts` | `list source` step → batched `sync` steps (50/step, per-item try/catch) → optional `prune stale` step |
| Table | `mirror/db/schema.ts` | `mirror_records` keyed by the source's natural id, `synced_at` per row |
| Admin routes | `mirror/routes.ts` | `GET /api/mirror` (freshness + sample) · `POST /api/mirror/refresh[?prune=true]` |
| Cron guard | `index.ts` scheduled §7 | Fires the Workflow only when data is older than `MIRROR_MAX_AGE_HOURS` (default 24) |

## Enable it

The Workflow binding ships in `wrangler.jsonc` (`MIRROR_WORKFLOW`). For
automatic refresh, set:

```bash
MIRROR_CRON=true              # opt in to the cron guard
MIRROR_MAX_AGE_HOURS=24       # optional staleness window
```

Manual refresh any time: `POST /api/mirror/refresh` (admin). Pass
`?prune=true` when the source is authoritative and deletions should
propagate.

## Adapting to your source

1. Rewrite `listSourceRecords()` for your API. Keep the full-state
   contract — the Workflow upserts everything each run and freshness is
   per-row, so partial/diff syncs aren't needed until your dataset is
   huge. If the URL comes from user config, gate it with `isSafePublicUrl`.
2. Rename table/module if you like, or add more mirrors by copying the
   module — one Workflow class per dataset keeps retry envelopes isolated.
3. Read the mirrored data from your own domain routes and agent tools.
   Pairs well with a read-only SQL tool over reference data (issue #77) —
   the mirror table is exactly the kind of non-sensitive data safe to
   expose to agent-written SELECTs.

## Failure modes this design already handles

- **One bad record** → per-item try/catch inside the batch; logged, skipped.
- **Transient D1/source errors** → each `step.do` retries with backoff.
- **Source deletions** → rows whose `synced_at` stops advancing; `prune`
  deletes them, or leave them and treat staleness as a signal.
- **Cron storms** → the staleness guard makes cadence irrelevant; the
  Workflow fires at most once per staleness window.
