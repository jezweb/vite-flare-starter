# rightcover → vite-flare-starter pattern review

**Date:** 2026-05-04  
**Status:** Ready for decision  
**Owner:** Jez (Jeremy Dawes)  
**Related:** rightcover (github.com/jezweb/rightcover), PATCHES.md convention  

---

## Headline

RightCover demonstrates three patterns worth folding back: (1) **system-prompt assembly with mandatory formatting constraints** moved to a dedicated module (vs inline in agent.ts), enabling client-specific guardrails to survive skill changes; (2) **structured email inbound handling via Cloudflare Email Routing with postal-mime parsing and async triage** — a reusable pattern for any app needing webhooks from email; (3) **routine templates scoped to concrete domain workflows** with example inputs, tool allow-lists, and optional localFireHour gating — better than the upstream starter examples because they describe production patterns, not generic demos.

Domain-specific patterns (policy analyses, always-load user-rules skills, renewal-template families) teach structural lessons but don't need code changes upstream — documentation is sufficient.

---

## A — Improvements to upstream primitives

### A1. System Prompt Assembly Module

**Name:** Domain-scoped system prompt factory  
**Why it's better:** RightCover moves the system prompt out of inline strings in `buildChatAgent` and into a dedicated module (`src/server/modules/insurance/lib/system-prompt.ts`). This is a small file (80 lines) with a single export: `RIGHTCOVER_SYSTEM_PROMPT`. Benefits:
- Client-specific guardrails (no em dashes, AU dates, mandatory sign-offs) are centrally editable without touching agent.ts.
- Formatting constraints sit in a "MANDATORY" section near the top, not scattered across skills.
- The pattern scales: multi-tenant apps can export `getSystemPrompt(tenantId)` instead of a constant.
- Upstream chat route can override via `buildChatAgent({ systemPrompt: customPrompt })` — already wired, just never used this cleanly before.

**Where to find it:** `/Users/jez/Documents/rightcover/src/server/modules/insurance/lib/system-prompt.ts`

**Suggested upstream shape:**  
Keep the override mechanism in `buildChatAgent` (it already exists). Document in `AGENTS.md` that domain modules should export a `getSystemPrompt()` function and pass it as:
```typescript
const systemPrompt = await insurance.getSystemPrompt(userId)
const { agent } = await buildChatAgent({ env, userId, systemPrompt })
```
Example: "If your app has client-specific formatting rules (e.g. no em dashes, AU English), author them in a module-scoped prompt file and import at the chat route level."

**Effort:** S (add docs + example section in agent.ts comment, no code change)  
**Confidence:** High (already wired, just undiscovered pattern)

---

### A2. Email Inbound Handler — Cloudflare Email Routing Integration

**Name:** Structured email ingestion via Email Routing + postal-mime + R2 + DB  
**Why it's better:** RightCover's `handleInboundEmail` (in `src/server/modules/insurance/lib/email-handler.ts`) is production-grade because it:
- Parses raw SMTP with postal-mime (handles MIME boundaries, attachments, encoding).
- Detects forwarded emails (looks for "Fwd:", "Original message", "From:" patterns).
- Extracts original sender email using regex (handles both `<addr>` and bare address formats).
- Looks up contact by sender email (single-tenant, but pattern generalizes).
- Stores PDFs to R2 with structured keys (`inbound/{inboundId}/{fileId}-{filename}`).
- Creates `inbound_emails` row in **pending** status for async processing.
- The async triage routine (`inbound-triage`) picks it up on its next fire — keeps the email handler fast and reliable.
- Comprehensive structured logging (JSON, tagged events).

Upstream has email module and email routing, but no inbound webhook handler. This fills that gap.

**Where to find it:** `/Users/jez/Documents/rightcover/src/server/modules/insurance/lib/email-handler.ts`

**Suggested upstream shape:**  
Create `docs/ADDING_EMAIL_INBOUND.md` with:
1. Wiring in `src/server/index.ts` (`async email(message, env, ctx)` export).
2. Example handler scaffold using postal-mime.
3. Pattern: parse → store → queue pending record → let a routine handle async extraction.
4. Link to RightCover's schema (`inbound_emails` table) as a concrete reference.

