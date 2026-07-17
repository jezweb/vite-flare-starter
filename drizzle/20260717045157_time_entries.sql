CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`user_id` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`description` text,
	`date` text NOT NULL,
	`billable` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `time_entries_entity_idx` ON `time_entries` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `time_entries_user_idx` ON `time_entries` (`user_id`,`date`);