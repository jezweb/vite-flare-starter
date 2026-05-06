---
date: 2026-05-07
status: active
panel:
  - openai/gpt-5.5            (lead — Jez requested)
  - anthropic/claude-opus-4.7
  - google/gemini-3.1-pro-preview
target: Voice mode + Knowledge module shipped 2026-05-06 (commits 18debac→94017a5)
deployed: https://vite-flare-starter.webfonts.workers.dev (version 9fce30b3)
cost: ~$0.81 across the panel
companion: 2026-05-06-knowledge-voice-ux-audit.md
owner: jez+claude
---

# Brains-trust review — voice + knowledge

Three independent senior-engineer reviews of the just-shipped surfaces.
Strong cross-validation: every Critical issue below was flagged by ≥2
of the three reviewers. Raw responses kept at `/tmp/brains-trust/*.md`.

## Cross-validated CRITICAL — fix before claiming voice works

### C1 — Voice mode disables itself after every successful utterance
**Called by**: GPT-5.5 H1, Opus H1
**File**: `src/client/modules/chat/components/VoiceModeButton.tsx` ~line 130-150

Current flow on a real hold-release:
1. `pointerdown` → `holdRef = true`, `startRecording()`
2. `pointerup` → `holdRef = false`, `stopRecording()`
3. **Browser fires synthetic `click` after pointerup**
4. `onClick` checks `if (holdRef.current)` — but `holdRef` is already
   `false` from step 2 → `handleToggleEnabled()` runs → voice mode OFF

**This guaranteed-fires every utterance.** Voice mode is essentially
unusable as shipped — record once, get the reply, button toggles off,
have to re-enable for the next turn. Both reviewers identified this
independently with the same fix.

**Fix**: Add a `justHandledPointerRef` set in `pointerup`, cleared on
microtask, checked in `onClick`. Or call `e.preventDefault()` on
`pointerup` to suppress synthetic click.

### C2 — Knowledge `org` scope is effectively public
**Called by**: GPT-5.5 #1, Opus C3 (related)
**File**: `src/server/modules/knowledge/routes.ts:65`

```ts
// org — Phase 5 enforcement; allow for now
return true
```

`POST/PATCH/DELETE/GET /api/knowledge` with `scope=org&scopeId=<anything>`
all succeed regardless of org membership. Currently no UI path creates
org-scoped docs, but a malicious authenticated user can hit the API
directly to create + read across orgs.

**Fix**: Reject `scope=org` with 501 until Phase 5 lands real
membership checks.

### C3 — Knowledge catalog + budget endpoints leak project/org metadata
**Called by**: GPT-5.5 #2
**File**: `src/server/modules/knowledge/routes.ts:135-160`

```ts
const projectId = c.req.query('projectId') ?? null
const orgId = c.req.query('orgId') ?? null
const entries = await listKnowledgeCatalog(c.env.DB, userId, projectId, orgId)
```

No `checkScopeAccess()` for the projectId/orgId query params. Any
authenticated user can hit `GET /api/knowledge/catalog?projectId=victim`
and get titles + summaries + ids + token counts of docs in projects
they don't own.

**Fix**: Validate projectId via `checkScopeAccess(d, userId, 'project',
projectId)` before passing to storage helpers; reject orgId entirely
until Phase 5.

### C4 — Knowledge chat tool trusts arbitrary `ctx.projectId`
**Called by**: GPT-5.5 #4, Opus C3
**File**: `src/server/modules/chat/tools/knowledge.ts:50-55`

```ts
const projectIds = new Set(ownProjects.map((p) => p.id))
if (projectId) projectIds.add(projectId)  // ← unverified
```

If `ctx.projectId` derives from an untrusted source (e.g., a chat
created when the user had access to a project that's since been
revoked), the tool happily searches that project's docs. The
"defence-in-depth" filter in `getKnowledgeForUser` passes the
unverified scope through, so it's not actually defence.

**Fix**: Intersect projectId against ownProjects before adding it.
Same fix needed in `chat-agent.ts` section 8c for `effectiveProjectId`.

### C5 — Disabled knowledge docs are still searchable + loadable by agent
**Called by**: GPT-5.5 #3
**File**: `src/server/modules/knowledge/storage.ts:155-220, 351-385`

The schema documents `disabled` as "neither catalog nor body inject;
doc is parked". But `searchKnowledge()` and `getKnowledgeForUser()`
don't filter `injection_mode='disabled'`. So a user disables a
sensitive doc, the agent calls `knowledge_search` → finds it → calls
`load_knowledge` → body in conversation. Defies the contract.

**Fix**: Filter `injectionMode IN ('on_demand', 'always')` in both
storage helpers. Owner can still see disabled docs via the
management `GET /:id`, but the agent tools cannot.

