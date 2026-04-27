CREATE TABLE `inbox_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`routine_run_id` text,
	`agent_class` text,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`payload_json` text,
	`importance` text,
	`confidence` real,
	`reasoning` text,
	`suggested_action_json` text,
	`sources_json` text,
	`due_at` integer,
	`expires_at` integer,
	`effort_minutes` integer,
	`tags_json` text,
	`related_item_ids_json` text,
	`thread_space_id` text,
	`read_at` integer,
	`decided_at` integer,
	`decision_text` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inbox_items_user_id_idx` ON `inbox_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `inbox_items_user_kind_idx` ON `inbox_items` (`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `inbox_items_user_unread_idx` ON `inbox_items` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `inbox_items_user_undecided_idx` ON `inbox_items` (`user_id`,`decided_at`);--> statement-breakpoint
CREATE INDEX `inbox_items_due_at_idx` ON `inbox_items` (`due_at`);--> statement-breakpoint
CREATE INDEX `inbox_items_routine_run_idx` ON `inbox_items` (`routine_run_id`);