---
name: Use Chrome MCP for logged-in views
description: Default to Chrome MCP (mcp__claude-in-chrome__*) whenever a URL requires login; playwright-cli sessions lack auth and keep bouncing to sign-in
type: feedback
originSessionId: 3c7ca3d7-9b2d-4446-8e60-4cf77faf1296
---
When the URL needs an authenticated session (dashboards, admin pages, deployed apps behind OAuth), default to Chrome MCP tools over playwright-cli. Jez is already logged in in his Chrome profile, so navigating there just works. If the specific app isn't logged in, either (a) log in interactively via Chrome MCP or (b) ask Jez to log in on the open tab.

**Why:** We've repeatedly burned time trying to smoketest logged-in views with playwright-cli only to hit the sign-in redirect, take a screenshot of nothing useful, and stall. Chrome MCP reuses the user's real session cookies and skips the whole OAuth dance.

**How to apply:**
- First step for any `*.workers.dev`, `*.jezweb.com.au`, or other app URL behind auth: use `mcp__claude-in-chrome__tabs_context_mcp` to check existing tabs, then `tabs_create_mcp` (or switch to an existing tab) and load the screen.
- Use playwright-cli only when: (a) the page is public, (b) you need parallel isolated sessions, or (c) you specifically need a clean profile without cookies.
- If the live page returns a sign-in wall even in Chrome, ask Jez rather than scripting a login from scratch.
