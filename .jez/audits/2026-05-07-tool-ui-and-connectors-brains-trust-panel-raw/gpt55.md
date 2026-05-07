# openai/gpt-5.5

_Tokens: in=34575 out=3771 cost=$0_

## TL;DR

**Q1:** Don’t make 140 bespoke renderers and don’t jump to iframe/MCP-UI yet. Ship a **tiered rendering contract**: every tool must have at least pill metadata; high-volume / high-pain output shapes must have a rich renderer; broad reusable “shape renderers” should cover markdown, code, tables, images, files, errors. Keep `_ui` for agent-authored interactive UI, not as the universal tool-result protocol.

**Q2:** The connectors flow is technically strong but first-time SME discoverability is not good enough. The page promises Gmail, Notion, Slack, “Browse apps”, etc., then the modal contains one ABR example and talks about MCP URLs. That is honest for a developer starter, but disappointing/confusing for a non-technical business owner. Convert more users by making Google/Microsoft the obvious first action, removing MCP jargon from primary copy, adding real popular app entries or task-based templates, and surfacing permission controls earlier.

---

## Q1 strategy

### Recommended path

Use a **3-tier rendering standard**, not “custom renderer for every tool”.

1. **Baseline requirement: no bare wrench**
   - Every `ToolDefinition` must include `render.displayName`, `icon`, and `summary` unless it is explicitly covered by a default renderer.
   - Today this is optional in the contract (`src/shared/agent/tool.ts`, render block around `render?:`), which is why the bottom 21% exists.
   - Extend `.claude/rules/one-file-tool-definitions.md`: new tools require a “rendering plan”.

2. **Reusable shape renderers before per-tool renderers**
   Add generic duck-typed renderers for common output shapes:
   - Markdown/body/frontmatter/resource → Skills + Knowledge.
   - `{ stdout, stderr, exitCode }` → code tools.
   - arrays/rows/columns → data tables.
   - image/screenshot URLs/base64 → image preview.
   - file/doc/artifact metadata → file card.
   - error-like shapes → consistent error card.

   This gives much better coverage than hand-coding 80 tiny renderers. The existing registry already supports predicate matchers (`ToolRenderer.match` can be a function in `tool-renderers/_shared.tsx`), so use that.

3. **Bespoke renderers only where UX carries product value**
   Keep custom domain renderers for Gmail, Calendar, Docs, Sheets, Slack, Notion, Atlassian, etc. The Gmail renderer is the right bar for product-critical tools (`tool-renderers/gmail.tsx`).

4. **Keep `_ui` for agent-generated UI, not tool results**
   `_ui` is excellent for interaction primitives: forms, choices, maps, comparison cards, confirmations (`src/server/modules/chat/tools/ui.ts`; dispatch in `ChatUiElement.tsx` and `InputTakeover.tsx`).
   
   But don’t make every normal tool return `_ui`. Tool outputs should stay semantic/domain-shaped. Otherwise you blur execution data with presentation and make downstream automation harder.

5. **Do not move to iframe MCP-UI now**
   MCP-UI/resource/iframe is useful for third-party untrusted rich apps, but it adds:
   - sandbox/CSP complexity,
   - auth/data-leak surface,
   - mobile sizing issues,
   - theming/accessibility inconsistency,
   - another protocol to support.

   You already have most of the value for native tools via structured outputs + React renderers + `_ui` elements. Consider MCP-UI later only for external MCP servers that want to return rich HTML resources.

### Trade-offs

- **Require renderer for every tool:** too rigid if “renderer” means bespoke React. Good if it means “metadata + explicit fallback class”.
- **Bulk-fix high-pain tools:** yes. That gives immediate transcript quality improvement.
- **Universal `_ui`:** tempting, but wrong abstraction for tool execution results.
- **MCP-UI iframe:** future extensibility, not this quarter’s leverage.
- **Generic renderers:** best ROI, but need careful precedence so they don’t override polished domain renderers. Keep them late in `TOOL_RENDERERS`, before raw defaults and after bespoke renderers (`tool-renderers/index.ts`, default renderers are already last).

### Concrete first move

Ship a **“Tool UI Phase 1” PR**:

1. Add render blocks for `artifacts.ts` and `documents.ts`.
2. Add `skills-knowledge.tsx` renderer for `load_skill`, `list_skills`, `knowledge_search`, `load_knowledge`.
3. Add `code.tsx` renderer for `run_python`, `run_shell`, `run_js`.
4. Add `browser.tsx` renderer for screenshot/image preview + extracted JSON/table.
5. Add `data.tsx` generic tabular renderer.
6. Add CI/audit script:
   - fail if a registered tool has neither custom renderer, `_ui`, default renderer, nor server render metadata;
   - warn if expanded body falls back to JSON for high-output tools.

Target: move from **43% rich / 21% bare** to roughly **65–75% acceptable rich-ish UX** in one week.

---

## Q2 connectors

### Strengths

