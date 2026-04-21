# useChat + reactive initialMessages breaks streaming

## Core rule

Do NOT pass a reactive `initialMessages` (or `messages`) prop to `@ai-sdk/react`'s `useAIChat` when the parent also fetches stored conversation messages on URL transitions. The SDK re-seeds state when the prop identity changes, which wipes in-flight streaming when `useConversationMessages(urlConversationId)` resolves mid-stream.

**Why it matters**: the symptom is "user sends first message in a fresh `/chat`, URL updates to `/chat/:id`, and the transcript body stays on the empty `Good evening` state until full reload." The message IS persisted server-side. The conversation IS created. But the client UI never updates.

## The pattern (as implemented)

`src/client/modules/chat/hooks/useChat.ts`:

```ts
// Freeze the initial seed at mount
const seedRef = useRef(initialMessages)

const chat = useAIChat({
  messages: seedRef.current,   // stable reference — never reacts
  messageMetadataSchema,
  transport,
  onToolCall,
  onError,
})

// Adopt stored messages on navigation (not initial mount) ONLY when
// chat.messages is empty — so we never overwrite a live stream.
useEffect(() => {
  if (!initialMessages || initialMessages.length === 0) return
  if (chat.messages.length > 0) return
  chat.setMessages(initialMessages)
}, [initialMessages, chat])
```

## Anti-patterns to refuse

| If tempted to... | Instead... |
|------------------|------------|
| Pass `useConversationMessages` result directly as `initialMessages` to `useAIChat` | Freeze a ref, adopt via `setMessages` with a "chat empty" guard |
| Reset messages whenever the URL `conversationId` changes | Only adopt on navigation when local state is empty — let in-flight streams complete |
| Debug "transcript blank after send" by adjusting `hasMessages = messages.length > 0 \|\| isLoading` | That's the M2 fix — it's not wrong, but it doesn't address this C1 race. Fix the underlying seed-reset. |

## When to revisit

If AI SDK publishes a version where passing `messages` prop behaves as "initial only" (not reactive), we can drop the freeze pattern. Until then, keep it.

**Last updated**: 2026-04-22 (C1 critical fix in post-roadmap audit).
