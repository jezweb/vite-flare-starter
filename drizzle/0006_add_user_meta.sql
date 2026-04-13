CREATE TABLE `user_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_meta_user_key_idx` ON `user_meta` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `user_meta_user_id_idx` ON `user_meta` (`user_id`);