/**
 * Audio Tools — Speech-to-Text and Text-to-Speech via AI SDK
 *
 * - STT: Workers AI Deepgram Nova 3 (auto language detection)
 * - TTS: Workers AI Deepgram Aura 2 (12 voice options)
 *
 * Falls back to OpenAI Whisper/TTS if Workers AI fails and OPENAI_API_KEY is set.
 */
import {
  experimental_generateSpeech as generateSpeech,
  experimental_transcribe as transcribe,
} from 'ai'
import { z } from 'zod'
import { createWorkersAI } from 'workers-ai-provider'
import { Mic, Volume2 } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

const SPEAKERS = [
  'angus',
  'asteria',
  'arcas',
  'athena',
  'helios',
  'hera',
  'luna',
  'orion',
  'orpheus',
  'perseus',
  'stella',
  'zeus',
] as const

function getAudioEnv(ctx: AgentContext): { AI: Ai; OPENAI_API_KEY?: string } {
  return ctx.env as unknown as { AI: Ai; OPENAI_API_KEY?: string }
}

// ─── transcribe_audio ───────────────────────────────────────────

const TranscribeAudioOutput = z.union([
  z.object({
    text: z.string(),
    segments: z.number().optional(),
    provider: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

export const transcribeAudioDefinition: ToolDefinition<
  { audioDataUrl: string },
  z.infer<typeof TranscribeAudioOutput>
> = {
  name: 'transcribe_audio',
  description:
    'Convert audio to text (speech-to-text). Use when the user provides an audio recording or wants you to listen to something. Pass audio as a base64 data URL.',
  inputSchema: z.object({
    audioDataUrl: z
      .string()
      .describe('Audio file as data URL (data:audio/webm;base64,...). Max 10MB.'),
  }),
  outputSchema: TranscribeAudioOutput,
  execute: async ({ audioDataUrl }, ctx) => {
    const env = getAudioEnv(ctx)
    const workersai = createWorkersAI({ binding: env.AI })
    try {
      const match = audioDataUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        return {
          error: 'Invalid audio data URL. Expected format: data:audio/<type>;base64,<content>',
        }
      }
      const [, , base64 = ''] = match
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      if (bytes.length > 10 * 1024 * 1024) {
        return { error: 'Audio too large (max 10MB)' }
      }

      const result = await transcribe({
        model: workersai.transcription('@cf/deepgram/nova-3'),
        audio: bytes,
      })
      return { text: result.text, segments: result.segments?.length ?? 0 }
    } catch (error) {
      if (env.OPENAI_API_KEY) {
        try {
          const { createOpenAI } = await import('@ai-sdk/openai')
          const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
          const match = audioDataUrl.match(/^data:([^;]+);base64,(.+)$/)
          const binary = atob(match?.[2] ?? '')
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

          const result = await transcribe({
            model: openai.transcription('whisper-1'),
            audio: bytes,
          })
          return { text: result.text, provider: 'openai-fallback' }
        } catch {
          // Both failed
        }
      }
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Mic, displayName: 'Transcribe Audio' },
}

// ─── speak_text ─────────────────────────────────────────────────

const SpeakTextOutput = z.union([
  z.object({
    audioDataUrl: z.string(),
    speaker: z.string(),
    provider: z.string().optional(),
    sizeBytes: z.number(),
    characters: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const speakTextDefinition: ToolDefinition<
  { text: string; speaker?: (typeof SPEAKERS)[number] },
  z.infer<typeof SpeakTextOutput>
> = {
  name: 'speak_text',
  description:
    'Convert text to speech audio (text-to-speech). Returns an audio data URL the user can play. Choose a speaker voice that fits the content.',
  inputSchema: z.object({
    text: z.string().max(2000).describe('Text to convert to speech (max 2000 chars)'),
    speaker: z
      .enum(SPEAKERS)
      .optional()
      .describe(
        'Voice: luna (default, neutral female), orion (male), athena (warm female), zeus (deep male)'
      ),
  }),
  outputSchema: SpeakTextOutput,
  execute: async ({ text, speaker = 'luna' }, ctx) => {
    const env = getAudioEnv(ctx)
    const workersai = createWorkersAI({ binding: env.AI })
    try {
      const result = await generateSpeech({
        model: workersai.speech('@cf/deepgram/aura-2-en'),
        text,
        voice: speaker,
      })
      const base64 = result.audio.base64
      return {
        audioDataUrl: `data:audio/mpeg;base64,${base64}`,
        speaker,
        sizeBytes: result.audio.uint8Array.length,
        characters: text.length,
      }
    } catch (error) {
      if (env.OPENAI_API_KEY) {
        try {
          const { createOpenAI } = await import('@ai-sdk/openai')
          const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
          const result = await generateSpeech({
            model: openai.speech('tts-1'),
            text,
            voice: 'alloy',
          })
          const base64 = result.audio.base64
          return {
            audioDataUrl: `data:audio/mpeg;base64,${base64}`,
            speaker: 'alloy',
            provider: 'openai-fallback',
            sizeBytes: result.audio.uint8Array.length,
            characters: text.length,
          }
        } catch {
          // Both failed
        }
      }
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Volume2, displayName: 'Text to Speech' },
}

export const audioDefinitions = [transcribeAudioDefinition, speakTextDefinition] as ToolDefinition<
  unknown,
  unknown
>[]
