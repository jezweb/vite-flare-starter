CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`source` text NOT NULL,
	`path` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_name_unique` ON `skills` (`name`);--> statement-breakpoint
CREATE INDEX `skills_source_idx` ON `skills` (`source`);--> statement-breakpoint
CREATE INDEX `skills_enabled_idx` ON `skills` (`enabled`);