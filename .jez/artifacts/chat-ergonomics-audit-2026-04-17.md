# Chat Ergonomics Audit — 2026-04-17

**Source:** Screenshots of claude.ai (47 captures from April 17 session), claude.ai HTML DOM (saved page), live vite-flare-starter source code.
**Scope:** Input card, sidebar, message rendering, tool UI, attachment display, empty state, keyboard shortcuts, scroll UX.
**Stack:** React 19 + Vite 7 + Tailwind v4 + shadcn/ui + AI SDK v6.

---

## Top 10 Quick Wins

These can each be implemented in under 30 minutes:

| # | Finding | Files | Effort |
|---|---------|-------|--------|
| 1 | Action bar: remove text labels from Copy + Regenerate, icon-only | `MessageRenderer.tsx` | 5 min |
| 2 | Scroll-to-bottom: filled dark pill, not outline ghost | `ChatPage.tsx` | 5 min |
| 3 | User bubble: increase corner radius to `rounded-[1.5rem]` (pill-like) | `message.tsx` | 5 min |
| 4 | Sidebar conversation items: remove `MessageSquare` icon per-item | `ConversationSidebar.tsx` | 5 min |
| 5 | Sidebar hover action: replace trash icon with `…` ellipsis menu | `ConversationSidebar.tsx` | 15 min |
| 6 | Action chip preset: populate input textarea on hover, not on click | `ActionChips.tsx` + `ChatPage.tsx` | 20 min |
| 7 | Chips: remove icons from chip labels (text only, like claude.ai) | `ActionChips.tsx` | 5 min |
| 8 | InputTakeover keyboard hint footer: add "↑↓ navigate · Enter select · Esc skip" | `InputTakeover.tsx` | 10 min |
| 9 | Empty state: replace email pill with first-name-only greeting (`Happy Friday, Jez`) | `ChatPage.tsx` | 20 min |
| 10 | Action bar: add thumbs-up / thumbs-down feedback buttons (even as no-ops) | `MessageRenderer.tsx` | 20 min |

---

## Full Findings (42 total)

### EMPTY STATE

---

**Finding 1 — Greeting lacks warmth and personalisation**
- **Category:** Empty State
- **Observation:** claude.ai uses a warm day-of-week greeting — "Happy Friday, Jeremy" — with a small asterisk/logo inline. The text uses a serif or mixed-weight treatment that reads more personal. No email pill is shown above the greeting.
- **Current state:** `ChatPage.tsx` renders a `rounded-full border bg-muted` pill showing the user's email, then `<h2 className="text-3xl font-semibold tracking-tight">What can I help you with?</h2>`. The email pill is visually prominent and clinical.
- **Recommendation (quick):** Replace the email pill with a time-of-day greeting using first name only. Calculate `morning/afternoon/evening` in a utility or derive from `new Date().getHours()`. Example: `"Good afternoon, Jez"` or `"Happy Friday, Jez"`. Remove the bordered pill entirely.
- **Rationale:** The email pill re-states information the user already knows. A personalised greeting feels warmer and matches the conversational register of a chat interface.

---

**Finding 2 — Heading copy is generic**
- **Category:** Empty State
- **Observation:** "What can I help you with?" is the most common heading across every chat UI. claude.ai's equivalent heading has more character and changes with context (project name appears in the heading when in a project).
- **Current state:** `ChatPage.tsx` line `<h2>What can I help you with?</h2>` (static string).
- **Recommendation (quick):** Change to something app-specific. For the starter, `"Start a conversation"` or, if branding is configured, inject the app name: `"Ask ${APP_NAME} anything"`. Even a subtle tweak like removing the question mark ("What can I help with today") improves register.
- **Rationale:** Generic headings blend into the background. A distinct heading signals an intentional product voice.

---

**Finding 3 — Subtitle contrast is too high**
- **Category:** Empty State
- **Observation:** claude.ai's subtitle text under the heading is very muted — barely visible — creating clear hierarchy. The heading commands attention; the subtitle recedes.
- **Current state:** `ChatPage.tsx` subtitle uses `text-muted-foreground` which, in the default theme, is about 60% opacity. This is reasonable but the heading and subtitle don't have strong enough contrast differential.
- **Recommendation (quick):** Change subtitle to `text-muted-foreground/60` or add `text-sm` to reduce its visual weight relative to the heading, so the hierarchy is more pronounced.
- **Rationale:** Strong heading / receding subtitle guides the eye to the input card faster.

---

