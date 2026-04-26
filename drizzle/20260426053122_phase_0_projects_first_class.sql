-- Phase 0 — Projects First-Class build
-- See: .jez/artifacts/projects-first-class-plan-2026-04-26.md
--
-- Changes:
--   * memories table — multi-entry three-scope persistent memory
--   * projects: org_id, starred, archived_at, memory_update_mode
--   * conversations: tags, memory_processed_at
--   * files: project_id
--   * skills: org_id
--   * user: memoryUpdateMode
--
-- Drizzle's auto-generated migration was hand-edited to drop spurious
-- duplicate CREATE TABLE / ALTER TABLE statements for earlier raw-SQL
-- migrations (0023..0031) that the snapshot history doesn't fully track.
-- This file contains only Phase 0's net-new changes.

-- New: memories table -------------------------------------------------------
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`is_private` integer DEFAULT 0 NOT NULL,
	`source_conversation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`source_conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `memories_scope_idx` ON `memories` (`scope`,`scope_id`);--> statement-breakpoint
CREATE INDEX `memories_scope_type_idx` ON `memories` (`scope`,`scope_id`,`type`);--> statement-breakpoint
CREATE INDEX `memories_scope_private_idx` ON `memories` (`scope`,`scope_id`,`is_private`);--> statement-breakpoint
CREATE INDEX `memories_source_conversation_idx` ON `memories` (`source_conversation_id`);--> statement-breakpoint

-- projects: org + star + archive + memory mode ------------------------------
ALTER TABLE `projects` ADD `org_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `starred` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `memory_update_mode` text DEFAULT 'ask' NOT NULL;--> statement-breakpoint
CREATE INDEX `projects_user_starred_idx` ON `projects` (`user_id`,`starred`,`updated_at`);--> statement-breakpoint
CREATE INDEX `projects_org_id_idx` ON `projects` (`org_id`);--> statement-breakpoint

-- conversations: tags + memory processed flag ------------------------------
ALTER TABLE `conversations` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `memory_processed_at` integer;--> statement-breakpoint
CREATE INDEX `conversations_memory_processed_idx` ON `conversations` (`memory_processed_at`);--> statement-breakpoint

-- files: project scoping ---------------------------------------------------
ALTER TABLE `files` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
CREATE INDEX `files_project_id_idx` ON `files` (`project_id`);--> statement-breakpoint

-- skills: org scoping ------------------------------------------------------
ALTER TABLE `skills` ADD `org_id` text;--> statement-breakpoint
CREATE INDEX `skills_org_id_idx` ON `skills` (`org_id`);--> statement-breakpoint

-- user: memory update mode -------------------------------------------------
ALTER TABLE `user` ADD `memoryUpdateMode` text DEFAULT 'ask' NOT NULL;
