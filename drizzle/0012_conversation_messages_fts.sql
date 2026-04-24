-- Full-text search index for conversation_messages.
--
-- Required to make /api/conversations/search match message bodies — without
-- it, the route silently falls back to LIKE-on-title (see
-- `.jez/artifacts/ux-audit-2026-04-18.md` finding M1).
--
-- Uses FTS5 with `content=` linked back to the source table so storage stays
-- single-copy. Triggers keep the index in sync on INSERT/UPDATE/DELETE.
--
-- The content column indexed is `parts` — a JSON blob of UIMessage parts.
-- FTS5 tokenises it as text, which means users searching "meeting" will match
-- "meeting" inside any { type: "text", text: "..." } inside the JSON.
CREATE VIRTUAL TABLE IF NOT EXISTS "conversation_messages_fts" USING fts5(
  parts,
  content="conversation_messages",
  content_rowid="rowid"
);--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "conversation_messages_fts_ai" AFTER INSERT ON "conversation_messages" BEGIN
  INSERT INTO "conversation_messages_fts"(rowid, parts) VALUES (NEW.rowid, NEW.parts);
END;--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "conversation_messages_fts_ad" AFTER DELETE ON "conversation_messages" BEGIN
  INSERT INTO "conversation_messages_fts"("conversation_messages_fts", rowid, parts) VALUES ('delete', OLD.rowid, OLD.parts);
END;--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "conversation_messages_fts_au" AFTER UPDATE ON "conversation_messages" BEGIN
  INSERT INTO "conversation_messages_fts"("conversation_messages_fts", rowid, parts) VALUES ('delete', OLD.rowid, OLD.parts);
  INSERT INTO "conversation_messages_fts"(rowid, parts) VALUES (NEW.rowid, NEW.parts);
END;--> statement-breakpoint

-- Populate the index from existing rows (no-op on a fresh fork, essential for
-- existing databases that already have conversation history).
INSERT INTO "conversation_messages_fts"("conversation_messages_fts") VALUES ('rebuild');
