# Cross-Project Ideas from Kindling

**Kindling (2026-04-15):** Content creation companion for SMEs. Users collect raw material (hopper) throughout their week, then use AI writing sessions to turn it into newsletters, blog posts, and social content. Differentiator: voice profile (writing samples + audio recordings) → AI-generated voice injected into all output.

---

## 1. **AI SDK Standards Adoption (Phases 0–E)**

**Pattern:** Complete overhaul of tool calling contracts and observability (`ai-sdk-standards-adoption-plan-2026-04-22.md`)

- **Phase 0:** Unified `ToolDefinition<Input, Output>` contract with server `execute`, Zod schemas, and optional client render metadata in one object
- **Phase A:** Strict output schemas (`z.union([success, error])`) on all 51 tools; inferred types eliminate duplicate type definitions
- **Phase B:** Per-tool telemetry via `onStepFinish` + D1 `ai_tool_calls` table; admin panel shows tool errors from last 24h
- **Phase C:** Sources UX (`SourcesFooter` component) aggregates citations from search tools; collapses at 8+ items
- **Phase D:** `experimental_repairToolCall` + `toModelMessages` pruner + `computeActiveTools()` filters privileged tools (email send, delete, shell) unless unlock keywords present
- **Phase E:** `prepareStep` injection + structured output renderers

**Benefit:** Type safety end-to-end, observability into tool behaviour, cost reduction via token pruning, safety gates on destructive operations, sources attribution without manual effort.

**Effort:** 3–4 sessions (phases can be merged; Phase A is hardest). Code review found 7 critical bugs; framework handles them systematically.

**Files:** `src/server/lib/ai/agent.ts`, `src/shared/agent/tool.ts`, all 23 tool files, `src/client/modules/chat/components/SourcesFooter.tsx`

---

## 2. **Defence-in-Depth Auth Allowlist**

**Pattern:** Better-auth hardened with three layers of user-creation gating (`src/server/modules/auth/index.ts`)

- Layer 1: Google Cloud Console "Internal" user type (OAuth consent screen)
- Layer 2: `ENABLE_EMAIL_LOGIN=false` by default (email/password disabled)
- Layer 3: `ALLOWED_AUTH_EMAILS` + `ALLOWED_AUTH_DOMAINS` allowlist (optional env vars)

**Also:** `testUtils` plugin from better-auth + `DEV_AUTH_SECRET`-gated sign-in route for dev/E2E without email delivery.

**Benefit:** Three gates mean a misconfigured Google project alone doesn't leak signups. Useful for internal tools or phased rollout.

**Effort:** 1 session. Already baked into Kindling's auth setup; only needs porting the allowlist logic.

**Files:** `src/server/modules/auth/index.ts` (lines 46–160), `src/server/modules/auth/cleanup.ts` (new endpoint to clear test users)

---

## 3. **Hopper Module — Multi-Type Content Intake**

**Pattern:** Unified collection system for diverse media types (`src/server/modules/hopper/routes.ts`, `src/client/modules/hopper/`)

- 5 item types: text, link, photo, audio, file
- Per-type validation (max 50KB text, max 25MB audio/photos)
- Filtering: by type, starred status, full-text search, pagination

**Background Tasks:**
- OG scraping on link saves (HTMLRewriter-based, 10s timeout, extracts title/description/image)
- Image EXIF stripping before R2 upload (GPS coordinates leak home addresses)
- YouTube transcript + summary extraction (Gemini 3 Flash, soft-fail if no API key)

**Benefit:** Hopper becomes the "collection inbox" for any fork that needs to gather raw material (not just writing). OG + EXIF handling are reusable utilities.

**Effort:** 1–2 sessions. Hopper is self-contained; only dependency is R2 file upload (already in starter).

**Files:** `src/server/modules/hopper/routes.ts`, `src/server/modules/hopper/og-scraper.ts`, `src/server/modules/hopper/strip-exif.ts`, `src/server/modules/hopper/youtube-extractor.ts`, `drizzle/0010_hopper.sql`

---

## 4. **OG Metadata Scraper (HTMLRewriter)**

**Pattern:** Lightweight link enrichment via `scrapeOg()` utility

- **Key advantage:** Uses Workers-native HTMLRewriter, no extra dependency
- **Strategy:** Stream response, parse `<head>` only (stop at `<body>`)
- **Timeout:** 10s abort (keeps `waitUntil()` bounded)
- **Fallback:** Returns null for non-HTML, timeouts, 403s — caller uses OG field defaults

**Benefit:** Enriches link cards with title/description/image without blocking the save. Prevents link rot (metadata fetched at save time, not render time).

**Effort:** 30 min to port. Pure utility, zero dependencies.

**Files:** `src/server/modules/hopper/og-scraper.ts`

