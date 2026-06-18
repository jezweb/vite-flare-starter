CREATE TABLE `walkabout_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`page_path` text,
	`model_used` text,
	`latency_ms` integer,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_walkabout_questions_user_created` ON `walkabout_questions` (`user_id`,`created_at`);