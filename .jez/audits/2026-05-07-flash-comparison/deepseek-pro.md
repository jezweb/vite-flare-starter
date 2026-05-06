# DeepSeek v4 Pro 1M verification re-review

_Tokens: in=24385 out=5516 cost=$0.049300464_

**Verdict**  
All critical and high issues from the brains‑trust audit are correctly addressed. The code is now production‑safe for the described use cases; the only remaining gap is a non‑critical iOS‑Safari edge case where voice mode is already enabled on page load and the audio element hasn’t been primed by a user gesture (the user must click the button off/on to unlock, which is acceptable for launch).

**Verified‑fixed**  

- **C1** – fixed at `VoiceModeButton.tsx` → `justHandledPointerRef` + `queueMicrotask` suppress the synthetic click after hold‑release.  
- **C2** – fixed at `routes.ts:65` → `checkScopeAccess` returns `false` for `org`.  
- **C3** – fixed at `routes.ts` `/catalog` and `/budget` → projectId validated via `checkScopeAccess` before passing to storage.  
- **C4** – fixed at `knowledge.ts` `userScopes` → projectIds are intersected with ownership; `chat-agent.ts` §8c re‑validates `effectiveProjectId`.  
- **C5** – fixed at `storage.ts` → `searchKnowledge` and `getKnowledgeForUser` filter `injection_mode != 'disabled'`.  
- **C6** – fixed at `useVoiceChat.ts` `unlockAudio` + `VoiceModeButton.ts` call to `unlockAudio` inside the enable‑gesture.  
- **C7** – fixed at `useVoiceChat.ts` `pickMimeType` → falls back to `recordingUnsupported` and UI shows a tooltip+disabled state.  
- **C8** – fixed at `useVoiceChat.ts` → `lastSpokenIdRef.current` is set only after `audio.play()` resolves.  
- **H1** – fixed at `useVoiceChat.ts` `startRecording` → session counter and check after `getUserMedia`.  
- **H2** – fixed at `useVoiceChat.ts` → `AbortController` + timeout for both transcribe and TTS fetches, aborted on cancel/unmount.  
- **H3** – fixed at `storage.ts` `loadAlwaysActiveKnowledge` → enforces 50K‑token total cap; `chat-agent.ts` appends a truncation notice.  
- **H4** – fixed at `storage.ts` `searchKnowledge` → all tokens are double‑quoted with escaped internal `"` and a trailing wildcard on the last token.  
- **H5** – fixed at `useVoiceChat.ts` → object URL revoked in all error/abort paths, and `revokeUrl` is called from `stopSpeaking` and unmount.  
- **M1** – fixed at migration `20260507082530_knowledge_fts_trigger_columns.sql` → trigger narrowed to `UPDATE OF title, summary, body, tags`.  
- **M2** – fixed at `voice-tts.ts` → Aura 2 is unconditional default; ElevenLabs only used when `provider='elevenlabs'` is passed explicitly.  
- **M3** – fixed at `voice-tts.ts` → speaker is validated against the `AURA2_SPEAKERS` array; invalid names fall back to the default.

**Still broken or partial**  
None of the audited items remain open.

**New issues introduced by the fixes**  
- **iOS audio unlock for pre‑enabled voice mode** – if voice mode is persisted as enabled (e.g., from localStorage) the button is never clicked to enable, so `unlockAudio` may not run inside a gesture. On iOS Safari the first TTS auto‑play would then be blocked. Workaround: the user must toggle voice mode off and on. This is a pre‑existing limitation of the autoplay policy, not a regression, and not critical for launch.

**Final must‑fix‑before‑prod list**  
None.