---

## 5. **Image EXIF/XMP Stripping**

**Pattern:** Privacy-preserving image upload via `stripImageMetadata()` (JPEG + PNG support)

- **Why critical:** EXIF GPS coordinates leak home addresses + client sites
- **How:** Byte-walk JPEG marker chain, skip APP1 (EXIF/XMP) + APP13 (Photoshop IPTC), keep APP0 (JFIF) + APP2 (ICC profile for colour accuracy)
- **Workers-native:** No Pillow, no Cloudflare Images binding, pure Uint8Array manipulation

**Benefit:** Strips metadata at upload time (solves at source, not per-export). One-line integration into file upload routes.

**Effort:** 30 min. Pure utility, no DB changes.

**Files:** `src/server/modules/hopper/strip-exif.ts`

---

## 6. **YouTube Transcript Extraction**

**Pattern:** Direct Gemini API call with public YouTube URL → transcript + summary

- **Pattern lifted from:** youtube-mcp project
- **Advantage:** No transcript scraping, no API quota gymnastics
- **Soft-fail:** Returns null if GEMINI_API_KEY unset or URL invalid; caller falls back to OG scrape
- **Fit:** Hopper item enrichment; makes video links as useful as text notes

**Benefit:** Users can drop a YouTube link and get instant transcript + summary without copy-paste.

**Effort:** 30 min to port. Optional feature (no-op if API key unset).

**Files:** `src/server/modules/hopper/youtube-extractor.ts`

---

## 7. **Context Module — Voice + Business Profile**

**Pattern:** Dual-profile system for personalisation (`src/server/modules/context/routes.ts`)

