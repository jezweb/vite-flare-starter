# Chat UI Perfection Plan

## Critical Bugs (Fix First)

### 1. Raw JSON rendered on conversation reload
Messages loaded from D1 are being rendered as raw JSON strings instead of
parsed UIMessage parts. The `parts` column stores JSON but something in the
hydration path isn't parsing it back into objects.
- **File**: `src/server/modules/conversations/storage.ts` (loadChat)
- **File**: `src/client/modules/chat/pages/ChatPage.tsx` (hydration useEffect)
- **Test**: Reload any conversation URL — should show rendered messages, not JSON

### 2. Transcribe not working
Audio recorder sends blob but transcription fails. Need to check:
- Is the audio blob being sent as the correct data URL format?
- Is the Workers AI transcription model (Deepgram) accepting the format?
- Is the response being handled correctly?
- **File**: `src/server/modules/chat/tools/audio.ts`

### 3. File attachment UX is poor
The + menu opens a dropdown but there's no visual feedback when a file is
selected, no preview of attached files before sending, no drag-and-drop zone.

## UI Improvements (Claude.ai as Benchmark)

### Chat Input Area
- **Drag-and-drop zone**: Highlight the entire chat area when dragging a file over
- **Attachment preview chips**: Show filename + size as dismissible chips above the textarea
- **File type icons**: Different icons for PDF, image, audio, text
- **Upload progress**: Show progress bar while file uploads / converts
- **Paste feedback**: Brief toast "Image pasted" when Cmd+V captures a file

### Message Rendering
- **User message bubble**: Right-aligned with subtle background (like claude.ai)
- **Assistant message**: Left-aligned, full-width, no bubble — just text
- **Tool calls**: Collapsible by default (currently expanded), show just the tool name + status
- **Streaming indicator**: Animated dots or cursor while streaming, not just blank space
- **Copy full message**: Button to copy the entire assistant response (not just code blocks)
- **Timestamp on hover**: Show when each message was sent

### Conversation Sidebar
- **Wider on desktop**: 56px (w-56) feels cramped for conversation titles
- **Group by date**: Today, Yesterday, Last 7 days, Older
- **Rename inline**: Click title to rename (not just delete)
- **Drag to reorder / pin**: Pin important conversations to top

### Mobile Experience
- **Sidebar as Sheet**: On mobile, conversation sidebar should be a Sheet (slide-over), not inline
- **Full-width input**: Input should touch edges on mobile
- **Touch-friendly targets**: All buttons ≥44px tap target
- **Swipe to dismiss sidebar**: Natural mobile gesture
- **Bottom sheet for model selector**: Instead of dropdown which can clip

### Model Selector
- **Show model description on hover**: Context window, pricing tier
- **Recently used models**: Pin last 3 used to top of list
- **Search/filter in dropdown**: Type to filter when 16+ models

### Tool Call UI
- **Collapsed by default**: Just show icon + tool name + "Completed" badge
- **Expand on click**: Reveal parameters + result
- **Custom icons per tool**: Calculator icon for calculate, globe for web_search, etc.
- **Error state styling**: Red border + clear error message, not raw JSON

### Empty State
- **More engaging**: Add subtle animation or gradient
- **Contextual suggestions**: Based on what tools are available
- **Quick actions**: "Upload a document", "Record a voice note", "Search the web"

### Accessibility
- **Keyboard navigation**: Tab through messages, Enter to expand tool calls
- **Screen reader labels**: Proper aria-labels on all interactive elements
- **Reduced motion**: Respect prefers-reduced-motion for animations
- **High contrast**: Ensure all text meets WCAG AA contrast ratios

## Reference: Claude.ai Patterns to Copy

1. **Clean message layout**: No bubbles on assistant messages — just avatar + text, left-aligned
2. **Artifacts panel**: Side panel for generated content (code, documents, diagrams)
3. **Tool use display**: Minimal by default, expandable
4. **Attachment handling**: Inline preview with filename, type icon, remove button
5. **Model badge**: Shown per-message, not in header
6. **Stop generation**: Prominent stop button during streaming
7. **Message actions on hover**: Copy, regenerate, edit — appear on hover, right-aligned

## Implementation Priority

### Phase 1 — Fix Breaking Issues
1. Raw JSON on reload (critical rendering bug)
2. Transcription not working
3. Attachment preview before send

### Phase 2 — Claude.ai Parity
4. Tool calls collapsed by default
5. Drag-and-drop file zone
6. Copy full message button
7. Streaming cursor/indicator
8. Mobile sidebar as Sheet

### Phase 3 — Polish
9. Date-grouped conversations
10. Model description on hover
11. Custom tool icons
12. Keyboard navigation
13. Timestamp on hover
14. Attachment preview chips