**Finding 4 — Chip expansion panel is far from input**
- **Category:** Empty State / Action Chips
- **Observation:** claude.ai's preset expansion appears as a floating panel positioned BELOW the input card — i.e. beneath the textarea — and the hovered preset's text is injected directly into the textarea as you hover. You see the prompt appear and can edit it before committing. The interaction is: hover a chip → panel appears near input → hover a preset → text appears in textarea live → click to confirm.
- **Current state:** `ActionChips.tsx` expands the preset panel directly below the chip row (which is above the input), making it feel disconnected from where the prompt will appear. There is no live preview on hover. Clicking a preset calls `onPick(preset.prompt)` which sets the input value.
- **Recommendation (medium):** Restructure the empty state layout so chips sit immediately above the input card. On hover of a preset, call `onPreview(text)` (new prop) to temporarily populate the textarea. On click, confirm. On mouse-leave without click, clear the preview. This requires a `previewText` state in ChatPage and passing a setter down.
- **Rationale:** Live hover preview dramatically reduces the mental model mismatch — the user sees exactly what will go into the input before committing, making it feel like a suggestion, not a navigation action.

---

**Finding 5 — Action chips have icons; claude.ai does not**
- **Category:** Empty State / Action Chips
- **Observation:** claude.ai's chips are text-only: "Write", "Strategize", "Career chat", "Claude's choice". No icon inside the chip. The chip itself is a rounded pill with subtle border.
- **Current state:** `ActionChips.tsx` renders `<Icon className="size-3.5" />` followed by the label inside each chip button.
- **Recommendation (quick):** Remove the `<Icon className="size-3.5" />` from the chip button (keep the icon in the expanded panel header where it provides useful context). The chip row looks cleaner and chips feel lighter without icons.
- **Rationale:** Icons inside short text chips compete with the labels for attention. Text-only chips scan faster.

---

**Finding 6 — No "Claude's choice" / serendipity chip**
- **Category:** Empty State / Action Chips
- **Observation:** claude.ai includes a "Claude's choice" chip that triggers a random prompt or a model-initiated exploration. This creates delight and lowers the blank-page anxiety. It signals that the AI has personality.
- **Current state:** `CHAT_CHIPS` in `src/shared/config/chat-chips.ts` defines the chips — no random/serendipity option.
- **Recommendation (medium):** Add a "Surprise me" chip to `chat-chips.ts` that, when clicked, selects a random preset from a curated list and submits (or populates) the textarea. Alternatively, the last chip could cycle through rotating prompts each session.
- **Rationale:** Serendipity chips reduce blank-page anxiety for new users and demonstrate the model's range.

---

### INPUT CARD

---

**Finding 7 — Focus ring is too subtle**
- **Category:** Input Card
- **Observation:** claude.ai's input card gains a very subtle shadow/border shift on focus — not a ring — but the overall card treatment is already more structured (slight lift via shadow) so focus feels like activation. Our implementation uses `focus-within:border-muted-foreground/30` which changes the border from default to a slightly darker muted colour. On many themes this is nearly invisible.
- **Current state:** `ChatPage.tsx` wraps PromptInput in `<div className="rounded-2xl border bg-background shadow-sm focus-within:border-muted-foreground/30 ...">`. The border colour shift is ~15% opacity change.
- **Recommendation (quick):** Increase the focus treatment to `focus-within:ring-1 focus-within:ring-primary/20 focus-within:border-primary/30` or add `focus-within:shadow-md` to give more perceptible activation feedback. The ring should be very subtle (primary at 20%) so it doesn't look like an error state.
- **Rationale:** Users should feel the input activate when they click it. A near-invisible focus change undermines the feeling of readiness.

---

**Finding 8 — Placeholder text doesn't change context**
- **Category:** Input Card
- **Observation:** claude.ai changes the placeholder text based on context — in empty state it reads "Type / for skills" or "How can Claude help you today?"; during a conversation it changes. Our placeholder is static.
- **Current state:** `ChatPage.tsx` hardcodes the placeholder in the PromptInput. The component receives a `placeholder` prop.
- **Recommendation (quick):** Pass a computed placeholder: `messages.length === 0 ? "Ask anything, or drop a file…" : "Reply…"`. Optionally rotate through a few empty-state placeholders for variety.
- **Rationale:** Contextual placeholders guide the user more accurately. "Reply…" during a conversation makes it obvious the field is for continuation.

---

**Finding 9 — Model picker label is too long**
- **Category:** Input Card
- **Observation:** claude.ai's model picker shows "Opus 4.7 Adaptive ↓" — short model name + mode in a compact button. The mode ("Adaptive") indicates intelligent routing. The chevron is minimal.
- **Current state:** The model selector in the input card shows full model names like "claude-opus-4-6" or "Kimi K2.5 (Workers AI)" which can overflow on smaller cards.
- **Recommendation (medium):** Add a `shortLabel` field to the model config in `src/shared/config/models.ts` for use in the compact model picker button. Example: "Kimi K2.5" → "Kimi", "Claude Sonnet 4.6" → "Sonnet 4.6". Cap the button width with `max-w-[140px] truncate`.
- **Rationale:** A compact model picker keeps the input card bottom row from becoming cluttered, especially on narrow viewports.

---

