---
date: 2026-07-17
status: complete
owner: jez+claude
topic: brains-trust review — #95 remaining HIGHs batch (fix/security-95-remaining)
---

# Brains-trust: #95 remaining security batch

Panel: `openai/gpt-5.6-sol`, `anthropic/claude-opus-4.8`, `google/gemini-3.1-pro-preview`
(via OpenRouter, ~$0.69 total). Input: 1,025-line diff + fix goals. Raw output in the
session scratchpad (not preserved — findings below are the complete set).

## Scope of the batch

1. `install_skill` → caller's namespace (BUNDLED default parameter removed entirely)
2. MCP-connector OAuth state = `signValue(connectionId:userId)`, callback verifies both vs the row
3. Webhook agents: HMAC-signed `userId:slug` handle URLs, per-user DO namespace, first-caller claim gone
4. `saveChat` storage-layer membership check (fail-closed, required `userId` param)
5. Space principal model: owner's MCP tools dropped when `actingUserId !== owner`
6. Doc-truth: nextCronRun real 5-field support, MarkdownEditor onChange wired, auth-cleanup mixed-timestamp normalisation

## Cross-validated → fixed before commit

- **Cron field range validation missing** (gpt M1 + opus M4). `0 99 * * *` was accepted;
  JS Date rolls invalid values into different days/times silently. Fixed: all five fields
  range-checked (0-59 / 0-23 / 1-31 / 1-12 / 0-7), out-of-range throws.

## Single-reviewer but verified-real → fixed

- **`*` minute/hour semantics wrong** (gpt M2). `30 * * * *` (standard: hourly at :30)
  was parsed as daily 00:30 — 23 missed fires/day. Fixed: hour `*` = every hour via
  hour-stepping scan; minute `*` (sub-hourly) now throws with a clear message rather
  than silently misfiring. Tool description updated so the model doesn't emit `*/N`.
- **`this.isMember` binding fragility in saveChat** (opus H1). Destructuring the storage
  object would lose `this`, throw, and be swallowed by chat-agent's best-effort catch →
  silent persistence loss. Fixed: membership check extracted to a closure (`isMemberOf`),
  object method now aliases it.
- **Milkdown mount-time emission** (opus L7). Seeded docs could fire onChange on mount,
  dirtying pristine forms. Fixed: `lastEmittedRef` seeded with the initial value.

## Verified and dismissed (with evidence)

- **"Missing BETTER_AUTH_SECRET makes handles forgeable"** (opus H2). Checked
  `src/server/lib/crypto.ts`: `verifyValue(_, undefined)` returns `null` → receiver 401s
  (fail-closed); `signValue` throws → /info 500s loudly. No forgery path. The optional
  typing in `WebhookEnv` mirrors reality (dynamic env), runtime is safe.
- **"/info //rotate may not validate SLUG_RE"** (opus L6, hedged). They do — the check
  is above the diff window in both handlers.
- **"1e11 threshold parity claim may be false"** (opus M5). Checked
  `auth/db/types.ts` `isoTimestamp.fromDriver`: same `> 1e11` split. Parity holds.
  Pre-1973-millis misclassification is unreachable for auth rows.
- **DOM/DOW AND-vs-OR semantics** (gpt M3). Known deliberate deviation, documented in
  the function docstring at the time of writing. POSIX OR behaviour deferred until a
  real schedule needs it.

## Accepted lows (documented, not fixed)

- **userId visible inside webhook handle + OAuth state** (gpt L1/L2). `signValue`
  authenticates, doesn't encrypt. better-auth userIds are opaque random tokens, not
  PII; webhook URLs are already secret-adjacent. Revisit if a fork uses meaningful ids.
- **saveChat TOCTOU** (gpt L3). Membership revoked between check and insert can land a
  few final messages. Impact: cosmetic; D1 has no cross-statement transaction here.
- **`<=` equality bump** (opus M3-nit). A cron matching the exact request second defers
  one slot. Harmless for agent schedules.

Gemini's review validated the cleanup SQL as sound and surfaced nothing actionable
(reasoning consumed most of its budget despite 20k max_tokens — consistent with the
known gotcha; keep feeding it 16k+ and treat it as a validator voice).

## Verdict

No Criticals. All cross-validated and verified-real findings fixed in the same branch
(212 + new tests green, type-check clean). Merge approved.
