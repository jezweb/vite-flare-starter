CREATE TABLE `user_mcp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connector_id` text NOT NULL,
	`display_name` text NOT NULL,
	`url` text NOT NULL,
	`transport` text DEFAULT 'http' NOT NULL,
	`auth_type` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`expires_at` text,
	`scope` text,
	`oauth_client_id` text,
	`oauth_client_secret` text,
	`auth_server_url` text,
	`token_endpoint` text,
	`authorization_endpoint` text,
	`registration_endpoint` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_error` text,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_mcp_connections_user_idx` ON `user_mcp_connections` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_mcp_connections_user_connector_url_idx` ON `user_mcp_connections` (`user_id`,`connector_id`,`url`);--> statement-breakpoint
CREATE TABLE `user_mcp_tool_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`policy` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `user_mcp_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_mcp_tool_policies_connection_tool_idx` ON `user_mcp_tool_policies` (`connection_id`,`tool_name`);