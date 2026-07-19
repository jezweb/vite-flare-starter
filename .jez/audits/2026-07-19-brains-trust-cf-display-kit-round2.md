---
date: 2026-07-19
status: complete
owner: jez+claude
topic: CF display kit round 2 — SegmentedBar/SeriesLegend, TimeRangePicker, RadialGauge, LogTail, analytics-demo page
panel: openai/gpt-5.6-sol · anthropic/claude-opus-4.8 · google/gemini-3.1-pro-preview (project OpenRouter key)
supersedes-context: 2026-07-19-brains-trust-cf-display-kit.md (round 1)
---

# Brains-trust — CF display kit round 2

Scope: four new primitives + `/dashboard/analytics-demo` worked example +
observability retrofit (TimeRangePicker, success/error SegmentedBar).

## Cross-validated → fixed before commit

| Finding | Reviewers | Fix |
|---|---|---|
| RadialGauge ARIA used raw `value`/`max` (invalid meter when max ≤ 0 or value > max) + no accessible-name fallback + tone computed from unclamped ratio | GPT + Opus (Opus: "the meter-semantics selling point is compromised") | ARIA mirrors sanitised values; name falls back to "value of max"; tone from clamped fraction |
| LogTail follow effect depended on `lines.length` — a rolling tail buffer (constant length) never re-pins, the exact case follow exists for | Opus + Gemini | depend on the `lines` array reference |
| LogTail expand button lacked `aria-controls`/detail `id` | Opus + Gemini | wired `log-detail-<key>` association |
| SegmentedBar aria summary announced NaN/negative values the visual dropped | GPT + Opus | summary built from finite ≥ 0 values only |
| Demo `DEMO_LOG` used module-scope `Date.now()` — timestamps freeze for the SPA session (Gemini rated Critical) | GPT + Gemini | `buildDemoLog(now)` inside `useMemo` per mount |

## Singles taken

- LogTail `detail` truthiness → `!= null` (empty-string details expandable) (GPT)
- sr-only "Warning:"/"Error:" prefixes — severity survives without color (GPT)
- key collisions on duplicate labels → label+index keys in bar + legend (GPT/Opus)
- TimeRangePicker GMT label memoised once per mount (Opus)
- Demo cache-hit delta derived from data instead of hardcoded −1.9 (Gemini)
- Demo gauge renamed "Budget used" (was "of $5.00" — a caption posing as a name) and value clamped so range switches don't pin destructive (Opus)
- One-line comment marking `isDarkMode` as the ECharts-only escape hatch (Opus)

## Rejected, with reasons

- **SSR hydration mismatch for GMT label** (GPT + Gemini): this starter is
  SPA-only (Workers static assets, no SSR path). Noted in a comment for
  SSR forks; cross-validation of an inapplicable environment isn't evidence.
- **`text-[11px]` in RadialGauge caption** (GPT): matches the established
  StatCard micro-label convention; consistency wins.
- **SegmentedBar minWidth breaks 100% invariant with many tiny segments**
  (Opus): real but intentional (trace-visibility, e.g. 172-of-360k 5xx);
  documented in a comment instead of changed.
- **Require `id` on SegmentItem** (GPT): label+index keys close the collision
  without an API break.

## Verified-clean (Opus)

Division-by-zero guards across all four components, PRNG determinism,
timezone sign math, LogTail NaN timestamp fallback — independently confirmed.
