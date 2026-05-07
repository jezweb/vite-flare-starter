# deepseek/deepseek-v4-pro

_Tokens: in=36064 out=4208 cost=$0.06191616_

**TL;DR**

Tool UI: the three-layer model is sound but the long tail is starving. Don't refactor the contract — it'll choke contributions. Instead, extend the `_ui` marker pattern aggressively: it's your highest-leverage path because it creates rich UX with zero per-tool client code. Ship the audit's quick wins this week (skills/knowledge/code/browser — maybe 60 min total), then teach the agent to emit `show_data_table`/`show_metric_cards` from tools like `data/*` and `entities/*` via system-prompt nudges. Custom renderers stay for domain-specific UX (Gmail inbox, calendar grid) where a generic table won't cut it.

Connectors: the one-entry catalog is honest infrastructure but a brutal first impression. The copy buries the actual value ("paste any URL") behind the MCP jargon. A non-technical SME owner sees an empty "Connected apps" section and a browse modal offering exactly an Australian business registry. You need 5–6 useful entries (GitHub, Linear, Stripe, Slack via Smithery), a search bar that doesn't hide with 1 result, and every user-facing mention of "MCP" replaced with plain language. The per-tool toggle in ConnectionDetail is an enterprise feature that should light up *after* the first connection, not be the primary CTA.

---

## Q1 strategy: Extend `_ui` markers, ship quick wins, don't mandate renderers

### Recommended path

**Phase A — this week (60–90 min):** Ship the five quick wins from the audit doc:

1. `artifacts.ts` + `documents.ts` — add `render` blocks with icons and displayNames (`jez/audits/2026-05-07-tool-ui-coverage.md:93`). These are the only tools with *zero* render metadata. 5 min.
2. `skills-knowledge.tsx` — one shared renderer for `load_skill` + `knowledge_search` + `load_knowledge`. Same output shape (markdown body + frontmatter + resources list). Reuse the markdown rendering already in the chat bubble. 30 min.
3. `code.tsx` — `run_python`/`run_shell`/`run_js` render stdout in `<pre>` with copy-on-click. 15 min.
4. `browser.tsx` — `browser_screenshot` renders an `<img>`; `browser_extract` renders as a data table. 15 min.
5. `data.tsx` — `read_data`/`aggregate_data`/`pivot`/`trend`/`distribution` render tabular output as a sortable table. 20 min.

This moves ~20 tools from "bare wrench" or "JSON dump" to rich in one session and covers all five "high pain" items from the audit.

**Phase B — structural (next sprint):** Extend the `_ui` marker pattern, not the renderer registry:

The `_ui` pattern (`src/server/modules/chat/tools/ui.ts`) is your MCP-UI — it's already working, already dispatched in `ChatUiElement.tsx`, already has 13 component types including `show_data_table`, `show_metric_cards`, `show_timeline`, `show_progress`, `show_comparison`. The missing piece: **tools don't know they can use it**.

Right now only the 13 `uiDefinitions` tools return `{ _ui: ... }`. But any tool *can*. Add a system-prompt nudge (like the one that pairs `places_search` with `show_map` at `AGENT_TOOLKIT.md:places`) that tells the model: *"After calling tools that return tabular data (entities, findings, data, channels), consider calling `show_data_table` to present results."*

This is the highest-leverage move because:
- Zero new client code per tool family
- The agent decides the best presentation (table vs metric cards vs timeline)
- It scales to any future MCP tool whose output shape you don't control
- It mirrors what Claude Desktop does with MCP-UI resources

**Phase C — contract guidance, not mandate:** Amend `.claude/rules/one-file-tool-definitions.md` to *require* a `render` block with at minimum `{ icon, displayName }` — but NOT a custom client renderer. The `_ui` marker + server-side `expanded` function can cover many tools. Making a client renderer mandatory would slow the ~40 files that need touching and deter community contributions. The right rule: "every tool SHALL have `render.icon` + `render.displayName`; tools with output > 2KB SHOULD provide `render.expanded` or emit a `_ui` marker."

### Trade-offs

