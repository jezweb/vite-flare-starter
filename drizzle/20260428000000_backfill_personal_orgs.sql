-- Backfill personal orgs for existing users.
--
-- Phase 0 of the multi-tenant org UI work. The user-create hook
-- handles new signups; this migration takes care of users who signed
-- up before the hook landed. Idempotent — only inserts when the user
-- has zero memberships.
--
-- Backfill uses simple naming ("Personal") + user-id-derived slug to
-- avoid SQL string-mangling edge cases. Future signups go through
-- ensurePersonalOrg which uses the user's first name in the display.
-- Existing users can rename their org from the org settings page.

-- 1. Create one org per user without any membership.
INSERT INTO organization (id, name, slug, createdAt)
SELECT
  lower(hex(randomblob(16))) AS id,
  'Personal' AS name,
  'personal-' || substr(u.id, 1, 8) AS slug,
  unixepoch() AS createdAt
FROM user u
WHERE NOT EXISTS (
  SELECT 1 FROM member m WHERE m.userId = u.id
);

-- 2. Add each user as owner of their newly created org.
-- Join via the user-id suffix in the slug — unique by construction
-- since slugs have a UNIQUE constraint and we built them with the
-- substr(userId, 1, 8) suffix.
INSERT INTO member (id, organizationId, userId, role, createdAt)
SELECT
  lower(hex(randomblob(16))) AS id,
  o.id AS organizationId,
  u.id AS userId,
  'owner' AS role,
  unixepoch() AS createdAt
FROM user u
JOIN organization o ON o.slug = 'personal-' || substr(u.id, 1, 8)
WHERE NOT EXISTS (
  SELECT 1 FROM member m WHERE m.userId = u.id
);

-- 3. Backfill activeOrganizationId on every session that doesn't
-- already have one set, picking the user's earliest membership.
-- Without this, sessions created before this migration land on a
-- "no active org" state in the dashboard until the user signs out
-- and back in.
UPDATE session
SET activeOrganizationId = (
  SELECT m.organizationId FROM member m
  WHERE m.userId = session.userId
  ORDER BY m.createdAt ASC
  LIMIT 1
)
WHERE activeOrganizationId IS NULL
  AND EXISTS (SELECT 1 FROM member m WHERE m.userId = session.userId);
