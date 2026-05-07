---
date: 2026-05-07
status: active (review complete, fixes pending)
panel:
  - openai/gpt-5.5            ($0 — BYOK)
  - anthropic/claude-opus-4.7 ($0.39)
  - deepseek/deepseek-v4-pro  ($0.06)
  - deepseek/deepseek-v4-flash ($0.006)
total cost: $0.46
context: tool-ui-coverage audit + AGENT_TOOLKIT.md + mcp-connectors.md +
  ToolDefinition contract + ui.ts + ChatUiElement + InputTakeover +
  tool-renderers/_shared.tsx + gmail.tsx + connector-catalog.ts +
  ConnectorsPage.tsx + connector routes (server + client)
raw: panel-raw/{gpt55,opus47,dspro,dsflash}.md
owner: jez+claude
---

# Brains-trust synthesis — tool UI strategy + connectors discoverability

Two questions to a 4-reviewer panel. Strong cross-validated convergence
on both. Headlines:

## Q1 — Tool UI strategy: SHAPE RENDERERS, NOT MORE BESPOKE ONES

3 of 4 reviewers (GPT-5.5, Opus 4.7, DeepSeek Flash) recommend the same
architecture. DeepSeek Pro is the dissenter — leans more on `_ui` markers.

**Consensus design — three-tier rendering contract**:

1. **`_ui` markers stay for agent-authored interactive UI** (forms,
   choices, confirmations, contact cards) — current `tools/ui.ts`
   is the right shape. Don't expand `_ui` to cover output display.

2. **NEW: 4 generic shape renderers** matching by output shape, not
   tool name. ~150 LOC total in a new
   `tool-renderers/shapes.tsx` and registered BEFORE defaults:

   | Shape | Matches | Tools that benefit |
   |---|---|---|
   | `{ stdout, stderr, exitCode }` | terminal/code-block | `run_python`, `run_shell`, `run_js` |
   | `{ imageUrl \| dataUrl, ... }` | image preview | `browser_screenshot`, `generate_image`, `video_frame` |
   | `{ markdown, frontmatter? }` | prose with frontmatter | `load_skill`, `load_knowledge`, `docs_get` |
   | `{ rows: [...], columns? }` | data table | `read_data`, `aggregate_data`, `sheets_read_range`, many MCP tools |

   This converts ~30 of the 53 default-meta tools to rich UX with **zero
   per-tool code**. Skills + Knowledge + Code + Browser screenshot all
   inherit good rendering for free.

3. **Bespoke domain renderers** (gmail.tsx, calendar.tsx, etc.) stay
   for product-critical UX where generic shapes can't capture it.

**Contract change** — extend `~/.claude/rules/one-file-tool-definitions.md`:
> A tool must satisfy one of: (a) return an `_ui` marker, (b) return
> output matching a registered shape renderer, (c) ship a domain
> renderer in `tool-renderers/`. CI test walks `allDefinitions` and
> warns (not blocks) on misses.

**Don't go to true MCP-UI iframe sandboxes yet** — every reviewer
agrees. `_ui` already covers ~90% of what sandboxed HTML would give us
with full TypeScript typing. Reconsider when third-party MCP servers
want to render custom UI.

**Predicted lift**: 43% rich coverage today → 75%+ rich coverage after
shipping shape renderers, with no per-tool work for the long tail.

## Q2 — Connectors discoverability: ONE-ENTRY CATALOG IS A CONVERSION KILLER

Full consensus across all 4 reviewers. Every reviewer used some variant
of "trust-destroying" or "honest but disappointing".

**Core problem**: the page fuses two products that should be staged
separately:
1. **Native workspace integrations** (Google + Microsoft) — high value,
   instantly understood by SMEs, 30-second flow.
2. **Custom MCP infrastructure** — powerful, extensible, completely
   meaningless to a non-technical user.

The "Browse apps" primary CTA leads to product 2, which shows ONE
example (Australian Business Register). First impression for an SME:
"this is half-built / for developers".

**Consensus fixes** (priority order):

### P0 — Ship this week

- **Seed the catalog with 6–10 real Smithery entries** (GitHub, Linear,
  Stripe, Slack, Notion, HubSpot, Airtable, Asana). All are public
  Smithery URLs — no maintenance burden, just listing them. Code
  already supports this — `MCP_CATALOG` in `connector-catalog.ts` is
  trivial to extend (~30 min data entry).
- **Purge "MCP" from primary user-facing copy**. Replace with
  "integration" / "app" / "connection". Keep MCP in one
  `HelpDisclosure` ("Built on the open MCP standard"). Affected:
  `ConnectorsPage.tsx` header + Browse modal + Custom dialog +
  `ConnectionDetail.tsx`.
