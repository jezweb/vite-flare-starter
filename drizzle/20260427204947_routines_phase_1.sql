CREATE TABLE `routine_cadence_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`from_interval` integer NOT NULL,
	`to_interval` integer NOT NULL,
	`reason` text,
	`applied` integer DEFAULT false NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routine_cadence_changes_routine_id_idx` ON `routine_cadence_changes` (`routine_id`);--> statement-breakpoint
CREATE TABLE `routine_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`agent_run_id` text,
	`run_number` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`input_context_summary` text,
	`output_summary` text,
	`outcome` text DEFAULT 'started' NOT NULL,
	`cost_usd` real,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routine_runs_routine_id_idx` ON `routine_runs` (`routine_id`);--> statement-breakpoint
CREATE INDEX `routine_runs_started_at_idx` ON `routine_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `routine_runs_routine_run_idx` ON `routine_runs` (`routine_id`,`run_number`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`agent_class` text NOT NULL,
	`agent_name` text NOT NULL,
	`trigger_kind` text DEFAULT 'schedule' NOT NULL,
	`trigger_config_json` text,
	`input_template_json` text,
	`tools_allowed_json` text,
	`skills_loaded_json` text,
	`hooks_json` text,
	`enabled` integer DEFAULT true NOT NULL,
	`base_interval` integer,
	`min_interval` integer,
	`max_interval` integer,
	`effective_interval` integer,
	`adjust_mode` text DEFAULT 'suggested' NOT NULL,
	`daily_budget_usd` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_run_at` integer,
	`last_outcome` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routines_user_id_idx` ON `routines` (`user_id`);--> statement-breakpoint
CREATE INDEX `routines_enabled_idx` ON `routines` (`enabled`);--> statement-breakpoint
CREATE INDEX `routines_trigger_kind_idx` ON `routines` (`trigger_kind`);