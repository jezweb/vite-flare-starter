# anthropic/claude-opus-4.7

_Tokens: in=56471 out=4193 cost=$0.38718_

# Brains-trust review — tool UI + connectors

## TL;DR

**Q1:** Don't chase 100% rich renderers per-tool — it's a treadmill. Double down on the `_ui` marker pattern as your "MCP-UI lite" and add **2-3 generic output-shape renderers** (stdout-block, image, markdown-body, rows-table) that any tool can opt into by returning a recognised shape. Ship the four quick wins from the audit this week (skills/knowledge/code/screenshot). Extend the one-file rule to require *either* a `render` block *or* a known output shape. Defer true MCP-UI (sandboxed iframes) — you don't have the threat model for it and `_ui` already covers ~90% of what sandboxed HTML would give you, with better typing.

**Q2:** The flow is honest but disappointing, and the disappointment happens in the *first click an SME makes*. "Connector examples (1 entry)" with an Australian Business Register demo is a trust-destroying moment for a non-technical user. You have two good products fused into one confused page: native workspace connectors (high value, obvious) and custom MCP infrastructure (great infra, scary naming). Split the IA, hide "MCP" from the primary flow, and seed the catalog with 6-8 real Smithery-backed entries even if you don't own them.

---

## Q1 — Tool UI rendering strategy

### Recommendation: **tiered contract**, not per-tool rich renderers

Three tiers, enforced by the contract:

1. **Interactive / agent-directed UI** → `_ui` marker (current `ui.ts`). This is your MCP-UI equivalent and it's *already better than MCP-UI* for your use case because it's type-checked end-to-end and the component library is shared with the rest of the app. Keep investing here.
2. **Output-shape renderers** (new). Add ~4 generic renderers that match on *output shape*, not tool name:
   - `{ stdout, stderr, exitCode }` → terminal block (covers `run_python`, `run_shell`, `run_js`)
   - `{ imageUrl | dataUrl, ... }` → image preview (covers `browser_screenshot`, future `generate_image` variants, `video_frame`)
   - `{ markdown: string, frontmatter?: ... }` → prose renderer (covers `load_skill`, `load_knowledge`, `docs_get` body)
   - `{ rows: [...], columns?: [...] }` → table (covers `read_data`, `aggregate_data`, `sheets_read_range`, many MCP tools)

   `_shared.tsx` already has `matchesRenderer` with a predicate form — this is ~150 LOC of new code and collapses ~30 of the 53 "default meta only" tools into rich UX for free.

3. **Domain renderers** (current `gmail.tsx` etc.) stay as-is for high-value flows where generic shapes can't capture the UX (reply threads, calendar cards, map results).

### Contract change

Extend `one-file-tool-definitions.md`:

> A tool must satisfy one of: (a) return an `_ui` marker, (b) return an output matching a registered shape renderer, (c) ship a `render.expanded` or domain renderer. PRs failing the check get a CI warning, not a block — renderer-less tools still work, they just look crap.

Soft-enforce via a test that iterates `allDefinitions`, runs a sample `execute` against mocked ctx, and asserts at least one of the three matches. Write this once, it catches every future tool.

### Why not just bulk-fix the high-pain tier?

You'll fix 10 today and ship 20 more tools next quarter. The audit's own numbers say it: **21% bare + 36% JSON-body = 57% of tools are unaesthetic**, and the per-tool authoring cost is why. Shape renderers change the default.

### Why not go to real MCP-UI (sandboxed iframes)?

- You don't have untrusted third-party renderers yet. Every tool is yours.
- Iframes break your design system (toasts, theming, keyboard shortcuts, chat send-back).
- The `_ui` dispatch in `ChatUiElement.tsx:25-130` is ~100 lines and does 90% of what sandboxed MCP-UI does, with full typing.
- Reconsider when you let users install *third-party* MCP servers that want to render custom UI. Today they only expose tools.

### Concrete first move (this week)

1. Add `src/client/modules/chat/components/tool-renderers/shapes.tsx` with the 4 shape renderers above. ~2 hours.
2. Register them *before* `defaultRenderers` in `index.ts:92`. Instant lift for run_python, browser_screenshot, skills, knowledge, data_*, firecrawl.
3. Ship `skills-knowledge.tsx` (markdown shape renderer will already handle most of it — this is just polish for frontmatter + resources).
4. Extend the one-file rule doc.
5. Then revisit the audit — I bet you're at ~75% rich coverage without touching most tools.

### Trade-offs

- Shape matching means tools have to standardise outputs. Good — forces consistency. Bad — breaks if a tool returns `{ rows, error }` on failure. Solution: match on `success` shape, fall through to default on error shape.
- `_ui` gets weird for output that should *also* persist as a tool result (e.g. `show_data_table` from structured data). You'll eventually want a "rich output + _ui render hint" variant. Not urgent.

---

## Q2 — Connectors discoverability

### The core problem

You have **two products** on this page:
1. **Native workspace connectors** (Google, Microsoft) — high value, SME understands immediately, 30-second flow.
2. **Custom MCP infrastructure** — powerful, extensible, completely meaningless to a non-technical user.

The page treats them as peers. They aren't. Product 1 is the conversion engine; product 2 is power-user surface area. Right now "Browse apps" (the primary CTA) lands on product 2, which shows **one entry for an Australian business registry**. This is the worst possible first experience.

