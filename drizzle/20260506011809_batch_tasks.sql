CREATE TABLE `batch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`ref_kind` text NOT NULL,
	`ref_value` text NOT NULL,
	`label` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `batch_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `batch_items_job_idx` ON `batch_items` (`job_id`,`status`);--> statement-breakpoint
CREATE TABLE `batch_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`instruction` text NOT NULL,
	`task_kind` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`total_items` integer NOT NULL,
	`completed_items` integer DEFAULT 0 NOT NULL,
	`failed_items` integer DEFAULT 0 NOT NULL,
	`workflow_id` text,
	`result_summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `batch_jobs_user_idx` ON `batch_jobs` (`user_id`,`status`,`created_at`);