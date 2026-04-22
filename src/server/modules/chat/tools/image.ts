/**
 * Image Generation Tool — via AI SDK generateImage.
 *
 * Multi-provider: Workers AI (FLUX), OpenAI (GPT Image, DALL-E), Google (Imagen).
 * Generated images are stored in R2 and a URL is returned. Requires FILES bucket.
 */
import { generateImage, type ImageModel } from 'ai'
import { z } from 'zod'
import { createWorkersAI } from 'workers-ai-provider'
import { ImageIcon } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

type ImageEnv = {
  AI: Ai
  FILES?: R2Bucket
  OPENAI_API_KEY?: string
}

function getImageEnv(ctx: AgentContext): ImageEnv {
  return ctx.env as unknown as ImageEnv
}

const GenerateImageOutput = z.union([
  z.object({
    url: z.string(),
    key: z.string(),
    prompt: z.string(),
    provider: z.string(),
    sizeBytes: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const generateImageDefinition: ToolDefinition<
  { prompt: string; size?: string; provider?: 'workers-ai' | 'openai' },
  z.infer<typeof GenerateImageOutput>
> = {
  name: 'generate_image',
  description:
    'Generate an image from a text description. The image is saved and a URL is returned. Use when the user asks you to create, draw, or generate an image, illustration, or picture.',
  inputSchema: z.object({
    prompt: z.string().describe('Detailed image description — be specific about subject, style, lighting, composition'),
    size: z.string().optional().describe('Image size: 1024x1024 (default), 1536x1024, 1024x1536'),
    provider: z.enum(['workers-ai', 'openai']).optional().describe('Image provider (default: workers-ai which is free)'),
  }),
  outputSchema: GenerateImageOutput,
  isAvailable: (ctx) => !!getImageEnv(ctx).FILES,
  execute: async ({ prompt, size, provider = 'workers-ai' }, ctx) => {
    const env = getImageEnv(ctx)
    try {
      const workersai = createWorkersAI({ binding: env.AI })
      let imageModel: ImageModel = workersai.image('@cf/black-forest-labs/flux-1-schnell')

      if (provider === 'openai' && env.OPENAI_API_KEY) {
        const { createOpenAI } = await import('@ai-sdk/openai')
        const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
        imageModel = openai.image('gpt-image-1')
      }

      const { image } = await generateImage({
        model: imageModel,
        prompt,
        size: (size || '1024x1024') as `${number}x${number}`,
      })

      // Key MUST start with `users/${userId}/` so /api/files/download/* ownership check passes.
      const key = `users/${ctx.userId}/generated/${crypto.randomUUID()}.png`
      await env.FILES!.put(key, image.uint8Array, {
        httpMetadata: { contentType: 'image/png' },
        customMetadata: { prompt, provider, userId: ctx.userId },
      })

      return {
        url: `/api/files/download/${encodeURIComponent(key)}`,
        key,
        prompt,
        provider,
        sizeBytes: image.uint8Array.length,
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: ImageIcon, displayName: 'Generate Image' },
}

export const imageDefinitions = [generateImageDefinition] as ToolDefinition<unknown, unknown>[]
