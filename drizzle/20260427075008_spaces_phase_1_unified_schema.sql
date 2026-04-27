CREATE TABLE `conversation_members` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`kind` text NOT NULL,
	`user_id` text,
	`agent_class` text,
	`agent_name` text,
	`reply_mode` text,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer NOT NULL,
	`last_read_at` integer,
	`notification_level` text DEFAULT 'all' NOT NULL,
	`pinned_to_sidebar` integer DEFAULT 0 NOT NULL,
	`invited_by_user_id` text,
	`blocked_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_members_conversation_idx` ON `conversation_members` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `conversation_members_user_idx` ON `conversation_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `conversation_members_agent_idx` ON `conversation_members` (`agent_class`,`agent_name`);--> statement-breakpoint
CREATE INDEX `conversation_members_kind_idx` ON `conversation_members` (`conversation_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_members_user_unique` ON `conversation_members` (`conversation_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_members_agent_unique` ON `conversation_members` (`conversation_id`,`agent_name`);--> statement-breakpoint
ALTER TABLE `pending_approvals` ADD `space_id` text;--> statement-breakpoint
ALTER TABLE `pending_approvals` ADD `requested_by_user_id` text;--> statement-breakpoint
CREATE INDEX `pending_approvals_space_idx` ON `pending_approvals` (`space_id`);--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `parent_message_id` text;--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `thread_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `last_thread_at` integer;--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `reactions` text;--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `pinned_at` integer;--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `pinned_by_user_id` text;--> statement-breakpoint
CREATE INDEX `conversation_messages_parent_idx` ON `conversation_messages` (`parent_message_id`);--> statement-breakpoint
CREATE INDEX `conversation_messages_pinned_idx` ON `conversation_messages` (`conversation_id`,`pinned_at`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `kind` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `space_mode` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `default_reply_mode` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `history_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `conversations_kind_idx` ON `conversations` (`kind`);--> statement-breakpoint

-- Backfill: every existing 1:1 conversation gets a user-owner member +
-- a default agent member ('assistant', always-replying). Lower(hex(randomblob))
-- generates a UUID-shaped id without depending on uuid extensions. created_at
-- is already an integer (timestamp mode = seconds), so we can reuse it directly
-- as joined_at.
INSERT INTO `conversation_members`
  (id, conversation_id, kind, user_id, reply_mode, joined_at, role, notification_level, pinned_to_sidebar)
SELECT
  lower(hex(randomblob(16))) AS id,
  id AS conversation_id,
  'user' AS kind,
  user_id AS user_id,
  NULL AS reply_mode,
  COALESCE(created_at, strftime('%s','now')) AS joined_at,
  'owner' AS role,
  'all' AS notification_level,
  0 AS pinned_to_sidebar
FROM `conversations`;--> statement-breakpoint

INSERT INTO `conversation_members`
  (id, conversation_id, kind, agent_class, agent_name, reply_mode, joined_at, role, notification_level, pinned_to_sidebar)
SELECT
  lower(hex(randomblob(16))) AS id,
  id AS conversation_id,
  'agent' AS kind,
  'AssistantAgent' AS agent_class,
  'assistant' AS agent_name,
  'always' AS reply_mode,
  COALESCE(created_at, strftime('%s','now')) AS joined_at,
  'member' AS role,
  'all' AS notification_level,
  0 AS pinned_to_sidebar
FROM `conversations`;