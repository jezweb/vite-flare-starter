# Plan — 2026-04-18 build session

Five features, one bundled migration, final live test. Execute in order; commit per feature.

## Scope

| # | Title | Schema change | Est. |
|---|-------|---------------|------|
| 2 | Conversation summaries (title + 1-line summary in sidebar) | `conversations.summary TEXT` | 45 min |
| 3 | Starred conversations | `conversations.starred INTEGER DEFAULT 0` + index | 45 min |
| 4 | Artifact lightbox (cmd+click card → full-screen viewer) | None | 25 min |
| 1a | Screenshot countdown + preview | None | 30 min |
| 1b | Capture-steps grid + transcription (record → frame grid PNG + audio transcript) | None | 90 min |

Bundle the two schema deltas for #2 and #3 into one migration so we only deploy once for DB changes.

## Step-by-step

### Pre-flight
- `git pull --rebase` (sync remote agent)
- Note current deployed version

### Step A — one migration for #2 and #3
- Edit `src/server/modules/conversations/db/schema.ts`
- Add `summary: text('summary')` (nullable)
- Add `starred: integer('starred').notNull().default(0)`
- `pnpm db:generate:named "add_summary_starred_to_conversations"`
- `pnpm db:migrate:local`
- `pnpm db:migrate:remote`
- Index on `(user_id, starred DESC, updated_at DESC)` via SQL migration

### Step B — #2 Conversation summaries
- New endpoint `POST /api/conversations/:id/summarise` that runs generateObject via Kimi K2.5 (Workers AI, free) with schema `{ title: z.string().max(80), summary: z.string().max(120) }` based on first user + first assistant messages
- Trigger: after first assistant response completes, the client fires-and-forgets the POST
- `ConversationSidebar` renders two lines: `title` (font-medium) then `relativeTime · summary` (text-muted-foreground)
- Fallback: if `summary` is null, show the relative time alone (current behaviour)
- Don't re-summarise once a title is non-default (so manual renames stick)

### Step C — #3 Starred conversations
- API: `POST /api/conversations/:id/star` + `DELETE /api/conversations/:id/star`
- Include `starred` in list response
- `ConversationSidebar` — Star icon on row hover, filled when starred. Show "Starred" section above "Today" if any exist.
- Sort: starred rows first (most-recent-updated), then the existing date groups
- `useStarConversation` hook with optimistic toggle

### Step D — #4 Artifact lightbox
- New `ArtifactLightbox.tsx` wrapping `ArtifactViewer` in a shadcn `Dialog` at ~80vw / 80vh
- `ArtifactSidebar` card: regular click scrolls (today's behaviour), `cmd/ctrl+click` or clicking a new "expand" icon opens the lightbox
- Add a small "expand" icon on each card next to download
- Same keyboard: Esc closes

### Step E — #1a Screenshot countdown
- Fork `captureScreenshot()` in `prompt-input.tsx` into a component state machine
- Component holds the `MediaStream` live
- Show fixed floating card bottom-right: live thumbnail + countdown 3 → 2 → 1 → capture
- Buttons on the card: "Capture now", "Retake" (re-open picker), "Cancel" (stop stream)
- Capture happens on countdown-end or "Capture now" click; stream closes after

### Step F — #1b Capture-steps grid + transcription
- New menu item `PromptInputActionAddScreenCapture` next to screenshot
- Flow:
  1. Click → option dialog: "With microphone?" toggle (default on) + "Max duration: 45s" hint
  2. `getDisplayMedia({ video: true, audio: true })` + optionally `getUserMedia({ audio: true })` merged
  3. MediaRecorder starts; floating bottom-right card shows live preview + timer + Stop button
  4. Auto-stop at 45s
  5. On stop: replay recorded webm into hidden `<video>`, sample frames at `max(1, duration/15) `s intervals (cap at 16 frames), composite into a 4×4 grid PNG with timestamp caption on each cell
  6. If audio track exists: extract audio as webm blob, POST to `/api/audio/transcribe` (we already have a transcribe tool, but need a direct endpoint for this use case) — get transcription text
  7. Attach the grid PNG as a File + append `[Screen capture narration: "..."]` to the textarea
- Cap duration at 45s, one frame per 3s = up to 15 frames + 1 cap slot

### Step G — Test everything
- Deploy
- Chrome MCP verify each feature in a fresh conversation:
  - Summaries show in sidebar after first assistant response
  - Star icon toggles and reorders
  - Cmd+click artifact card opens lightbox
  - Screenshot countdown appears with preview
  - Capture-steps produces a grid PNG + transcription
- Commit + push each feature separately; update overnight log with one "iteration 6 (local)" entry at end

## Commit strategy

One commit per feature so each ship is reviewable:
- `feat(chat): auto-generated conversation summaries`
- `feat(chat): starred conversations`
- `feat(chat): artifact lightbox via cmd+click or expand icon`
- `feat(chat): screenshot countdown with preview card`
- `feat(chat): capture-steps screen recording — frame grid + audio transcript`

## Risk / fallback

- **Kimi K2.5 structured output unreliable**: fall back to plain text with a JSON-wrapped prompt, parse best-effort. If still bad, switch to OpenRouter Haiku.
- **getDisplayMedia permissions**: on Safari it's spotty. Feature-detect and hide the menu item if unsupported.
- **MediaRecorder codec**: Chrome default is `video/webm;codecs=vp8,opus`. Audio extraction: use a separate `MediaRecorder` for the audio track if video decoding causes issues.
- **Long transcription taking time**: show a spinner in the attachment tile while transcription runs; let the user send without it if they want.

---

**Ordered**: Step A → B → C → D → E → F → G.