- The main page explains the value in user language: connect apps so AI can read/act.
- Google Workspace and Microsoft 365 are surfaced as first-class workspace integrations, which is right for SMEs.
- The custom MCP infrastructure is strong: OAuth, bearer fallback, encrypted tokens, per-tool policies (`mcp-connections/routes.ts`).
- Per-tool controls are a real differentiator: `always / ask / never`, read vs write grouping (`ConnectionDetail.tsx`, write heuristic near `WRITE_HINTS`).

### Weaknesses / confusing bits

1. **“Browse apps” over-promises**
   The modal is titled “Connector examples” and contains one ABR entry (`connector-catalog.ts`, `MCP_CATALOG`). That feels like a bait-and-switch after the page says Gmail, Calendar, Drive, Notion, Slack.

2. **ABR is a poor first SME example**
   It proves the plumbing but does not map to common first jobs: “connect my email”, “connect accounting”, “connect CRM”, “connect project tracker”.

3. **MCP jargon leaks into primary UX**
   The modal copy says “public MCP servers”, “Smithery”, “Anthropic reference servers”, “self-hosted Workers” (`ConnectorsPage.tsx`, `BrowseDialog`). That is developer copy, not SME owner copy.

4. **Empty state copy is okay but mismatched**
   “Click Browse apps to see ready-made connections” is weak when there is one example. Also the button label says **Add custom**, but the empty state says **Add custom app**.

5. **Permission granularity is hidden**
   Users only discover tool-level controls after connecting and clicking Configure. The safety story should appear before connect: “You can choose read-only, ask first, or block write actions.”

6. **Workspace integrations and connected apps feel split**
   Native Google/Microsoft cards live outside “Connected apps”. A user might connect Google but still see an empty MCP connected-apps section and wonder if it worked, depending on implementation details.

### Prioritised changes

#### P0 — Fix language and first action

- Change primary CTA from **Browse apps** to either:
  - **Connect an app**, if the catalog becomes real, or
  - **Browse examples**, if it remains one-entry.
- Change **Add custom** to **Add connection URL** or **Connect by URL**.
- Remove “MCP” from primary copy. Use:
  - “connection URL”
  - “custom connector”
  - “secure app connection”
- Keep MCP in an advanced disclosure/help text only.

#### P0 — Make Google/Microsoft the obvious first conversion

Add an onboarding card above both sections:

> Start here  
> Connect your email, calendar, and files so your AI can answer questions and draft work from your business context.

Buttons:
- **Connect Google Workspace**
- **Connect Microsoft 365**
- **I use another app**

This will convert better than sending first-timers into a one-item MCP catalog.

#### P1 — Make the catalog useful or rename it honestly

If this is a product for SMEs: ship at least 6–10 credible entries.

Suggested starter catalog:
- GitHub
- Linear
- Slack
- Notion
- Stripe
- Airtable
- HubSpot
- Shopify
- Xero / QuickBooks, if target market is SME
- Postgres / Google Drive only if connection flow is genuinely easy

If these are public Smithery/community connectors, mark clearly:
- “Third-party”
- auth type
- permissions summary
- “opens provider sign-in”
- reliability caveat if needed

If you don’t want maintenance burden, don’t pretend it is an app store. Rename to **Examples** and make **Connect by URL** the dominant path for technical users.

#### P1 — Surface permissions before and after connect

In each catalog card show:

- “Tools discovered after connect”
- “Write actions ask first”
- “You can disable individual tools”

After successful connection, auto-open `ConnectionDetail` instead of just closing/toasting. That exposes the good part: per-tool controls (`ConnectionDetail.tsx`).

#### P2 — Add task-based discovery

For SME users, app names are less powerful than outcomes:

- “Read and draft email”
- “Schedule meetings”
- “Search company docs”
- “Create invoices”
- “Track support tickets”
- “Update CRM contacts”
- “Report on sales/payments”

Each maps to recommended providers/connectors.

---

## What I’d ship this week if it were my project

### Tool UI

1. Add generic renderers:
   - `skills-knowledge.tsx`
   - `code.tsx`
   - `browser.tsx`
   - `data.tsx`
   - `files-artifacts-documents.tsx`
2. Add render metadata for all bottom-tier bare tools.
3. Add CI script/report: “tool rendering coverage”.
4. Update the tool-definition rule:
   - every new tool needs `render` metadata;
   - high-output tools need `expanded` or registered renderer;
   - `_ui` only for intentional user-facing UI elements.

### Connectors

1. Rewrite copy:
   - remove MCP from main page/modal;
   - “Browse apps” → “Connect an app” only if the catalog gets real entries;
   - otherwise “Browse examples”.
2. Add first-run CTA focused on Google/Microsoft.
3. Auto-open permissions after first connection.
4. Add a short permissions promise near CTAs:
   > You stay in control: read-only tools are on by default; write/delete actions ask first.
5. Either:
   - add 6–10 real popular catalog entries, or
   - keep one ABR entry but reposition it as a developer example, not “apps”.

My bias: **for a starter aimed at builders, one ABR example is defensible. For a first-time SME owner, it is not enough.**