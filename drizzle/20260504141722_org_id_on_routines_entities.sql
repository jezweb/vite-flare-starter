ALTER TABLE `routines` ADD `organization_id` text;--> statement-breakpoint
CREATE INDEX `routines_org_idx` ON `routines` (`organization_id`);