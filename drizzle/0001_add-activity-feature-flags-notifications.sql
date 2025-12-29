CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`action` text NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text NOT NULL,
	`entityName` text,
	`changes` text,
	`metadata` text,
	`ipAddress` text,
	`userAgent` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_logs_user_idx` ON `activity_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `activity_logs_entity_type_idx` ON `activity_logs` (`entityType`);--> statement-breakpoint
CREATE INDEX `activity_logs_entity_id_idx` ON `activity_logs` (`entityId`);--> statement-breakpoint
CREATE INDEX `activity_logs_action_idx` ON `activity_logs` (`action`);--> statement-breakpoint
CREATE INDEX `activity_logs_created_at_idx` ON `activity_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `activity_logs_entity_lookup_idx` ON `activity_logs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'core' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`icon` text,
	`menuPath` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`updatedBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_feature_flags_category` ON `feature_flags` (`category`);--> statement-breakpoint
CREATE INDEX `idx_feature_flags_enabled` ON `feature_flags` (`enabled`);--> statement-breakpoint
CREATE TABLE `user_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`type` text DEFAULT 'system' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`read` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_notifications_userId_idx` ON `user_notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `user_notifications_userId_read_idx` ON `user_notifications` (`userId`,`read`);--> statement-breakpoint
CREATE INDEX `user_notifications_createdAt_idx` ON `user_notifications` (`createdAt`);