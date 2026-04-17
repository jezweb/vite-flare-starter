/**
 * Image Generation Tool — via AI SDK generateImage
 *
 * Multi-provider image generation: Workers AI (FLUX), OpenAI (GPT Image, DALL-E),
 * Google (Imagen). Generated images are stored in R2 and a URL is returned.
 *
 * Requires at least one image-capable provider configured.
 */
import { tool, generateImage, type ImageModel } from 'ai'
import { z } from 'zod'
import { createWorkersAI } from 'workers-ai-provider'

interface ImageContext {
  env: {
    AI: Ai
    FILES?: R2Bucket
    OPENAI_API_KEY?: string
  }
  userId: string
}

export function buildImageTools(ctx: ImageContext) {
  if (!ctx.env.FILES) return {}

  const workersai = createWorkersAI({ binding: ctx.env.AI })

  return {
    generate_image: tool({
      description: 'Generate an image from a text description. The image is saved and a URL is returned. Use when the user asks you to create, draw, or generate an image, illustration, or picture.',
      inputSchema: z.object({
        prompt: z.string().describe('Detailed image description — be specific about subject, style, lighting, composition'),
        size: z.string().optional().describe('Image size: 1024x1024 (default), 1536x1024, 1024x1536'),
        provider: z.enum(['workers-ai', 'openai']).optional().describe('Image provider (default: workers-ai which is free)'),
      }),
      execute: async ({ prompt, size, provider = 'workers-ai' }) => {
        try {
          let imageModel: ImageModel = workersai.image('@cf/black-forest-labs/flux-1-schnell')

          // Use OpenAI if requested and configured
          if (provider === 'openai' && ctx.env.OPENAI_API_KEY) {
            const { createOpenAI } = await import('@ai-sdk/openai')
            const openai = createOpenAI({ apiKey: ctx.env.OPENAI_API_KEY })
            imageModel = openai.image('gpt-image-1')
          }

          const { image } = await generateImage({
            model: imageModel,
            prompt,
            size: (size || '1024x1024') as `${number}x${number}`,
          })

          // Store to R2. Key MUST start with `users/${userId}/` so that the
          // /api/files/download/* endpoint's ownership check passes. Previous
          // `generated/...` prefix silently 403'd every generated image.
          const key = `users/${ctx.userId}/generated/${crypto.randomUUID()}.png`
          await ctx.env.FILES!.put(key, image.uint8Array, {
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
    }),
  }
}
