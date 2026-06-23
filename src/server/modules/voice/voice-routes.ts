/**
 * Voice mode HTTP endpoints.
 *
 *   POST /api/voice/transcribe   — multipart audio file → { text }
 *   POST /api/voice/tts           — { text, speaker?, provider? } → audio/mpeg
 *   GET  /api/voice/voices        — list available speakers + provider config
 *
 * Both transcribe + tts are auth-gated. The chat round-trip itself does
 * NOT live here — voice mode is a client-side IO wrapper around the
 * existing chat endpoint. Client flow:
 *
 *   PTT release → POST /transcribe → submit text to chat (existing path)
 *                → stream reply → POST /tts(reply) → play audio
 *
 * Audio formats:
 *   - Input: webm-opus (per workers-ai-gotchas.md Nova 3 requirement;
 *     browser MediaRecorder produces this natively with mimeType='audio/webm')
 *   - Output: mp3 from Aura 2 (encoding='mp3' container='none') or
 *     ElevenLabs (model_id='eleven_turbo_v2_5')
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { consumeRateLimit } from '@/server/middleware/rate-limit'
import {
  AURA2_SPEAKERS,
  synthesizeSpeech,
  type SynthesizeOpts,
  type TtsEnv,
  type TtsProvider,
} from './voice-tts'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

/** GET /voices — capability discovery for the client picker. */
app.get('/voices', (c) => {
  const elevenLabsAvailable = !!(c.env as unknown as { ELEVENLABS_API_KEY?: string })
    .ELEVENLABS_API_KEY
  return c.json({
    aura2: { speakers: AURA2_SPEAKERS, default: 'orion' },
    elevenlabs: {
      available: elevenLabsAvailable,
      // Voice list is account-scoped; we expose only the env-default id.
      defaultVoiceId:
        (c.env as unknown as { ELEVENLABS_VOICE_ID?: string }).ELEVENLABS_VOICE_ID ?? null,
    },
  })
})

/**
 * POST /transcribe — multipart audio → text via Workers AI Nova 3.
 *
 * Field name: `audio` (Blob). Browser-side, send a `FormData` with the
 * recorded `Blob` from MediaRecorder under that key.
 */
app.post('/transcribe', async (c) => {
  const rl = consumeRateLimit({
    key: 'VOICE',
    windowMs: 60 * 60 * 1000,
    identifier: c.get('userId'),
    routeKey: 'POST:/api/voice/transcribe',
  })
  if (!rl.allowed) {
    return c.json(
      { error: 'Voice rate limit exceeded — try again later.', retryAfterSeconds: rl.retryAfterSeconds },
      429
    )
  }
  let form: FormData
  try {
    form = await c.req.formData()
  } catch (err) {
    return c.json(
      { error: `Bad multipart body: ${err instanceof Error ? err.message : String(err)}` },
      400
    )
  }
  const file = form.get('audio')
  if (!file || typeof file === 'string') {
    return c.json({ error: 'Missing "audio" file in multipart form' }, 400)
  }
  const blob = file as File
  const arrayBuffer = await blob.arrayBuffer()
  const contentType = blob.type || 'audio/webm'
  if (arrayBuffer.byteLength === 0) {
    return c.json({ error: 'Empty audio buffer' }, 400)
  }
  if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
    return c.json({ error: 'Audio too large (>20MB)' }, 413)
  }

  // Nova 3 binding wants a multipart-encoded body, NOT a raw ArrayBuffer.
  // Passing the bytes directly returns `5006: required properties at
  // '/audio' are 'body,contentType'` even though both fields look populated
  // — the binding's JSON-schema validator can't introspect ArrayBuffer.
  // Wrapping in a single-field FormData fixes it. Same trick as
  // src/server/modules/audio/routes.ts.
  const upstreamForm = new FormData()
  upstreamForm.append('audio', new Blob([arrayBuffer], { type: contentType }), 'audio')
  const formResp = new Response(upstreamForm)

  try {
    const ai = (c.env as unknown as { AI: Ai }).AI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await ai.run(
      '@cf/deepgram/nova-3' as any,
      {
        audio: {
          body: formResp.body,
          contentType: formResp.headers.get('content-type'),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    )) as unknown
    const text = extractTranscript(result)
    if (!text) {
      return c.json({ error: 'No speech detected', text: '' }, 200)
    }
    return c.json({ text })
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err)
    const lower = rawMessage.toLowerCase()
    // Per ~/.claude/rules/workers-ai-gotchas.md: only "no speech" / "silence"
    // are benign. 3030 corrupt/unsupported is a real format error.
    const benign =
      lower.includes('no speech') ||
      lower.includes('no audio') ||
      lower.includes('silence') ||
      lower.includes('too short')
    console.error(JSON.stringify({ event: 'voice_transcribe_error', error: rawMessage, benign }))
    if (benign) {
      return c.json({ error: 'No speech detected', text: '' }, 200)
    }
    return c.json({ error: `Transcription failed: ${rawMessage}` }, 500)
  }
})

const ttsBodySchema = z.object({
  text: z.string().min(1).max(5000),
  speaker: z.string().optional(),
  provider: z.enum(['aura2', 'elevenlabs']).optional(),
})

/**
 * POST /tts — synthesize text to audio bytes. Returns audio/mpeg directly
 * with X-TTS-Provider header so the client knows which provider answered.
 */
app.post('/tts', zValidator('json', ttsBodySchema), async (c) => {
  const rl = consumeRateLimit({
    key: 'VOICE',
    windowMs: 60 * 60 * 1000,
    identifier: c.get('userId'),
    routeKey: 'POST:/api/voice/tts',
  })
  if (!rl.allowed) {
    return c.json(
      { error: 'Voice rate limit exceeded — try again later.', retryAfterSeconds: rl.retryAfterSeconds },
      429
    )
  }
  const { text, speaker, provider } = c.req.valid('json')
  const env = c.env as unknown as TtsEnv
  try {
    const opts: SynthesizeOpts = {}
    if (speaker !== undefined) opts.speaker = speaker
    if (provider !== undefined) opts.provider = provider as TtsProvider
    const result = await synthesizeSpeech(env, text, opts)
    return new Response(result.audio, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.audio.byteLength),
        'X-TTS-Provider': result.provider,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ event: 'voice_tts_error', error: message }))
    return c.json({ error: `TTS failed: ${message}` }, 500)
  }
})

function extractTranscript(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const r = result as Record<string, unknown>
  // Nova 3 returns { text: '...' } in the binding's flattened shape.
  if (typeof r['text'] === 'string') return (r['text'] as string).trim()
  // Some Nova endpoints wrap as { results: { channels: [{ alternatives: [{ transcript }] }] } }
  const results = r['results'] as Record<string, unknown> | undefined
  const channels = results?.['channels'] as Array<Record<string, unknown>> | undefined
  const alt = channels?.[0]?.['alternatives'] as Array<Record<string, unknown>> | undefined
  const transcript = alt?.[0]?.['transcript']
  return typeof transcript === 'string' ? transcript.trim() : ''
}

export default app