Or ship a skeleton `src/server/modules/email-inbound/handler.ts` that forks can override.

**Effort:** M (docs + optional scaffold template)  
**Confidence:** High (actively running in production, multiple constraints confirmed)

---

### A3. Concrete Routine Templates with Domain Context

**Name:** Production routine templates instead of generic examples  
**Why it's better:** RightCover's `ROUTINE_TEMPLATES` in `src/shared/config/routine-templates.ts` has only 2 templates (`renewal-scanner`, `inbound-triage`) instead of the upstream's ~5 generic examples (morning-brief, youtube-digest, routine-health). The RightCover templates are concrete:

1. **renewal-scanner:** daily, 8am AEST fixed, uses `renewal-scan` skill + `list_renewals` tool, emits inbox findings grouped by `renewal_batch_id`. The `inputText` is a detailed paragraph describing exactly what the agent should do (not vague instructions).

2. **inbound-triage:** every 30 minutes, processes `inbound_emails` with status=pending, analyzes PDFs, emits findings.

Both templates include:
- `adjustMode: 'fixed'` (not 'suggested') — confirms the schedule is intentional, not a default.
- Specific tool allow-lists (`['list_renewals', 'inbox_add', 'find_tools']`) — teaches the pattern of gating tools rather than trusting all-or-nothing.
- Skill names that match code (no ambiguity).
- Input text that reads like a spec, not a chat prompt.

The upstream morning-brief is useful as a walkthrough, but adding 1-2 concrete examples of "here's a domain workflow you'd actually ship" would improve confidence.

**Where to find it:** `/Users/jez/Documents/rightcover/src/shared/config/routine-templates.ts`

**Suggested upstream shape:**  
Keep the existing templates. Add a new section in `docs/ROUTINES.md` called "Example: Email Triage Routine" that explains the pattern of:
- Async queueing (parse email → pending record).
- Routine wakes up on an interval.
- Routine checks for pending records.
- Routine calls domain tools (analyse_policy or equivalent).
- Routine marks complete.

OR ship a second template alongside the existing ones, labeled "Production Example: Email Processing Routine" — intentionally concrete, not instructional.

**Effort:** S (docs only, or add 1 template)  
**Confidence:** High (proven in single-tenant deploy)

---

### A4. @fork-patch Convention Tooling (Optional)

**Name:** Patch discovery and drift detection  
**Why it's worth considering:** RightCover faithfully uses the `@fork-patch[id]` convention (15 instances), and PATCHES.md lists all 10 active patches. RightCover CLAUDE.md and PATCHES.md reference is comprehensive. This is working as designed.

**Optional enhancement:** A simple CLI tool (or GitHub Action) that:
- Scans the codebase for `@fork-patch\[` comments.
- Compares the list to entries in PATCHES.md.
- Warns if a marker exists without an entry, or vice versa.
- Runs on CI for fork repos (optional).

This is **not essential** (the convention is self-documenting), but would be a nice-to-have for teams maintaining multiple forks.

**Effort:** M (shell script or Node.js tool, optional CI integration)  
**Confidence:** Low (nice-to-have, not blocking)

---

## B — Patterns worth documenting upstream

### B1. Policy Analyses Versioned Table

**Name:** Versioned entity extractions (generic shape)  
**Domain example:** `policy_analyses` table in RightCover  
**Pattern:** Any app that needs to track "extracted structured data from a source document over time" can generalize this shape:

```
entity_analyses
├── id: UUID
├── entity_id: FK to entities / documents / generic type
├── extracted_data: JSON (schema varies per entity_type)
├── ai_model: string (which model ran the extraction)
├── previous_analysis_id: FK to self (version chain)
├── created_at, updated_at: timestamps
```

RightCover's `policy_analyses` has:
- `policy_id` → `policyId` (specific)
- `coverage_details`, `exclusions`, `flags` → JSON fields (type-specific, but schema-validated by Zod elsewhere)
- `previous_analysis_id` → links to prior extraction (version history)

