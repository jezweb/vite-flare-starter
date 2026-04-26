-- better-auth Organization plugin tables (v1: organization + member only).
-- The plugin manages CRUD via its database adapter; we just provide the
-- tables. Schema mirrors better-auth's internal model:
--   https://www.better-auth.com/docs/plugins/organization#schema
--
-- Deferred for a later phase: invitation, team, teamMember,
-- organizationRole (custom roles). Current scope: orgs + members
-- with the default owner/admin/member roles.
--
-- Also adds activeOrganizationId to the session table — better-auth
-- uses this to track which org a user is currently scoped to. Used
-- by route guards (requireActiveOrg) and by app code reading the
-- active org without re-querying every request.

CREATE TABLE IF NOT EXISTS `organization` (
  `id` TEXT PRIMARY KEY,
  `name` TEXT NOT NULL,
  -- URL-safe identifier (also used for vanity routes if a fork wants).
  `slug` TEXT NOT NULL UNIQUE,
  `logo` TEXT,
  -- JSON blob for arbitrary org metadata (settings, branding, etc).
  `metadata` TEXT,
  `createdAt` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS `organization_slug_idx` ON `organization`(`slug`);

CREATE TABLE IF NOT EXISTS `member` (
  `id` TEXT PRIMARY KEY,
  `organizationId` TEXT NOT NULL REFERENCES `organization`(`id`) ON DELETE CASCADE,
  `userId` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  -- Default roles: owner, admin, member. Forks adding custom roles
  -- store them as plain strings; the org plugin's AC system enforces
  -- via the OrganizationOptions.ac config when set.
  `role` TEXT NOT NULL DEFAULT 'member',
  `createdAt` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS `member_org_idx` ON `member`(`organizationId`);
CREATE INDEX IF NOT EXISTS `member_user_idx` ON `member`(`userId`);
-- Composite — prevents the same user being a member of the same org
-- twice via app code. (Better-auth's API enforces this too; the
-- index is defence-in-depth + makes "is X in org Y" lookups O(1).)
CREATE UNIQUE INDEX IF NOT EXISTS `member_user_org_unique` ON `member`(`organizationId`, `userId`);

-- Augment session with activeOrganizationId. Better-auth reads/writes
-- this via the org plugin; we add the column so the schema matches.
ALTER TABLE `session` ADD COLUMN `activeOrganizationId` TEXT REFERENCES `organization`(`id`) ON DELETE SET NULL;

-- Opt-in scoping: entities can belong to an org instead of (or
-- alongside) a single user. NULL = personal entity (current behaviour).
-- Forks that want everything org-scoped fill this on every insert
-- and add membership checks at the route layer.
ALTER TABLE `entities` ADD COLUMN `organization_id` TEXT REFERENCES `organization`(`id`) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS `entities_org_idx` ON `entities`(`organization_id`);
