-- better-auth Organization plugin — invitation table.
--
-- Deferred from migration 0030. Required by the invite-member +
-- accept-invitation + list-invitations endpoints. Schema mirrors
-- better-auth's internal model:
--   https://www.better-auth.com/docs/plugins/organization#schema
--
-- Lifecycle:
--   1. Inviter calls invite-member → row inserted with status='pending'
--   2. Invitee clicks link, signed-in or signs in → accept-invitation
--      flips status='accepted' AND inserts a member row.
--   3. Invitations expire after 48h by default; better-auth filters
--      expired ones from list-invitations.
--   4. Inviter or owner can cancel → status='cancelled'.

CREATE TABLE IF NOT EXISTS `invitation` (
  `id` TEXT PRIMARY KEY,
  `organizationId` TEXT NOT NULL REFERENCES `organization`(`id`) ON DELETE CASCADE,
  `email` TEXT NOT NULL,
  -- Default role: 'member'. Overridable per-invite from the UI.
  `role` TEXT,
  -- 'pending' | 'accepted' | 'cancelled' | 'rejected'
  `status` TEXT NOT NULL DEFAULT 'pending',
  `inviterId` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  -- Better-auth stores expiresAt as ISO 8601 text. Aligning with
  -- session.expiresAt convention.
  `expiresAt` TEXT NOT NULL,
  `createdAt` INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index by org for the list-invitations endpoint.
CREATE INDEX IF NOT EXISTS `invitation_org_idx` ON `invitation`(`organizationId`);
-- Index by email for "do I have any pending invitations?" lookups.
CREATE INDEX IF NOT EXISTS `invitation_email_idx` ON `invitation`(`email`);
-- Composite — speeds up the most common pending-only query.
CREATE INDEX IF NOT EXISTS `invitation_org_status_idx` ON `invitation`(`organizationId`, `status`);
