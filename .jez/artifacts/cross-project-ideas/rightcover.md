# RightCover → vite-flare-starter: Cross-Project Ideas

**RightCover** (insurance broker AI fork) has discovered real product needs and architectural patterns worth porting back to the starter. This list prioritises ideas that are generalisable (not insurance-specific), battle-tested in production use, and solve problems other forks will encounter.

---

## 1. **Auto-load Skills (Ambient Knowledge in System Prompt)**

**Pattern:** Skills frontmatter field `auto_load: true` loads skill bodies into the system prompt at chat start.

**Where it's used:**
- `michael-broker-rules` — Michael's formatting constraints (no em dashes, AU dates, sign-off rules)
- `lake-macquarie-risk` — 50-suburb insurance risk reference data

**Why it matters:** 
Without this, the agent must discover and call `load_skill` on rules that should be ambient context. With auto-load, formatting constraints and domain knowledge are injected before the first turn, reducing early errors and token waste. Especially valuable for single-tenant or client-specific apps.

**Generalisability:** High — any starter user with mandatory client rules (HR compliance, brand voice, domain reference data) will benefit.

**Effort:** Small
- Add `auto_load: boolean` to `SkillFrontmatter` in `skills/loader.ts`
- Partition `buildSystemPrompt()` to fetch auto-load bodies and inject before catalogue
- Mark auto-loaded skills as `[always-loaded]` in catalogue so agent doesn't redundantly call `load_skill`

**Files:** `src/server/lib/ai/skills/loader.ts`, `src/server/lib/ai/skills/registry.ts`, `src/server/lib/ai/agent.ts`

---

## 2. **Cloudflare Email Routing Handler + Inbound Email Persistence**

**Pattern:** Dedicated email handler (`email()` export) parses inbound messages via `postal-mime`, stores PDFs to R2, creates `inbound_emails` row in pending state, hands off to a routine for async processing.

**Where it's used:**
- Michael forwards CBN INSIGHT invoices to `inbox@rightcover.au`
- Handler persists email metadata + PDFs within 1s
- Routine picks them up 30m later for extraction (decoupled, observable)

**Why it matters:**
- Email handlers are fast but unreliable if they do heavy lifting inline. Decoupling via pending state + async routine keeps handler < 1s.
- R2 attachment storage is cleaner than body bloat.
- Contact matching (sender → existing contact) happens at ingest, pre-enriching context for the routine.

**Generalisability:** High — any tool that needs to ingest external data (Slack, webhooks, email forwards, webhooks) should follow this pattern.

**Effort:** Medium
- Scaffold email handler module with postal-mime parser
- Add `inbound_emails` + schema migration
- Wire up `email()` export in `src/server/index.ts`
- Doc pattern: "Email + Async Routine Pattern"

**Files:** `src/server/modules/insurance/lib/email-handler.ts`, `src/server/modules/insurance/db/schema.ts`, `docs/ADDING_EMAIL_INBOUND.md` (already in upstream)

---

## 3. **Admin Agent + Admin Tools Module**

**Pattern:** Autonomous agent (`AdminAgent`) with approval-gated tools for managing other agents, routines, and deployment state. Removes manual UI clicks for "change persona", "cap budget", "toggle routine", "inspect agent runs".

**Where it's used:**
- `set_agent_persona` → propose persona change via chat
- `set_agent_model` → propose model switch with cost + capability trade-off
- `set_agent_budget` → propose daily USD cap
- `inspect_agent` → read full state (runs, cost, blocks, memory)
- `list_routines` / `inspect_routine` / `create_routine` → routine lifecycle via chat

**Why it matters:**
- Jez (and power users) can say "cap AdminAgent at $0.50/day" or "make AssistantAgent shorter" without opening the UI.
- Approval queue gates all writes — safety by default.
- Awareness tools (`list_my_agents`, `list_my_connections`, `list_my_spaces`) provide context without duplicating UI views.

**Generalisability:** Very high — any starter user running multiple agents or routines will want chat-driven admin.

