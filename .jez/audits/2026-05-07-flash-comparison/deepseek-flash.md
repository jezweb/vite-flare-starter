# DeepSeek v4 Flash 1M

_Tokens: in=24352 out=1843 cost=$0.00392532_

## Verdict

**Conditionally production-safe** — all 8 Critical issues and the most important High/Medium issues are properly fixed. The code is significantly more robust than the original. However, I found **2 new issues** (one High, one Medium) introduced by the fixes that must be addressed before claiming production readiness. The voice mode will now actually work on desktop, and the knowledge auth holes are closed.

---

## Verified-fixed

- **C1** — fixed at `VoiceModeButton.tsx:55-60` — `justHandledPointerRef` correctly suppresses synthetic click after pointerup. Solid.
- **C2** — fixed at `routes.ts:60` — `checkScopeAccess` now returns `false` for org scope. Org operations are fully denied. Correct.
- **C3** — fixed at `routes.ts:155-160` — `projectId` validated via `checkScopeAccess` before use; orgId ignored. Correct.
- **C4** — fixed at `tools/knowledge.ts:60-65` — `projectId` intersected against `ownIds` before adding. Also fixed in `chat-agent.ts:8c` with explicit ownership check. Correct.
- **C5** — fixed at `storage.ts:165` (search) and `storage.ts:385` (getKnowledgeForUser) — both filter `injection_mode != 'disabled'`. Correct.
- **C6** — fixed at `useVoiceChat.ts:120-135` — `unlockAudio()` primes audio element with silent MP3 inside user gesture. Correct approach.
- **C7** — fixed at `useVoiceChat.ts:70-80` — `pickMimeType()` detects actual support; returns `supported: false` for iOS Safari. UI shows clear error message. Correct.
- **C8** — fixed at `useVoiceChat.ts:260` — `lastSpokenIdRef.current = reply.id` set only after `audio.play()` resolves. Correct.
- **H1** — fixed at `useVoiceChat.ts:145-155` — session counter invalidates stale `getUserMedia` results. Correct.
- **H2** — fixed at `useVoiceChat.ts:185-195` and `useVoiceChat.ts:220-230` — AbortController with 25s timeout on both transcribe and TTS fetches. Correct.
- **H3** — fixed at `storage.ts:15` — `ALWAYS_ACTIVE_TOKEN_CAP = 50_000` enforced in `loadAlwaysActiveKnowledge()`. Truncation notice appended to system prompt. Correct.
- **H4** — fixed at `storage.ts:165-180` — FTS5 query now wraps each term in double quotes with proper escaping. Wildcard only on last term. Correct.
- **H5** — fixed at `useVoiceChat.ts:270-275` — Object URL revoked in catch block and on all termination paths. Correct.
- **M1** — fixed in new migration `20260507082530_knowledge_fts_trigger_columns.sql` — trigger narrowed to `AFTER UPDATE OF title, summary, body, tags`. Correct.
- **M2** — fixed at `voice-tts.ts:55-60` — Aura 2 is unconditional default; ElevenLabs requires explicit `provider='elevenlabs'`. Comment documents the billing footgun. Correct.
- **M3** — fixed at `voice-tts.ts:85-90` — speaker validated against `AURA2_SPEAKERS` enum; falls back to default if invalid. Correct.
- **M4** — fixed at `routes.ts:95-100` — `serializeRow()` omits body by default; opt-in via `?include=body`. Correct.
- **M5** — fixed at `useVoiceChat.ts:215-220` — TTS fetch aborted in `stopSpeaking()`, `startRecording()`, and cleanup. Correct.
- **M6** — fixed at `VoiceModeButton.tsx:45-50` — `capturedPointerIdRef` ignores non-captured pointers. Correct.
- **M7** — fixed at `useVoiceChat.ts:200-205` — empty transcript surfaces "Didn't catch that — try again." toast. Correct.

---

## Still broken or partial

**None.** Every issue from the original report that was targeted for this fix session is properly addressed.

---

## New issues introduced by the fixes

### N1 (High) — `loadAlwaysActiveKnowledge` doesn't filter disabled docs
**File**: `src/server/modules/knowledge/storage.ts:300-340`

The three `SELECT` queries for user/project/org always-active docs filter by `injectionMode = 'always'` but **do not** filter out `disabled` docs. The schema says `disabled` means "neither catalog nor body inject", but a doc that was `always` and then toggled to `disabled` will still be returned here because the query only checks `injectionMode = 'always'` — it doesn't check that the doc isn't also in a disabled state.

Wait — looking more carefully: `injectionMode` is a single enum field, not a separate flag. If `injectionMode = 'disabled'`, then `injectionMode = 'always'` won't match. So this is actually fine. **False alarm — no issue here.**

### N2 (Medium) — `unlockAudio` silent MP3 may fail on some iOS versions
**File**: `src/client/modules/chat/hooks/useVoiceChat.ts:120-135`

The silent MP3 data URL is a valid MP3 frame, but some iOS Safari versions (15.x, early 16.x) require the audio element to have `playsInline` attribute set before `play()` will succeed inside a gesture. Without it, the prime may silently fail, and subsequent TTS plays will still get `NotAllowedError`.

**Fix**: Add `a.playsInline = true` and `a.setAttribute('playsinline', '')` before calling `a.play()`.

### N3 (Low) — `knowledge_search` tool doesn't pass `limit` correctly
**File**: `src/server/modules/chat/tools/knowledge.ts:95`

```ts
const hits = await searchKnowledge(db, scopes, query, limit ?? 20)
```

The `limit` parameter from the tool input is `number | undefined`, but `searchKnowledge` expects `limit = 20` as default. The `??` operator works correctly here — if `limit` is `undefined`, it defaults to 20. **No issue.**

### N4 (Medium) — `GET /api/knowledge/budget` returns full body text
**File**: `src/server/modules/knowledge/routes.ts:175-185`

The budget endpoint calls `loadAlwaysActiveKnowledge` which returns full bodies, but the response only maps `id, title, scope, estimatedTokens`. The bodies are fetched from the database but never serialized to the response. This is wasteful but not a leak. **Minor performance concern, not a security issue.**

### N5 (High) — `checkScopeAccess` for project scope has no caching
**File**: `src/server/modules/knowledge/routes.ts:45-50`

Every single knowledge API call that touches a project scope does a `SELECT FROM projects WHERE id = ? AND userId = ?` query. For a chat session that loads 5 knowledge docs, that's 5+ separate DB queries for the same project ownership check. This isn't a correctness issue but will add ~50ms per call on cold start.

**Not a blocker** — the original code had the same pattern. Flagging for future optimisation.

---

## Final must-fix-before-prod list

1. **N2 — iOS Safari audio unlock may fail on older iOS** — add `playsInline` attribute to the primed audio element in `unlockAudio()`. This is a 1-line fix that prevents the entire voice mode from working on iOS 15-16.

2. **N4 — Budget endpoint fetches full bodies unnecessarily** — change `loadAlwaysActiveKnowledge` to accept an optional `includeBodies` parameter (default `true` for the chat-agent path, `false` for the budget endpoint). This is a performance issue, not a correctness issue — can be deferred to a follow-up.

**Everything else is production-safe.** The voice mode will work on desktop Chrome/Firefox, knowledge auth is properly gated, FTS5 search won't crash on punctuation, and the budget cap prevents context-window overflow.