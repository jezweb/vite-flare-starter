-- Narrow the AFTER UPDATE trigger on knowledge_documents to fire only when
-- title/summary/body/tags actually change. The original trigger had no
-- column list, so even a metadata-only PATCH (injectionMode toggle) would
-- delete + reinsert the full body in the FTS5 index. For 100KB bodies that
-- meant ~200KB of FTS churn per metadata edit. Caught by 2026-05-07
-- brains-trust review.
--
-- Drizzle generates the journal-tracked migrations; this one is hand-written
-- because drizzle-kit doesn't model SQLite trigger column-lists.

DROP TRIGGER IF EXISTS "knowledge_documents_fts_au";--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "knowledge_documents_fts_au"
  AFTER UPDATE OF title, summary, body, tags ON "knowledge_documents"
BEGIN
  INSERT INTO "knowledge_documents_fts"("knowledge_documents_fts", rowid, title, summary, body, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.summary, OLD.body, OLD.tags);
  INSERT INTO "knowledge_documents_fts"(rowid, title, summary, body, tags)
  VALUES (NEW.rowid, NEW.title, NEW.summary, NEW.body, NEW.tags);
END;