**Finding 10 — "+" attachment button is less discoverable than claude.ai's**
- **Category:** Input Card
- **Observation:** claude.ai uses a square filled-black "+" button (or a small icon) that is visually distinct from the textarea. It reads as a clear action trigger. Our implementation uses a ghost icon button that blends into the card.
- **Current state:** The attachment/menu trigger in PromptInput uses `variant="ghost"` which is near-invisible against `bg-background`.
- **Recommendation (quick):** Change the attachment/plus button to `variant="outline"` or give it a `bg-muted` background so it reads as a distinct button rather than an ambient icon. Alternatively, keep ghost but increase the icon size from the default.
- **Rationale:** Attachment discoverability directly impacts whether users try to include files. A more prominent button increases feature usage.

---

**Finding 11 — No voice input waveform indicator**
- **Category:** Input Card
- **Observation:** claude.ai shows animated waveform bars during voice input (real-time audio visualisation). Our `AudioRecorder` component shows a duration timer but no waveform.
- **Current state:** `src/client/components/AudioRecorder.tsx` shows a red dot + duration counter during recording.
- **Recommendation (medium):** Add a simple 3-bar animated equalizer to the AudioRecorder compact mode using CSS animations (no audio analysis needed — just decorative bars). This visually signals that audio is being captured.
- **Rationale:** Animated feedback during recording reassures the user that the microphone is working. A static timer alone is ambiguous.

---

**Finding 12 — No "deep research" or mode indicator in input**
- **Category:** Input Card  
- **Observation:** claude.ai exposes a "Deep research" toggle and a "Styles" selector in the input footer. These surface power-user controls in the input itself.
- **Current state:** Model selection is the only input-card control beyond the textarea and buttons.
- **Recommendation (larger):** Consider adding a `[Research mode]` toggle that switches to a more thorough system prompt / tool configuration. Even if not implemented fully, reserving the UI space for future modes signals the product's direction. Short-term: a "Mode" dropdown in the input card with just "Chat" and "Research" labels.
- **Rationale:** Mode toggles in the input card are a clear industry direction (ChatGPT, Gemini, claude.ai all have them). Building the UI slot now costs little.

---

### MESSAGE RENDERING

---

**Finding 13 — Action bar has text labels; should be icon-only**
- **Category:** Message Rendering / Action Bar
- **Observation:** claude.ai's per-message action bar shows icon-only buttons: copy icon, thumbs-up, thumbs-down, regenerate icon. No text. The bar is revealed on hover and disappears when not needed. Each icon has a tooltip on hover.
- **Current state:** `MessageRenderer.tsx` renders `Copy` text label next to the icon and `Regenerate` text label. The action bar appears at `ml-10 mt-1` for the last assistant message.
- **Recommendation (quick):** Remove text labels from Copy and Regenerate. Keep the `tooltip` prop on `MessageAction` (which already wraps `TooltipProvider`). This makes the action bar more compact and less visually intrusive.
- **Rationale:** Text labels on action buttons that are already icon-recognisable add noise. The `MessageAction` component already has tooltip support — use it.

---

**Finding 14 — No thumbs-up / thumbs-down feedback buttons**
- **Category:** Message Rendering / Action Bar
- **Observation:** claude.ai shows thumbs-up and thumbs-down on every assistant message action bar. This is standard across all major AI products. The signal is used for RLHF / quality improvement.
- **Current state:** `MessageRenderer.tsx` only has Copy + Regenerate.
- **Recommendation (quick):** Add `ThumbsUp` and `ThumbsDown` buttons to the assistant action bar. Even as no-ops initially (or logging a console event), the presence of these buttons signals a production-quality product. Wire to a `POST /api/conversations/:id/messages/:msgId/feedback` endpoint when ready.
- **Rationale:** Feedback buttons are table stakes for a chat UI. They also help users feel in control of the response quality.

---

**Finding 15 — User bubble corner radius is too sharp**
- **Category:** Message Rendering
- **Observation:** claude.ai user messages have a very rounded, pill-like bubble: `border-radius: 1.5rem` (24px). This is significantly more rounded than the typical `rounded-lg` (8px) pattern.
- **Current state:** `message.tsx` applies `group-[.is-user]:rounded-lg` to `MessageContent` which is 8px radius.
- **Recommendation (quick):** Change to `group-[.is-user]:rounded-[1.5rem]` in `message.tsx`. This one line change dramatically modernises the user bubble.
- **Rationale:** Pill-shaped user bubbles are the contemporary standard across claude.ai, ChatGPT, and Gemini. They read as "speech bubbles" more naturally than square-ish rounded boxes.

---

