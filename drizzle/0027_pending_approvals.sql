-- Approval queue for autonomous agents.
-- When an agent wants to take a destructive action (send email,
-- post to Slack, etc) it stores the request here as `status='pending'`.
-- A human reviews via the UI / API + approves or rejects. On approve,
-- the agent's executeApproved(action, payload) method runs to perform
-- the action with its full env access.

CREATE TABLE IF NOT EXISTS `pending_approvals` (
  `id` TEXT PRIMARY KEY,
  -- Owning user — used for scoping the queue UI and re-targeting the agent.
  `user_id` TEXT NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  -- DO class name (e.g. AssistantAgent). Lets the approver call back
  -- to the right binding when executing.
  `agent_class` TEXT NOT NULL,
  -- The agent's idFromName partition (usually `${userId}:${slug}`).
  `agent_name` TEXT NOT NULL,
  -- Free-form action identifier the agent's executeApproved switches on.
  -- e.g. 'send_email', 'post_message', 'create_calendar_event'.
  `action` TEXT NOT NULL,
  -- One-line human-readable summary the UI shows in the queue list
  -- ("Send email to alice@... — Subject: Re: pricing"). Optional.
  `summary` TEXT,
  -- Action-specific payload (JSON). The agent's executeApproved
  -- knows the schema for each action.
  `payload_json` TEXT NOT NULL,
  -- 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
  `status` TEXT NOT NULL DEFAULT 'pending',
  -- Free-form notes the user added on approval/rejection.
  `note` TEXT,
  -- If user edited the payload during review, the modified version
  -- (overrides payload_json on execute). NULL = unchanged.
  `payload_override_json` TEXT,
  -- Result of executeApproved if status='executed'/'failed'.
  `result_json` TEXT,
  `error_message` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `resolved_at` INTEGER,
  `executed_at` INTEGER
);

CREATE INDEX IF NOT EXISTS `pending_approvals_user_id_idx` ON `pending_approvals`(`user_id`);
CREATE INDEX IF NOT EXISTS `pending_approvals_status_idx` ON `pending_approvals`(`status`);
CREATE INDEX IF NOT EXISTS `pending_approvals_user_status_idx` ON `pending_approvals`(`user_id`, `status`);
CREATE INDEX IF NOT EXISTS `pending_approvals_agent_idx` ON `pending_approvals`(`agent_class`, `agent_name`);
CREATE INDEX IF NOT EXISTS `pending_approvals_created_at_idx` ON `pending_approvals`(`created_at`);
