---
date: 2026-05-06
status: active (planned)
companion: voice-and-knowledge-plan-2026-05-06.md (the why and shape)
owner: jez+claude
---

# Voice mode — build spec

Native conversational round-trip in chat: mic → STT → ChatAgent →
TTS → speakers. Push-to-talk, opt-in via toggle on `/dashboard/chat`.

## Goal

Voice IO for the existing ChatAgent. Same conversation, same tools,
same memory, same skills — the only difference is audio in / audio
out. Push-to-talk in v1; continuous mode in v2.

## Files to create

### Server

#### 1. `src/server/modules/voice/voice-tts.ts`

Workers AI Aura 2 wrapper + ElevenLabs fallback:

```ts
export interface TtsEnv {
  AI: Ai
  ELEVENLABS_API_KEY?: string
  ELEVENLABS_VOICE_ID?: string
}

export type TtsProvider = 'aura2' | 'elevenlabs'

/**
 * Generate speech audio (mp3) for a text string.
 * Aura 2: free, Workers AI binding, US-English-leaning. Default.
 * ElevenLabs: paid, multilingual, voice cloning. Opt-in via key.
 */
export async function synthesizeSpeech(
  env: TtsEnv,
  text: string,
  opts?: { speaker?: string; provider?: TtsProvider },
): Promise<{ audio: ArrayBuffer; provider: TtsProvider }> {
  const wantElevenLabs =
    opts?.provider === 'elevenlabs' || (env.ELEVENLABS_API_KEY && !opts?.provider)

  if (wantElevenLabs && env.ELEVENLABS_API_KEY) {
    const voice = env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM'  // default voice
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })
    if (!resp.ok) throw new Error(`ElevenLabs TTS failed: ${resp.status}`)
    return { audio: await resp.arrayBuffer(), provider: 'elevenlabs' }
  }

  // Aura 2 default — speaker name with no `-en` suffix per
  // ~/.claude/rules/workers-ai-gotchas.md. Encoding mp3 / container none.
  const speaker = (opts?.speaker ?? 'orion').replace(/-en$/i, '')
  const result = (await env.AI.run('@cf/deepgram/aura-2-en', {
    text,
    speaker,
    encoding: 'mp3',
    container: 'none',
  })) as { audio: ArrayBuffer } | ArrayBuffer

  const audio = (result as { audio?: ArrayBuffer }).audio
    ?? (result as ArrayBuffer)
  return { audio, provider: 'aura2' }
}
```

#### 2. `src/server/modules/voice/voice-chat-routes.ts`

REST routes mounted at `/api/voice`:

```
POST /transcribe   multipart audio → text via Workers AI Nova-3 STT
POST /tts          { text, speaker?, provider? } → audio/mpeg stream
```

Both authMiddleware-gated. Transcribe accepts webm-opus per
`~/.claude/rules/workers-ai-gotchas.md` (Nova 3 binding requirement).

The ACTUAL chat round-trip uses the existing chat agent — voice mode
is an IO wrapper, not a new agent. Client-side flow:

1. User holds PTT button; mic captures audio (MediaRecorder webm-opus)
2. On release, POST audio to `/api/voice/transcribe` → text
3. Submit text to existing chat endpoint as a normal user message
4. Stream the assistant's reply (existing flow)
5. After streaming completes, POST reply text to `/api/voice/tts` → audio
6. Play audio via `<audio>` element

No new DO needed. Voice mode is purely a client-side IO wrapper.

### Client

#### 3. `src/client/modules/chat/components/VoiceModeToggle.tsx`

Toggle button in chat header. Off = text mode (current). On = voice
mode. Stores pref in localStorage scoped to userId.

#### 4. `src/client/modules/chat/components/VoiceModePanel.tsx`

When voice mode is on, replace the textarea with a panel:
- Big PTT button (hold-to-record). Tap-to-toggle on mobile.
- Live transcript preview while recording (interim from STT)
- Status: "Listening… / Transcribing… / Thinking… / Speaking…"
- Hidden `<audio>` element for TTS playback
- Voice picker (speaker name) + provider toggle (Aura2 / ElevenLabs)
  in a cog icon dropdown

#### 5. `src/client/hooks/useVoiceChat.ts`

State machine + MediaRecorder + fetch wrappers:

```ts
type VoiceState = 'idle' | 'listening' | 'transcribing' | 'sending' | 'speaking' | 'error'

export function useVoiceChat(opts: { onTextSubmit: (text: string) => void }) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  // ...
  const startRecording = async () => { /* MediaRecorder → blob */ }
  const stopRecording = async () => { /* upload → STT → onTextSubmit */ }
  const playReply = async (text: string) => { /* TTS → audio */ }

  return { state, transcript, startRecording, stopRecording, playReply }
}
```

#### 6. Wire into ChatPage

When voice mode is on:
- Hide chat textarea
- Mount VoiceModePanel
- After agent reply streams to completion, call `playReply(replyText)`
- Save interleaved voice + text turns to conversation history same as before (text wins for transcript fidelity)

## Storage / wrangler

- Workers AI binding (`AI`) already wired
- Add optional secrets: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
  (only if user wants ElevenLabs default)
- No new bindings, no migration

## Verification gates

1. Type-check + build clean
2. Open chat, toggle voice mode on → textarea hidden, PTT button visible
3. Hold PTT, say "hello", release → transcript shows, message sends,
   agent replies, agent reply plays as audio
4. Voice picker switches speaker mid-conversation
5. Provider toggle works if `ELEVENLABS_API_KEY` is set
6. Tools/skills/memory all work — voice mode doesn't break the
   existing agent loop
7. Mobile (real iOS device): PTT button works, audio plays inline
8. Conversation history shows text turns (no special voice-only marker)

## What this v1 does NOT do

- Continuous mode (no VAD, no auto-detect end-of-utterance)
- Streaming TTS (Aura 2 returns full audio; play after full stream)
- Speech-to-speech latency optimisation (pipeline is sequential)
- Multi-language UI (English-only voice prompts)
- Voice cloning UI (use ElevenLabs voice ID configured at env-level)

These are v2 candidates after dogfood.

## Cross-cutting

- **Reuse VoiceInputExample's STT pattern** — it's already wired with
  `@cloudflare/voice` + Nova 3. Voice mode uses the same STT but via
  POST endpoint rather than DO WebSocket (chat doesn't need a DO
  for IO since the ChatAgent already is one).
- **Audio format**: webm-opus on input (Nova 3 requirement); mp3 on
  output (Aura 2 default; ElevenLabs supports mp3).
- **Privacy**: Aura 2 is local-Cloudflare (no third-party). ElevenLabs
  sends text to their servers. Document this in the provider toggle.

## TL;DR

Voice mode = client-side IO wrapper around existing chat. Two new
endpoints (`/api/voice/transcribe`, `/api/voice/tts`), one new toggle,
one new panel, one new hook. ~3-4h. ChatAgent unchanged.
