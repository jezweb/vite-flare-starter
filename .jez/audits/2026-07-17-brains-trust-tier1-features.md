---
date: 2026-07-17
status: complete
owner: jez+claude
topic: Tier-1 generalised features (kanban, search, mirror, formats, backups, auth batch)
---

# Brains-trust — Tier-1 generalised features

Panel over the `feat/tier1-generalised-features` branch (server + client-auth
diffs). Reviewers: `openai/gpt-5.6-luna-pro`, `anthropic/claude-opus-4.8`,
`google/gemini-3.1-pro-preview` (via OpenRouter). ~$-cheap round.

## Fixed before merge (cross-validated or clearly real)

| # | Finding | Reviewers | Fix |
|---|---|---|---|
| C1 | `entity_create` provenance stamp spoofable — `{createdBy:'agent', ...fields}` let the agent override the stamp via `input.fields.createdBy`, defeating the feature | gpt-5.6 + opus | Reversed spread: stamp goes last (`entities.ts`) |
| H2 | Backup download: raw R2 key in `content-disposition` (header injection) + unguarded `decodeURIComponent` (500 on malformed encoding) | gpt-5.6 + opus | try/catch decode + `replace(/[^\w.\-]/g,'_')` on filename (`backups/routes.ts`) |
| M4 | Same-minute backup runs overwrite each other's R2 object (minute-precision key) | gpt-5.6 + opus | Key now seconds-precision + bookmark suffix (`backups/workflow.ts`) |
| H1 | `NewChatRedirect` forwarded ALL query params; `q` auto-sends, so a crafted link = one-click agent prompt | opus | Allowlist `projectId/q/title/text/url` only (`App.tsx`) |

## Verified and cleared (panel couldn't see the out-of-diff wiring)

- **Magic-link allowlist bypass (opus M3):** `isSignupAllowed` is wired into
  `databaseHooks.user.create.before` (fires on ANY signup path incl.
  magic-link) AND `session.create.before`. Path-agnostic — confirmed in
  `auth/index.ts:301-371`. No bypass.
- **Rate-limit / passkey / admin migrations "missing" (gpt-5.6 M):** false
  alarm — migrations ARE committed (`drizzle/…_rate_limit_table.sql`,
  `…_auth_admin_passkey.sql`), just not in the diff slice sent to the panel.
  Applied + verified locally.
- **Admin plugin gating (opus H3):** verified live — ban revokes the target's
  session, impersonate swaps session + stamps `impersonatedBy`, both gate on
  `user.role === 'admin'` (same role ADMIN_EMAILS promotes). No divergence.

## Noted, not fixed (low / accepted)

- **R2 list pagination (gpt-5.6 M):** backup list/prune + cron staleness read
  only the first `FILES.list` page. For daily backups × 30-day retention
  (~30 objects, « 1000 default page size) this never truncates. Revisit if
  retention or cadence grows; documented here so it's not silently assumed.
- **Cron staleness guard race (opus M4):** manual + cron can both pass the
  freshness check and launch overlapping runs. Mirror upserts are idempotent;
  backups now get unique keys (M4 fix above), so the residual cost is a
  duplicate object, not corruption. Acceptable for a starter.
- **`/llms.txt` advertises upstream docs when `GITHUB_URL` unset (opus L1):**
  by design for the public starter; a private fork sets `GITHUB_URL=""` to
  hide GitHub links (existing rebrand step). Informational.
- **Impersonation banner is client-only (opus L3):** server enforces the 1h
  cap + stamp; the banner is a visibility aid. Acceptable.
- **`passkey.createdAt` not `.notNull()` (opus L2):** matches better-auth's
  optional-timestamp expectation; left as-is.

## Reviewer signal

gpt-5.6 and opus converged tightly (provenance + header injection + backup
key). Gemini's output truncated into reasoning mid-stream (low signal this
round). The two clean reviewers agreeing on C1 + H2 is the cross-validation
that mattered.
