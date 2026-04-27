# Routines Research: Scheduled & Event-Driven Agent Patterns (2026)

**Date:** 2026-04-27  
**Scope:** Anthropic, Google, OpenAI, n8n, Zapier, OpenClaw, Claude Code — what's shipping, naming, UX patterns

---

## Terminology Table: What Everyone Calls It

| Product | Term | Trigger Types | Destination | Status |
|---|---|---|---|---|
| **Claude Code (Anthropic)** | Routines | schedule, API, GitHub webhook | cloud (Anthropic-managed) | research preview (Apr 2026) |
| **Claude Desktop** | Scheduled tasks | schedule only | local machine | GA |
| **Anthropic Agent SDK** | Tasks / loops | programmatic | embedded | GA |
| **OpenClaw (Anthropic fork)** | Scheduled tasks / cron | schedule (cron expr), heartbeat (30m) | local gateway | GA |
| **Google Gemini Enterprise** | Scheduled agents | schedule (hourly/daily/weekly/monthly/annual) | cloud | GA |
| **OpenAI Workspace Agents** | Automations / agents | schedule, webhook triggers | cloud | research preview (through May 6, 2026) |
| **n8n** | Workflows + Schedule trigger | schedule (minute/daily/weekly), webhook | distributed | GA |
| **Zapier** | Zaps / automations | schedule, webhook | cloud | GA |

**Pick:** "Routines" (matches Claude Code + aligns with "recurring task" semantics). Avoid "tasks" (too generic); "automations" feels lower-IQ.

---

## 10 Patterns Worth Stealing

### 1. **Three Trigger Types, Optionally Stacked**
Claude Code's model is clean: a single routine can have any combination of:
- **Schedule** (cron-like: hourly, daily, weekly, custom intervals)
- **API** (HTTP POST with bearer token, optional context in body)
- **Event** (GitHub webhooks, Slack app events, etc.)

A single PR review routine triggers nightly *and* on every PR *and* via manual API call. The unified model beats separate "scheduled task" vs "webhook handler" primitives.

### 2. **Run-Specific Context Injection**
Claude Code's API trigger accepts a `text` field (freeform) passed alongside the saved prompt. Sentry alert? Pass the alert body. Deploy script? Pass build metadata. The routine sees both its fixed prompt AND the injected context — no need to re-configure.

### 3. **Repository + Connectors as First-Class Config**
Routines clone one or more repos at run start (fresh default branch), plus bundle any MCP connectors (Slack, Linear, Google Drive). Access is explicit: remove connectors the routine doesn't need. No implicit "agent can access everything."

### 4. **Session-Based Observability**
Every routine run is a full Claude Code session. Jez can click through to watch it live, review changes, create a PR, or continue the conversation. Not a black-box log stream — it's the same debugging surface as interactive work.

### 5. **Branch Scoping (claude/ prefix by default)**
Routines push to `claude/`-prefixed branches by default, preventing accidental commits to protected or long-lived branches. Opt-in override per repository for trusted routines. Beats "routine can do anything" model.

### 6. **Environment as Configuration Layer**
Routines run in a "cloud environment" that controls:
- Network access (restricted, full, or allowlist)
- Environment variables (API keys, secrets)
- Setup script (dependency caching, tool install)

This separates routine logic from infrastructure, making prompts portable and reusable.

### 7. **Inbox + Approval Queue (vite-flare-starter pattern)**
The starter ships `modules/approvals/` — a unified queue for findings that need human review. Not "alert → slack message → human digs through Slack." It's "agent surfaces finding → Inbox → human reviews + approves → agent executes."

### 8. **Decision vs Approval Frame Distinction**
- **Approval**: "Agent says do X. Approve? Yes/No" — gates execution
- **Decision**: "Agent found X (here's why + context). What should I do?" — informs human judgment

