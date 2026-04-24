CREATE TABLE `ai_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`model` text NOT NULL,
	`step_index` integer NOT NULL,
	`tool_name` text NOT NULL,
	`tool_duration_ms` integer,
	`tool_error` text,
	`input_tokens` integer DEFAULT 0,
	`output_tokens` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_tool_calls_user_id_idx` ON `ai_tool_calls` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_tool_calls_created_at_idx` ON `ai_tool_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_tool_calls_tool_name_idx` ON `ai_tool_calls` (`tool_name`);