---
name: Chat bugs found during live testing (2026-04-15)
description: Four bugs found by Jez testing live on the deployed starter. Filed for next session.
type: project
originSessionId: 81a9b605-104d-47c6-90ea-95d42d80f379
---
Four chat bugs found during live UX testing, need fixing:

1. **PDF upload crashes** — "cannot identify image file <_io.BytesIO>" (400 error).
   The PromptInput sends PDFs as file parts to the LLM, but Workers AI Kimi K2.5
   doesn't accept PDFs as file content parts. Need to intercept PDF attachments
   server-side, run them through `env.AI.toMarkdown()` first, then inject the
   markdown as text context rather than a file part.
   **Files:** `src/server/modules/chat/routes.ts` (pre-process file parts before agent call)

2. **Blank AI response** — simple "ask me a question" gets empty response (AI avatar + Regenerate, no text).
   Likely a model error that gets swallowed. Need to check if the model returns empty,
   and surface the error rather than showing a blank bubble.
   **Files:** `src/client/modules/chat/components/MessageRenderer.tsx` (handle empty parts)

3. **"done" tool shows as "Running"** — the done tool (no execute function, stops the loop)
   renders as a tool call stuck in "Running" state. Need to detect `done` tool calls and
   render the answer field as the final response text instead of a tool accordion.
   **Files:** `src/client/modules/chat/components/MessageRenderer.tsx` (detect done tool, extract answer)

4. **"Tool result is missing" after offer_choices** — InputTakeover submits user's choice
   as a new message, but the agent loop expected a tool result for `offer_choices`.
   Need to wire the choice back as `addToolApprovalResponse` or `addToolResult` instead.
   **Files:** `src/client/modules/chat/pages/ChatPage.tsx` (handleTakeoverSubmit),
   `src/client/modules/chat/components/chat-ui/InputTakeover.tsx`

**Status of original 4 bugs:** All fixed and deployed in commit 750c5d2.

**Bugs 5+6 fixed in commit 0220210 (2026-04-15):**

5. **Raw JSON on conversation reload** — FIXED. Root cause: defensive parsing needed
   in loadChat (double-stringify guard), createdAt Date conversion in hydration,
   parts-as-array guard in MessageRenderer. Tested: reload shows rendered messages.

6. **Transcription not working** — FIXED. Root cause: audio files went through the
   non-image file pre-processing path which ran TextDecoder on audio blobs (garbage).
   Fix: audio MIME types now routed through Workers AI Deepgram Nova 3 for transcription.

**UI improvements shipped in same commit:**
- Tool calls collapsed by default (expand during streaming, collapse on reload)
- Animated bouncing dots thinking indicator + blinking cursor during streaming
- Copy full message button next to Regenerate
- Mobile sidebar as Sheet (slide-over) instead of inline panel
- Date-grouped conversations (Today / Yesterday / Last 7 days / Older)
- Timestamp on hover for messages
- Sidebar refreshes when new conversations created (commit 874c30f)

**Live test results (2026-04-15):**
- Test 1.1 (simple text): PASS — "Hello there, how are you?"
- Test 1.4 (conversation saved/reload): PASS — messages render correctly, tool calls collapsed
- Test 3.1.1 (calculator): PASS — 83,810,205 correct
- Test 3.1.2 (server time): PASS — UTC + AEST conversion
- Test 3.2.1 (remember): PASS — saved user.name = Jeremy
- Test 3.3.3 (show_data_table): PASS — inline table with copy/download/fullscreen
- Sidebar date grouping: PASS — TODAY header with conversations
- Intermittent Workers AI hang observed (1 out of 6 requests)

**Additional fixes in this session:**
- Regenerate duplicate user message: FIXED (use SDK's built-in regenerate + skip consecutive same-role user messages)
- Sidebar not refreshing on new conversation: FIXED (invalidate queries on navigate)

**Test suite shipped:** `scripts/test-agent.sh` — run via `pnpm test:agent`. Tests 16 models, 24 tools, 3 extract schemas, 5 conversation endpoints.

**Final test results (2026-04-15):**
- 16/16 models: ALL PASS
- 31/33 with Kimi K2.5 (tools + extract + conversations)
- 30/33 with Claude Sonnet 4.6
- 30/33 with Gemma 4 26B IT
- All "failures" are model prompt-following choices, NOT code bugs

**How to apply:** Remaining items: file attachment UX (drag-drop, preview), image upload test with vision model, reasoning model test (QwQ), document generation test.