**Finding 16 — No message timestamp on user messages**
- **Category:** Message Rendering
- **Observation:** claude.ai shows a small grey timestamp on user messages, but only on hover (top-right of the bubble). This avoids cluttering the conversation while still providing the information on demand.
- **Current state:** No timestamps are shown on messages in `MessageRenderer.tsx`.
- **Recommendation (medium):** Add a `createdAt` timestamp (from message metadata if available, or client-side) displayed as `text-[11px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity` positioned at `absolute top-1 -right-1` relative to the user message group. For assistant messages, skip timestamps or show them only in the expanded action bar.
- **Rationale:** Timestamps help users reconstruct conversation timelines, especially in long sessions. Show-on-hover avoids visual clutter.

---

**Finding 17 — Branch switching exists in code but is unwired**
- **Category:** Message Rendering
- **Observation:** claude.ai shows "2/3 ←→" style branch navigation when the user has edited and regenerated a message. This lets users compare different model responses side-by-side.
- **Current state:** `message.tsx` exports full `MessageBranch`, `MessageBranchContent`, `MessageBranchSelector`, `MessageBranchPrevious`, `MessageBranchNext`, `MessageBranchPage` components — but `MessageRenderer.tsx` does not use them. There is no branch concept in `useChat` hook.
- **Recommendation (larger):** Wire branch tracking into the edit-message flow. When the user edits a message, instead of truncating the conversation, store the previous response as branch[0] and the new response as branch[1]. Render using `<MessageBranch>`. This is the most complex item in this audit but would be a significant UX differentiator.
- **Rationale:** Message branching is one of the most-used features in claude.ai for iterative refinement. The component primitives already exist — they just need wiring.

---

**Finding 18 — Assistant avatar is plain "AI" fallback text**
- **Category:** Message Rendering
- **Observation:** claude.ai uses a small circular icon with the Claude asterisk/brand mark. Our implementation uses `AvatarFallback="AI"` (text).
- **Current state:** `MessageRenderer.tsx` renders `<Avatar className="size-7"><AvatarFallback>AI</AvatarFallback></Avatar>`.
- **Recommendation (quick):** Replace the "AI" text fallback with either: (a) the app logo/favicon as an `<AvatarImage>`, or (b) a `BotIcon` from lucide-react styled with `text-primary`. Either is better than generic "AI" text.
- **Rationale:** The assistant avatar is the visual identity of the AI. A distinctive icon establishes personality. "AI" text is a placeholder, not a product choice.

---

**Finding 19 — No streaming "thinking" label**
- **Category:** Message Rendering
- **Observation:** claude.ai shows "Thinking…" or "Typing…" text next to a pulsing indicator while the model is generating. Our implementation shows three bouncing dots with no label.
- **Current state:** `MessageRenderer.tsx` has a `ThinkingIndicator` component with three bouncing dots and no accompanying text.
- **Recommendation (quick):** Add `<span className="text-xs text-muted-foreground ml-1">Thinking…</span>` next to the thinking dots, or alternate between "Thinking…" and "Responding…" based on whether tool calls are in progress. This text disappears once streaming content begins.
- **Rationale:** Labelled states are clearer than unlabelled animations, especially for users unfamiliar with the three-dot convention.

---

**Finding 20 — File attachments in transcript use emoji, not thumbnail**
- **Category:** Message Rendering
- **Observation:** claude.ai renders sent image attachments as thumbnail images inside the user bubble, with good aspect ratio handling. Non-image files render as a compact pill with file icon + name.
- **Current state:** `MessageRenderer.tsx` renders images with `max-w-xs max-h-64 rounded-lg border` (acceptable) but non-image files render as `"📎 {filename}"` — a plain text emoji + filename with no structured component.
- **Recommendation (medium):** For non-image file parts, render a compact pill component (similar to the pre-send `AttachmentTile`) with the correct icon from `iconFor()` (same helper as `AttachmentTiles.tsx`), filename truncated, and media type badge. This re-uses the work already done for pre-send tiles.
- **Rationale:** File attachments in the sent message transcript should look deliberate and structured, not like a text fallback.

---

**Finding 21 — No smooth scroll / scroll padding for streaming messages**
- **Category:** Message Rendering / Scroll UX
- **Observation:** claude.ai auto-scrolls smoothly during streaming, keeping the latest content visible. There's a brief pause when tool results arrive before resuming scroll. The experience is continuous.
- **Current state:** `ChatPage.tsx` uses a `useEffect` that calls `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })` when messages change. This is correct but only fires on discrete message events, not on every token during streaming.
- **Recommendation (medium):** Add a `useEffect` that runs when `isLoading` is true and polls `scrollIntoView` via `requestAnimationFrame`, stopping when `isLoading` becomes false. Alternatively, use a `MutationObserver` on the messages container. This ensures smooth auto-scroll throughout the streaming response.
- **Rationale:** Choppy or incomplete auto-scroll during streaming is one of the most noticeable UX deficiencies in chat UIs. Users shouldn't have to manually scroll to see streamed content.

---

