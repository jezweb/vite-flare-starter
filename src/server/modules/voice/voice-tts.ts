/**
 * Voice TTS — Aura 2 (free, Workers AI) with optional ElevenLabs fallback.
 *
 * Aura 2 quirks (~/.claude/rules/workers-ai-gotchas.md):
 *   - The binding rejects `-en` suffixed speaker names. REST API accepts
 *     'orion-en'; binding wants bare 'orion'. We strip the suffix.
 *   - encoding='mp3' + container='none' returns raw mp3 bytes.
 *
 * ElevenLabs is opt-in via ELEVENLABS_API_KEY. When set, callers can pass
 * provider='elevenlabs' (or default to it) to use multilingual + voice
 * cloning. The Aura 2 default ships fork-day-one with no extra setup.
 */
import type { Ai } from '@cloudflare/workers-types'

export interface TtsEnv {
  AI: Ai
  ELEVENLABS_API_KEY?: string
  ELEVENLABS_VOICE_ID?: string
}

export type TtsProvider = 'aura2' | 'elevenlabs'

export interface SynthesizeOpts {
  /** Speaker name. For Aura 2, see workers-ai-gotchas.md valid list (orion, athena, etc). */
  speaker?: string
  /** Override the env-default provider. */
  provider?: TtsProvider
}

export interface SynthesizeResult {
  audio: ArrayBuffer
  provider: TtsProvider
  contentType: string
}

const DEFAULT_AURA_SPEAKER = 'orion'
const DEFAULT_ELEVENLABS_VOICE = '21m00Tcm4TlvDq8ikWAM' // Rachel — ElevenLabs default

export async function synthesizeSpeech(
  env: TtsEnv,
  text: string,
  opts: SynthesizeOpts = {},
): Promise<SynthesizeResult> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('TTS input text is empty')

  const wantElevenLabs =
    opts.provider === 'elevenlabs' ||
    (opts.provider === undefined && !!env.ELEVENLABS_API_KEY && opts.speaker === undefined)

  if (wantElevenLabs) {
    if (!env.ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs requested but ELEVENLABS_API_KEY is not set')
    }
    const voice = env.ELEVENLABS_VOICE_ID ?? DEFAULT_ELEVENLABS_VOICE
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: trimmed,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '')
      throw new Error(`ElevenLabs TTS failed: ${resp.status} ${detail.slice(0, 200)}`)
    }
    return {
      audio: await resp.arrayBuffer(),
      provider: 'elevenlabs',
      contentType: 'audio/mpeg',
    }
  }

  // Aura 2 — strip `-en` suffix per workers-ai-gotchas binding requirement.
  const speaker = (opts.speaker ?? DEFAULT_AURA_SPEAKER).replace(/-en$/i, '')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await env.AI.run('@cf/deepgram/aura-2-en' as any, {
    text: trimmed,
    speaker,
    encoding: 'mp3',
    container: 'none',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as { audio?: ArrayBuffer } | ArrayBuffer

  const audio =
    (result as { audio?: ArrayBuffer }).audio ??
    (result instanceof ArrayBuffer ? result : null)

  if (!audio) throw new Error('Aura 2 returned no audio bytes')
  return { audio, provider: 'aura2', contentType: 'audio/mpeg' }
}

/** Valid Aura 2 speakers per Cloudflare docs / workers-ai-gotchas. */
export const AURA2_SPEAKERS = [
  'amalthea', 'andromeda', 'apollo', 'arcas', 'aries', 'asteria',
  'athena', 'atlas', 'aurora', 'callista', 'cora', 'cordelia',
  'delia', 'draco', 'electra', 'harmonia', 'helena', 'hera',
  'hermes', 'hyperion', 'iris', 'janus', 'juno', 'jupiter',
  'luna', 'mars', 'minerva', 'neptune', 'odysseus', 'ophelia',
  'orion', 'orpheus', 'pandora', 'phoebe', 'pluto', 'saturn',
  'thalia', 'theia', 'vesta', 'zeus',
] as const

export type Aura2Speaker = (typeof AURA2_SPEAKERS)[number]
