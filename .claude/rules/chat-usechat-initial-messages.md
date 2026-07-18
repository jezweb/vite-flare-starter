# Chat message seeding — the DO is the source of truth

## Current architecture (post-`useAgentChat`)

`src/client/modules/chat/hooks/useChat.ts` wraps `@cloudflare/ai-chat/react`'s
`useAgentChat`. Message history lives in the ChatAgent DO's SQLite; the client
never owns it. Two seams keep that true — breaking either reintroduces the
"transcript wipes mid-stream / remount loops forever" class of bug this rule
used to document:

1. **`conversationId` lives in the URL, not React state.** ChatPage mounts
   only at `/dashboard/chat/:conversationId` (bare `/chat` redirects via
   `NewChatRedirect`, which mints the UUID upfront). `useAgentChat` resolves
   `use(initialMessagesPromise)` under Suspense — an id held in React state
   resets on the suspense remount and loops the hook forever.
2. **`getInitialMessages` is a one-time bridge, not a sync channel.** The SDK
   calls it only when the DO's SQLite is empty (legacy D1-only conversations
   seed the DO on first connect; thereafter the DO wins). Never feed it a
   reactive query result expecting the transcript to follow — it won't, by
   design.

## If tempted to...

| Tempted to | Instead |
|---|---|
| Hold `conversationId` in `useState` / component state | Keep it in the route; navigate to change conversations |
| Push fetched messages into the chat after mount (`setMessages` sync) | Trust the DO; it already has them. Fix the DO/projection if it doesn't |
| Reintroduce a reactive `initialMessages`/`messages` prop | `getInitialMessages` is the only seed path, and only for empty DOs |

## History

Pre-2026-07 this file described a freeze-ref workaround for `@ai-sdk/react`'s
reactive `initialMessages` prop wiping in-flight streams. That code path was
retired when chat moved to `useAgentChat` + DO-authoritative storage; the
workaround no longer exists in `useChat.ts`.

**Last updated**: 2026-07-18 (rewritten for the useAgentChat architecture).
