---
date: 2026-07-19
status: complete
owner: jez+claude
topic: CF-dashboard display kit (Sparkline, StatCard v2, BreakdownList, DashboardPanel)
panel: openai/gpt-5.6-sol · anthropic/claude-opus-4.8 · google/gemini-3.1-pro-preview (via OpenRouter; brainstrust key hit weekly limit → project key)
---

# Brains-trust — CF-style display kit

Scope: four new/extended `src/components/ui/` primitives + retrofits of
AgentObservabilityPage and ActivityPage. Kit motivated by Jez's saved
Cloudflare dashboard pages (screenshots: `.jez/screenshots/cf-dash-study/`)
and the goal of not looking like a default-shadcn dashboard.

## Cross-validated → fixed before commit

| Finding | Reviewers | Fix |
|---|---|---|
| Sparkline: NaN/Infinity in `data` poisons Math.min/max → `M0,NaN` path | all 3 | filter non-finite before building points |
| Sparkline: one-point series draws no line; area variant renders a triangle | all 3 | duplicate single point → full-width flat line |
| BreakdownList: `Math.max(pct, 0.75)` gives value=0 a visible bar | GPT + Gemini | min-width only applies when `value > 0` |
| ActivityPage `ACTION_COLORS`: raw palette + `dark:` variants — hard design-rule breach (pre-existing, not introduced by this change) | all 3 | remapped 11 actions onto semantic success/info/warning/destructive/muted tokens, no `dark:` |
| `halfOverHalfDelta`: odd-length range splits 3-vs-4 days, biasing delta upward (Gemini rated Critical) | Gemini (verified by hand: floor(7/2)=3) | compare per-day averages, not sums |

## Singles taken

- Action Select didn't reset `page` (breakdown click did) → `setPage(1)` in handler (GPT)
- `totalCostUsd` of exactly 0 rendered as "—" (truthiness) → `!= null` (GPT)
- `useId()` colons stripped from the gradient id — harmless robustness (Gemini; the url(#) fragment was legal as-is)

## Rejected, with reasons

- **KPI icons dropped is a regression** (all 3, prompted): intentional — CF's KPI
  cards are icon-free; the delta chip + sparkline replace the decoration with signal.
  No speculative `icon?` prop added.
- **ToggleGroup needs `type="single"`** (Gemini): stale-world — that's the Radix API;
  this codebase is shadcn-on-Base-UI and the (unchanged) code works live.
- **`text-[11px]` label violates type scale** (GPT+Gemini): pre-existing deliberate
  micro-label style in StatCard since v1; consistent across the app. Left as-is.
- **14d→30d tool-usage range mapping mislabel** (GPT): pre-existing endpoint
  limitation, panel header makes no range claim. Noted, not changed.
- **isError rendered as empty state** (GPT): pre-existing page pattern, broader than
  this change. Worth a future sweep across pages, not a kit fix.

## Verified-clean notes (Opus)

Empty/flat/negative series, divide-by-zero guards, useId gradient collision-safety,
and the ECharts-stays-lazy claim all independently confirmed.

## Observations logged during verification

- Entity CRUD does not write `activity_logs` rows (only auth events appear for a
  fresh user who created/deleted entities via `/api/entities`). The Activity page
  advertises "items created, updated, archived". Filed as a follow-up candidate.
