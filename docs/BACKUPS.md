# Backups & Restore

Two layers, different jobs. Know which one you're reaching for **before**
an incident, not during.

| Layer | Window | Setup | Restores |
|---|---|---|---|
| **D1 Time Travel** (built-in) | 30 days paid / 7 free, any-minute granularity | none — always on | in place, destructive |
| **Backup Workflow** (this repo) | as long as your retention (default 30 days, set higher for compliance) | 3 env values | into any database, via SQL import |

User-facing "export my data" (GDPR takeout) is a third thing — the
settings module's data export. Backups are operator-level.

## Layer 1 — Time Travel (reach for this first)

Every D1 database continuously bookmarks itself. For "we just deleted /
corrupted something in the last few days" this is the whole answer:

```bash
# Find the bookmark nearest a timestamp
npx wrangler d1 time-travel info vite-flare-starter-db --timestamp "2026-07-16T02:00:00Z"

# Restore — DESTRUCTIVE, overwrites in place, cancels in-flight queries
npx wrangler d1 time-travel restore vite-flare-starter-db --timestamp "2026-07-16T02:00:00Z"
```

The restore prints an "undo" bookmark — note it down; restoring to that
bookmark reverses a bad restore. There is no clone-from-bookmark yet
(July 2026): restores are always in place.

## Layer 2 — the Backup Workflow (beyond 30 days)

`src/server/modules/backups/workflow.ts` runs Cloudflare's official
export pattern: D1 export API (polled to a signed URL) → SQL dump
streamed into the FILES bucket under `_backups/` → prune past retention.

### Setup

```bash
# 1. API token: dash.cloudflare.com → My Profile → API Tokens →
#    Create Token → "D1" template (read is enough for export)
printf "<token>" | npx wrangler secret put D1_REST_API_TOKEN

# 2. Vars — in wrangler.jsonc "vars" (or .dev.vars locally):
#    CLOUDFLARE_ACCOUNT_ID  = account_id at the top of wrangler.jsonc
#    D1_DATABASE_ID         = d1_databases[0].database_id
#    BACKUP_CRON            = "true"       (daily via the cron guard)
#    BACKUP_RETENTION_DAYS  = "30"         (raise for compliance)
```

The `BACKUP_WORKFLOW` binding already ships in `wrangler.jsonc`. Without
the vars, the workflow errors with a clear message and the cron guard
never fires — safe by default.

### Operating it

```bash
# Manual run (admin session)
curl -X POST https://<app>/api/backups/run -H "Cookie: <admin session>"
# List stored backups
curl https://<app>/api/backups
# Download one
curl -OJ https://<app>/api/backups/download/_backups%2F2026-07-16T02-00.sql
```

The cron guard (scheduled §8 in `src/server/index.ts`) fires at most
once per ~23h, whatever the cron cadence.

### Restore from a dump

```bash
# Into the SAME database (after exhausting Time Travel options):
npx wrangler d1 execute vite-flare-starter-db --remote --file backup.sql

# Into a FRESH database (the safer path — verify, then cut over):
npx wrangler d1 create restore-check
npx wrangler d1 execute restore-check --remote --file backup.sql
```

⚠ Dumps are `INSERT` statements — importing over existing rows conflicts.
Restore into a fresh database, or wipe the target first.

⚠ **FTS5 is excluded by design.** The D1 export API refuses entire
databases containing virtual tables ("cannot export databases with
Virtual Tables"), so the workflow exports an explicit allowlist of real
tables (virtual tables + their `_data/_idx/_content/_docsize/_config`
shadows are skipped — see `listExportableTables`). After a restore:
run migrations first (recreates the FTS tables + triggers), import the
dump, then rebuild each index — either
`INSERT INTO <fts_table>(<fts_table>) VALUES ('rebuild')` for
content-table FTS, or re-save the affected rows.

### Storage note

Backups live in the FILES bucket under `_backups/` — outside the
`users/<id>/` prefix space, reachable only through the admin routes.
Fine for most forks; a compliance-grade deployment should use a
dedicated bucket (swap the binding in `workflow.ts` + `routes.ts`) so
lifecycle rules and access audits stay separate from user files.

## What's deliberately NOT here

- **R2 bucket backup** — R2 has no native cross-bucket replication
  (July 2026). If your R2 data is critical, add a copy step to the
  workflow or `rclone sync` from CI.
- **GDPR takeout upgrade** (zip + R2 + expiring link) — the settings
  export covers the basics today; the upgrade is tracked upstream.