- **contextProfile:** Business name, description, industry, audience, location, writing tone/humour/formality, spelling locale (en-au/us/gb/nz)
- **voiceProfile:** Audio recordings + writing samples → AI analyses both → `styleSummary` (prose description of user's voice)
- **contextSamples:** Stored writing examples (markdown)

**Upsert logic:** Profile auto-creates on first read (no null-checks in client code needed).

**Benefit:** Reusable for any fork that needs "know the user" system prompts (not just Kindling). Voice analysis is done server-side, only style summary sent to chat.

**Effort:** 1 session. Schema + routes; voice-analysis endpoint likely already exists in starter (ambient-notes pattern).

**Files:** `src/server/modules/context/routes.ts`, `src/server/modules/context/db/schema.ts`

---

## 8. **Writing Context Builder**

**Pattern:** System prompt injection from hopper + voice + profile (`src/server/modules/hopper/writing-context.ts`)

- `buildWritingContext()` — full prompt for chat system role
- `summariseWritingContext()` — lightweight summary for UI (items + char count + profile flags)
- Locale-aware writing guides loaded via Vite `?raw` imports (e.g., `getWritingGuide('en-au', 'casual')`)

**Benefit:** Separates content aggregation from prompt construction. Reusable for other "write in voice of X" workflows.

**Effort:** 30 min to port (assumes starter has writing guides already).

**Files:** `src/server/modules/hopper/writing-context.ts`, `src/server/lib/writing/index.ts` (guides)

---

## 9. **Buddy Module — Conversational Companion with Voice**

**Pattern:** Persistent, stateful voice agent with persona (`src/server/modules/buddy/`, build spec in `.jez/artifacts/buddy-pivot-build-spec-2026-05-05.md`)

- **Core:** `KindlingBuddySession` Durable Object (voice agent) + WebSocket for streaming transcripts + React provider
- **Persona:** Dynamic system prompt via `buildBuddyPrompt()` — injects user context, recent conversation, focussed artefact, voice profile
- **Extraction:** Per-utterance LLM pass extracts hopper items from speech + generates reply
- **TTS:** Aura 2 voice with user-selectable speaker names
- **Walkthrough mode:** Buddy guides user through frameworks (e.g., "What's the problem you're solving?")

**Key detail:** Persona file is the highest-leverage input; every word costs tokens. Disses "AI marketing words" (delve, harness, unlock, robust) and validates frequently.

**Benefit:** Reusable voice companion pattern for any fork. Session + event model is portable.

**Effort:** 3–4 sessions. Requires Durable Object setup + WebSocket plumbing. Build spec is detailed; good for scoping.

**Files:** `src/server/modules/buddy/` (10 files), `src/client/modules/buddy/` (6 components), `drizzle/0023_buddy_sessions.sql`, `.jez/artifacts/buddy-pivot-build-spec-2026-05-05.md`

---

## 10. **Email Module with Typed Templates**

**Pattern:** Service-based email abstraction with swappable providers (`src/server/modules/email/service.ts`)

- **Providers:** Resend (SMTP2Go) or Cloudflare Email Routing (durable queue)
- **Fallback in dev:** `console.log` (no blocking on missing API keys)
- **Templates:** 9 HTML templates (welcome, password reset, verify, invite, etc.) with typed props
- **Queue system:** `email_queue` table + durable queue worker for retry logic

**Benefit:** Email sending never blocks auth flows; failures are logged but don't error. Easy to swap providers.

**Effort:** 1 session if Resend already integrated; queue pattern is optional.

**Files:** `src/server/modules/email/service.ts`, `src/server/modules/email/queue.ts`, `src/server/modules/email/templates/*.ts`

---

## 11. **Trusted Origins Parser (better-auth hardening)**

**Pattern:** Flexible auth origins via `TRUSTED_ORIGINS` env var (`src/server/modules/auth/index.ts:15–29`)

```ts
function parseTrustedOrigins(envValue?: string): string[] {
  // Accepts: "http://localhost:5173,https://myapp.workers.dev"
  // Always includes localhost for dev
  // Used by better-auth.trustedOrigins
}
```

**Benefit:** Auth works across dev, staging, and production domains with one env var. No hardcoded localhost.

**Effort:** 15 min. Drop-in replacement for static trustedOrigins array.

**Files:** `src/server/modules/auth/index.ts`

---

## 12. **Seven Critical Tool Bugs (Code Review Findings)**

**Pattern:** Bug fixes from Workspace tool expansion; highly reusable validation patterns

1. **MIME separator:** `.filter(Boolean)` on header array dropped blank line separator in RFC 5322 messages
2. **Index math:** Multi-heading docs appends shifted indices between requests
3. **Timezone:** `Date.getHours()` returns UTC in Workers; need `Intl.DateTimeFormat` for local hour
4. **Self-reply filter:** Gmail `replyAll` could cc the user; add profile fetch to filter
5. **File size cap:** Buffer content before size check → OOM risk; add pre-check + streaming reader
6. **Scope matching:** `.includes('readonly')` false-positives on super-set scopes; split + exact-match
7. **Degraded flag:** Drive fallback silently lost structure; surface via `degraded: true` flag

**Benefit:** Preventive fixes for any fork that implements similar tools. Patterns apply to any array filtering, index manipulation, timezone handling, or scope validation.

**Effort:** Varies (30 min–1 session per fix). Most are one-liners once identified.

**Files:** Fixes scattered across `src/server/modules/google-workspace/tools/` and `src/server/modules/chat/tools/`

---

## 13. **Auth Testing Utilities (better-auth testUtils)**

**Pattern:** Built-in test auth without email delivery

- `testUtils` plugin from better-auth v1.5+
- `DEV_AUTH_SECRET` environment gating
- Dedicated `/api/auth/test/signin` route for E2E tests

**Benefit:** CI/E2E tests can sign in without Resend/SMTP setup. Gating prevents production leaks.

**Effort:** 30 min. Config-only.

**Files:** `src/server/modules/auth/index.ts` (betterAuth config), new route in auth module

---

## 14. **UX Audit Runbook (4 Rounds, ~30 Fixes)**

**Pattern:** Systematic audit covering auth, chat, files, skills, settings, notifications, connectors, admin, activity, organization, security, API tokens, profile (`CHANGELOG.md:2026-04-22`)

Key fixes shipped:
- SignIn/ProtectedRoute preserve `?next=` deep links
- Chat conversation-not-found state with clear CTAs
- Time-of-day greeting bands
- AbortController on in-flight summarise calls
- Folder-aware empty states
- Skills upload `confirm()` → `AlertDialog`
- Form race-condition fixes via `<fieldset disabled>` pattern
- Dark-mode contrast fixes (semantic tokens instead of raw Tailwind)
- Keyboard accessibility (InlineEdit)
- Pagination hidden during loading

**Benefit:** Checklist for systematic UX polish. Patterns (deep-link preservation, loading skeleton strategy, form disabling, AbortController usage) are reusable.

**Effort:** 2–3 sessions to run your own audit and fix the high-impact ones.

**Files:** `.jez/artifacts/ux-audit-*.md` (6 audit reports), fixes scattered across chat/files/auth/settings modules

---

## 15. **Privileged Tool Gating Pattern**

**Pattern:** Hide destructive operations unless user explicitly requests them (`src/server/lib/ai/prepare-step.ts`)

- Define `PRIVILEGED_TOOL_NAMES` (email send, calendar delete, shell exec, etc.)
- In `computeActiveTools()`, filter by: (1) unlock keywords in latest message, OR (2) tool already succeeded in conversation
- Prevents accidental tool calls on vague requests like "clean up my inbox"

**Benefit:** Safety without permission dialogs for simple operations. Keywords are user-configurable.

**Effort:** 30 min. One function to update.

**Files:** `src/server/lib/ai/prepare-step.ts`, `src/shared/config/privileged-tools.ts` (new)

---

## 16. **Buddy Persona System Prompt**

**Pattern:** Deliberately anti-AI, friend-like companion voice (`src/server/modules/buddy/persona.ts:26–54`)

**Key rules for prompt:**
- No "that's amazing!"  or "what an insight!" (validation is annoying)
- No AI-marketing words (delve, harness, leverage, unlock)
- No em dashes (use commas/full stops)
- No summarising back ("so what you're saying is...")
- Contractions ("I've", "you're") feel human
- Short replies (1–3 sentences usually)
- Notice specifics (people, numbers, dates) — gold for writing

**Benefit:** Persona template is portable; any fork needing a conversational agent can adapt this.

**Effort:** 15 min to tweak for your product. Pattern is proven in conversation transcripts.

**Files:** `src/server/modules/buddy/persona.ts`

---

## 17. **Buddy Names + Welcome Script**

**Pattern:** User-selectable buddy personas (`src/server/modules/buddy/persona.ts:60–74`)

- 5 names: Wren, Kit, Tess, Otto, Sage (stored in user_meta)
- Welcome script randomised from 3 variants
- Used in `buildBuddyPrompt()` to personalise opening

**Benefit:** Light personalisation without ML. Names are culturally neutral, short, memorable.

**Effort:** 15 min. Just strings.

**Files:** `src/server/modules/buddy/persona.ts`, user_meta upgrade

---

## 18. **Session-Relative Timestamps (buddy_events)**

**Pattern:** Session events use `ts_ms` (milliseconds from session start) instead of epoch (`src/server/modules/buddy/db/schema.ts`)

- Enables relative progress bars ("1:30 into a 5-minute session")
- Cleaner for transcript scrolling (no epoch arithmetic)
- Still indexed by creation_at for admin queries

**Benefit:** UX detail; makes timeline UI cleaner.

**Effort:** 15 min. Schema decision, one field rename.

**Files:** `drizzle/0023_buddy_sessions.sql`, buddy events table

---

## 19. **Buddy Walkthrough Mode**

**Pattern:** Context-aware buddy guidance for frameworks

```ts
walkthroughContext?: { 
  framework: string      // "Customer Problem"
  question: string       // "What's the problem they face?"
  questionPurpose: string // "Find the core need"
}
```

Buddy reads this in prompt, asks naturally (not verbatim), probes on thin answers.

**Benefit:** Structured guidance without rigid forms. Can be reused for onboarding, product training, etc.

**Effort:** 30 min. One prompt block + integration in buddy reply.

**Files:** `src/server/modules/buddy/persona.ts`, `src/server/modules/buddy/routes.ts`

---

## 20. **Focused Artefact Mode**

**Pattern:** Conversation scoping via focused context

```ts
focusedArtefact?: { 
  topic: string      // "Newsletter Q2 Roadmap"
  summary: string    // "3-section breakdown of product roadmap"
}
```

Buddy prompt includes: "Keep conversation centred on this until they signal otherwise."

**Benefit:** Keeps buddy from drifting (e.g., draft refinement without hopper changes).

**Effort:** 30 min. One prompt injection + route param.

**Files:** `src/server/modules/buddy/persona.ts`, buddy routes

---

## 21. **Writing Principles from Jezmail**

**Pattern:** Reusable writing quality guide extracted from production experience (`src/server/lib/writing/`)

- Locale-aware spelling (en-au, en-us, en-gb, en-nz)
- Tone options: casual, friendly-professional, professional, formal
- Humour levels: none, light, regular
- Formality: relaxed, standard, elevated
- Guides loaded as Vite `?raw` imports (baked at build time)

**Benefit:** Portable writing style framework. Any fork can load different guides per locale.

**Effort:** 30 min if guides already exist; 2 hours to write new ones.

**Files:** `src/server/lib/writing/index.ts`, `src/server/lib/writing/en-au.md`, etc.

---

## Summary: Three Immediate Wins

**Highest ROI (1–2 sessions):**
1. **AI SDK Standards Adoption** — observable, type-safe tools + privileged gating
2. **Hopper + OG scraper + EXIF stripper** — reusable intake pattern
3. **Defence-in-depth auth allowlist** — free security upgrade

**Medium ROI (2–3 sessions):**
- Buddy module (if voice features matter)
- Email module (if transactional email needed)
- UX audit runbook (if polish phase approaching)

**Low ROI (reference only, don't port):**
- Kindling-specific landing page
- Buddy persona (only useful if building a friend-like product)
- Writing context (only useful if building a writing tool)

---

**Last updated:** 2026-05-05  
**Kindling commit:** 58fecef  
**Kindling version:** 0.1.0
