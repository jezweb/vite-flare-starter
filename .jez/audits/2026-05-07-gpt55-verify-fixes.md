# GPT-5.5 verification re-review

_Tokens: in=23362 out=5009_

**Verdict** — Not production-safe yet. Most security-critical knowledge leaks are fixed, and voice is materially improved, but there are still must-fix regressions/partials: the getUserMedia race remains for release-before-permission, transcribe fetches are not aborted on disable/cancel/new recording, and the new FTS5 escaping likely makes normal searches fail due malformed wildcard syntax.

**Verified-fixed**

- **C1** — fixed at `VoiceModeButton.tsx:109-143`, `:190-198` — pointerup prevents default and suppresses follow-up click; mostly correct.
- **C2** — fixed at `knowledge/routes.ts:45-64` — org scope now denied by `checkScopeAccess`; correct.
- **C3** — fixed at `knowledge/routes.ts:149-162`, `:169-186` — catalog/budget validate projectId and ignore orgId; no cross-project/org leak.
- **C4** — fixed at `chat/tools/knowledge.ts:44-68` and `chat-agent.ts` section 8c safeProjectId block — projectId is intersected with owned projects; correct.
- **C5** — fixed at `knowledge/storage.ts:219-220`, `:455-456` — disabled docs excluded from search/load_knowledge; correct.
- **C6** — fixed at `useVoiceChat.ts:193-211`, called from `VoiceModeButton.tsx:84-92` — audio element primed inside enable gesture; acceptable, though iOS recording remains intentionally unsupported.
- **C7** — fixed at `useVoiceChat.ts:104-116`, `:241-249` — unsupported WebM MediaRecorder now errors cleanly instead of throwing; correct.
- **C8** — fixed at `useVoiceChat.ts:417-421` — reply id burned only after `audio.play()` resolves; correct.
- **M1** — fixed at `drizzle/20260507082530_knowledge_fts_trigger_columns.sql:10-20` — UPDATE trigger narrowed to indexed columns; correct.
- **M2** — fixed at `voice-tts.ts:49-56` — Aura2 default is unconditional; correct.
- **M3** — fixed at `voice-tts.ts:91-98` — speaker validated against enum, falls back to default; acceptable.
- **M4** — fixed at `knowledge/routes.ts:101-124`, `:268-284` — list omits body unless `?include=body`; correct.
- **M5** — mostly fixed at `useVoiceChat.ts:169-186`, `:356-363` — TTS fetch aborts on stop/new TTS.
- **M6** — fixed at `VoiceModeButton.tsx:96-107`, `:109-114`, `:145-152` — captured pointer id ignores multitouch; correct.
- **M7** — fixed at `useVoiceChat.ts:326-333` and `voice-routes.ts:90-104` — empty transcript surfaces “didn’t catch that”; correct.

**Still broken or partial**

- **H1 partial** — `useVoiceChat.ts:281-288` still does not invalidate `sessionRef` when `stopRecording()` is called before `getUserMedia()` resolves. Release after >250ms while permission prompt is pending still lets stale `startRecording()` resume and turn mic hot. `cancelRecording()` fixes only the tap path at `:214-231`.
- **H2 partial** — transcribe fetch has timeout at `useVoiceChat.ts:302-350`, but `cancelRecording()`, `stopSpeaking()`, disabling voice mode, and new recording do not abort `transcribeAbortRef`. Late transcribe can still call `opts.onTextSubmit(text)` after voice was disabled.
- **H3 partial** — cap exists at `knowledge/storage.ts:26-34`, enforced at `:339-365`, but chat warning is only appended when `knowledgeBlock` exists in `chat-agent.ts` section 10. If the first/only always doc exceeds 50K tokens, all docs are skipped and no prompt notice is emitted.
- **H4 still broken** — `knowledge/storage.ts:193-199` builds last term as `"term" *`. FTS5 prefix syntax should be `"term"*` or unquoted `term*`; the current query likely throws syntax errors for ordinary searches.
- **M5 edge partial** — TTS object URL can still leak/play during effect cleanup if abort happens after URL creation but before/around `audio.play()`; catch path returns early on `abort.signal.aborted` before revoking at `useVoiceChat.ts:423-431`.

**New issues introduced by the fixes**

- `VoiceModeButton.tsx:65-69` clears `justHandledPointerRef` in a microtask. If relying on that latch, it is likely too early before the synthetic click task; current safety depends on `preventDefault()`. Safer: clear with `setTimeout(..., 0)` or keep the latch for one tick.
- `knowledge/routes.ts:149-162`, `:169-186` silently ignore unauthorized `projectId`/`orgId` instead of returning 403/501. Security leak is fixed, but API semantics can mask caller bugs.
- `chat-agent.ts` section 11 still passes `effectiveProjectId` into memory injection, not `safeProjectId`. Not part of knowledge fix, but same stale-project pattern may exist for memories.
- `voice-tts.ts:91-98` silently maps invalid speakers to `orion`; avoids 5xx but may hide client bugs. Prefer 400 validation at route layer if caller supplied an invalid speaker.
- `useVoiceChat.ts:281-298` can hang if `recorder.stop()` throws before `onstop` fires; promise never resolves.

**Final must-fix-before-prod list**

- Fix **H1** completely: increment/invalidate `sessionRef` in `stopRecording()` when recorder is absent/inactive, and before any release/disable path that should cancel pending `getUserMedia`.
- Fix **H2** completely: abort `transcribeAbortRef` on cancel, disable, unmount, and new recording; guard late transcribe with current session/enabled checks before `onTextSubmit`.
- Fix **H4** FTS query construction: change last-term wildcard from `"term" *` to valid FTS5 syntax or remove wildcard; add tests for `foo -bar`, `OR`, `NOT`, `example.com`.