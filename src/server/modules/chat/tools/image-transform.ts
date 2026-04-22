/**
 * Image Transform Tools — Cloudflare Images binding via AI agent.
 *
 * Resize, crop, convert format, remove backgrounds, thumbnails, colour
 * adjustments, blur/sharpen. All processing at the edge.
 * Requires IMAGES + FILES bindings.
 */
import { z } from 'zod'
import { Wand2, Info } from 'lucide-react'
import { transformImage, getImageInfo, type TransformOptions } from '@/server/modules/images/transform'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

type ImageTransformEnv = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  IMAGES?: any
  FILES?: R2Bucket
}

function getEnv(ctx: AgentContext): ImageTransformEnv {
  return ctx.env as unknown as ImageTransformEnv
}

const available = (ctx: AgentContext) => {
  const env = getEnv(ctx)
  return !!(env.IMAGES && env.FILES)
}

type ImageTransformInput = {
  sourcePath: string
  outputPath: string
  width?: number
  height?: number
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad'
  format?: 'webp' | 'avif' | 'jpeg' | 'png'
  quality?: number
  gravity?: 'auto' | 'face' | 'left' | 'right' | 'top' | 'bottom'
  blur?: number
  sharpen?: number
  brightness?: number
  contrast?: number
  saturation?: number
  rotate?: '90' | '180' | '270'
  flip?: 'h' | 'v' | 'hv'
  removeBackground?: boolean
  backgroundColor?: string
}

const ImageTransformOutput = z.union([
  z.object({
    sourcePath: z.string(),
    outputPath: z.string(),
    sizeBytes: z.number(),
    contentType: z.string(),
    url: z.string(),
  }),
  z.object({ error: z.string() }),
])

export const imageTransformDefinition: ToolDefinition<
  ImageTransformInput,
  z.infer<typeof ImageTransformOutput>
> = {
  name: 'image_transform',
  description:
    'Transform an image stored in the filesystem: resize, crop, convert format, remove background, blur, sharpen, adjust brightness/contrast/saturation, rotate, flip. The result is saved as a new file. Use when the user asks to resize, optimise, edit, or process an image.',
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
  outputSchema: ImageTransformOutput,
  isAvailable: available,
  execute: async ({ sourcePath, outputPath, removeBackground, backgroundColor, rotate, ...rest }, ctx) => {
    const env = getEnv(ctx)
    try {
      const scopedSource = `users/${ctx.userId}/${sourcePath}`
      const scopedOutput = `users/${ctx.userId}/${outputPath}`

      const object = await env.FILES!.get(scopedSource)
      if (!object) return { error: `Image not found: ${sourcePath}` }

      const options: TransformOptions = {
        ...rest,
        format: rest.format || 'webp',
        ...(rotate ? { rotate: Number(rotate) as 90 | 180 | 270 } : {}),
        ...(removeBackground ? { segment: 'foreground', format: 'png' } : {}),
        ...(backgroundColor ? { background: backgroundColor } : {}),
      }

      const response = await transformImage(env.IMAGES, await object.arrayBuffer(), options)
      const resultBytes = await response.arrayBuffer()
      const contentType = response.headers.get('content-type') || `image/${options.format}`
      await env.FILES!.put(scopedOutput, resultBytes, { httpMetadata: { contentType } })

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
  render: { icon: Wand2, displayName: 'Transform Image' },
}

const ImageInfoOutput = z.union([
  z.object({
    path: z.string(),
    format: z.string(),
    fileSize: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const imageInfoDefinition: ToolDefinition<{ path: string }, z.infer<typeof ImageInfoOutput>> = {
  name: 'image_info',
  description: "Get metadata about an image: format, dimensions, file size. Use when the user asks about an image's properties.",
  inputSchema: z.object({
    path: z.string().describe('Path to image in the filesystem'),
  }),
  outputSchema: ImageInfoOutput,
  isAvailable: available,
  execute: async ({ path }, ctx) => {
    const env = getEnv(ctx)
    try {
      const scopedPath = `users/${ctx.userId}/${path}`
      const object = await env.FILES!.get(scopedPath)
      if (!object) return { error: `Image not found: ${path}` }
      const info = await getImageInfo(env.IMAGES, await object.arrayBuffer())
      return { path, ...info }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Info, displayName: 'Image Info' },
}

export const imageTransformDefinitions = [
  imageTransformDefinition,
  imageInfoDefinition,
] as ToolDefinition<unknown, unknown>[]
