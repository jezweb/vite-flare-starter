---
name: Test live app after every non-trivial deploy
description: After deploying changes, actively exercise the live app via Chrome MCP before reporting "done" — don't wait for Jez to find regressions
type: feedback
originSessionId: 3c7ca3d7-9b2d-4446-8e60-4cf77faf1296
---
After any non-trivial deploy to vite-flare-starter, open the live URL via Chrome MCP and actually exercise the affected flows. Type-check + build passing is not enough. Specifically:

- Open the chat page, send a test message, watch it stream and persist.
- If I changed attachments: drag-and-drop a real file, watch the tile, submit, open preview.
- If I changed message rendering: scroll through an existing conversation, check no broken images / no weird corners / no extra scrollbars / no empty states.
- If I changed persistence: switch between two conversations, navigate to /new, confirm messages update correctly.
- If I touched tools (generate_image, audio, file upload): trigger the tool, confirm the output renders and the URL resolves.
- Read DOM via `mcp__claude-in-chrome__javascript_tool` to find hidden issues (broken `<img>` tags, nested scrollers, 4xx fetches, unexpected ghost rows in D1, stale cached hashes).
- Check `read_console_messages` with `onlyErrors: true` before declaring success.

**Why this rule exists:** Jez has repeatedly found regressions I could have caught: broken attachment URLs after a key-prefix rename, two scrollbars after a layout refactor, nested rounded corners, ghost empty conversations in D1, conversation switch not re-hydrating messages. Each one was visible within 30 seconds of actually using the app.

**How to apply:** Before posting "deployed" to the user, spend a minute dogfooding in the Chrome MCP tab. If I'm changing visible UI or user-triggered flows, I'm not done until I've seen it work in the browser.