### C6 — iOS Safari TTS autoplay blocked (broken user-gesture chain)
**Called by**: GPT-5.5 #6 (high), Opus C1, Gemini #1
**File**: `src/client/modules/chat/hooks/useVoiceChat.ts:209-243`

`audio.play()` runs after `await fetch(TTS_URL)` + `await resp.blob()`.
iOS Safari requires `play()` to fire synchronously inside a user
gesture. The auto-TTS effect runs in response to an assistant reply
arriving — never a user gesture. **Every** TTS playback will be
rejected with `NotAllowedError` on iOS.

**Fix**: When voice mode is enabled (inside the click gesture),
prime an `<audio>` element by calling `play()` on a silent buffer
once. Then reuse that element via `.src = newUrl` for subsequent
plays — iOS treats it as the unlocked element.

### C7 — iOS Safari MediaRecorder mimeType fallback throws
**Called by**: GPT-5.5 #5 (high), Opus H3, Gemini #2
**File**: `src/client/modules/chat/hooks/useVoiceChat.ts:67-78`

```ts
return 'audio/webm'  // unconditional fallback
```

iOS Safari's MediaRecorder doesn't support webm. `new MediaRecorder(
stream, { mimeType: 'audio/webm' })` throws `NotSupportedError`
synchronously. Even if we use `audio/mp4`, Nova 3 requires webm-opus
on the server side.

**Fix (MVP)**: Detect unsupported and show "voice mode requires Chrome
or Firefox; iOS support coming soon" rather than crashing. Future
work: server-side transcoding via ffmpeg-wasm or a different STT model
that accepts mp4/aac.

### C8 — Auto-TTS reply-id burned before play succeeds → permanent loss
**Called by**: GPT-5.5 H4 (partial), Opus C2
**File**: `src/client/modules/chat/hooks/useVoiceChat.ts:200-208`

```ts
if (lastSpokenIdRef.current === reply.id) return
lastSpokenIdRef.current = reply.id   // ← set BEFORE async work
```

If the TTS fetch fails (transient 5xx, network blip, decode error),
the id is already burned. The reply will never be retried even after
the user fixes the issue. Combined with C6, on iOS the FIRST reply
gets burned and TTS never plays again.

**Fix**: Set `lastSpokenIdRef.current = reply.id` only after
`audio.play()` resolves successfully.

## Cross-validated HIGH

### H1 — Race: getUserMedia pending → user cancels → mic stays hot
**Called by**: GPT-5.5 H2, Gemini #2
**File**: `src/client/modules/chat/hooks/useVoiceChat.ts:101-133`

User taps quickly to disable. `pointerdown` calls `startRecording()`
which awaits `getUserMedia` (can be 500ms+). `pointerup` calls
`cancelRecording()` — but `recorderRef.current` is still null, so
cancel is a no-op. Then `getUserMedia` resolves, recorder is
constructed, `recorder.start()` runs. Mic is now hot with no UI to
stop it.

**Fix**: Add a `recordingSessionRef` counter, bump on cancel/stop;
inside startRecording check after the await whether the session is
still current — if not, stop tracks and bail.

### H2 — No AbortController/timeouts on transcribe + TTS fetches
**Called by**: GPT-5.5 H7, Opus C2 partial, Gemini "poor connectivity"

UI sits in `transcribing` or `speaking` indefinitely on poor
connectivity. Toggling off doesn't abort the network work. Late
responses can affect state after the user has moved on.

**Fix**: AbortController per fetch; timeout 20-30s; abort on cancel,
disable, unmount, new recording.

### H3 — No total always-active token budget cap
**Called by**: GPT-5.5 M1, Opus M1 implicit, Gemini Medium #1

Per-doc cap is 256KB hard / 100KB soft, but no total cap across
all `always` docs. Five 256KB docs = 1.2MB → blows even Anthropic's
context window. Result: chat "randomly" breaks for users who put
many docs in always mode. UI banner warns at 10K tokens but doesn't
block.

