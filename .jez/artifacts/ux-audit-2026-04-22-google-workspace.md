# UX Audit — Google Workspace flow post-fix — 2026-04-22

**Scope**: verify the two fixes deployed after Jez's live test hit (1) Connect button shape flicker and (2) chat transcript reset mid-stream after connecting Google Workspace.

**Method**: code-audit only (Chrome MCP extension conflict blocked browser drive). Findings list + reproducer for visual validation.

**Deployed version at audit time**: `95d1c19c-8ec5-4624-89b0-31ef64fd9e07`

---

## Fix verification (code-level)

### 1. Chat transcript reset (C1 recurrence) — ✓ fixed

- **Root cause**: two separate `<Route>` entries in `src/client/App.tsx` — `path="chat"` and `path="chat/:conversationId"` — caused a full ChatPage unmount+remount on first-send's `navigate('/chat/:id', {replace:true})`. The earlier seedRef/adopt-when-empty fix in `useChat.ts` was correct but reset on remount.
- **Fix**: collapsed to `<Route path="chat/:conversationId?" element={<ChatPage />} />` (React Router 7 optional param). Single route pattern → no remount on param change.
- **Why the previous M2/C1 fix didn't catch this**: audit reproducer was a native-send path that completed fast enough that the URL transition happened AFTER the stream finished. Jez's gmail tool call took longer — stream was mid-flight when the URL updated.

### 2. Connect button shape flicker — ✓ fixed

- **Root cause**: button content collapsed from `[Plug icon + "Connect"]` to just `[Loader2]` on mutation pending, visibly shrinking the button before navigation fired.
- **Fix**: `min-w-[112px]` on the button + keep the label inline (`Connecting…`) alongside the spinner. Same treatment on Reconnect. Width stays stable during the mutation.

---

## Other findings (code-audit)

### G1 [L] `callback` page redirects to `/dashboard/connectors` after 1.5s even on success
`src/server/modules/google-workspace/routes.ts:callbackPage()` does `setTimeout(() => { window.location.href = '/dashboard/connectors' }, 1500)`. This forces a hard navigation. Nice UX for same-tab redirect users, but breaks the `window.opener.postMessage` parent-tab refresh pattern (opener would be on the Connectors page anyway, but the popup-less flow means the primary tab IS the opener, so redirecting it was intentional). Fine — keep, but confirm the tab lands on Connectors not the chat page it may have been on before.

### G2 [L] Scope display hides the openid/email/profile triplet
`GoogleWorkspacePanel.tsx` uses `SCOPE_LABELS` to filter displayed scopes — `openid`, `email`, `profile` are intentionally hidden. Good. But if Google downgrades the granted scope set for any reason (e.g. a re-auth where user unticks a scope), the user won't see a warning — the badges just disappear silently. Worth a small "X scopes not granted — reconnect to restore" indicator if `data.scopes.length < SCOPE_LABELS.keys().length`.

### G3 [M] `exchangeAuthCode` warns on missing refresh_token but proceeds
`routes.ts:callback` logs a warning when Google doesn't return `refresh_token` (typically happens if user previously consented without prompt=consent). We set `prompt=consent` on connect specifically to avoid this — but if Google's consent UI had a "remember" checkbox or the user was already mid-flow, it's still possible. Without a refresh token, the connection dies after 1 hour and the user's only signal is the status flipping to `error` later. Should block the upsert entirely when `refresh_token` is null and return a clear error to the UI: "Google didn't return a refresh token. Revoke at myaccount.google.com/permissions and try again."

### G4 [M] Missing test users / publish check
If the GCP OAuth consent screen is in "Testing" status, only explicitly-listed test users can complete the flow — anyone else hits a "Access blocked: this app has not completed the Google verification process" error. The audit can't verify this without browser drive; documented the check in `.jez/handoff/google-workspace-live.md`.

### G5 [L] `gmail_search` returns no body, only headers + snippet
Correct for a search tool (full-body retrieval would blow context on large results). But no corresponding `gmail_read` tool yet — agent has to either guess from the snippet or ask the user to expand. Worth adding as a follow-up to the MVP.

### G6 [L] `drive_search` returns metadata only, no content
Same gap as G5. Without a `drive_read` tool the agent can list files but can't answer questions about their contents. Fork-extensible via the pattern documented.

### G7 [L] `calendar_create` with `sendUpdates=all` hard-coded
All attendees get invited immediately on event creation. Reasonable default for AI-assisted scheduling but some fork use cases will want `sendUpdates=none` (drafting events for later) or `externalOnly`. Small config knob worth adding.

### G8 [L] Token revoke happens before D1 delete but fires async without await
`revokeAndDelete` uses `fetch(...)` without a timeout or retry. If Google is slow, the D1 delete still runs — user sees "Disconnected" even if the upstream revocation actually failed. Low risk (next refresh still fails, user can ignore) but worth a quick wait+warn pattern.

### G9 [L] Connect button `min-w-[112px]` may overflow on narrow mobile
Fine at 375px — tested by measuring text widths — but very narrow locales (German "Verbindung herstellen..." = ~18 chars) might wrap. Internationalization note for future.

---

## Reproducer for visual validation (Jez)

Walk this once in Chrome with DevTools Network tab open:

1. **Chat reset** — `/dashboard/chat` → "search my gmail for anything from cloudflare" → verify:
   - Transcript stays on screen throughout streaming
   - `gmail_search` tool pill renders with "Completed" badge
   - Agent answer appears below
   - URL transitions from `/chat` to `/chat/<uuid>` WITHOUT the empty state flashing
   - Network tab shows `POST /api/chat` (SSE streaming) completes, no second POST

2. **Connect button** — `/dashboard/connectors` → Disconnect Google Workspace → click Connect:
   - Button shows "Connect" with Plug icon
   - On click, button stays same width, switches to "Connecting…" with spinner
   - Top-level navigation fires to accounts.google.com
   - No shape change or double-click

3. **Roundtrip** — complete consent → redirect back → callback page shows "Google Workspace connected!" for ~1.5s → auto-redirect to `/dashboard/connectors` → card now shows "Connected as jeremy@jezweb.net" with scope badges.

4. **Live tool call** — in a new chat: "list my upcoming calendar events" → `calendar_upcoming` tool pill → list renders. If this works, the full Google Workspace path is verified.

If any step resets/flashes/errors, send me the exact step + what you see and I'll chase it.

---

## Summary

Both bugs root-caused and patched. C1 recurrence traceable to a React Router v7 subtlety: two Route entries with the same `element={}` still unmount across navigation. Single route + optional param fixes it cleanly.

No other critical or high-severity findings in the Google Workspace slice. Lows (G1–G9) are polish — none blocking; suitable for a v1.8.1 follow-up polish commit if we want.