**Why it's a lesson:** Forks building CRM, document processing, or invoice extraction apps will recognise this pattern. Documenting it (with the optional Zod schema per entity_type) gives them a head start.

**Where to find it:** `/Users/jez/Documents/rightcover/src/server/modules/insurance/db/schema.ts` (lines 67–100)

**Suggested upstream shape:**  
Add to `docs/PATTERNS.md` a subsection "Versioned Entity Extractions":
- Explain the use case (AI extraction, approval workflow, change tracking).
- Show the schema skeleton.
- Reference RightCover's implementation as a concrete example.
- Note: schema varies per entity_type; use Zod or TypeScript to define per type.

**Effort:** S (docs only)  
**Confidence:** High (obvious generalization)

---

### B2. Always-Load User Rules Skill

**Name:** Per-user hardcoded rules skill (user configuration pattern)  
**Domain example:** `michael-broker-rules` skill in RightCover  
**Pattern:** A skill that is **always loaded in every agent session** (not optionally loaded by the user). It contains rules, decisions, and client preferences that the model must apply. This differs from a regular skill because:
- It's auto-loaded (not discovered by the agent).
- It's treated as read-only config, not user-editable markdown (though it could be in a future fork).
- It's the mechanism for encoding "non-negotiable operating rules" (no em dashes, AU dates, sign-offs).

RightCover does this by:
1. Listing `michael-broker-rules` in the system prompt as a pre-loaded skill.
2. Ensuring the skill is always in the skill catalog (never disabled).
3. The skill content is versioned (migrated from clawhq, tracked in git).

**Why it's a lesson:** This pattern decouples "mandatory client constraints" (which belong in the system prompt) from "how the agent invokes them" (skills are better). Multi-tenant apps especially will benefit: tenant A might require "no exclamation marks", tenant B might require "French language output" — both can be encoded as always-loaded tenant-specific skills.

**Where to find it:** `/Users/jez/Documents/rightcover/skills/michael-broker-rules/SKILL.md` (729 lines, comprehensive broker knowledge)

**Suggested upstream shape:**  
Add to `docs/AGENT_PLAYBOOKS.md` a subsection "Client Configuration Skills":
- Explain the pattern: always-loaded, pre-initialized skill for non-negotiable rules.
- Show how to mark a skill as "always load" (could be a YAML frontmatter field `always_load: true`).
- Reference RightCover's `michael-broker-rules` as a complete example.
- Note: upstream's system prompt has space for this (the `extraSections` cascade in buildChatAgent already injects skill names).

**Effort:** S (docs only)  
**Confidence:** High (proven pattern, already working)

---

### B3. Skill Template Families

**Name:** Domain-specific skill template sets  
**Domain example:** 8 `renewal-review-*` skills in RightCover (home, landlord, motor, business, etc.)  
**Pattern:** When a domain has multiple **variants of the same workflow** (email template, extraction schema, review questions), encode each variant as a skill with a consistent structure:

```
skills/
├── renewal-review-home/
│   └── SKILL.md
├── renewal-review-landlord/
│   └── SKILL.md
├── renewal-review-motor/
│   └── SKILL.md
└── …
```

Each skill:
- Has the same frontmatter metadata (`name`, `description`).
- Follows the same template structure (header, workflow, rules).
- Differs only in the type-specific content (CPI rules, cover types, extra fields).
- Is discovered and loaded by the agent on-demand.

This is **better than** a single skill with branching logic or a separate config file because:
- Each skill is versioned independently.
- The agent can load the right skill by name without guessing.
- Editing one template doesn't risk breaking others.
- New forks can add a new type without refactoring shared code.

**Where to find it:** `/Users/jez/Documents/rightcover/skills/` (8 renewal-review-* skills)

**Suggested upstream shape:**  
Add to `docs/AGENT_PLAYBOOKS.md` a subsection "Skill Template Families":
- Explain when to use a family (multiple type-specific workflows).
- Show the naming convention (`<workflow>-<type>`).
- Example: "If your CRM has 5 types of contacts, create 5 skills instead of 1 skill with 5 branches."
- Reference RightCover's renewal-review family as a complete worked example.

**Effort:** S (docs only)  
**Confidence:** High (self-evident pattern, proven)

