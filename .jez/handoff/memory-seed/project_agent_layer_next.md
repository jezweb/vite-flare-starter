---
name: Agent layer is the next major evolution
description: The toolkit (53+ tools, skills, UI) is complete at v1.6.0. The next step is conversation persistence, proactive behaviour, and Cloudflare Agents SDK integration — making the AI an active participant, not just a responder.
type: project
originSessionId: 81a9b605-104d-47c6-90ea-95d42d80f379
---
The starter reached v1.6.0 with a comprehensive toolkit layer. Jez wants to explore the **agent layer** — how the AI participates in the system rather than just responding.

**Why:** Every project Jez builds (l2chat, ClawHQ, Athena, Apollo) ends up needing: conversation persistence, proactive scheduling, self-improving skills, and multi-agent coordination. The starter should provide this foundation.

**How to apply:** Next session should:
1. Research Cloudflare Agents SDK (https://github.com/cloudflare/agents) — DO-based agents with hibernation, WebSocket, scheduling
2. Design conversations + messages D1 schema (or DO storage)
3. Consider making the chat a Durable Object instead of a stateless Worker route
4. Build: conversation persistence, proactive webhook→agent triggers, self-improvement loop
5. Reference: l2chat's storage.ts, ClawHQ's KV history, Athena's DO.alarm() loop

**Key insight from Jez:** "What does it look like for the agent to participate in the system, not just respond to the user?" — this is the design question for the agent layer.
