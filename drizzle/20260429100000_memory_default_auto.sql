-- Flip the schema-level default for memoryUpdateMode from 'ask' to 'auto'
-- on existing rows that haven't been deliberately changed.
--
-- Justification: 'ask' was the only default before commit 2099523 — anyone
-- whose row currently reads 'ask' got it by default, not by deliberate
-- choice. Flipping them to 'auto' matches the new "best UX for a new user"
-- product decision (memory updates apply automatically, diff-review is
-- opt-in via Settings → Memory).
--
-- This migration only touches rows where the field equals 'ask'. Users who
-- explicitly chose 'never' keep that. Anyone who later wants 'ask' back
-- can flip it from Settings.
UPDATE user
SET memoryUpdateMode = 'auto'
WHERE memoryUpdateMode = 'ask';

UPDATE projects
SET memory_update_mode = 'auto'
WHERE memory_update_mode = 'ask';