| Path | Pros | Cons |
|------|------|------|
| Bulk-fix high-pain | Immediate impact, manageable scope | Doesn't solve the long tail; you'll be back here in 3 months |
| Mandate renderer on merge | Never ships ugly UX again | Slows velocity, punishes experiments, doesn't help the 60+ existing bare tools |
| Lean into `_ui` markers | Scales infinitely, agent-driven UI, no per-tool code | Can't express domain-specific layouts (Gmail inbox, calendar grid); agent might pick wrong presentation |
| MCP-UI sandboxed iframes | Maximum flexibility, matches upcoming Claude protocol | Massive build effort, security surface, overkill for the current 140 tools |
| **Hybrid (recommended)** | Quick wins now, `_ui` for the long tail, custom renderers for high-value domains | Requires discipline on the system prompt + audit process |

### Concrete first move

Add this to the agent system prompt (alongside the existing `places_search` → `show_map` nudge):

```
After calling tools that return lists, tables, or structured results
(entities, findings, data, channels, memories-multi, browser_extract),
prefer calling show_data_table, show_metric_cards, or show_timeline
instead of dumping raw text. This makes results scannable and tappable.
```

Then create a `defaults.tsx` entry for every tool in the "bare wrench" tier that at minimum provides `icon` + `displayName`. That's ~32 entries, 20 minutes of data entry in `src/client/modules/chat/components/tool-renderers/defaults.tsx`. Suddenly 0% of tools ship with a generic wrench.

---

## Q2 connectors: This page undersells the product's best feature

### Strengths

- The infrastructure is genuinely good: OAuth 2.1 + PKCE + DCR, encrypted tokens, per-tool allow/ask/never (`src/server/modules/mcp-connections/routes.ts`), bearer fallback, probe→connect flow.
- The "Add custom" dialog with probe-ahead is excellent UX for the technical audience that knows what MCP is (`CustomConnectorDialog` in `ConnectorsPage.tsx`).
- The Workspace integrations section (Google, Microsoft) looks professional and communicates value immediately.
- The ConnectionDetail per-tool policy sheet (`ConnectionDetail.tsx`) is well-designed for enterprise users who need "read Gmail but never send."

### Weaknesses — ranked by severity

1. **One-entry catalog is honest but actively harmful.** A new user clicks "Browse apps" and sees a *single* connector for Australian Business Register. For most users outside Australia, this is useless. The modal title literally says "Connector **examples**" — plural — but shows a singular. This makes the product look abandoned or pre-MVP. The philosophy doc (`connector-catalog.ts:12-16`) says the value is the infrastructure, not a curated catalog — but the user doesn't see the infrastructure, they see an empty shelf.

2. **"MCP" is jargon.** The HelpDisclosure says "Built on the Model Context Protocol (MCP) standard" (`ConnectorsPage.tsx:138`). The Browse dialog says "public MCP servers" and "MCP server URL" five times. The Custom dialog says "Add custom MCP server." A non-technical SME owner sees this and thinks "this is for developers." Replace every instance with "apps and tools" or "connections." Save "MCP" for the docs, not the UI.

3. **The empty state copy is generic.** "The external tools your AI can use when chatting or running routines" (`ConnectorsPage.tsx:254`) doesn't say what the user *gets*. Better: "Connect Slack and get AI that reads channels, posts updates, and finds messages. Connect Notion to search docs and create pages. Most connections take under 30 seconds." Show the benefit, not the mechanism.

4. **Per-tool toggles are hidden behind "Configure" → Sheet.** A user connects Google Workspace and sees a "Configure" button. They click it and find a full policy grid with "Read-only tools" and "Write / delete tools" (`ConnectionDetail.tsx:169-181`). This is powerful but invisible. After the first connection, surface a one-line summary: "12 tools available · Gmail read, Drive read, Calendar read. [Manage]" as a card footer.

5. **The workspace integrations section has no "Connected" state.** When a user connects Google Workspace, it still shows the "Connect" card with a native panel. The MCP connections render as cards in "Connected apps" — but Workspace doesn't. This creates a confusing split: "Is my Google connection in Workspace integrations or Connected apps?" After connection, move the Workspace card into the "Connected apps" grid with the same card treatment.

6. **No social proof or guidance.** The page doesn't tell users what to connect *first*. No "Popular connections" section, no "Start here" badge, no "Most users connect Google Workspace + Slack." The catalog has a `popularity` field (`connector-catalog.ts:41`) but it's not surfaced in the UI.

