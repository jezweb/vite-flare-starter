CREATE TABLE `thread_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	`level` text DEFAULT 'all' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `thread_subscriptions_thread_idx` ON `thread_subscriptions` (`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_subscriptions_user_thread_unique` ON `thread_subscriptions` (`user_id`,`thread_id`);--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `starred_by_user_ids` text;--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `quoted_message_id` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD `history_disabled_at` integer;