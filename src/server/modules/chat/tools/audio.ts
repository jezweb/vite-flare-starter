/**
 * Audio Tools — Speech-to-Text and Text-to-Speech via Workers AI
 *
 * Uses Cloudflare's Deepgram bindings — no external API keys needed.
 * - STT: Deepgram Nova 3 (auto language detection)
 * - TTS: Deepgram Aura 2 (12 voice options) with Aura 1 fallback
 *
 * @see https://developers.cloudflare.com/workers-ai/models/
 */
import { tool } from 'ai'
import { z } from 'zod'

interface AudioEnv {
  AI: Ai
}

interface AudioContext {
  env: AudioEnv
}

const SPEAKERS = [
  'angus', 'asteria', 'arcas', 'athena', 'helios', 'hera',
  'luna', 'orion', 'orpheus', 'perseus', 'stella', 'zeus',
] as const

export function buildAudioTools(ctx: AudioContext) {
  return {
    transcribe_audio: tool({
      description: 'Convert audio to text (speech-to-text). Use when the user provides an audio recording or wants you to listen to something. Auto-detects language. Pass audio as a base64 data URL.',
      inputSchema: z.object({
        audioDataUrl: z.string().describe('Audio file as data URL (data:audio/webm;base64,...). Max 10MB.'),
      }),
      execute: async ({ audioDataUrl }) => {
        try {
          // Parse data URL
          const match = audioDataUrl.match(/^data:([^;]+);base64,(.+)$/)
          if (!match) {
            return { error: 'Invalid audio data URL. Expected format: data:audio/<type>;base64,<content>' }
          }
          const [, contentType = 'audio/webm', base64 = ''] = match
          const binary = atob(base64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

          if (bytes.length > 10 * 1024 * 1024) {
            return { error: 'Audio too large (max 10MB)' }
          }

          // Stream the audio to Workers AI Deepgram model
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(bytes)
              controller.close()
            },
          })

          const resp = await ctx.env.AI.run(
            '@cf/deepgram/nova-3' as Parameters<Ai['run']>[0],
            {
              audio: { body: stream, contentType },
              detect_language: true,
            } as never,
            { returnRawResponse: true },
          ) as unknown as Response

          const data = await resp.json() as {
            results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> }
            metadata?: { detected_language?: string }
          }

          const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
          const confidence = data?.results?.channels?.[0]?.alternatives?.[0]?.confidence
          const language = data?.metadata?.detected_language || 'en'

          return { text: transcript, language, confidence }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    speak_text: tool({
      description: 'Convert text to speech audio (text-to-speech). Returns an audio data URL the user can play. Use when the user asks you to read something aloud or speak a message. Choose a speaker voice that fits the content.',
      inputSchema: z.object({
        text: z.string().max(2000).describe('Text to convert to speech (max 2000 chars)'),
        speaker: z.enum(SPEAKERS).optional().describe('Voice: luna (default, neutral female), orion (male), athena (warm female), zeus (deep male), and others'),
      }),
      execute: async ({ text, speaker = 'luna' }) => {
        try {
          let result: unknown
          try {
            // Try Aura 2 first
            result = await ctx.env.AI.run(
              '@cf/deepgram/aura-2-en' as Parameters<Ai['run']>[0],
              { text, speaker } as never,
            )
          } catch {
            // Fallback to Aura 1
            result = await ctx.env.AI.run(
              '@cf/deepgram/aura-1' as Parameters<Ai['run']>[0],
              { text, speaker } as never,
            )
          }

          // Result is a ReadableStream of MP3 audio
          const stream = result as ReadableStream<Uint8Array>
          const reader = stream.getReader()
          const chunks: Uint8Array[] = []
          let total = 0
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              chunks.push(value)
              total += value.length
            }
          }
          const audio = new Uint8Array(total)
          let offset = 0
          for (const chunk of chunks) {
            audio.set(chunk, offset)
            offset += chunk.length
          }
          const base64 = btoa(String.fromCharCode(...audio))
          return {
            audioDataUrl: `data:audio/mpeg;base64,${base64}`,
            speaker,
            sizeBytes: audio.length,
            characters: text.length,
          }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
