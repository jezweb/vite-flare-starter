# viteflare-maint — session log

Standing maintenance session for vite-flare-starter, running on ivy (Mac mini,
maintenance wing). Doctrine: `~/Documents/maintenance/maintenance-doctrine.md`
(that path exists on ivy only). Hourly heartbeat cron; crons die on session
restart, so **recreate the cron as the first act of every session**.

Deployed app: https://vite-flare-starter.webfonts.workers.dev (account
jeremy@jezweb.net — the webfonts.workers.dev subdomain, NOT jezweb.workers.dev).
Deploy only via `pnpm run deploy`. Week-one gate: non-trivial changes as PRs.

---

## Pass log (newest first)

### 2026-08-04 ~15:15 AEST — heartbeat: sensors clean, advanced #119 → PR #123

**Sensors:** app 200s; no new issues/alerts (dependabot still 14 — recomputes
when PR #122 merges to main); PR #122 open, unreviewed (repo has no CI checks);
no hq mail.

**Advanced:** issue #119 (chat approval buttons dead under Workers AI). Fix as
reported+verified by the issue author: SDK matches `approval.id`, not
`toolCallId`; Workers AI decorates toolCallId so the lookup missed. Threaded
`approvalId` through MessageRenderer → onToolApproval → ChatPage's
`addToolApprovalResponse`. Same fix in ChatMessage.tsx — which is **dead code**
(imported nowhere; MessageRenderer is the live renderer). → **PR #123**.
Verified: 291/291 tests, type-check, lint (858 warnings pre-existing).
NOT live-verified under a Workers AI model — needs TEST_AUTH_TOKEN (see For hq).

**Follow-up candidates:** decide whether ChatMessage.tsx should be deleted
(dead duplicate of MessageRenderer with drift risk — this bug existed in both).

### 2026-08-04 ~14:20 AEST — first session: baseline sweep + security PR

**Sensors:**
1. **Live errors** — `wrangler tail` sample clean (ok outcomes, no exceptions);
   HTTP probes: `/` 200, `/api/auth/config` 200. Note: tail `--format json`
   emits pretty-printed concatenated JSON, not JSONL — parse with a streaming
   decoder, not line-by-line.
2. **Repo health** — 14 open dependabot alerts / `pnpm audit --prod` 19 vulns
   (8 high) at baseline. → **PR #122** clears to 2 dev-time moderates:
   react-router 8.2.0→8.3.0 (the direct high, CSRF), in-range `pnpm update`,
   undici overrides, @modelcontextprotocol/sdk override (agents pins 1.29.0,
   dupe broke tsc), shiki family HELD at ~4.2.0 (4.4.1 types clash with
   @streamdown/code's internal shiki 3), Dockerfile sandbox base 0.12.3→0.12.4
   (must match @cloudflare/sandbox npm version; tag verified on Docker Hub).
   Verified: 291/291 tests, type-check, build. NOT deployed — PR pending review.
   13 open GitHub issues = standing backlog (see below).
3. **Client mail** — none routed.
4. **Browser walk** — public surface only (`/`, `/sign-in`): renders clean,
   zero console errors. Authed walk blocked — no TEST_AUTH_TOKEN on this
   machine (no `~/Documents/.jez/` sync on ivy). Auth routes are `/sign-in` /
   `/sign-up`, not `/login`.

**Learned / traps for next pass:**
- `pnpm update` REWRITES package.json ranges here, not just the lockfile.
- Bumping @cloudflare/sandbox requires the Dockerfile base tag bump in the
  same change (CLAUDE.md documents this; easy to miss in a deps PR).
- 2 remaining audit moderates are unclearable without forced majors inside
  third-party trees: esbuild@0.18 (better-auth tooling, dev-only) and
  @hono/node-server v1 (agents' Node adapter, unused on Workers). Don't chase.

**Backlog (from open issues, roughly by value):**
- #119 chat approval buttons dead under Workers AI models (bug — likely next)
- #121 monthly catalogue check (due ~2026-08-25; `pnpm models:refresh` +
  `pnpm doctor:models`)
- #109 deliberate-migrations tracker (react-router v8 ✅ done in PR #122's
  sense of currency; check remaining items)
- #118 kanban optimistic-move recipe doc; #85/#84/#83 pattern enhancements;
  #113 Think harness eval; #110/#63 fork-planning; #36/#35 upstream waits.
- `.jez/handoff/pending.md` (2026-04-20) is largely stale — M6/M7 components
  showcase gaps may still be real; verify before acting.

**For hq:**
- Need `TEST_AUTH_TOKEN` for the deployed app (wrangler secret; value not on
  ivy) to run authed browser walks + `pnpm test:e2e`. Route via herdr when
  convenient — not blocking.
- PR #122 needs review/merge (or tell me to merge + deploy if week-one PR gate
  is waived for dep bumps).
- Special mission note: once #122 merges, downstream forks likely want the
  react-router CSRF bump — advisory to follow after merge.
