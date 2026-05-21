---
date: 2026-05-21
status: pending
owner: jez+claude
---

# Trial: Claude Managed Agents on Cloudflare

Goal: deploy `cloudflare/claude-managed-agents` (CMA), run one real task,
write a comparison to vite-flare-starter's `AutonomousAgent` shape. Confirms
or revises the docs/AGENTS.md "vite-flare-starter vs Claude Managed Agents"
decision matrix entry shipped 2026-05-21 (commit 2f10cca).

## Why deferred

Discovered 2026-05-21 (announcement blog post):
https://blog.cloudflare.com/claude-managed-agents/. Manual prerequisites
that need Jez at the keyboard (Anthropic Console, webhook config, R2 keys)
+ tight context budget in that session. Lifting to a fresh session for
proper attention.

## Prerequisites

- ✓ Cloudflare Paid plan (Containers + Worker Loader bindings are Paid+)
- ✓ Anthropic API key (in `~/Documents/.jez/secrets/anthropic-jez-personal-current.md`)
- ✗ Docker — NOT installed locally. Either install (Docker Desktop or
  OrbStack, ~10 min) OR use the git-based deploy (Workers Builds runs
  the container build in CF cloud, no local Docker needed).
- ✗ Anthropic self-managed environment — has to be created in their Console

## Setup checklist

Run these in order. Steps marked **[Jez]** require browser sign-in; the
rest I can do.

1. **[Jez]** Click "Deploy to Cloudflare" button:
   https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/claude-managed-agents
   - Forks repo to `jezweb/claude-managed-agents` (or chosen name)
   - ⚠ Rename one of the two KV namespaces (the form pre-fills `SECRETS`
     and `EGRESS_POLICIES` with the same default name — rename to
     `<worker>-secrets` and `<worker>-egress-policies`)
2. **[Jez]** Anthropic Console:
   - Create "Self-managed environment" at
     https://platform.claude.com/workspaces/default/environments
   - Copy `ENVIRONMENT_ID` and `ANTHROPIC_ENVIRONMENT_KEY`
3. **[Jez]** Paste secrets in the CF deploy form:
   - `ENVIRONMENT_ID`, `ANTHROPIC_ENVIRONMENT_KEY`, `ANTHROPIC_API_KEY`
   - Placeholder for `WEBHOOK_SECRET` (set properly in step 5)
   - Complete deploy → get `https://<worker>.workers.dev` URL
4. **[Jez]** Anthropic Webhooks (https://platform.claude.com/settings/workspaces/default/webhooks):
   - Set URL to `https://<worker>.workers.dev/webhooks`
   - Copy the generated webhook signing secret
5. **[Claude]** Set the real webhook secret:
   - `cd ~/Documents/claude-managed-agents`
   - `printf "<the-real-secret>" | npx wrangler secret put WEBHOOK_SECRET`
6. **[Claude]** Run a test task — exact command/UI TBD, depends on the
   deployed control plane's interface. Likely:
   - Open the deployed worker URL in browser
   - Trigger a simple Claude task ("list files in /workspace, write a
     hello.txt, list again")
   - Watch via `wrangler tail` for webhook events + tool calls

## What to look for (the comparison)

Write findings to `.jez/artifacts/cma-trial-findings-<date>.md`. Focus on:

| Dimension | What to compare |
|---|---|
| Tool definition shape | Their `defineTool({ name, inputSchema, run })` vs our `ToolDefinition` in `src/server/modules/chat/tools/` — how close, what adapter would look like |
| State flow | Session start/end webhooks vs our DO state-per-(user,conv) |
| Sandbox feel | MicroVM container vs Isolate — pick one for the test |
| Observability | Their sandbox logs + session recording vs our `wrangler tail` + run_audit table |
| Cost surface | Container CPU/memory + Anthropic API calls — note actual $ on test task |
| Customisation ceiling | What custom-tools.js can do vs what AutonomousAgent + tool registry can do |

## Open questions to answer

- Could our vite-flare-starter expose its tools (Gmail, Drive, calendar, etc.) to a CMA deployment via the `defineTool` adapter? Worth ~20 LOC?
- Does CMA's session-state model handle multi-turn refinement (the user types follow-ups) as cleanly as our chat conv DOs?
- What does the cost difference look like for a "agent does 5 tool calls then exits" task — managed vs self-hosted?

## Estimated cost of running the trial

- Cloudflare: marginal (Paid plan already covers Containers; one test
  session would use a few seconds of MicroVM time)
- Anthropic: ~$0.05-0.20 for a simple task with one Claude call + tools
- Total: under $1, well within experimentation budget

## Reference

- Blog: https://blog.cloudflare.com/claude-managed-agents/
- Template: https://github.com/cloudflare/claude-managed-agents
- Decision matrix entry (already shipped): docs/AGENTS.md "vite-flare-starter vs Claude Managed Agents" section (commit 2f10cca)
