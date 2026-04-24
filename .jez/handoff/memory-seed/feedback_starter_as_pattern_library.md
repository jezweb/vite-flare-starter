---
name: Starter kit is a pattern library, not a strip-and-build template
description: The existing modules in vite-flare-starter serve as reference implementations that teach Claude Code how to build new modules. Deleting them removes the patterns the AI needs.
type: feedback
originSessionId: 81a9b605-104d-47c6-90ea-95d42d80f379
---
The starter's feature modules (chat, files, activity, notifications, etc.) aren't just demo features — they're **reference implementations** that Claude Code reads when building new modules in forked projects. They teach the AI the patterns for this stack: how to create a Hono route, a Drizzle schema, a TanStack Query hook, a React page, and how they wire together.

**Why:** Jez noticed that when features are stripped from a fork, the AI agent building new features starts drifting and producing inconsistent code. The reference implementations keep it on-pattern.

**How to apply:** Don't strip feature modules from the starter. Instead:
- Keep them as working reference code
- Make them opt-in/opt-out via config (feature flags + nav config)
- When forking, disable features in config rather than deleting files
- The AI can still read the disabled modules when building new ones
