-- Email log — every outbound email attempt with provider + status.
-- Feeds the admin Email logs view, rate limiting, and per-user activity.
--
-- Drizzle's generator also wanted to re-emit the `projects` table because
-- 0013 used ON DELETE SET NULL explicitly. Those re-emits are removed —
-- they would clobber existing data. Only the email_log is new.

CREATE TABLE IF NOT EXISTS `email_log` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text REFERENCES `user`(`id`) ON DELETE SET NULL,
  `to_address` text NOT NULL,
  `from_address` text NOT NULL,
  `subject` text NOT NULL,
  `template` text,
  `provider` text NOT NULL,
  `status` text NOT NULL,
  `message_id` text,
  `error` text,
  `tags` text,
  `sent_at` integer NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `email_log_user_idx` ON `email_log` (`user_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_log_status_idx` ON `email_log` (`status`,`sent_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_log_template_idx` ON `email_log` (`template`,`sent_at`);
