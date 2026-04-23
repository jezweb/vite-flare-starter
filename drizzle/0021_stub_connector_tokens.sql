CREATE TABLE `user_slack_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`scope` text NOT NULL,
	`account_label` text,
	`account_identifier` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_notion_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`scope` text NOT NULL,
	`account_label` text,
	`account_identifier` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_atlassian_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`scope` text NOT NULL,
	`account_label` text,
	`account_identifier` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