### Strengths

- Empty state copy is actually good: "Connect Gmail, Calendar, Drive… Most take 30 seconds." Concrete, benefit-first, low-friction. Keep it.
- Workspace panels surface above the fold — right call.
- `ManageToolsDialog` with per-tool read/write toggles is genuinely excellent UX for power users. File:line `ConnectionDetail.tsx:180-220` — the read-only/write split is the right heuristic.
- Popup-avoidance via `window.location.href` redirect (`ConnectorsPage.tsx` line with Cn1 fix comment) — correct. Keep.
- Bearer/OAuth probe flow is elegant.

### Weaknesses (ranked by conversion impact)

1. **"Browse apps" is the primary button and it leads nowhere useful.** A first-time SME clicks it, sees "Connector examples — 1 entry — Australian Business Register" and concludes the product is half-built. This is the #1 fix.
2. **"MCP" appears in user-facing copy** (modal description, custom dialog). SMEs don't know what MCP is and won't google it. "A short list of public MCP servers to demonstrate the connector flow" reads as *developer documentation*, not a product.
3. **"Add custom" is a power-user escape hatch disguised as a primary action.** Non-technical users won't have an MCP URL. Demoting it would be honest.
4. **Per-tool granularity is invisible.** Nothing on the connections page hints that after connecting Gmail you can toggle `gmail_send` off. This is actually a killer feature for privacy-conscious SMEs and it's buried behind "Configure".
5. **Coming-soon stubs are dev-only** (good) but removing them leaves the "Connected apps" section empty for most users — no social proof, no sense of *what's possible*.
6. The "Workspace integrations" cards need **logos** (the description says they have them; if not, add). SME pattern-matches logos first, text second.

### Prioritised changes

**P0 — ship this week**

1. **Rename "Browse apps" → "Add an integration"** and change the modal. Make the modal the *single* connect surface. Inside it, show three tabs or sections:
   - **Popular apps** (8-10 real entries: Linear, GitHub, Stripe, HubSpot, Notion, Slack, Airtable, Asana) pointing at public Smithery URLs. Label them "via Smithery" in small grey text to set expectations.
   - **Workspace** (Google, Microsoft — even though they're also on the page, having them here lets "Browse" be *the* answer to "how do I connect anything").
   - **Advanced: paste a connection URL** (today's custom flow, tucked at the bottom).
2. **Purge "MCP" from primary copy.** Keep it in one `HelpDisclosure` — "Built on the open MCP standard". Everywhere else, say "integration" or "app" or "connection".
3. **Add a "what the AI can do" teaser to the catalog entries.** For Linear: "Create and update issues, search by assignee, post comments." Same shape as the Google Workspace bullet list.

**P1 — next sprint**

4. Surface the per-tool toggles on the workspace cards directly — a "Permissions" link next to "Connect" showing "5 read, 3 write (all asking for approval)". Gives the privacy story without needing the user to drill in.
5. When a user connects their first thing, fire a toast: "Try asking your assistant: 'Summarise my unread emails from this week.'" — converts landing → connecting → *actually using*.
6. Move the Australian Business Register example to a "See a no-auth demo" link in the help disclosure. It's valuable for devs, toxic for SMEs.

**P2 — later**

7. Telemetry: track `connect_started`, `connect_completed`, `first_tool_call_post_connect`. You can't optimise this funnel without it.
8. Consider a 3-card "Choose your starter pack" on empty state: *Email assistant* (Google/MS), *Project ops* (Linear+Slack), *Revenue* (Stripe+HubSpot). One click wires multiple connectors.

### Does "MCP" mean anything to an SME?

No. Zero. Treat it like "OAuth 2.1 PKCE" — real, important, never user-facing. Your own copy in `CustomConnectorDialog` already gets this right ("Connection URL", "Sign-in method") — push that language everywhere.

### Is the 1-entry catalog honest-but-disappointing, or fine?

It's not fine. "Honest" only works when users understand the framing ("this is a demo of the infra"). SMEs don't. They see a storefront with one item. Ship 6-8 curated Smithery entries — you don't have to own them, you just have to list the URLs. When Smithery's link breaks, yours will too, but that's a future problem and it's better than the current impression.

---

## What I'd ship this week

**Mon-Tue (Q1):**
- `shapes.tsx` with 4 generic output-shape renderers (stdout, image, markdown, table). Wire into `TOOL_RENDERERS` above defaults.
- Quick wins: `artifacts.ts` + `documents.ts` render blocks, screenshot `<img>` preview (will fall out of shape renderer).
- Extend `one-file-tool-definitions.md` with the three-tier requirement + add a CI test that walks `allDefinitions`.

**Wed-Thu (Q2):**
- Rewrite `BrowseDialog` to be the single "add integration" surface with Popular/Workspace/Advanced sections.
- Seed catalog with 6-8 Smithery entries (Linear, GitHub, Notion, Slack, Stripe, HubSpot, Airtable, Asana). ~30min to write entries.
- Purge "MCP" from all non-help copy. Rename "Browse apps" → "Add an integration".
- Add "what this lets your AI do" bullets to every catalog entry.

**Fri:**
- First-connection toast with an example prompt.
- Ship telemetry events for the connector funnel.
- Audit rerun — expect rich coverage to jump from 43% → 75%+ on the strength of the shape renderers alone.