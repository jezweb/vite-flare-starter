-- BYOK service credentials for AI providers + scraping/search APIs.
-- Per-user (optionally per-org) keys that override the operator's
-- env-supplied defaults. Helper layer in src/server/lib/credentials.ts:
--   getServiceKey(env, userId, orgId, provider) →
--     user-credential ?? org-credential ?? env-fallback ?? null
--
-- Encrypted at rest using TOKEN_ENCRYPTION_KEY (same envelope as
-- mcp_connections oauth tokens).

CREATE TABLE IF NOT EXISTS `service_credentials` (
  `id` TEXT PRIMARY KEY,
  -- Owner: a user OR an org. Exactly one is set; the other is NULL.
  `user_id` TEXT REFERENCES `user`(`id`) ON DELETE CASCADE,
  `organization_id` TEXT REFERENCES `organization`(`id`) ON DELETE CASCADE,
  -- Provider id — caller-defined. Examples:
  --   'anthropic', 'openai', 'google_ai', 'openrouter', 'deepseek',
  --   'mistral', 'xai', 'serper', 'brave', 'tavily', 'exa', 'firecrawl'
  `provider` TEXT NOT NULL,
  -- Optional friendly label so users can store multiple keys for the
  -- same provider (e.g. 'production', 'testing'). Most users have one.
  `label` TEXT NOT NULL DEFAULT 'default',
  -- AES-GCM encrypted key value (base64url envelope from crypto.ts).
  `encrypted_value` TEXT NOT NULL,
  -- 'active' | 'revoked' — revoked keys aren't returned by getServiceKey
  -- but stay in the row for audit until manually deleted.
  `status` TEXT NOT NULL DEFAULT 'active',
  -- Last 4 chars of the plaintext key for UI display ("sk-...abcd").
  -- Stored unencrypted because it's not sensitive on its own.
  `last_four` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  -- Exactly one owner.
  CHECK ((user_id IS NOT NULL AND organization_id IS NULL)
      OR (user_id IS NULL AND organization_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS `service_creds_user_idx` ON `service_credentials`(`user_id`);
CREATE INDEX IF NOT EXISTS `service_creds_org_idx` ON `service_credentials`(`organization_id`);
-- Lookup pattern: getServiceKey(provider, owner) — single index per
-- owner type covers it.
CREATE UNIQUE INDEX IF NOT EXISTS `service_creds_user_provider_label_unique`
  ON `service_credentials`(`user_id`, `provider`, `label`)
  WHERE `user_id` IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS `service_creds_org_provider_label_unique`
  ON `service_credentials`(`organization_id`, `provider`, `label`)
  WHERE `organization_id` IS NOT NULL;
