CREATE TABLE `scheduled_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`skill_name` text,
	`cron` text,
	`next_run` integer NOT NULL,
	`last_run` integer,
	`last_result` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scheduled_jobs_user_id_idx` ON `scheduled_jobs` (`user_id`);--> statement-breakpoint
CREATE INDEX `scheduled_jobs_next_run_idx` ON `scheduled_jobs` (`next_run`);--> statement-breakpoint
CREATE INDEX `scheduled_jobs_status_idx` ON `scheduled_jobs` (`status`);