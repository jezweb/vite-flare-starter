---
date: 2026-07-17
status: complete
owner: claude
topic: field-configs module (#62 item 2) pre-commit review
panel: openai/gpt-5.6-sol, anthropic/claude-opus-4.8, google/gemini-3.1-pro-preview
cost: ~$0.35
---

# Brains-trust — custom field schema + DynamicFieldRenderer

Scope: `server/modules/field-configs/` (schema, routes, validation),
`client/components/DynamicFieldRenderer.tsx`, `client/hooks/useFieldConfigs.ts`,
`client/modules/kanban-demo/components/TaskEditSheet.tsx`.

## Fixed before commit

| Finding | Reviewers | Fix |
|---|---|---|
| TaskEditSheet effect keyed on `[task]` — background refetch clobbers in-progress edits | sol, opus, gemini | Effect keyed on `task?.id` with a ref for the object |
| Reorder = up-to-200 sequential D1 UPDATEs, non-atomic | sol, opus, gemini | `db.batch()` (implicit transaction) |
| Required text/textarea accepts `''`; required multi_select accepts `[]` | sol, opus, gemini | `.trim().length > 0` refine + `.min(1)` |
| Create duplicate pre-check is TOCTOU | sol, opus, gemini | Catch UNIQUE violation → 409 (per-user mode); shared-mode cross-owner race documented as renderer-tolerated |
| `__proto__` fieldName silently drops from zod shape (prototype assignment) | sol (verified by inspection) | `FORBIDDEN_FIELD_NAMES` rejected at route + skipped in builder + null-proto shape |
| Number input converts per keystroke — decimals untypeable | sol, gemini | Raw string while typing, parse on blur |
| Sheet writes back unrendered (agent-written) keys stale | sol, opus (H2 aspect) | Save sends only configured fieldNames |
| Dangling `aria-labelledby` on multi_select group | sol, opus | `id={..-label}` on FieldLabel |
| Date regex accepts 2026-99-99 | sol, opus | Calendar-validity refine (round-trip check) |
| Seed non-atomic, retry blocked by 409 | sol, opus | Per-field try/catch, retry completes the set |

## Dismissed with reasons

- **opus C1 "shared-mode writes are an authz hole"** — shared tenancy in this
  starter *deliberately* means colleagues act on each other's rows (see
  `src/server/lib/tenancy.ts` docblock: scoping reads but not writes produces
  "I can see it but can't act on it" bugs; the entities module uses the same
  pattern). Read-write symmetry is the documented design, not a conflation.
- **gemini "buildFieldsSchema fails partial PATCH"** — inherent to validating
  the complete post-merge fields object; docblock now states this explicitly.
- **opus L2 "serialise leaks userId"** — creator attribution is intentional in
  shared mode.
- **gemini M3 "set closure stale state"** — parent owns state via setState;
  sequential user interactions re-render between clicks. Demo-grade risk accepted;
  forks needing rapid programmatic updates should lift to functional updates.
- **gemini Low "select can't be cleared"** — acceptable for the demo; forks add
  a None item when nullable selects matter.

## Notes

- Panel run via OpenRouter (`openrouter-brainstrust.md` key). Gemini given 20k
  max_tokens per the reasoning-budget caveat.
- `pnpm test` green (8 field-configs tests incl. panel-finding pins) before commit.
