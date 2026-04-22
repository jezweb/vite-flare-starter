-- Projects: group conversations with shared instructions.
--
-- Adds a `projects` table and a nullable `project_id` FK on `conversations`
-- with ON DELETE SET NULL so removing a project returns its conversations
-- to the flat list rather than deleting them.
--
-- SQLite needs a table rebuild to add a FK column, so we use the "new table
-- + copy + swap" pattern Drizzle generates. Kept hand-written here because
-- `pnpm db:generate` would re-emit unrelated auth-table drift.
CREATE TABLE `projects` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `system_prompt` text,
  `default_model` text,
  `color` text,
  `position` integer DEFAULT 0 NOT NULL,
  `archived` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

CREATE INDEX `projects_user_id_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE INDEX `projects_user_position_idx` ON `projects` (`user_id`,`position`);--> statement-breakpoint
CREATE INDEX `projects_user_archived_idx` ON `projects` (`user_id`,`archived`);--> statement-breakpoint

ALTER TABLE `conversations` ADD `project_id` text REFERENCES `projects`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `conversations_project_id_idx` ON `conversations` (`project_id`);