vite-flare-starter uses the decision frame: approval card shows the *finding* (not just a yes/no gate), context, and recommendations. Human decides next steps. Better UX than gatekeeping.

### 9. **Episodic + Semantic Memory Hybrid**
Long-running agents (LinkedIn's CMA, MemMachine) store *both* raw episodes (ground truth, searchable) *and* summaries (efficient retrieval). Compaction happens at write time (selective summarization) not at read time (aggressive pruning). Routines that run 100+ times can reference prior runs without context explosion.

### 10. **One-Off Runs Bypass Daily Caps**
Claude Code distinguishes scheduled routine runs (capped per day per account) from one-off runs (exempt, use regular subscription allowance). Jez can always kick off an urgent task without waiting for tomorrow's quota reset.

---

## 3 Anti-Patterns to Avoid

### ❌ "Smart" Buffering of Multiple Triggers
Don't batch or deduplicate triggers. "If both schedule and webhook fire within 5 minutes, run once" sounds efficient but breaks observability. Each trigger maps to one session. Events that blur together become indistinguishable in logs.

**Better:** Let duplicates happen. Sessions are cheap. Deduplication lives in the agent's prompt ("if you've already processed this PR, skip").

### ❌ Implicit Connector Access
"Agent can use any connector" → implicit security. Routines should explicitly list connectors they need. Removing one prevents the agent from accidentally leaking data to Slack. Makes it obvious what the routine touches.

### ❌ Approvals Without Context
Don't show "Agent wants to push to main. Approve?" without showing *what* it's pushing, *why*, and *what changed*. vite-flare-starter's ConfigDiffCard pattern (diff + before/after + rationale) is the minimum context bar.

---

## One-Paragraph Recommendation

**Our Routines + Inbox should feel like:** A Routine is a Claude Code session that runs on a schedule (or webhook, or API call) and lands *findings* in an Inbox instead of just executing blindly. The Inbox shows what the routine discovered, why it matters, and what the human should decide (not just approve). Approvals are *framed as decisions* — "Here's what I found. What should we do?" — not gatekeeping. Multiple routines can fan findings to the same Inbox. Humans review once, approve once, routine executes. Context for long-running routines comes from episodic memory (raw prior runs) + summaries (efficient lookup). Each routine run is a full session, clickable for live debugging or post-mortem review. Ship on Claude Code's Routines API (schedule + webhook + API trigger) as the plumbing, vite-flare-starter's approvals UI as the UX, and episodic memory blocks (via Vectorize) for context across runs.

---

## References & Source Material

### Official Documentation
- [Claude Code: Automate work with routines](https://code.claude.com/docs/en/routines) — schedule, API, GitHub triggers, connectors, environments
- [Google Gemini Enterprise: Schedule agent executions](https://docs.cloud.google.com/gemini/enterprise/docs/agent-designer/schedule-agent)
- [OpenClaw Concepts: Agent runtime](https://docs.openclaw.ai/concepts/agent) — cron, heartbeat, multi-agent coordination
- [n8n: AI Agents + Workflows](https://n8n.io/ai/) — 70+ AI nodes, human-in-the-loop approvals

### Research
- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [LinkedIn: Cognitive Memory Agent (CMA)](https://www.infoq.com/news/2026/04/linkedin-cognitive-memory-agent/) — episodic + semantic + procedural layers
- [MemMachine: Ground-truth-preserving memory](https://arxiv.org/html/2604.04853v1)
- [Google Cloud: Choose a design pattern for agentic AI](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system)

### Product News (2026)
- [Anthropic adds 'routines' to Claude Code for scheduled agent tasks](https://tessl.io/blog/anthropic-adds-routines-to-claude-code-for-scheduled-agent-tasks/) — launched April 14, 2026
- [OpenAI Workspace Agents: ChatGPT automation](https://www.gncrypto.news/news/openai-workspace-agents-chatgpt-automation/) — research preview through May 6, 2026

---

**Last Updated:** 2026-04-27
