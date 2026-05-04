-- Full-text search index for entities.
--
-- Required to make /api/search/entities match entity titles + bodies
-- (the latter lives at fields.body inside the JSON `fields` column).
--
-- entities.fields is a JSON blob, so we cannot use FTS5's content="entities"
-- linkage directly — FTS5 indexes columns, not JSON paths. Instead this is
-- a "contentless" (well, content-less-of-source) FTS5 table that stores its
-- own copy of (title, body), populated by triggers that read JSON_EXTRACT
-- on every INSERT/UPDATE.
--
-- Storage cost is small: title + first ~hundreds of chars of body per row.
-- The win: query-time JSON_EXTRACT is replaced with BM25-ranked FTS lookups.
CREATE VIRTUAL TABLE IF NOT EXISTS "entities_fts" USING fts5(title, body);--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "entities_fts_ai" AFTER INSERT ON "entities" BEGIN
  INSERT INTO "entities_fts"(rowid, title, body) VALUES (
    NEW.rowid,
    COALESCE(NEW.title, ''),
    COALESCE(JSON_EXTRACT(NEW.fields, '$.body'), '')
  );
END;--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "entities_fts_au" AFTER UPDATE ON "entities" BEGIN
  DELETE FROM "entities_fts" WHERE rowid = OLD.rowid;
  INSERT INTO "entities_fts"(rowid, title, body) VALUES (
    NEW.rowid,
    COALESCE(NEW.title, ''),
    COALESCE(JSON_EXTRACT(NEW.fields, '$.body'), '')
  );
END;--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS "entities_fts_ad" AFTER DELETE ON "entities" BEGIN
  DELETE FROM "entities_fts" WHERE rowid = OLD.rowid;
END;--> statement-breakpoint

-- Backfill from existing rows. No-op on a fresh fork; essential for
-- forks with existing entity data.
INSERT INTO "entities_fts"(rowid, title, body)
SELECT rowid,
       COALESCE(title, ''),
       COALESCE(JSON_EXTRACT(fields, '$.body'), '')
FROM "entities";
