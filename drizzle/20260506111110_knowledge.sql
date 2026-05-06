CREATE TABLE `knowledge_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body` text NOT NULL,
	`format` text DEFAULT 'markdown' NOT NULL,
	`injection_mode` text DEFAULT 'on_demand' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`estimated_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_scope_idx` ON `knowledge_documents` (`scope`,`scope_id`);--> statement-breakpoint
CREATE INDEX `knowledge_injection_idx` ON `knowledge_documents` (`injection_mode`);--> statement-breakpoint
CREATE INDEX `knowledge_scope_injection_idx` ON `knowledge_documents` (`scope`,`scope_id`,`injection_mode`);--> statement-breakpoint

-- Full-text search index for knowledge_documents.
--
-- Drives /api/knowledge/search and the knowledge_search agent tool. Indexes
-- title + summary + body + tags so users can grep against doc content rather
-- than just metadata. Uses FTS5 with `content=` linked back to
-- knowledge_documents — the index stores no copy of the source data, just
-- references rowids. Triggers keep the index in sync on INSERT/UPDATE/DELETE
-- (the 'delete' magic value is FTS5's contentless-update protocol).
CREATE VIRTUAL TABLE IF NOT EXISTS "knowledge_documents_fts" USING fts5(
  title,
  summary,
  body,
  tags,
  content="knowledge_documents",
  content_rowid="rowid",
  tokenize='porter unicode61'
);--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "knowledge_documents_fts_ai" AFTER INSERT ON "knowledge_documents" BEGIN
  INSERT INTO "knowledge_documents_fts"(rowid, title, summary, body, tags)
  VALUES (NEW.rowid, NEW.title, NEW.summary, NEW.body, NEW.tags);
END;--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "knowledge_documents_fts_ad" AFTER DELETE ON "knowledge_documents" BEGIN
  INSERT INTO "knowledge_documents_fts"("knowledge_documents_fts", rowid, title, summary, body, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.summary, OLD.body, OLD.tags);
END;--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "knowledge_documents_fts_au" AFTER UPDATE ON "knowledge_documents" BEGIN
  INSERT INTO "knowledge_documents_fts"("knowledge_documents_fts", rowid, title, summary, body, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.summary, OLD.body, OLD.tags);
  INSERT INTO "knowledge_documents_fts"(rowid, title, summary, body, tags)
  VALUES (NEW.rowid, NEW.title, NEW.summary, NEW.body, NEW.tags);
END;--> statement-breakpoint

-- Populate the index from existing rows (no-op on a fresh fork, essential for
-- forks with existing data — the 'rebuild' magic command does both).
INSERT INTO "knowledge_documents_fts"("knowledge_documents_fts") VALUES ('rebuild');