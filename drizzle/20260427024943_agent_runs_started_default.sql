PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_class` text NOT NULL,
	`agent_name` text NOT NULL,
	`user_id` text NOT NULL,
	`trigger` text DEFAULT 'rest' NOT NULL,
	`input_summary` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`duration_ms` integer,
	`outcome` text DEFAULT 'started' NOT NULL,
	`error_message` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real,
	`steps` integer DEFAULT 0 NOT NULL,
	`tools_called` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_runs`("id", "agent_class", "agent_name", "user_id", "trigger", "input_summary", "started_at", "finished_at", "duration_ms", "outcome", "error_message", "input_tokens", "output_tokens", "cost_usd", "steps", "tools_called", "created_at") SELECT "id", "agent_class", "agent_name", "user_id", "trigger", "input_summary", "started_at", "finished_at", "duration_ms", "outcome", "error_message", "input_tokens", "output_tokens", "cost_usd", "steps", "tools_called", "created_at" FROM `agent_runs`;--> statement-breakpoint
DROP TABLE `agent_runs`;--> statement-breakpoint
ALTER TABLE `__new_agent_runs` RENAME TO `agent_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `agent_runs_user_id_idx` ON `agent_runs` (`user_id`);--> statement-breakpoint
CREATE INDEX `agent_runs_class_idx` ON `agent_runs` (`agent_class`);--> statement-breakpoint
CREATE INDEX `agent_runs_user_class_idx` ON `agent_runs` (`user_id`,`agent_class`);--> statement-breakpoint
CREATE INDEX `agent_runs_started_at_idx` ON `agent_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `agent_runs_outcome_idx` ON `agent_runs` (`outcome`);