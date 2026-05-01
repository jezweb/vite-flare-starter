# AdminAgent v1 — plan

**Date**: 2026-05-01
**Status**: Approved (Option A from issue thread), executing
**Linked issue**: gh #49
**Estimated**: ~4 hours, single session

## Scope (intentionally tight)

A new `AdminAgent` extending `AutonomousAgent`, mounted as a member of an
auto-provisioned `#admin` Space, with English-to-routine as the primary
use case.

V1 admin tool set (~14 tools across routines + situational awareness):

**Routines (the core)**
- `list_routines` (read)
- `inspect_routine(id)` (read)
- `list_routine_runs(id, limit)` (read)
- `create_routine(input)` — proposes via approval card
- `update_routine(id, patch)` — proposes via approval card
- `pause_routine(id)` — propose-only in v1
- `run_routine_now(id)` — propose-only in v1
- `delete_routine(id)` — propose-only + confirm

**Situational awareness (read-only, auto)**
- `list_my_agents` — agent registry catalogue
- `list_my_connections` — MCP connections
- `list_my_spaces`
- `list_pending_approvals`
- `list_recent_activity(limit)`
- `list_inbox(filter, limit)`

All write tools route through `requestApproval` so the user sees a
proposal card in Inbox, approves, and the action executes.

## Out of scope for v1

- Capability registry refactor (would 3x the cost, defer)
- Auto-execute on writes (everything is propose-only first)
- Admin tools for: secrets rotation, auth provider changes, deletes of
  users/orgs (refused with a "do this in Settings" message)
- Admin chat for non-current-user data (per-user only)
- Multi-step workflows (e.g. "create routine + invite agent + connect
  Gmail" as one transaction) — v1 lets the user iterate turn-by-turn

## Architecture

```
src/server/modules/autonomous-agents/admin-agent.ts
  AdminAgent extends AutonomousAgent
    static metadata = { displayName: 'Platform Admin', category: 'meta' }
    persona — a "platform operator" persona, knows the starter's
      vocabulary (routines, agents, connections, spaces, approvals)
    buildToolset() — manually composes the admin-tool list (skips
      MCP inheritance because admin actions are platform-internal)
    approval gates per tool name prefix

src/server/modules/admin-tools/
  routines.ts       — 8 routine tools wrapping existing REST handlers
  awareness.ts      — 6 read-only situational tools
  index.ts          — aggregator (matches chat/tools/index.ts shape)

src/client/modules/spaces/
  hooks/useEnsureAdminSpace.ts
    On first sign-in: GET /api/spaces?title=admin → if 0 results,
    POST /api/spaces { title: 'admin', defaultReplyMode: 'always',
                       agents: [{ agentClass: 'AdminAgent', ... }] }
    Triggered from DashboardLayout once authed.
```

## Risk fences (v1 hard rules)

1. `create_routine` rejects if `agentClass === 'AdminAgent'` (recursion guard)
2. AdminAgent is per-user — agent name = `${userId}:admin` (existing pattern)
3. Daily budget cap inherited from base class — already enforced
4. AdminAgent CANNOT call MCP tools (admin actions are platform-internal,
   not third-party — explicit override of the inherited buildToolset)
5. The tool allow-list is the security boundary — anything not on the
   list cannot be called

## Phases (committable independently)

1. **Admin tools — routines** (~60m): 8 routine tools as ToolDefinitions
2. **Admin tools — awareness** (~30m): 6 read-only tools
3. **AdminAgent class** (~30m): persona + buildToolset + recursion guard
4. **Auto-provision #admin space** (~30m): client-side ensure hook
5. **CLAUDE.md + docs** (~15m): pattern note, agent registry entry
6. **Dogfood** (~30m): live test "set up a routine that watches X..."
7. **Close gh #49** (~10m): comment + close with shipped scope

## Resume instructions

Each phase commits independently. If wrangler auth is expired, ship code
+ commit + note "live verification deferred" in commit body.

If dogfood reveals a real gap (e.g. routine schema mismatch), file a
follow-up issue rather than expanding v1 scope.

---

**Last Updated**: 2026-05-01
