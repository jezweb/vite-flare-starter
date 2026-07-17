CREATE TABLE `share_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`permissions` text DEFAULT 'view' NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`access_count` integer DEFAULT 0 NOT NULL,
	`last_accessed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_tokens_hash_uq` ON `share_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `share_tokens_user_idx` ON `share_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `share_tokens_entity_idx` ON `share_tokens` (`entity_type`,`entity_id`);