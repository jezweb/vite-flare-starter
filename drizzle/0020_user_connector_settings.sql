CREATE TABLE `user_connector_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`enabled_tools_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_connector_settings_user_connector_uidx` ON `user_connector_settings` (`user_id`,`connector_id`);