---

### B4. Daily Renewal Scanner Routine

**Name:** Periodic workflow scanner with grouped findings  
**Domain example:** `renewal-scanner` routine in RightCover  
**Pattern:** A routine that:
1. Scans a data table (policies) for items matching a condition (expiring in N days).
2. Groups results (by client, by batch).
3. Emits **one finding per group** (not N findings).
4. Surfaces actionable next steps in the inbox.

This is a concrete pattern for "watch something, emit findings." Upstream's `ROUTINES.md` describes the abstraction well, but a worked example helps.

**Where to find it:** `/Users/jez/Documents/rightcover/src/shared/config/routine-templates.ts` (lines 55–71)

**Suggested upstream shape:**  
Add to `docs/ROUTINES.md` a section "Worked Example: Daily Renewal Scanner":
- Copy the renewal-scanner template definition.
- Explain the logic (scan for expiring policies, group by client, emit one finding per group).
- Reference the skill (`renewal-scan`) that does the logic.
- Show the `inputText` as a spec example: "This is how you communicate workflow intent to an autonomous agent."

**Effort:** S (docs only, copy from routine-templates.ts)  
**Confidence:** High (concrete, working example)

---

## C — Rightcover-specific, leave alone

These patterns are tied to insurance domain and shouldn't go upstream. Brief rationale:

| Pattern | Why leave it |
|---------|-------------|
| **Policy & analysis schema** | Insurance-specific. Upstream should document the generic versioned-extraction shape (B1), not ship insurance tables. |
| **Invoice extraction tools** (`analyse_policy`, `extract_schedule`) | Domain-specific Zod schemas for insurance documents. Reusable **pattern** is versioned extractions (B1). |
| **Insurance email triage** | Uses insurance-specific context (policy PDFs, contact matching to policies). Upstream should ship the generic email inbound handler (A2), forks adapt it. |
| **Renewal review email templates** | Insurance jargon, AU regulatory compliance, CPI rules, policy types, insurer quirks. Not portable. |
| **Michael's broker rules skill** | Client-specific decisions, Allianz quirks, lake macquarie regional risks. This is configuration, not a platform feature. |
| **8 renewal-review-* skills** | Insurance domain knowledge. Upstream documents the **skill template family pattern** (B3), forks author domain-specific families. |
| **Inbound email routing to inbox@rightcover.au** | Domain routing. Upstream handler (A2) is generic; fork wires it to their own domain/inbound address. |
| **Feature flags** (spaces, voiceAgent, etc. disabled) | Single-tenant deploy preferences. Upstream feature flags already work correctly. |
| **Chat chips** | Insurance-specific suggestions (Renewals, Analyse, Draft, Find). Upstream chips are generic; forks override in config. |

---

## Recommended action

**Top 3 specific changes, ranked by ROI:**

### 1. **Document system-prompt assembly pattern (A1)** — ROI: High, Effort: Low
Add a section to `docs/AGENTS.md` showing how to author domain-scoped system prompts and pass them to `buildChatAgent`. Include the note: "If your domain has client-specific formatting rules or mandatory constraints, author them in a module-scoped file and override the systemPrompt parameter."

**Files to touch:**
- `docs/AGENTS.md` (add subsection "Domain-Scoped System Prompts")
- Optional: Example comment in `src/server/lib/ai/agent.ts` near the systemPrompt parameter

**Why:** Every client fork will eventually have domain-specific guardrails. This surfaces the already-wired override mechanism.

---

