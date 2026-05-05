---
date: 2026-05-05
status: v2 — after GPT-5.5 brainstrust review (compliance-officer perspective)
owner: jez+claude
purpose: Honest answer to a prospect asking about data retention / deletion / security
---

# Data, retention, deletion, security — Jezweb SaaS on vite-flare-starter

## TL;DR for a customer email

We store account data, chat content, files, encrypted integration credentials, and audit/usage logs on Cloudflare's platform (D1, Durable Objects, R2). When you send a chat message, the prompt + tool definitions are sent to whichever AI provider you (or your operator) selected. We delete from active storage on request; residual copies in backups/logs expire on stated schedules. We don't currently hold SOC 2 or a formal pen-test report — we can map our controls if needed and pursue formal certification on request.

## What we store

| Data | Where | Encrypted at rest |
|---|---|---|
| Account (email, name, image URL) | D1 | Cloudflare platform encryption |
| Password hash (only if email/password auth enabled) | D1 | Cloudflare + scrypt hash |
| Chat messages (live state) | Durable Object SQLite | Cloudflare platform encryption |
| Chat messages (read projection for search/sidebar) | D1 | Cloudflare platform encryption |
| Files (uploads) | R2 | Cloudflare platform encryption |
| Avatars | R2 (URL is public by user-id) | Platform encryption only |
| OAuth tokens (Google, MS, Notion, Atlassian, Slack) | D1 | **AES-GCM application-layer + platform** |
| API tokens (per-user, scoped) | D1 | **SHA-256 hashed; plaintext shown once** |
| Custom secrets / BYOK API keys | D1 | **AES-GCM application-layer + platform** |
| Activity log | D1 | Platform |
| AI usage logs (token counts, model, cost — no message bodies) | D1 | Platform |
| Tool-call telemetry (counts + errors — no inputs/outputs) | D1 | Platform |
| Worker request logs | Cloudflare Workers Logs | Platform; 7-day retention |

## Subprocessors (data processors)