### Prioritised list of changes

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | Add 5-6 catalog entries: GitHub, Linear, Stripe, Slack, Notion, Postgres (public Smithery URLs, no-auth or bearer) | 30 min data entry | Transforms the browse modal from "one weird example" to "this works with things I use" |
| 2 | Replace all user-facing "MCP" with plain language | 15 min string changes | Removes the biggest conversion killer for non-technical users |
| 3 | Rewrite empty state copy to show benefit per app | 20 min copy | Tells users *why* they should connect, not *what* connections are |
| 4 | Add "Start with…" recommendation card at top of Connected apps | 45 min component | Guides first-timers to their first successful connection |
| 5 | After first connection, show tool count + "Manage" link on the card | 60 min | Surfaces the per-tool granularity that's currently buried |
| 6 | Move connected Workspace integrations into the "Connected apps" grid | 90 min logic | Fixes the "where did my Google connection go?" confusion |
| 7 | Search bar on catalog when entries ≥ 6 (already implemented at `BrowseDialog.tsx:showSearch`) | Done | Already gated; will light up when catalog grows |

### Does "Browse apps → Connector examples (1 entry)" work?

No. It's honest — the infrastructure *is* the value — but honesty doesn't convert. The user doesn't care about the architecture; they care about "can I connect my tools?" One entry says "barely." The fix isn't to hide the catalog or fake entries — it's to add 5–6 genuinely useful public connectors that cost nothing (no auth, no maintenance burden) and demonstrate the value. The Australian Business Register should move from "the only entry" to "one of several examples, useful if you're in Australia."

---

## What I'd ship this week

**Monday morning — Tool UI quick wins (90 min):**
- Add render blocks to `artifacts.ts` + `documents.ts` (bare minimum `icon` + `displayName`)
- Create `src/client/modules/chat/components/tool-renderers/skills-knowledge.tsx` covering `load_skill`, `knowledge_search`, `load_knowledge`
- Create `src/client/modules/chat/components/tool-renderers/code.tsx` for `run_python`/`run_shell`/`run_js`
- Create `src/client/modules/chat/components/tool-renderers/browser.tsx` for `browser_screenshot` + `browser_extract`
- Register all in `tool-renderers/index.ts`

**Monday afternoon — Catalog expansion + copy (60 min):**
- Add to `MCP_CATALOG` in `connector-catalog.ts`: GitHub (smithery.ai public), Linear (smithery), Stripe (smithery), Slack (Anthropic reference), Postgres (community), Notion (community). Use the public Smithery URLs — no auth for most, bearer for some.
- Replace all user-facing "MCP" strings in `ConnectorsPage.tsx`, `ConnectionDetail.tsx`, and `BrowseDialog` with "app" or "connection."
- Rewrite the empty state copy under "Connected apps" to be benefit-driven per common app.

**Tuesday — System prompt nudge + defaults fill (45 min):**
- Add the `_ui` marker nudge to the agent system prompt (tabular results → `show_data_table` etc.)
- Fill `defaults.tsx` with icon + displayName for every remaining bare-wrench tool (the ~32 from the audit). Use appropriate Lucide icons: `BookOpen` for knowledge, `Database` for data, `Lightbulb` for findings, `Box` for entities, `Globe` for firecrawl, etc.

**Wednesday — First-connection experience (90 min):**
- After a user connects their first app, show a "Start here" card: "Your AI can now read Gmail. Try: 'Find my last 3 unread emails' or 'What meetings do I have tomorrow?'"
- Move connected Workspace integrations into the Connected apps grid.
- Add tool-count summary to connection cards ("12 tools · 3 write tools require approval").

**Thursday — Polish + test:**
- Verify all new renderers in the chat transcript with real tool output.
- Smoke-test the connectors flow with the expanded catalog.
- Ensure the `showSearch` threshold (≥6) activates with the new catalog size.
- Ship.

**Why this order:** The tool UI fixes are the most visible — every user sees tool output in chat. The connectors fixes are the highest conversion leverage — they determine whether a first-time user sticks around long enough to see the tool UI fixes. The system prompt nudge is a force multiplier that improves all future tool output.