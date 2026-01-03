CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`mimeType` text NOT NULL,
	`size` integer NOT NULL,
	`folder` text DEFAULT '/',
	`isPublic` integer DEFAULT false,
	`publicUrl` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
