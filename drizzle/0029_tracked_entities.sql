-- Generic entity store for CRM / Atlassian-style apps.
-- One table, many entity types discriminated by `type`. Type-specific
-- fields live in the `fields` JSON blob — schema-on-read pattern that
-- avoids per-type table proliferation while keeping cross-type
-- queries trivial (sum of all entities by type, etc).
--
-- For products that grow specific entity types into many fields with
-- complex relationships, fork into typed tables (one for tickets, one
-- for contacts) and migrate data. This table is the starting point;
-- swap it out when the cost of generic-JSON queries beats the cost
-- of bespoke tables.

CREATE TABLE IF NOT EXISTS `entities` (
  `id` TEXT PRIMARY KEY,
  `user_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  -- Type discriminator. e.g. 'ticket', 'deal', 'contact', 'company',
  -- 'task', 'project'. Caller-defined; no enum constraint so forks
  -- can add types without DDL.
  `type` TEXT NOT NULL,
  -- Optional external system id (Stripe customer, Jira issue, GitHub PR).
  -- Indexed for upsert-on-webhook flows.
  `external_id` TEXT,
  -- Display title. Required so list views always have something to show.
  `title` TEXT NOT NULL,
  -- Workflow state. Caller-defined ('open', 'in_progress', 'closed',
  -- 'won', 'lost'). Indexed for filter-by-status views.
  `status` TEXT NOT NULL DEFAULT 'open',
  -- Optional assignee (FK to user). NULL = unassigned.
  `assignee_id` TEXT REFERENCES `user`(`id`) ON DELETE SET NULL,
  -- JSON blob of type-specific fields (priority, amount, contact_email, etc).
  `fields` TEXT NOT NULL DEFAULT '{}',
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS `entities_user_id_idx` ON `entities`(`user_id`);
CREATE INDEX IF NOT EXISTS `entities_user_type_idx` ON `entities`(`user_id`, `type`);
CREATE INDEX IF NOT EXISTS `entities_user_type_status_idx` ON `entities`(`user_id`, `type`, `status`);
CREATE INDEX IF NOT EXISTS `entities_external_id_idx` ON `entities`(`external_id`);
CREATE INDEX IF NOT EXISTS `entities_assignee_idx` ON `entities`(`assignee_id`);
CREATE INDEX IF NOT EXISTS `entities_updated_at_idx` ON `entities`(`updated_at`);
