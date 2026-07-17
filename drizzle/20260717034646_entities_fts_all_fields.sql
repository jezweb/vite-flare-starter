-- Widen the entities FTS index from (title, $.body) to (title, ALL
-- top-level text field values) — #62(5).
--
-- The original index only saw fields.body, so entities storing their
-- searchable text under any other key ($.content, $.description,
-- $.notes, a CRM's $.summary…) were invisible to /api/search/entities.
-- A generic entity store can't know the key names in advance, so the
-- triggers now concatenate every top-level string value in `fields`
-- via json_each. Non-string values (numbers, nested objects/arrays)
-- are skipped — indexing serialised JSON would pollute BM25 with
-- braces and key noise.
--
-- Rebuild strategy: drop-and-recreate. The FTS table is derived data
-- (see the backfill), so this is safe on live databases.
DROP TRIGGER IF EXISTS "entities_fts_ai";--> statement-breakpoint
DROP TRIGGER IF EXISTS "entities_fts_au";--> statement-breakpoint
DROP TRIGGER IF EXISTS "entities_fts_ad";--> statement-breakpoint
DROP TABLE IF EXISTS "entities_fts";--> statement-breakpoint

CREATE VIRTUAL TABLE "entities_fts" USING fts5(title, body);--> statement-breakpoint

CREATE TRIGGER "entities_fts_ai" AFTER INSERT ON "entities" BEGIN
  INSERT INTO "entities_fts"(rowid, title, body) VALUES (
    NEW.rowid,
    COALESCE(NEW.title, ''),
    COALESCE((
      SELECT group_concat(value, ' ') FROM json_each(NEW.fields)
      WHERE type = 'text'
    ), '')
  );
END;--> statement-breakpoint

CREATE TRIGGER "entities_fts_au" AFTER UPDATE ON "entities" BEGIN
  DELETE FROM "entities_fts" WHERE rowid = OLD.rowid;
  INSERT INTO "entities_fts"(rowid, title, body) VALUES (
    NEW.rowid,
    COALESCE(NEW.title, ''),
    COALESCE((
      SELECT group_concat(value, ' ') FROM json_each(NEW.fields)
      WHERE type = 'text'
    ), '')
  );
END;--> statement-breakpoint

CREATE TRIGGER "entities_fts_ad" AFTER DELETE ON "entities" BEGIN
  DELETE FROM "entities_fts" WHERE rowid = OLD.rowid;
END;--> statement-breakpoint

-- Backfill from existing rows with the widened extraction.
INSERT INTO "entities_fts"(rowid, title, body)
SELECT rowid,
       COALESCE(title, ''),
       COALESCE((
         SELECT group_concat(value, ' ') FROM json_each("entities".fields)
         WHERE type = 'text'
       ), '')
FROM "entities";