**Finding 22 — Reasoning is shown as a message part; should be collapsible**
- **Category:** Message Rendering
- **Observation:** claude.ai shows reasoning in a collapsible section: "Thought for a few seconds ↓" with a brain icon and chevron. The reasoning is collapsed by default. Users can expand it to read the model's chain of thought.
- **Current state:** `MessageRenderer.tsx` renders reasoning content inline as a message part (either via a `Tool` accordion or inline text). The `sendReasoning: true` flag is set in the server's `createAgentUIStreamResponse` call.
- **Recommendation (medium):** Wrap reasoning content in a distinct collapsible component: `<Collapsible>` (shadcn) with header `"Thought for X seconds"` (derive from a `reasoning_duration` metadata field or a hardcoded "a few seconds") + `BrainIcon` + `ChevronDownIcon`. Default to collapsed. The thinking content is often verbose and the user doesn't need to read it unless curious.
- **Rationale:** Showing raw reasoning by default distracts from the actual response. Collapsing it by default mirrors claude.ai, Gemini, and o3's approach and keeps the conversation scannable.

---

### TOOL UI

---

**Finding 23 — Tool accordion header lacks status badge**
- **Category:** Tool UI
- **Observation:** claude.ai's tool cards show: (a) wrench/tool icon, (b) tool name in readable form, (c) a status badge — green circle-check for "Completed", spinner for in-progress. The status is at the trailing edge of the header.
- **Current state:** `ControlledTool` in `MessageRenderer.tsx` wraps `<Tool>` from AI Elements. The `ToolHeader` shows the tool name and a status icon, but the status presentation differs from claude.ai's badge style.
- **Recommendation (medium):** In `ToolHeader`, add a trailing `<Badge variant="outline">` with: `"Running"` + `<Loader2 className="animate-spin size-3" />` while in progress, and `"Done"` + `<CheckCircle className="size-3 text-green-500" />` when complete. The badge sits at `ml-auto` in the header flex.
- **Rationale:** Status badges communicate tool execution state at a glance without requiring the user to expand the accordion. This is especially important when multiple tools run sequentially.

---

