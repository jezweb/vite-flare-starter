-- seed-virtual-test-data.sql
--
-- Seeds 1000 fake activity_log rows + a 500-message chat conversation
-- for stress-testing virtualization on the Activity page and Chat
-- transcript. Issue #52 phase 1.
--
-- Usage (LOCAL ONLY — never --remote):
--
--   # 1. Set the user id to seed against. Sign in to the local app
--   #    once, then grab the id with:
--   #
--   #    npx wrangler d1 execute DB --local \
--   #      --command "SELECT id, email FROM user LIMIT 5"
--   #
--   # 2. Edit the @user_id below if you don't want the default.
--   #
--   # 3. Run the script:
--   #
--   #    npx wrangler d1 execute DB --local \
--   #      --file .jez/scripts/seed-virtual-test-data.sql
--
-- Cleanup (after dogfooding):
--
--   DELETE FROM activity_logs WHERE entityName LIKE '[VIRT-TEST]%';
--   DELETE FROM conversations WHERE title = '[VIRT-TEST] 500-message stress conversation';
--   -- (cascade-deletes conversation_messages rows)
--
-- This script uses recursive CTEs so D1's "no procedural SQL" limit is
-- a non-issue — the rows are produced in a single INSERT ... SELECT.

-- ─── Activity logs ───────────────────────────────────────────────────
-- 1000 activity_log rows for the seed-user-001 (default test user).
-- Mixed actions / entities / timestamps so filters feel realistic.

WITH RECURSIVE counter(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM counter WHERE n < 1000
)
INSERT INTO activity_logs (
  id, userId, action, entityType, entityId, entityName,
  changes, metadata, createdAt
)
SELECT
  -- Stable ids so re-running this script produces idempotent rows
  -- you can DELETE by prefix.
  printf('virt-test-act-%04d', n) AS id,
  'seed-user-001' AS userId,
  CASE (n % 11)
    WHEN 0 THEN 'create'
    WHEN 1 THEN 'update'
    WHEN 2 THEN 'delete'
    WHEN 3 THEN 'archive'
    WHEN 4 THEN 'restore'
    WHEN 5 THEN 'import'
    WHEN 6 THEN 'export'
    WHEN 7 THEN 'assign'
    WHEN 8 THEN 'unassign'
    WHEN 9 THEN 'view'
    ELSE 'convert'
  END AS action,
  CASE (n % 5)
    WHEN 0 THEN 'contact'
    WHEN 1 THEN 'project'
    WHEN 2 THEN 'conversation'
    WHEN 3 THEN 'file'
    ELSE 'note'
  END AS entityType,
  printf('entity-%04d', n) AS entityId,
  printf('[VIRT-TEST] Sample row %d', n) AS entityName,
  NULL AS changes,
  NULL AS metadata,
  -- Spread timestamps over the last 90 days so "today" / "this week"
  -- counters in the StatGrid show realistic numbers.
  -- D1 stores `createdAt` as a unix-second integer (mode: 'timestamp').
  (strftime('%s', 'now') - (n * 60 * 60 * 2)) AS createdAt
FROM counter;

-- ─── Chat conversation + 500 messages ────────────────────────────────
-- One conversation, alternating user / assistant messages.

INSERT OR REPLACE INTO conversations (
  id, user_id, title, model, created_at, updated_at, kind
) VALUES (
  'virt-test-conv-001',
  'seed-user-001',
  '[VIRT-TEST] 500-message stress conversation',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  strftime('%s', 'now') - (500 * 60),
  strftime('%s', 'now'),
  'chat'
);

WITH RECURSIVE counter(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM counter WHERE n < 500
)
INSERT INTO conversation_messages (
  id, conversation_id, role, parts, metadata, created_at
)
SELECT
  printf('virt-test-msg-%04d', n) AS id,
  'virt-test-conv-001' AS conversation_id,
  CASE (n % 2) WHEN 1 THEN 'user' ELSE 'assistant' END AS role,
  -- AI SDK v6 UIMessage parts JSON: a single text part is enough to
  -- exercise the virtualizer; vary length so heights are non-uniform.
  CASE (n % 4)
    WHEN 0 THEN
      printf('[{"type":"text","text":"Short message %d. Quick check."}]', n)
    WHEN 1 THEN
      printf('[{"type":"text","text":"Medium message %d. This is a slightly longer reply that takes a couple of lines on a typical viewport so we can see the virtualizer measuring varied heights."}]', n)
    WHEN 2 THEN
      printf('[{"type":"text","text":"Long message %d.\n\nFirst paragraph with a bit of context.\n\nSecond paragraph that runs longer to bump the rendered height up past the 80px estimate. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\nThird paragraph for good measure."}]', n)
    ELSE
      printf('[{"type":"text","text":"Message %d — middle length, useful for the average row case."}]', n)
  END AS parts,
  NULL AS metadata,
  (strftime('%s', 'now') - ((500 - n) * 60)) AS created_at
FROM counter;
