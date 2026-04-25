-- The hand-rolled `scheduled_runs` audit table is replaced by the
-- Cloudflare `agents` SDK's built-in scheduling + observability event
-- stream. Schedule lifecycle (created/fired/retried/failed) emits
-- structured events that flow into Workers Logs (already enabled);
-- pending schedules are queryable via `agent.getSchedules()` over RPC.
--
-- Forks that want a permanent SQL audit log can subscribe to the SDK's
-- observability events and write to their own table — but the starter
-- doesn't ship one by default to avoid parallel state with the SDK.
DROP TABLE IF EXISTS `scheduled_runs`;