### 2. **Ship email inbound handler scaffold + docs (A2)** — ROI: High, Effort: Medium
Add `docs/ADDING_EMAIL_INBOUND.md` with:
- Explanation of the pattern (Email Routing → handler → parse + store → async triage).
- Copy of RightCover's `email-handler.ts` (or a simplified version) as a scaffold.
- Schema for `inbound_emails` table (reference RightCover's).
- Wiring in `src/server/index.ts`.

**Files to touch:**
- New: `docs/ADDING_EMAIL_INBOUND.md`
- Optional: `src/server/modules/email-inbound/handler.ts` (scaffold)

**Why:** Email is a common ingestion point. RightCover's handler is production-tested. Documenting it with a scaffold saves the next fork 3 days of work.

---

### 3. **Concrete routine examples in ROUTINES.md (B4 + A3)** — ROI: Medium, Effort: Low
Expand `docs/ROUTINES.md` with:
- **Section: "Worked Example — Email Triage Routine"** (copy `inbound-triage` template, explain the pattern).
- **Section: "Worked Example — Daily Scanner with Grouping"** (copy `renewal-scanner` template, explain grouping by batch_id).

These demonstrate the pattern in a production context, not as a generic walkthrough.

**Files to touch:**
- `docs/ROUTINES.md` (add 2 subsections)

**Why:** Upstream's ROUTINES.md is strong on abstraction. Adding 2 worked examples increases confidence for fork authors.

---

**Optional (lower priority):**

- **B1 (Versioned extractions):** Add subsection to `docs/PATTERNS.md` under "Database Patterns". 1 page, no code changes.
- **B2 (Always-load skills):** Mention in `docs/AGENT_PLAYBOOKS.md` under "Client Configuration". 1-2 paragraphs.
- **B3 (Skill families):** Mention in `docs/AGENT_PLAYBOOKS.md` under "Multi-Type Workflows". 1-2 paragraphs.
- **A4 (Patch tooling):** Punt — the convention works as-is. Consider only if 3+ forks exist and maintenance burden rises.

---

## Honest concerns

### Unproven at scale
- RightCover is 3 weeks old (forked 2026-04-30). The patterns work in single-tenant, single-user context. Multi-tenant or high-concurrency apps may surface issues:
  - Email handler assumes single tenant (picks first admin). Needs parameterization for multi-tenant.
  - Routine templates assume specific agent classes (AssistantAgent). Other AutonomousAgent subclasses may have different needs.
  - System prompt assembly doesn't show how to merge tenant-scoped + user-scoped + project-scoped constraints (though buildChatAgent already cascades them).

### Missing inverse patterns
- How does a fork **disable** a feature that's normally on? RightCover disables spaces/voiceAgent via feature flags, but doesn't show how to disable, e.g., the morning-brief routine template if it's not relevant to the domain.
- Patch A2 (email handler) doesn't address failure modes: what if postal-mime fails? What if R2 is unreachable? RightCover logs and drops (safe), but upstream docs should cover retry strategies.

### Skill organization
- RightCover's 14 skills are manually maintained. No indication whether they should be auto-discovered, or whether the "always-load michael-broker-rules" pattern scales to "always-load 3 skills". Upstream's skill discovery mechanism is good, but the pattern of "pre-load a canonical skill set" needs more testing.

### No performance baseline
- Email handler stores each PDF to R2 + creates files row + inbound_emails row. No measurement of latency (should be <500ms even with 3 DB writes + 1 R2 put). Upstream should include a note: "This pattern is optimised for <1s email handler latency — if R2 or D1 are slow, consider moving to a queue."

---

## Summary

**What should Jez do:**

1. **Merge actions 1–3 above.** They're low-effort, high-confidence, and unblock the next fork author by 2–3 weeks. Start with A2 (email handler docs) because email is a common pattern. Then A1 (system prompt), then B4 (routine examples).

2. **Don't ship insurance code upstream.** Domain module (policies, analyses, tools) stays in rightcover. Upstream ship patterns (system prompt assembly, email inbound, routine templates) and docs.

3. **Watch rightcover for 4–8 weeks.** After single-tenant single-client deploy stabilises, revisit whether the patterns hold. If a second fork copies the email handler and routine template pattern successfully, confidence in A2 + B4 moves to High + Ready.

4. **Optional:** If Jezweb builds 3+ forks, invest in A4 (patch tooling). Until then, the @fork-patch convention is sufficient.

---

**Bottom line:** RightCover doesn't have groundbreaking innovations. It demonstrates **solid engineering discipline** in a real domain (insurance broker automation). The patterns are _proven enough to document and reuse_ (A1–A3, B1–B4). Shipping docs and a scaffold will pay dividends on the next fork without risking upstream stability.

