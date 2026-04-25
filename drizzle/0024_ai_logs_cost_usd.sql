-- Add per-call USD cost tracking to AI logs.
-- Computed at write time from token counts × the bundled model
-- catalogue's per-Mtok prices. Null when the model isn't priced
-- (Workers AI, unknown ids).
ALTER TABLE `ai_usage_logs` ADD COLUMN `cost_usd` REAL;
ALTER TABLE `ai_tool_calls` ADD COLUMN `cost_usd` REAL;
