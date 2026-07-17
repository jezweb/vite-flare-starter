CREATE TABLE `field_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`field_name` text NOT NULL,
	`label` text NOT NULL,
	`field_type` text NOT NULL,
	`options` text,
	`required` integer DEFAULT false NOT NULL,
	`placeholder` text,
	`help_text` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `field_configs_user_type_idx` ON `field_configs` (`user_id`,`entity_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `field_configs_user_type_name_uq` ON `field_configs` (`user_id`,`entity_type`,`field_name`);