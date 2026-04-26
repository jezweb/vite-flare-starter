# Session Progress — Projects First-Class Build

**Started:** 2026-04-26
**Goal:** Build the full plan in `.jez/artifacts/projects-first-class-plan-2026-04-26.md` (8 phases, ~13 days of work). Jez AFK and trusts the build. Progress documented here so any compaction/resume is clean.

## Plan reference

- Canonical plan: `.jez/artifacts/projects-first-class-plan-2026-04-26.md`
- All 7 open questions answered yes; user trusts judgement on remaining details.
- Approach: build phases sequentially, ship → audit → fix at each phase boundary, commit per phase.

## Build order

| # | Phase | Status |
|---|---|---|
| 0 | Schema migration | **in progress** |
| 1 | Projects first-class + nav cleanup + Artifacts list + AI-assisted creation | pending |
| 2 | Files in projects | pending |
| 3 | Memory v1 with extensions A-F | pending |
| 4 | + menu + MCP resources picker | pending |
| 5 | Org awareness & sharing | pending |
| 6 | Universal search expansion + auto-tagging | pending |
| 7 | Inspirations doc + UX audit loop | pending |

## What works (so far)

(Nothing built yet — Phase 0 starting)

## Resume instructions (if compacted)

1. Read this file and `.jez/artifacts/projects-first-class-plan-2026-04-26.md`
2. Find current Phase status above
3. Resume from current Phase using "Phase notes" section below
4. Update this file as you progress (mark phases completed)
5. Commit at each phase boundary with message `feat(projects): Phase N — <headline>`
6. Run `pnpm type-check && pnpm build` after each phase
7. After Phase 7, run dev-tools:ux-audit skill to find issues, fix them, repeat until critical/high resolved

## Existing context (verified by reading source)

- `projects` table already exists with: `id, userId, name, description, systemPrompt, defaultModel, color, position, archived, createdAt, updatedAt`
- `conversations` table already has `projectId` (nullable), `starred`, `summary` columns
- `files` table does NOT have `projectId` yet — Phase 0 adds it
- `skills` table has `userId='bundled'` for default + per-user overrides; needs `orgId` for Phase 5
- `user` table is from better-auth — has `id, name, email, role, preferences, createdAt, updatedAt`
- `user` columns are camelCase (better-auth requirement)
- Latest migration: `drizzle/0031_service_credentials.sql`
- New migrations should use timestamp-prefixed names per drizzle config (`prefix: 'timestamp'`)
- npm scripts: `pnpm db:generate:named "<name>"`, `pnpm db:migrate:local`, `pnpm db:migrate:remote`

## Phase notes

### Phase 0 — Schema migration

Schema changes to make:

```sql
-- projects table additions
ALTER TABLE projects ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN starred INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN archived_at INTEGER;
ALTER TABLE projects ADD COLUMN memory_update_mode TEXT NOT NULL DEFAULT 'ask';

-- conversations table additions
ALTER TABLE conversations ADD COLUMN tags TEXT;
ALTER TABLE conversations ADD COLUMN memory_processed_at INTEGER;

-- files table additions
ALTER TABLE files ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

-- skills table additions
ALTER TABLE skills ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

-- user table additions (better-auth, camelCase column name)
ALTER TABLE user ADD COLUMN memoryUpdateMode TEXT NOT NULL DEFAULT 'ask';

-- new memories table
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  is_private INTEGER NOT NULL DEFAULT 0,
  source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX memories_scope_idx ON memories(scope, scope_id);
CREATE INDEX memories_scope_type_idx ON memories(scope, scope_id, type);
CREATE INDEX memories_scope_private_idx ON memories(scope, scope_id, is_private);
```

Approach:
1. Update `src/server/modules/projects/db/schema.ts` to add new columns
2. Update `src/server/modules/conversations/db/schema.ts` to add new columns
3. Update `src/server/modules/files/db/schema.ts` to add new column
4. Update `src/server/modules/skills/db/schema.ts` to add new column
5. Update `src/server/modules/auth/db/schema.ts` to add `memoryUpdateMode` (camelCase)
6. Create `src/server/modules/memories/db/schema.ts` (new module dir)
7. Generate migration with `pnpm db:generate:named "phase_0_projects_first_class"`
8. Apply local + remote
9. Verify with smoke test
