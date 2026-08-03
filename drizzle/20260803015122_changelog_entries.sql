CREATE TABLE `changelog_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`release_key` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`category` text DEFAULT 'feature' NOT NULL,
	`version` text,
	`highlight` integer DEFAULT false NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `changelog_entries_release_key_idx` ON `changelog_entries` (`release_key`);--> statement-breakpoint
CREATE INDEX `changelog_entries_published_at_idx` ON `changelog_entries` (`published_at`);