**Fix**: Enforce a server-side cap in `loadAlwaysActiveKnowledge`
(e.g., 50K tokens total — same as the plan's "hard cap"). Truncate
overflow with a warning appended to the system prompt.

### H4 — FTS5 search crashes on common terms (`-`, `OR`, `NOT`)
**Called by**: GPT-5.5 H10, Opus H7, Gemini #1
**File**: `src/server/modules/knowledge/storage.ts:165-180`

`query.replace(/["'()*+:^]/g, ' ')` strips most operators but misses
`-`, `OR`, `NOT`, `AND`, `NEAR`. Searching `"foo -bar"`, `"OR"`, or
`"example.com"` produces FTS5 syntax errors → 500s out of `/search`.

**Fix**: Wrap each token in double quotes (FTS5 phrase syntax)
which forces literal interpretation: `terms.map(t => `"${t.replace
(/"/g, '""')}"`).join(' ')` — and only wildcard-suffix the last.

### H5 — Object URLs leak when `audio.play()` rejects
**Called by**: GPT-5.5 #8, Opus H4, Gemini L1
**File**: `src/client/modules/chat/hooks/useVoiceChat.ts:226-245`

`URL.createObjectURL(blob)` only revoked in `onended` / `onerror`.
Neither fires when `play()` rejects (Safari autoplay block, decode
error). Long sessions on iOS leak proportionally to reply count.

**Fix**: Revoke in the `catch` block too, and store
`{ audio, url }` together so `stopSpeaking` can revoke on its
cleanup path.

## Single-reviewer findings worth fixing

### M1 (Opus C4) — FTS trigger fires on every UPDATE, even metadata-only
`AFTER UPDATE ON knowledge_documents` with no column list. Every PATCH
that touches just `injectionMode` or `tags` re-indexes the full body.
Fix: `AFTER UPDATE OF title, summary, body, tags ON ...`.

### M2 (GPT-5.5 M5) — TTS provider default switches to ElevenLabs silently
If `ELEVENLABS_API_KEY` is set + caller omits `provider`, default
flips from free Aura 2 to paid ElevenLabs. **Billing footgun.** Fix:
make Aura the default unconditionally; ElevenLabs requires explicit
opt-in or a separate `EMAIL_PROVIDER_ORDER`-style env var.

### M3 (GPT-5.5 M4) — TTS server accepts arbitrary speaker strings
Bad speaker → Aura 2 returns 5xx (uncaught). Fix: validate against
`AURA2_SPEAKERS` enum server-side.

### M4 (Opus M3) — List endpoint returns full bodies
`GET /api/knowledge` returns body for every doc. 50 docs × 100KB =
5MB list response. Fix: omit body by default; opt-in via
`?include=body`.

### M5 (Opus C2 partial) — TTS fetch not aborted on stopSpeaking
`stopSpeaking()` doesn't abort an in-flight TTS fetch. Late response
can play over a new recording. Fix: AbortController on TTS fetch,
abort in stopSpeaking + startRecording.

### M6 (Opus M5) — VoiceModeButton breaks on multi-touch
Two fingers → `pointerdown` runs twice → second `startRecording`
fails because stream exists. Fix: track `capturedPointerIdRef`,
ignore non-captured pointers.

### M7 (Gemini Low #2) — Empty transcript bails silently
User holds, speaks, gets nothing — no feedback that audio was
detected as silence. Fix: surface a one-time "didn't catch that"
toast.

## What looks solid (consensus across all 3 reviewers)

- FTS5 migration structure (content/content_rowid + AI/AU/AD triggers
  + 'delete' magic value + REBUILD on apply)
- Scope discriminator + composite indexes
- Always/on_demand mode design + chat-agent injection wiring
- Aura 2 response shape three-way normalisation (ArrayBuffer /
  ReadableStream / `{audio}`)
- Nova 3 multipart FormData wrapping trick
- TTS+STT loopback test (catches container/encoding mismatches)
- Five-state client state machine + setPointerCapture usage
- `<knowledge_content>` marker tag matching `<skill_content>`
- Budget endpoint + UI banner surfacing always-active token cost
- WeakMap dedup on load_knowledge (Gemini called this "brilliant")

## Voice-specific deep-dive (Opus + Gemini)

**On poor connectivity** (Gemini): UI sticks indefinitely in
`transcribing` because no AbortController. Confirms H2.

**On voice mode toggle mid-stream** (Gemini): handled correctly —
`stopSpeaking()` pauses + `cancelled` flag prevents ghost audio.

**iOS Safari background tab** (Opus): MediaRecorder dies on background;
on return, audio element pauses, `onended` may never fire. Add
`visibilitychange` handler.

**Aura 2 latency** (Opus): ~500ms-2s per paragraph. For 5000-char
caps, perceived as slow. Sentence-by-sentence streaming via
MediaSource API would cut this ~70% — complex but valuable for v2.

## Action plan

Fixing **C1–C8** (all critical) + **H1–H5** + **M1, M2, M3** in this
session. Other Mediums can be follow-ups. Total ~300 lines of code
across ~6 files. Then re-deploy and re-run smoke test.

Site-wide brains-trust pass (all features beyond voice + knowledge)
deferred to a follow-up — would need a different prompt with
`docs/AGENT_PLAYBOOKS.md` + `nav.ts` + each major surface's source.
