# Security & Access Control

The access-control model every fork inherits. Read this before deploying to real
users. It consolidates the guarantees the starter enforces and the levers you set
per deployment. (Hardened in the 2026-06 security review — see `.jez/review/register.md`.)

---

## 1. Who can sign in — the allowlist gate

**Restricting sign-in is done in code, not just the Google consent screen.** A
consent screen set to "External" (required whenever any user is on a non-Workspace
domain) lets *any* Google account in. The code allowlist is the real gate; the
consent screen is defence-in-depth.

`isSignupAllowed(email, env)` (`src/server/modules/auth/index.ts`) gates on:

| Env var | Effect |
|---|---|
| `ALLOWED_AUTH_EMAILS` | comma list of exact addresses allowed |
| `ALLOWED_AUTH_DOMAINS` | comma list of domains allowed (no `@`) |
| `AUTH_ALLOWLIST=true` | force the gate on with empty lists → **fail closed** (reject all) |

- **Unset** (default) → open signup, so a fresh public fork is unaffected.
- Enforced in **two** hooks so it can't be half-applied:
  - `databaseHooks.user.create.before` — blocks new non-allowlisted signups.
  - `databaseHooks.session.create.before` — re-checks on **every login**, so an
    account that predates the allowlist (or an operator you removed) is locked
    out on next sign-in, not just at signup.
- Test users (`*@test.<x>.local`) are exempt **only** when `TEST_AUTH_TOKEN` is
  set — exempt-by-construction, never a bare TLD/regex bypass.

**Per-deployment lever:** a private/team app should set `ALLOWED_AUTH_DOMAINS`
(e.g. `jezweb.net`). A public app leaves it unset (open) but should expect — and
rate-limit / budget — anonymous AI usage.

**Verify live:** `wrangler d1 execute <db> --remote --command "SELECT email, createdAt FROM user ORDER BY createdAt"` — any address outside your operator set is unauthorised access.

## 2. Admin role

`ADMIN_EMAILS` auto-promotes matching users to `admin` — but **only if their email
is verified** (`emailVerified`), so an unverified email/password account registered
on an admin address can't claim admin. OAuth (Google) sets `emailVerified`, so the
normal admin sign-in path is unaffected.

## 3. Tenancy isolation

Rows are scoped to their creator (`userId`). Use `scopeUser(table.userId, userId)`
(`src/server/lib/tenancy.ts`) for **reads and write-guards** — it returns the
condition in per-user mode and `undefined` in shared mode (`VITE_TENANCY_MODE=shared`),
so the two never drift. Org-scoped data is gated by membership via `getOrgRole()`.
Never take a tenancy scope (`orgId`/`projectId`/`userId`) from a client query param;
derive it from the session.

### Polymorphic entities (comments, watchers, …)

Features that attach to **any** entity by a client-supplied `entityType + entityId`
pair can't use `scopeUser` (the row they're reading isn't the entity itself). They
gate through `canAccessEntity(env, entityType, entityId, userId)`
(`src/server/lib/entity-access.ts`) — the single oracle that resolves an entity's
owner. It mirrors the `scopeUser` contract (per-user → owner match; shared → allow)
and fails closed on unknown types or missing rows. The starter registers resolvers
for `conversation`, `file`, and an entities-table fallback covering every
`entities`-module type. **A fork that adds an entity type its comments/watchers
attach to must `registerEntityType`/`registerEntityFallback` for it** — otherwise
the gate denies (secure default). Without this oracle, any authed user reads/writes
another tenant's comment threads and watch lists by id (polymorphic IDOR).

## 4. R2 object ownership

R2 objects are stored under user-scoped key prefixes (`users/<userId>/…`). Any route
that serves an object from a caller-supplied key MUST gate on
`isOwnedR2Key(key, userId)` (`src/server/lib/r2-keys.ts`) — one source of truth used
by the files, images, and media modules and the image agent tools. Without it, a
logged-in user reads another tenant's files by guessing the key (IDOR).

## 5. Durable Object / agent access

`/agents/*` is gated by a **fail-closed per-class policy** (`AGENT_ACCESS_POLICY` in
`src/server/index.ts`): an agent class with no declared policy is **denied**. Policies:
`owner-chat` (ChatAgent `user-<id>-conv-<id>`), `owner-colon` (AutonomousAgents +
voice/video, owner = segment before the first `:`), `do-enforced` (SpaceAgent — the
DO checks membership itself). Adding a new agent is secure by default. Routines run
with `setOwner(routine.userId)` and an owner-namespaced agent name; routine
`agentClass` is allowlisted against the registry.

## 6. OAuth connector token security

The connecting `userId` carried through a provider redirect is HMAC-signed
(`signValue`/`verifyValue`, `src/server/lib/crypto.ts`) in the `*_user` cookie and
verified in the callback, so it can't be substituted to hijack a victim's token row.
`mcp-connections` binds `state = signValue(connectionId)` and verifies it.
Connector access tokens are stored AES-GCM encrypted and **decrypted before use**
(never sent as ciphertext).

## 7. Injection / SSRF / XSS

- **SSRF:** server-side fetch of a user-supplied URL goes through
  `isSafePublicUrl` (blocks localhost/internal/private-IP/metadata) or a host
  allowlist (`isAllowedGitHubUrl`) — `src/server/lib/ssrf.ts`.
- **Reflected XSS:** any user/provider value interpolated into HTML (OAuth callback
  pages) runs through `escapeHtml` (`src/server/lib/escape-html.ts`).
- **Webhooks:** signatures compared in constant time; Stripe verified with the
  `t=…,v1=…` scheme over `<timestamp>.<body>`.

## 8. Audit / access log

Every module records user actions via `logActivity()` into `activity_logs`
(action, entity, IP, user-agent, field-level changes, timestamp). App owners review
cross-user activity at **`GET /api/admin/access-log`** (auth + admin gated) and the
**`/dashboard/admin/access-log`** UI (filter by user / action / entity / date).
Forks extend coverage by calling `logActivity()` for their own domain actions.

---

## Pre-deploy checklist (security)

- [ ] Decide sign-in policy: set `ALLOWED_AUTH_*` for private/team apps; leave open
      only for genuine public apps (and rate-limit AI usage).
- [ ] `BETTER_AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` set as wrangler secrets
      (used for cookie signing + connector token encryption).
- [ ] `ADMIN_EMAILS` set to real operators.
- [ ] If using OAuth connectors, confirm the callback host (`BETTER_AUTH_URL`) is correct.
- [ ] New domain modules use `scopeUser()` on reads + write-guards.
- [ ] New routes serving R2 by key gate on `isOwnedR2Key()`.
- [ ] New agent classes declare an `AGENT_ACCESS_POLICY` entry.