- **Rewrite the empty-state copy** under "Connected apps" to be
  benefit-driven: "Connect Slack and your AI can read channels, post
  updates, find messages. Connect Notion to search docs and create
  pages. Most take under 30 seconds."
- **Rename "Browse apps" → "Add an integration"** (or "Add app").
- **Add "what this lets your AI do" bullets** to every catalog entry
  (matching the Workspace cards' existing bullet pattern).

### P1 — Next sprint

- **Restructure the Browse modal** into 3 sections: Popular / Workspace /
  Advanced (paste URL). Workspace appears in BOTH places so "Browse" is
  the single answer to "how do I connect anything".
- **Surface per-tool toggles earlier** — show "12 tools available · 3
  write tools require approval" on the connection card directly, not
  buried behind Configure.
- **First-connection toast** suggesting an example prompt: "Try asking
  your assistant: 'Summarise my unread emails from this week.'" —
  converts landing → connecting → *actually using*.
- **Move connected Workspace cards into the Connected Apps grid** after
  connect — fixes "where did my Google connection go?" confusion
  (DeepSeek Pro flagged this specifically).

### P2 — Later

- **Telemetry**: `connect_started`, `connect_completed`,
  `first_tool_call_post_connect` — can't optimise the funnel without
  measuring it.
- **Task-based discovery**: 3-card "Choose your starter pack" on empty
  state — *Email assistant* (Google/MS), *Project ops* (Linear+Slack),
  *Revenue* (Stripe+HubSpot). One click wires multiple connectors.

## Where the panel disagreed

Only one substantive disagreement: **DeepSeek Pro** wanted to push the
`_ui` marker pattern further (teach the agent to emit `show_data_table`
from `read_data` results via system-prompt nudges). The other three
prefer shape renderers because:
1. Shape renderers don't require the agent to translate output → UI
   intent — the renderer detects the shape and renders correctly.
2. `_ui` mixes execution data with presentation; downstream automation
   gets harder.
3. Type checking is cleaner with shape detection than with prompt-driven
   `_ui` emission.

DeepSeek Pro's angle is still valuable as a **complement** — for cases
where the tool returns plain JSON but the agent KNOWS it should be
shown as a metric card or comparison. Worth a sentence in the system
prompt: "When tool output would benefit from a card/table/choices, emit
the matching `_ui` element."

## Combined ship list (panel consensus)

**~3-4 hours of work this week** for both Q1 + Q2:

| Order | Task | Effort | File(s) |
|---|---|---|---|
| 1 | Add `tool-renderers/shapes.tsx` (4 generic renderers) | 90 min | new file + register in `index.ts` |
| 2 | Add `render` blocks to `artifacts.ts` + `documents.ts` | 5 min | server tool files |
| 3 | Add `skills-knowledge.tsx` polish renderer | 20 min | new file |
| 4 | Seed catalog with 6 Smithery entries | 30 min | `connector-catalog.ts` |
| 5 | Purge "MCP" from primary copy | 15 min | 4 client files |
| 6 | Rewrite empty-state benefit-led copy | 20 min | `ConnectorsPage.tsx` |
| 7 | Rename "Browse apps" → "Add an integration" | 5 min | `ConnectorsPage.tsx` |
| 8 | Add "what your AI can do" bullets to catalog entries | 30 min | `connector-catalog.ts` + dialog |
| 9 | Extend `one-file-tool-definitions.md` rule + CI script | 45 min | rule file + new test |
| 10 | First-connection toast with example prompt | 30 min | `ConnectorsPage.tsx` |

**Predicted impact**:
- Tool UI rich coverage 43% → 75%+ with no per-tool work
- Connectors first-impression "this is real" rather than "this is a demo"
- Connector funnel measurable (after telemetry P2)

## What to defer

- True MCP-UI iframe protocol (no threat model justification yet)
- Bulk-author 80+ bespoke renderers
- Client-side search bar in Browse modal (already gated `>= 6` entries —
  lights up automatically once catalog is seeded)
- Choose-your-starter-pack UX (P2; needs telemetry first)

## Cost / value summary

$0.46 across 4 reviewers. Caught:
- The right architectural call on tool UI (shape renderers vs bulk
  bespoke vs `_ui` everywhere) — would have been hard to settle alone.
- One clear consensus + one minority view on Q1, both well-reasoned.
- Unanimous diagnosis on Q2 with an actionable ship list.
- Multiple specific file:line references that will save future-me from
  re-reading the connectors module.

Same pattern as the previous brains-trust round: cheap, fast, catches
strategy-level decisions a single pair of eyes wouldn't.