**Finding 24 — Tool parameters and results are not sectioned**
- **Category:** Tool UI
- **Observation:** claude.ai divides tool accordion content into labelled sections: "PARAMETERS" (small caps) and "RESULT" (small caps), each with their content block below. The visual separation makes it easy to scan what was sent vs what came back.
- **Current state:** `ToolContent` in AI Elements renders tool call arguments and results in a single block without section labels.
- **Recommendation (medium):** Add `"PARAMETERS"` and `"RESULT"` labels inside `ToolContent` (or in `MessageRenderer.tsx`'s custom tool rendering). Use `text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60` for the labels and a `border-t` separator between sections.
- **Rationale:** Sectioned tool output is dramatically easier to scan. When parameters are long, the label anchors the reader's eye to the right section.

---

**Finding 25 — Tool names show as snake_case**
- **Category:** Tool UI
- **Observation:** claude.ai displays tool names in human-readable form (e.g. "Search the web", not "web_search"). The tool name in the header is a sentence-cased phrase.
- **Current state:** Tool headers in `ToolHeader` display the raw tool name (e.g. `web_search`, `run_python`).
- **Recommendation (quick):** Add a `displayName` field to each tool definition (in `src/server/modules/chat/tools/`) or derive it via a simple transform: replace underscores with spaces and title-case the result. Apply in `ToolHeader`. Example: `"web_search"` → `"Web Search"`, `"run_python"` → `"Run Python"`.
- **Rationale:** Snake-cased tool names are implementation details. Displaying them in the UI leaks technical internals to the user.

---

**Finding 26 — No progress bar inside tool cards**
- **Category:** Tool UI
- **Observation:** claude.ai shows a thin animated progress bar inside the tool card header while the tool is executing. This is purely decorative (it doesn't reflect actual progress) but provides strong visual feedback that work is happening.
- **Current state:** No progress bar in tool UI.
- **Recommendation (medium):** Add a `<Progress>` (shadcn) with an indeterminate animation (use CSS keyframes to slide from 0→80% and stay there) inside the `ToolHeader` when the tool state is `"running"`. Remove it when complete.
- **Rationale:** Even a fake progress bar dramatically improves perceived responsiveness. The user's attention is engaged and they feel progress is happening.

---

### SIDEBAR

---

**Finding 27 — Conversation items have redundant icon**
- **Category:** Sidebar
- **Observation:** claude.ai conversation items in the sidebar show ONLY the conversation title — no icon, no timestamp per item. The date grouping (Today/Yesterday) provides temporal context.
- **Current state:** `ConversationSidebar.tsx` renders `<MessageSquare className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/50" />` before every conversation title. This adds visual noise.
- **Recommendation (quick):** Remove the `MessageSquare` icon from conversation list items. The icon is redundant — every item is a conversation. The grouping headers already provide structure.
- **Rationale:** Removing repeated decorative icons makes the sidebar cleaner and gives more horizontal space to the conversation title.

---

**Finding 28 — Per-item delete (trash) should be ellipsis menu**
- **Category:** Sidebar
- **Observation:** claude.ai shows a `...` (ellipsis) button on conversation hover, which opens a small popover menu with options: "Rename", "Delete", "Move to project", etc. A direct trash icon on hover is the "quick delete" anti-pattern — too easy to accidentally delete.
- **Current state:** `ConversationSidebar.tsx` renders a `Trash2` icon button directly on hover with `onClick={() => deleteMutation.mutate(...)}`. No confirmation, no other options.
- **Recommendation (medium):** Replace the trash icon with a `MoreHorizontal` icon button that opens a `Popover` or `DropdownMenu` with: "Rename", "Delete" (with confirmation via `AlertDialog`). This adds safety and future-proofs the sidebar for additional actions.
- **Rationale:** Direct-delete without confirmation on hover is error-prone. An ellipsis menu matches user expectations from claude.ai, ChatGPT, and Gemini sidebars.

---

**Finding 29 — Sidebar width may be too narrow**
- **Category:** Sidebar
- **Observation:** claude.ai's sidebar is approximately 260–280px wide. Our sidebar is `w-56` (224px). At 224px, longer conversation titles are truncated aggressively.
- **Current state:** `ConversationSidebar.tsx` uses `w-56` (224px).
- **Recommendation (quick):** Increase to `w-64` (256px) or `w-72` (288px). Test with typical conversation title lengths. `w-64` is a reasonable balance.
- **Rationale:** 32px more width recovers 1–3 words of title visibility. Conversation titles are the primary navigation signal — truncating them early hurts usability.

---

**Finding 30 — No search in conversation list**
- **Category:** Sidebar
- **Observation:** claude.ai has a global search icon in the sidebar that opens a full-page search. The search covers conversations, messages, and projects. Keyboard shortcut: Cmd+K or a dedicated search icon.
- **Current state:** The starter has a Command Palette (`src/client/components/CommandPalette.tsx`) triggered by Cmd+K that navigates between pages. It doesn't search conversation content. The conversation search endpoint (`GET /api/conversations/search`) does exist in the server.
- **Recommendation (medium):** Wire the Command Palette to include conversation search results. When the query looks like natural language (not a nav command), include a section `"Conversations"` with matching results from `GET /api/conversations/search?q=...`. Debounce the search.
- **Rationale:** Conversation search is essential as history grows. The server endpoint already exists — this is purely a frontend connection task.

---

**Finding 31 — No "New conversation" keyboard shortcut**
- **Category:** Sidebar / Keyboard
- **Observation:** claude.ai allows creating a new conversation via keyboard (typically Ctrl+Shift+O or a sidebar button). The new conversation button is visually distinct — usually a pencil/compose icon.
- **Current state:** The sidebar has a "New Chat" button. No keyboard shortcut is registered for it.
- **Recommendation (quick):** Register `Ctrl+Shift+N` (or `Cmd+Shift+N`) in `KeyboardShortcuts.tsx` to trigger a new conversation. Add the shortcut to the `?` shortcut modal.
- **Rationale:** Power users create many conversations. A keyboard shortcut avoids the mouse trip to the sidebar.

---

**Finding 32 — No conversation title auto-generation indicator**
- **Category:** Sidebar
- **Observation:** claude.ai auto-generates a conversation title after the first exchange. The sidebar item updates from "New chat" to the generated title with a subtle animation.
- **Current state:** Conversations get their title from `storage.createConversation(userId, { title, model })`. The chat module likely uses a default title. It's unclear if auto-title generation is wired.
- **Recommendation (medium):** After the first complete exchange, call a background API endpoint to generate a conversation title via LLM (1-sentence summary). Update the conversation title in D1 and invalidate the sidebar query. Show `"Generating title…"` as a placeholder in the sidebar during this process.
- **Rationale:** Meaningful conversation titles are essential for navigating history. "New chat" as a permanent title is a usability dead-end.

---

### SCROLL UX

---

**Finding 33 — Scroll-to-bottom button is outline, not filled**
- **Category:** Scroll UX
- **Observation:** claude.ai's scroll-to-bottom button is a dark filled pill: dark background, white text reading `"↓ Scroll to latest"`. It's visually prominent and impossible to miss.
- **Current state:** `ChatPage.tsx` uses `<Button size="sm" variant="outline">` with a `ChevronDown` icon. This is a ghost-outline style that blends into the background.
- **Recommendation (quick):** Change to `variant="default"` (filled primary) or create a custom `bg-foreground text-background` dark pill. Add the label `"Scroll to latest"` next to the icon. Position: `fixed bottom-[calc(var(--chat-input-height)+16px)] left-1/2 -translate-x-1/2`.
- **Rationale:** The scroll-to-bottom button must be immediately findable when new messages arrive. A filled button with text label is far more discoverable than an outline icon button.

---

**Finding 34 — No unread message count on scroll-to-bottom**
- **Category:** Scroll UX
- **Observation:** claude.ai's scroll-to-bottom button shows a badge count of how many new messages have arrived since the user scrolled up (e.g. `↓ 3 new messages`). This is especially useful during streaming when the model generates many responses.
- **Current state:** The scroll button shows no count.
- **Recommendation (medium):** Track a `newMessageCount` state that increments when `messages.length` increases while the user is scrolled up (not at bottom). Display as a badge on the button. Reset to 0 when user scrolls to bottom.
- **Rationale:** A count tells the user how much they've missed without requiring them to scroll. It reduces anxiety and speeds up the decision to scroll down.

---

**Finding 35 — Bottom spacer may be insufficient on small viewports**
- **Category:** Scroll UX
- **Observation:** claude.ai's conversation area has generous bottom padding so the last message is never hidden behind the input card.
- **Current state:** `ChatPage.tsx` has `<div aria-hidden className="h-32 shrink-0" />` as a bottom spacer. 128px should be sufficient for the input card but may be insufficient on short viewports when the input card is tall (e.g. with attachment tiles).
- **Recommendation (quick):** Change the spacer to use a CSS custom property or `padding-bottom` that matches the input card's measured height. Alternatively increase to `h-48` as a safe maximum.
- **Rationale:** Content hidden behind the input card is frustrating. A safe large spacer costs nothing.

---

### TOOL TAKEOVER (INPUT TAKEOVER)

---

**Finding 36 — InputTakeover lacks keyboard hint footer**
- **Category:** InputTakeover / Keyboard
- **Observation:** claude.ai's "Ask me questions" tool shows a full input takeover with a keyboard hint footer: `"↑↓ to navigate · Enter to select · Esc to skip"` and `"⌘ Enter to submit"`. These hints are rendered in a small muted footer bar below the choices.
- **Current state:** `InputTakeover.tsx` renders the takeover UI but does not include a keyboard hint footer.
- **Recommendation (quick):** Add a `<div className="px-3 py-1.5 border-t text-[11px] text-muted-foreground/60 flex items-center justify-between">` footer to `InputTakeover.tsx` with the hint text. The exact hints depend on the takeover type (choice list vs free text).
- **Rationale:** Keyboard hints dramatically improve the discoverability of keyboard navigation. Many users don't know they can use arrow keys + Enter in tool takeovers.

---

**Finding 37 — InputTakeover submit is single-step; claude.ai uses two-step**
- **Category:** InputTakeover
- **Observation:** claude.ai's question-collection tool shows questions one at a time with a "Submit all" button that collects all answers and sends them together. The UX flows: question → answer → next question → … → "Submit" → all answers sent.
- **Current state:** `InputTakeover.tsx` collects inputs but the exact submission flow differs. Whether it matches the two-step pattern is unclear from the code alone.
- **Recommendation (medium):** Review `InputTakeover.tsx` to ensure the "Submit" button clearly signals it will send all collected answers at once. Add a summary view before submission if multiple questions were collected.
- **Rationale:** Users should know what they're submitting. A summary step before final submission prevents accidental sends.

---

### ATTACHMENT UI

---

**Finding 38 — Attachment tiles are correctly positioned but could use file-size display**
- **Category:** Attachment UI
- **Observation:** claude.ai shows a file size label on attachment tiles (e.g. "23 KB" below the filename). This helps users know they've attached the right file and that it's not too large.
- **Current state:** `AttachmentTiles.tsx` shows filename (truncated) but no file size.
- **Recommendation (quick):** The `files` array from `usePromptInputAttachments()` may include a `size` property. If available, display it as `formatFileSize(size)` (e.g. `"23 KB"`, `"1.2 MB"`) in muted text below the filename.
- **Rationale:** File size is useful context before sending. It's a one-line addition if the `size` property is accessible.

---

**Finding 39 — Attachment preview dialog could show text file content**
- **Category:** Attachment UI
- **Observation:** claude.ai's file preview shows text file content inline (rendered as monospace text) for code, CSV, JSON, plain text files.
- **Current state:** `AttachmentPreview` in `AttachmentTiles.tsx` handles image/video/audio/PDF but falls back to a "Preview not available" message for text files.
- **Recommendation (medium):** For `text/*` and `application/json` MIME types, read the file content via `FileReader.readAsText()` and render in a `<pre>` block with overflow-auto and a max-height. This requires reading the file from the `url` blob URL.
- **Rationale:** Developers and power users frequently want to verify their code or CSV before sending. A "preview not available" fallback for plain text is unnecessarily limiting.

---

### SETTINGS & CUSTOMISATION

---

**Finding 40 — No "Customize" panel in the chat module**
- **Category:** Settings / Customisation
- **Observation:** claude.ai has a "Customize Claude" panel accessible from the sidebar. It allows setting: preferred name, job role, communication style, and response length preferences. This data goes into the system prompt.
- **Current state:** The starter has a general Settings page but no chat-specific customisation that affects the system prompt.
- **Recommendation (larger):** Add a chat preference section (under Settings or as a sidebar panel) with: preferred name (used in greeting), response style ("Concise" / "Detailed"), and tone preference. Store in `user_meta` D1 table (already used by the `memory` tool). Inject into the system prompt in `buildChatAgent`.
- **Rationale:** User-personalised system prompts produce notably better responses and create a sense of product ownership. The memory tool already demonstrates the pattern.

---

**Finding 41 — No distinct project/context scope**
- **Category:** Settings / Project Management
- **Observation:** claude.ai has "Projects" — a way to scope conversations with a shared system prompt, shared files, and shared memory. Each project is a distinct context.
- **Current state:** The starter has conversations but no project-level grouping.
- **Recommendation (larger):** This is a significant feature. Short-term: add a `project_id` FK to the `conversations` table and a `projects` table with `(id, name, system_prompt, created_at)`. Add project selector in the sidebar. Long-term: shared R2 file storage per project.
- **Rationale:** Projects are one of claude.ai's most compelling differentiators. Without them, all conversations share a flat namespace.

---

### GENERAL POLISH

---

**Finding 42 — No copy-to-clipboard confirmation animation**
- **Category:** General Polish
- **Observation:** claude.ai's copy button briefly changes to a checkmark (✓) for ~1 second after clicking, then reverts to the copy icon. No toast or notification — just the icon swap.
- **Current state:** The copy button in `MessageRenderer.tsx` likely shows a toast or does nothing visual (needs verification). The `MessageAction` component doesn't natively handle state toggle.
- **Recommendation (quick):** In `MessageRenderer.tsx`, manage a `copied` boolean state per message (or a shared `lastCopiedId`). On copy click, set `copied = true` and reset after 1500ms. Render `<CheckIcon>` instead of `<CopyIcon>` during this window. No toast needed.
- **Rationale:** The icon-swap feedback is cleaner than a toast for an action as common as copying. Toasts for copy actions are heavy-handed.

---

## Implementation Priority

### Phase 1 — Quick wins (< 30 min each, total ~3 hours)

1. Finding 13: Icon-only action bar (remove text labels)
2. Finding 33: Filled scroll-to-bottom button
3. Finding 15: User bubble radius → `rounded-[1.5rem]`
4. Finding 27: Remove sidebar conversation icon
5. Finding 5: Remove icons from action chips
6. Finding 25: Snake_case → human-readable tool names
7. Finding 18: Replace "AI" avatar with bot icon
8. Finding 19: Add "Thinking…" label to streaming indicator
9. Finding 36: Keyboard hint footer in InputTakeover
10. Finding 42: Copy button icon-swap confirmation
11. Finding 14: Add thumbs-up/thumbs-down buttons
12. Finding 31: New conversation keyboard shortcut

### Phase 2 — Medium improvements (~2–4 hours each)

13. Finding 4: Action chip live hover preview into textarea
14. Finding 28: Sidebar ellipsis menu (rename + delete with confirm)
15. Finding 22: Collapsible reasoning section
16. Finding 23: Tool status badges (Running/Done)
17. Finding 24: Tool sections (PARAMETERS / RESULT labels)
18. Finding 26: Indeterminate progress bar in tool header
19. Finding 30: Wire conversation search into Command Palette
20. Finding 34: New message count badge on scroll-to-bottom
21. Finding 1: Personalised greeting (time-of-day + first name)
22. Finding 20: Structured file attachment pill in transcript

### Phase 3 — Larger features (~1–3 days each)

23. Finding 17: Message branch tracking + branch switcher UI
24. Finding 32: Auto-generated conversation titles
25. Finding 41: Projects / conversation scoping
26. Finding 40: Chat customisation panel (name, style, tone)
27. Finding 12: Mode toggle in input card (Chat / Research)

---

## Notes for Implementers

- All Quick wins in Phase 1 are self-contained single-file changes.
- Finding 4 (chip hover preview) requires a prop chain: `ChatPage.tsx` → `ActionChips.tsx`, adding `onPreview` prop alongside `onPick`.
- Finding 17 (branches) requires server-side changes to `useChat` hook and conversation storage — save prior response before overwriting on edit.
- The `MessageBranch` component family in `src/components/ai-elements/message.tsx` is fully implemented and ready to use — just needs data wiring.
- Finding 22 (collapsible reasoning) can use shadcn's `<Collapsible>` component which is likely already installed.
- Findings 40 and 41 touch the server schema (D1) and will require migration generation + apply before testing.

---

*Audit completed: 2026-04-17*
*Source: 47 claude.ai screenshots (April 17 session), live vite-flare-starter source, claude.ai saved HTML DOM*