Always:
- **Cloudflare, Inc.** — hosting, DNS, edge compute, D1/DO/R2 storage. SOC 2 Type II, ISO 27001, PCI DSS. (Cloudflare's own subprocessors: see [cloudflare.com/trust-hub](https://www.cloudflare.com/trust-hub/))

Optional (only if the operator enables and the user opts in):
- **AI providers** — Anthropic, OpenAI, Google AI, Cloudflare Workers AI, OpenRouter (which itself proxies to DeepSeek, Mistral, xAI, Z.AI). The active provider depends on which model the user picks.
- **OAuth integrations** — Google, Microsoft, Notion, Atlassian, Slack. Only the user's own data, only the scopes the user approved.
- **Email** — SMTP2Go OR Mailgun OR Resend OR Cloudflare Email (operator's choice). Receives recipient address + email body for transactional mail (verification, invites).
- **Search** — Serper / Brave / Tavily / Exa, if the operator enables one.
- **Error tracking** — Sentry, if the operator sets `SENTRY_DSN`. Stack traces + request id, no message content, no PII.

We can provide a concrete subprocessors list per-deployment on request (specifies which of the optional ones are actually enabled in your tenant).

## Data residency

Honest version: data is hosted on Cloudflare's global platform. Cloudflare automatically places D1 / DO / R2 in regions near the originating user, but **placement is not a contractual residency commitment**. For customers who need contractual EU-only or AU-only residency we provision Cloudflare's paid Data Localization Suite — quote on request.

Workers Logs: stored by Cloudflare. Same caveat. 7-day retention.

## What goes to AI providers when you chat

Each chat turn sends to the selected provider:
- The current and recent messages in the conversation (subject to a per-turn pruning policy)
- The current system prompt
- The tool definitions available
- Any file attachments the user sent in that turn

Nothing else from the system goes to the model.

**Training**: provider terms vary. We do not control AI provider data handling. We can constrain a customer to a specific approved provider list (e.g. Workers AI only, or Anthropic Enterprise tier only) on request. Default policy summary:
- **Cloudflare Workers AI** — no training, stays on CF
- **Anthropic API (default tier)** — no training, 30-day server retention for abuse review
- **OpenAI API** — no training (API-tier, default since 2023)
- **OpenRouter** — pass-through to underlying provider; varies. Do not assume "no training" blanket.

For any specific deployment we can pin the provider list and document each one's retention contract.

## Encryption

- **In transit**: TLS 1.3 enforced by Cloudflare
- **At rest, platform-level**: D1, DO storage, R2 — encrypted by Cloudflare
- **At rest, application-level**: OAuth tokens, MCP credentials, BYOK keys are AES-GCM encrypted using a server-side symmetric key
- **Key management (today)**: a single environment-held key (`BETTER_AUTH_SECRET` or a dedicated `ENCRYPTION_KEY`). Rotation requires re-encrypting affected rows — script included. **For enterprise we'd recommend (and can move to) a dedicated key separated from the auth secret with documented rotation cadence.** Not yet HSM-backed.
- **Passwords**: scrypt via better-auth (only when email/password auth is enabled — OAuth-only by default)
- **API tokens**: SHA-256; plaintext returned to the user once at creation, never stored

## Deletion — what's instant and what isn't

**Instant (active storage, on user request)**:
- Per-conversation delete — UI button — cascades messages, members, projection rows, related artifacts
- Account delete — Settings → Delete Account, requires recent re-auth — cascades all user-scoped rows in D1, removes R2 objects under the user prefix
- OAuth disconnect — token row deleted; provider-side authorization remains until the user revokes from their Google/Microsoft account too

**Eventual (residual copies that aren't directly user-controlled)**:

| Where | Default retention | How customer-controllable |
|---|---|---|
| D1 point-in-time restore | 30-day window (Cloudflare-managed) | Cannot be shortened by us; Cloudflare's contract |
| Worker request logs | 7 days | Cloudflare-managed |
| R2 lifecycle (data-lake bucket) | 1 day for ephemeral data; indefinite otherwise | Configurable per bucket |
| Sentry events | Per Sentry plan (typically 30-90 days) | Configurable in Sentry |
| AI provider logs | Per provider (Anthropic 30d, OpenAI varies, etc.) | Provider-controlled |
| Email vendor logs | Per vendor (typically 30-90 days) | Vendor-controlled |

**GDPR Article 17 (right to be forgotten)**: we honour requests within 30 days. For account-scoped data we delete from active storage immediately; residual backup/log copies expire per the table above. Affected providers are notified and asked to honour their own deletion endpoints when applicable.

## Cascade-delete coverage

Verified for: every D1 table that references a `user`. 30+ tables, all marked `onDelete: cascade` in schema.

NOT in scope of cascade:
- **Durable Object SQLite** — wiped via per-DO `state.deleteAll()` when account-deletion fires (we wire this explicitly)
- **R2 objects** — deleted via `bucket.delete(key)` in the account-deletion script; lifecycle rules cover the rest
- **External systems** — provider-controlled; we can't force their deletion

## Customer controls

- **Export**: `GET /api/settings/export` returns full user data as JSON (Article 20 portability)
- **Per-conversation delete**: UI
- **Full account delete**: Settings → Delete Account
- **Disconnect any integration**: Connectors → Remove
- **Choose AI provider**: model picker (operator can constrain)
- **Scheduled / SFTP export**: not OOTB; available on request

## Security controls

- Auth: better-auth 1.6, OAuth-only by default. Sessions 7d, revocable. Admin role gated by env-var allowlist.
- Multi-tenant isolation: every query scopes by `userId`; orgs add `organization_id` scoping. Verified by code review and by an incident audit (2026-04-30) that caught the test-auth cascade trap.
- Test-auth plugin (headless test sessions): gated behind `TEST_AUTH_TOKEN` env (constant-time compared); when unset, every test endpoint returns 404. Real-data reassignment to test users is documented as prohibited.
- CSRF: better-auth signed state cookies, sameSite=lax
- Rate limit: per-IP + per-user on `/api/*`
- CORS: `TRUSTED_ORIGINS` allowlist
- Headers: HSTS, X-Frame-Options DENY, Permissions-Policy locked (camera/mic/geo off by default), strict CSP
- Bot Fight Mode: enabled on the CF zone; webhooks have explicit WAF skip rules
- DDoS: Cloudflare L3-7 protection
- Dependency scanning: `pnpm audit` in CI; Renovate (planned)
- Secrets: never logged; `wrangler secret put` for production; `.dev.vars` for local (gitignored)
- Internal access: only operator's CF dashboard credentials and `wrangler` CLI. Production access list per-customer on request.

## Logging — what we log, what we don't

- **Workers Logs**: HTTP method, path, status, duration, request id, IP (CF redacts EU IPs by default), user agent. **No request bodies, no response bodies, no auth headers** (CF strips cookies).
- **Application logs (`console.log` / structured events)**: action names, entity ids, user id, error names + messages. **No message content, no file content, no token plaintext.** Errors with stack traces stay server-side; users see a sanitised string.
- **AI usage**: model, token counts, duration, USD cost. Plus per-tool-call: name + error if any. **No prompts, no responses.**

## Incident response

- Operator-side incident lead is the Jezweb engineer on the deployment.
- Time to detect: errors via Sentry / Workers Logs alerting (operator-configurable); customer reports via support email.
- Time to notify a customer: aim for 24h for confirmed incidents affecting their data; 72h for GDPR Article 33 notification when applicable.
- Security contact: `security@jezweb.net` (publishable on a future security.txt page).

## Backup & DR

- **D1**: Cloudflare-managed point-in-time restore, 30-day window. We have not yet performed scheduled restore drills — recommend committing to quarterly drills for any production deployment.
- **R2**: versioning is opt-in per bucket; we recommend enabling for production deployments.
- **DO storage**: included in D1 PITR coverage (DO SQLite is platform-managed).
- **Restore RTO**: best-effort within hours for a single-account or single-conversation restore; full-tenant restore would be a CF support ticket — multi-day SLA.
- **Restore RPO**: ~1 hour (D1 PITR granularity).

## Known gaps / honest caveats

1. **No SOC 2 / ISO 27001 (Jezweb)**. Cloudflare itself holds these, which inherits to the storage layer. Mid/large enterprise customers should expect us to map our controls during their security review, and we'd quote SOC 2 readiness as a project if it's a deal blocker.
2. **No formal third-party pen-test** of the application code. Patterns follow OWASP defaults (parameterised queries, no eval, no untrusted-input sinks). We can commission one before/during onboarding for an enterprise customer.
3. **R2 versioning is not on by default** in the starter. Easy to enable per bucket — recommend doing so for production.
4. **Encryption key separation**: today the same env-held key encrypts all integration tokens. Enterprise deployments should split into a dedicated key with documented rotation.
5. **Avatar URLs are public** by user-id. They're 80×80 profile photos — but they ARE personal data; treat as such. Disclose in privacy notice.
6. **Backup/DR drills**: D1 PITR exists (30-day window) but we haven't run scheduled restore drills. Worth doing for production deployments.
7. **DPA**: we offer a DPA on request; standard SCCs included for EU customers. No formal subprocessors page yet — generated per-deployment.

## What we'd contractually commit to today

- Active-storage account + content delete: instant, cascading
- TLS in transit, AES-GCM at rest for credentials, platform encryption everywhere else
- Standard data export on demand (JSON)
- 30-day GDPR Article 17 response time
- No model training on chat content **when the customer is on the approved-providers list** (Anthropic API tier, OpenAI API tier, Workers AI). OpenRouter pass-through opt-in.
- DPA + SCCs
- Multi-tenant isolation per the controls above
- 24h customer notification on confirmed incidents; 72h GDPR notification

## What's roadmap

- SOC 2 Type II readiness (timeline TBC)
- Third-party pen-test
- Dedicated encryption key separation + documented rotation
- Self-serve "delete all my chat history" button (today: per-conversation delete)
- Quarterly DR restore drill
- Standing subprocessors page + security.txt
