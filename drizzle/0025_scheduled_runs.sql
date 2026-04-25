-- Per-run telemetry for ScheduledAgent Durable Objects.
-- One row per alarm fire (success or failure). Drives the
-- "show me last 50 runs of <agent>" admin surface and the retry
-- policy's deduplication of dead-letter logs.

CREATE TABLE IF NOT EXISTS `scheduled_runs` (
  `id` TEXT PRIMARY KEY,
  -- DO class name (e.g. ReminderAgent). Lets us scope queries to one
  -- agent kind without a join.
  `class_name` TEXT NOT NULL,
  -- The DO's idFromName() input — usually `${userId}:${kind}` or a
  -- UUID. Caller-defined; keeps the storage layer agnostic.
  `name` TEXT NOT NULL,
  -- Optional user scope so admin dashboards can filter "Jez's runs".
  -- Nullable for system-scoped agents that aren't per-user.
  `user_id` TEXT REFERENCES `user`(`id`) ON DELETE SET NULL,
  `scheduled_at` INTEGER NOT NULL,
  `fired_at` INTEGER NOT NULL,
  `duration_ms` INTEGER,
  -- 'ok' | 'error' | 'final_error' (after exhausted retries)
  `outcome` TEXT NOT NULL,
  `attempt` INTEGER NOT NULL DEFAULT 1,
  `error_message` TEXT,
  -- Free-form JSON the subclass wants to record (counters, summaries).
  -- Keeps the table generic; agents extend without schema changes.
  `result_json` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS `scheduled_runs_class_name_idx` ON `scheduled_runs`(`class_name`);
CREATE INDEX IF NOT EXISTS `scheduled_runs_name_idx` ON `scheduled_runs`(`name`);
CREATE INDEX IF NOT EXISTS `scheduled_runs_user_id_idx` ON `scheduled_runs`(`user_id`);
CREATE INDEX IF NOT EXISTS `scheduled_runs_fired_at_idx` ON `scheduled_runs`(`fired_at`);
