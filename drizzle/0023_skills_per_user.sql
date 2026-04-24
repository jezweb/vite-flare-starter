-- Per-user skill overrides.
--
-- Before: `skills` table had UNIQUE(name) — one row per skill name,
-- globally shared. Any user editing a skill mutated it for everyone.
--
-- After: UNIQUE(user_id, name) — every user gets their own row per
-- skill name. Bundled skills live at user_id='bundled' and are the
-- fallback when a user has no personal override.
--
-- SQLite can't drop a UNIQUE constraint via ALTER — we have to
-- recreate the table. Existing rows are preserved with
-- user_id='bundled' (they were effectively global already).

PRAGMA defer_foreign_keys = TRUE;

CREATE TABLE `__skills_new` (
    `id` text PRIMARY KEY NOT NULL,
    `user_id` text DEFAULT 'bundled' NOT NULL,
    `name` text NOT NULL,
    `description` text NOT NULL,
    `source` text NOT NULL,
    `path` text NOT NULL,
    `metadata` text DEFAULT '{}' NOT NULL,
    `enabled` integer DEFAULT true NOT NULL,
    `created_at` integer NOT NULL,
    `updated_at` integer NOT NULL
);

INSERT INTO `__skills_new`
    (`id`, `user_id`, `name`, `description`, `source`, `path`, `metadata`, `enabled`, `created_at`, `updated_at`)
SELECT
    `id`,
    'bundled',
    `name`,
    `description`,
    `source`,
    `path`,
    `metadata`,
    `enabled`,
    `created_at`,
    `updated_at`
FROM `skills`;

DROP TABLE `skills`;
ALTER TABLE `__skills_new` RENAME TO `skills`;

CREATE UNIQUE INDEX `skills_user_name_idx` ON `skills` (`user_id`, `name`);
CREATE INDEX `skills_source_idx` ON `skills` (`source`);
CREATE INDEX `skills_enabled_idx` ON `skills` (`enabled`);
