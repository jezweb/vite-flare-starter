-- Per-invocation telemetry for AutonomousAgent runs.
-- One row per runOnce() call (whether triggered by REST, schedule,
-- webhook, or another agent). Captures usage, cost, outcome, and
-- enough context to debug "why did this agent fire and what did it do".
--
-- Companion to aiUsageLogs (which is per-LLM-call, agent-agnostic).
-- This table groups LLM calls under their agent invocation, so
-- "show me everything ResearcherAgent:cf-workers did today" is one
-- query instead of a join + heuristic.

CREATE TABLE IF NOT EXISTS `agent_runs` (
  `id` TEXT PRIMARY KEY,
  -- DO class name (AssistantAgent, ResearcherAgent, etc).
  `agent_class` TEXT NOT NULL,
  -- The agent's idFromName partition (`${userId}:${slug}` or similar).
  `agent_name` TEXT NOT NULL,
  -- Owning user (denormalised for fast filtering).
  `user_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  -- 'rest' | 'schedule' | 'webhook' | 'inter_agent' — what triggered
  -- this run. Lets the dashboard answer "is this agent running on its
  -- own (autonomous) or being driven by user requests?"
  `trigger` TEXT NOT NULL DEFAULT 'rest',
  -- Truncated input text (first ~500 chars). Helps debug "why did
  -- the agent decide to do X" by surfacing the prompt.
  `input_summary` TEXT,
  `started_at` INTEGER NOT NULL,
  `finished_at` INTEGER,
  `duration_ms` INTEGER,
  -- 'ok' | 'error' | 'budget_exceeded'
  `outcome` TEXT NOT NULL DEFAULT 'ok',
  `error_message` TEXT,
  `input_tokens` INTEGER NOT NULL DEFAULT 0,
  `output_tokens` INTEGER NOT NULL DEFAULT 0,
  -- USD cost (REAL) — sum of per-LLM-call costs for this run.
  `cost_usd` REAL,
  -- Number of agent loop steps the LLM took (tool calls included).
  `steps` INTEGER NOT NULL DEFAULT 0,
  -- Comma-separated tool names the LLM called this run. Bounded;
  -- truncate at ~500 chars in the writer.
  `tools_called` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS `agent_runs_user_id_idx` ON `agent_runs`(`user_id`);
CREATE INDEX IF NOT EXISTS `agent_runs_class_idx` ON `agent_runs`(`agent_class`);
CREATE INDEX IF NOT EXISTS `agent_runs_user_class_idx` ON `agent_runs`(`user_id`, `agent_class`);
CREATE INDEX IF NOT EXISTS `agent_runs_started_at_idx` ON `agent_runs`(`started_at`);
CREATE INDEX IF NOT EXISTS `agent_runs_outcome_idx` ON `agent_runs`(`outcome`);
