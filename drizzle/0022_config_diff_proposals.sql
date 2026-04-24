CREATE TABLE `config_diff_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resource_kind` text NOT NULL,
	`resource_id` text NOT NULL,
	`resource_label` text NOT NULL,
	`before` text NOT NULL,
	`after` text NOT NULL,
	`summary` text NOT NULL,
	`reason` text,
	`format` text DEFAULT 'markdown' NOT NULL,
	`created_by_type` text NOT NULL,
	`created_by_model` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `config_diff_user_idx` ON `config_diff_proposals` (`user_id`);--> statement-breakpoint
CREATE INDEX `config_diff_resource_idx` ON `config_diff_proposals` (`user_id`,`resource_kind`,`resource_id`);--> statement-breakpoint
CREATE INDEX `config_diff_status_idx` ON `config_diff_proposals` (`user_id`,`status`);
