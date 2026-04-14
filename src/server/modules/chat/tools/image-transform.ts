/**
 * Image Transform Tool — AI agent access to Cloudflare Images processing
 *
 * Lets the agent transform images stored in R2: resize, crop, convert format,
 * remove backgrounds, generate thumbnails, adjust colours, add blur/sharpen.
 * All processing runs at the edge via the Cloudflare Images binding.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { transformImage, getImageInfo, type TransformOptions } from '@/server/modules/images/transform'

interface ImageTransformContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  env: { IMAGES?: any; FILES?: R2Bucket }
  userId: string
}

export function buildImageTransformTools(ctx: ImageTransformContext) {
  if (!ctx.env.IMAGES || !ctx.env.FILES) return {}

  return {
    image_transform: tool({
      description: 'Transform an image stored in the filesystem: resize, crop, convert format, remove background, blur, sharpen, adjust brightness/contrast/saturation, rotate, flip. The result is saved as a new file. Use when the user asks to resize, optimise, edit, or process an image.',
      inputSchema: z.object({
        sourcePath: z.string().describe('Path to source image in the filesystem'),
        outputPath: z.string().describe('Path to save the result'),
        width: z.number().optional().describe('Target width in pixels'),
        height: z.number().optional().describe('Target height in pixels'),
        fit: z.enum(['scale-down', 'contain', 'cover', 'crop', 'pad']).optional().describe('Resize mode'),
        format: z.enum(['webp', 'avif', 'jpeg', 'png']).optional().describe('Output format (default: webp)'),
        quality: z.number().min(1).max(100).optional().describe('Output quality 1-100'),
        gravity: z.enum(['auto', 'face', 'left', 'right', 'top', 'bottom']).optional().describe('Crop anchor (use "face" for AI face detection)'),
        blur: z.number().min(1).max(250).optional().describe('Gaussian blur radius'),
        sharpen: z.number().min(0).max(10).optional().describe('Sharpening strength'),
        brightness: z.number().optional().describe('Brightness (1.0 = unchanged)'),
        contrast: z.number().optional().describe('Contrast (1.0 = unchanged)'),
        saturation: z.number().optional().describe('Saturation (0 = grayscale, 1.0 = unchanged)'),
        rotate: z.enum(['90', '180', '270']).optional().describe('Rotation degrees'),
        flip: z.enum(['h', 'v', 'hv']).optional().describe('Mirror: h=horizontal, v=vertical'),
        removeBackground: z.boolean().optional().describe('AI background removal (returns transparent PNG)'),
        backgroundColor: z.string().optional().describe('Fill background colour (CSS4 format, e.g. "#ffffff")'),
      }),
      execute: async ({ sourcePath, outputPath, removeBackground, backgroundColor, rotate, ...rest }) => {
        try {
          const scopedSource = `users/${ctx.userId}/${sourcePath}`
          const scopedOutput = `users/${ctx.userId}/${outputPath}`

          const object = await ctx.env.FILES!.get(scopedSource)
          if (!object) return { error: `Image not found: ${sourcePath}` }

          const options: TransformOptions = {
            ...rest,
            format: rest.format || 'webp',
            ...(rotate ? { rotate: Number(rotate) as 90 | 180 | 270 } : {}),
            ...(removeBackground ? { segment: 'foreground', format: 'png' } : {}),
            ...(backgroundColor ? { background: backgroundColor } : {}),
          }

          const response = await transformImage(ctx.env.IMAGES, await object.arrayBuffer(), options)
          const resultBytes = await response.arrayBuffer()

          const contentType = response.headers.get('content-type') || `image/${options.format}`
          await ctx.env.FILES!.put(scopedOutput, resultBytes, {
            httpMetadata: { contentType },
          })

          return {
            sourcePath,
            outputPath,
            sizeBytes: resultBytes.byteLength,
            contentType,
            url: `/api/files/download/${encodeURIComponent(scopedOutput)}`,
          }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    image_info: tool({
      description: 'Get metadata about an image: format, dimensions, file size. Use when the user asks about an image\'s properties.',
      inputSchema: z.object({
        path: z.string().describe('Path to image in the filesystem'),
      }),
      execute: async ({ path }) => {
        try {
          const scopedPath = `users/${ctx.userId}/${path}`
          const object = await ctx.env.FILES!.get(scopedPath)
          if (!object) return { error: `Image not found: ${path}` }

          const info = await getImageInfo(ctx.env.IMAGES, await object.arrayBuffer())
          return { path, ...info }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
