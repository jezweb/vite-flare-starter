ALTER TABLE `user_mcp_connections` ADD `personality_label` text;--> statement-breakpoint
ALTER TABLE `user_mcp_connections` ADD `allowed_agent_names_json` text;--> statement-breakpoint
CREATE INDEX `user_mcp_connections_user_label_idx` ON `user_mcp_connections` (`user_id`,`personality_label`);