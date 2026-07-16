CREATE TABLE `email_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`message_id` text NOT NULL,
	`recipient` text NOT NULL,
	`event_type` text NOT NULL,
	`terminal` integer DEFAULT false NOT NULL,
	`smtp_status_code` text,
	`smtp_response` text,
	`bounce_type` text,
	`bounce_classification` text,
	`domain` text,
	`raw_payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_events_event_id_idx` ON `email_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `email_events_recipient_idx` ON `email_events` (`recipient`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_events_type_idx` ON `email_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_events_message_idx` ON `email_events` (`message_id`);--> statement-breakpoint
CREATE TABLE `email_suppressions` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`reason` text NOT NULL,
	`source_event_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_suppressions_email_idx` ON `email_suppressions` (`email`);