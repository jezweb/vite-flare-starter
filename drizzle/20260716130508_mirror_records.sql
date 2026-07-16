CREATE TABLE `mirror_records` (
	`external_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mirror_records_synced_at_idx` ON `mirror_records` (`synced_at`);