**Effort:** Medium to Large
- Scaffold `admin-tools/` module with 3 tool factories: `agents.ts`, `routines.ts`, `awareness.ts`
- Wire up `/api/agent-instances` routes (already partially done in rightcover)
- Approval queue integration (already exists in starter)
- Test recursion guards (AdminAgent can't change AdminAgent persona mid-conversation)

**Files:**
- `src/server/modules/admin-tools/`
- `src/server/modules/agent-instances/routes.ts`
- `src/server/modules/autonomous-agents/admin-agent.ts`

---

## 4. **Agent Instances API (Per-User Agent State)**

**Pattern:** Query `agent_runs` for distinct (agentClass, agentName) tuples; expose RPC methods on AutonomousAgent (`getStatus`, `setPersona`, `setModel`, `setDailyBudget`) via HTTP routes.

**Where it's used:**
- `GET /api/agent-instances` — list user's agent instances + cost/run stats
- `GET /api/agent-instances/:class/:name` — one instance, full state (persona, budget, last run)
- `PATCH /api/agent-instances/:class/:name` — edit instance config

**Why it matters:**
- Single source of truth: DO storage holds instance state, routes expose it, chat + UI both use same API.
- Discovery: untouched-but-defined agent classes visible via `/api/agents/registered` (catalogue), used-but-not-registered instances visible via `/api/agent-instances` (personalisations).

**Generalisability:** High — any team running multiple agents needs to discover which ones exist and adjust them without code deploy.

**Effort:** Small
- Implement `/api/agent-instances` routes (dispatch on agentClass, call RPC methods)
- Schema: query agent_runs for distinct instances, optionally filter by user

**Files:** `src/server/modules/agent-instances/routes.ts`

---

## 5. **Delegate Batch Tool (Parallel Task Fan-out)**

**Pattern:** `delegate_batch` spawns N subagents in parallel (concurrency cap ~4) for identical task templates. Results come back as `{ label, text | error }[]`; individual failures don't fail the batch.

**Where it's used:**
- Michael drops 5 policy PDFs, asks for a summary → 5 parallel summariser subagents, ~30s vs ~3min serial
- "Classify each of these 8 emails" → fan-out, synthesise results

**Why it matters:**
- Chat-blocking latency for N=2–10 parallel tasks is acceptable; above that, defer to routine + approvals queue.
- Refactored `runOneSubagent()` factory shared between `delegate` and `delegate_batch` prevents drift.
- Error resilience: one failing PDF doesn't halt the entire batch.

**Generalisability:** High — any user processing batches of similar items will want parallel processing without deferring to routines.

**Effort:** Small
- Extract shared `runOneSubagent()` from existing `delegate` tool
- Add `delegate_batch` with concurrency cap (default 4, max 5 to stay under rate limits)
- Output schema: `{ role, results: { label, text | error }[] }`

**Files:** `src/server/modules/chat/tools/delegate.ts`

---

## 6. **Test-Auth Module (Headless Agent Sign-in)**

**Pattern:** Lightweight HTTP endpoints that mint real session cookies for test users via `better-auth.testUtils()`. Agents can sign in headlessly without blocking on human OAuth.

**Where it's used:**
- UX audit agents, regression runners need signed-in session to walk the app
- Without this, every audit run blocks on Jez (human) to sign in via Chrome

**Safety guards:**
1. Only loads if `TEST_AUTH_TOKEN` env var is set (production: no surface area)
2. Constant-time header comparison (`X-Test-Auth` header vs secret)
3. Test user email allowlist: `*@test.*.local` (can never mint session for real user)
4. Cleanup endpoint filters by test domain

**Generalisability:** Medium — mostly relevant for teams running headless audits. Critical for any CI pipeline that needs to test as a logged-in user.

**Effort:** Small
- Wrap `better-auth.testUtils()` in HTTP routes
- Require `TEST_AUTH_TOKEN` secret, guard all endpoints
- Doc: cascade-delete trap (reassigning real data to test user can accidentally delete it on cleanup)

**Files:** `src/server/modules/test-auth/routes.ts`, `.Codex/rules/test-auth-cascade-delete.md`

---

## 7. **Skill Editor with Unsaved Changes Guard + AI Sparkle Rewrite**

**Pattern:** Detail-route skill editor (`/dashboard/skills/:slug`) with:
- Side-by-side source + preview panes
- Unsaved-changes guard (beforeunload)
- AI Sparkle button: "make this shorter / add AU context / fix tone" → `propose_patch` flow
- History tab showing past edits

**Where it's used:**
- Michael tweaks renewal templates in-app without touching code
- AI rewrite proposals (one-click via Sparkle) cut manual editing by 50%

**Why it matters:**
Skills are too soft to embed in TypeScript; they should be user-editable markdown. The editor is the UX that makes that work. Sparkle rewrite (via a cheap model like Kimi K2.6) turns skill improvement into a conversation, not a code PR.

**Generalisability:** Very high — any system with user-facing markdown rules, templates, or playbooks needs this UX.

**Effort:** Medium
- Extend existing `/dashboard/skills/:slug` editor with unsaved-changes guard + Sparkle button
- Wire up `propose_patch` chat tool to pre-fill with skill edits
- ConfigDiffCard component already exists for approval flow

**Files:**
- `src/client/modules/skills/pages/SkillDetailPage.tsx`
- `src/server/modules/chat/tools/propose-patch.ts`
- `src/client/components/ConfigDiffCard.tsx`

---

## 8. **Skill Auto-load Catalogue Marking**

**Pattern:** Catalogue endpoint marks skills with `[always-loaded]` tag so agent knows not to redundantly call `load_skill`.

**Where it's used:**
- Agent sees `michael-broker-rules [always-loaded]` in catalogue, skips `load_skill` call
- Reduces token waste, faster turns

**Why it matters:**
Small optimisation with outsized effect on chat feel. When baseline rules are ambient, the agent jumps straight to task rather than discovering context.

**Generalisability:** Medium — nice-to-have polish for any app using auto-load skills.

**Effort:** Tiny
- Filter auto-load skills in `registry.ts`, add `[always-loaded]` annotation in catalogue
- One-line change in agent.ts system prompt builder

**Files:** `src/server/lib/ai/skills/registry.ts`

---

## 9. **Extended CORE_TOOL_NAMES for Structured Output**

**Pattern:** Add artifact + document generation tools to `CORE_TOOL_NAMES` so they're always-available without `find_tools` discovery.

**Where it's used:**
- `create_artifact` (HTML/SVG/Mermaid dashboards)
- `generate_docx` (Word documents)
- `generate_csv` (structured data export)

**Why it matters:**
When Michael asks "give me a comparison table" or "export as CSV", the agent shouldn't call `find_tools` first — these should be reflexive. Reduces latency + token waste for common requests.

**Generalisability:** High — any system generating reports or dashboards wants instant access to artifact + doc tools.

**Effort:** Tiny
- Add 3 tool names to `CORE_TOOL_NAMES` array
- One-line change

**Files:** `src/server/lib/ai/tool-search.ts`

---

## 10. **Artifact Tools (Visual Content in Chat)**

**Pattern:** `create_artifact` and `edit_artifact` tools emit HTML, SVG, or Mermaid code rendered inline in chat via sandboxed iframe. No asset upload, no latency — just complete self-contained code.

**Where it's used:**
- Charts, dashboards, interactive calculators
- Formatted reports (via marked.js for markdown → HTML)
- Diagrams

**Why it matters:**
Artifacts transform chat from text-only to interactive. CDN libraries (Chart.js, Leaflet, Three.js, D3.js) are available in HTML artifacts; agent can generate production-quality visuals in one turn.

**Generalisability:** Very high — artifact rendering is the next UX frontier for AI chat.

**Effort:** Medium to Large
- Implement artifact iframe sandbox in `MessageRenderer`
- Add `create_artifact` / `edit_artifact` chat tools
- Artifacts toolbar (expand, code/preview toggle, copy code)
- `ArtifactViewer` component
- Dark theme by default

**Files:**
- `src/server/modules/chat/tools/artifacts.ts`
- `src/client/modules/chat/components/MessageRenderer.tsx`
- `src/client/modules/chat/components/ArtifactViewer.tsx`

---

## 11. **Domain-Specific System Prompt Injection**

**Pattern:** Import system prompt from domain module (e.g. `RIGHTCOVER_SYSTEM_PROMPT` from `insurance/lib/system-prompt.ts`) instead of using starter default.

**Where it's used:**
- Insurance: Michael's formatting constraints (em dashes, AU dates, sign-off)
- Embeds mandatory constraints in the system prompt near the top, marked `(MANDATORY)`

**Why it matters:**
Ensures constraints can't be overridden by user chat or skills. System prompt is the right place for non-negotiable rules.

**Generalisability:** High — any vertical-specific fork needs to inject domain rules.

**Effort:** Small
- Create `src/server/modules/[domain]/lib/system-prompt.ts`
- Import in `src/server/modules/chat/routes.ts` (~line 123)
- Mark with `@fork-patch[domain-system-prompt]`

**Files:** `src/server/modules/chat/routes.ts`

---

## 12. **Capability Layering in Email Handler (Contact Enrichment)**

**Pattern:** Inbound email handler performs contact lookup (sender email → existing contact in entities) at ingest time, pre-enriching the pending row.

**Where it's used:**
- When Michael forwards a CBN INSIGHT email, the handler finds the matching contact and stores `contactId` in `inbound_emails`
- Routine picks it up with context already bound

**Why it matters:**
Avoids N+1 lookups later. Contact enrichment at ingest is fast and deterministic; doing it in the routine is wasteful.

**Generalisability:** Medium — relevant for any system ingesting external data that references your CRM.

**Effort:** Small
- Email handler queries `entities` table by sender email before inserting `inbound_emails`

**Files:** `src/server/modules/insurance/lib/email-handler.ts`

---

## 13. **Onboarding Module (Optional, Light-weight)**

**Pattern:** Minimal onboarding route that shows help text, primer links, and guided quick-start for new users. Optional feature flag.

**Where it's used:**
- First-time user landing, explains what the tool does

**Why it matters:**
Better than blank slate. Even single-tenant apps need a "here's how to get started" moment.

**Generalisability:** Medium — nice-to-have UX polish.

**Effort:** Small
- Create `src/server/modules/onboarding/routes.ts`
- Add `/dashboard/onboarding` page
- Feature-flag `showOnboarding` in config

**Files:** `src/server/modules/onboarding/`

---

## 14. **Routines Swapper + Awareness Tools in Admin Agent**

**Pattern:** Admin agent tools for listing, inspecting, creating, and pausing routines. Read-only awareness tools for available agents, MCP connections, and spaces.

**Why it matters:**
Power users can manage workflows via chat without UI. Awareness tools (list_my_agents, list_my_connections) provide just enough context to propose meaningful changes.

**Generalisability:** High — teams running agent swarms will want this.

**Effort:** Medium (covered under #3 Admin Agent)

---

## 15. **Skill Linting + Consistency Rules**

**Pattern:** Pre-save checks on skills: em-dash bans, AU English rules, brand voice checks (via cheap model).

**Where it's used:**
- Michael's #1 ask: no em dashes in output
- Enforced in system prompt + skill linter

**Why it matters:**
Prevents regressions. One linting rule catches thousands of future errors.

**Generalisability:** Medium — mostly for client-specific rules. Starter could ship a "linting hooks" framework.

**Effort:** Small
- Add lint hooks to skill save flow
- Regex for em dashes, configurable rules in schema

---

## 16. **Cascade-Delete Safeguard Documentation**

**Pattern:** Comprehensive guide on the test-auth cascade-delete trap (reassigning real data to test user can delete it all on cleanup).

**Where it's used:**
- `.Codex/rules/test-auth-cascade-delete.md` in rightcover
- Happened on rightcover: 759 contacts + 20 policies lost

**Why it matters:**
One-line doc saves forks from catastrophic data loss.

**Generalisability:** Very high — all forks using test-auth need this warning.

**Effort:** Tiny
- Add rule to starter `.Codex/rules/`

---

## Summary: Quick-Win Priorities for Starter

**Tier 1 (Ship Soon):**
1. Auto-load Skills (small, high impact)
2. Skill Editor unsaved-changes guard (small, already partially done)
3. Test-Auth module (small, critical for audit agents)
4. Delegate Batch tool (small, obvious win)

**Tier 2 (Q2 2026):**
5. Admin Agent + Admin Tools (medium, high value)
6. Agent Instances API (small, depends on #5)
7. Artifact Tools (medium, game-changer UX)
8. Email Inbound pattern doc (already done in starter as ADDING_EMAIL_INBOUND.md)

**Tier 3 (Polish):**
9. Skill auto-load catalogue marking (tiny)
10. Extended CORE_TOOL_NAMES (tiny)
11. Domain system prompt injection pattern (small, doc only)
12. Cascade-delete safeguard rule (tiny)

---

**Generated:** 2026-05-06  
**Source:** RightCover fork analysis (git log, module structure, commits 2026-04-30 to 2026-05-06)  
**Methodology:** Read PATCHES.md, recent commits, module inventory, key code patterns
