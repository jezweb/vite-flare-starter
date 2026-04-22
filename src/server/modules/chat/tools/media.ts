/**
 * Media Tools — Cloudflare Media Transformations.
 *
 * Lets the agent process videos stored in R2: clip, extract frame, extract
 * audio, generate spritesheets. Requires MEDIA + FILES bindings.
 */
import { z } from 'zod'
import { Scissors, Image as ImageIcon, Music, Grid3x3 } from 'lucide-react'
import { extractFrame, extractAudio, clipVideo, generateSpritesheet } from '@/server/modules/media/transform'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

type MediaEnv = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MEDIA?: any
  FILES?: R2Bucket
}

function getEnv(ctx: AgentContext): MediaEnv {
  return ctx.env as unknown as MediaEnv
}

const available = (ctx: AgentContext) => {
  const env = getEnv(ctx)
  return !!(env.MEDIA && env.FILES)
}

const VideoClipOutput = z.union([
  z.object({
    sourcePath: z.string(),
    outputPath: z.string(),
    sizeBytes: z.number(),
    duration: z.string(),
  }),
  z.object({ error: z.string() }),
])

export const videoClipDefinition: ToolDefinition<
  {
    sourcePath: string
    outputPath: string
    duration: string
    time?: string
    width?: number
    height?: number
    removeAudio?: boolean
  },
  z.infer<typeof VideoClipOutput>
> = {
  name: 'video_clip',
  description:
    'Clip a segment from a video file. Extracts a portion by start time and duration. Can also resize and optionally remove audio. Use when the user wants to trim or cut a video.',
  inputSchema: z.object({
    sourcePath: z.string().describe('Path to source video in the filesystem'),
    outputPath: z.string().describe('Path to save the clipped video'),
    time: z.string().optional().describe('Start time (e.g. "10s", "1m30s"). Default: "0s"'),
    duration: z.string().describe('Clip duration (e.g. "5s", "30s", "1m")'),
    width: z.number().optional().describe('Resize width'),
    height: z.number().optional().describe('Resize height'),
    removeAudio: z.boolean().optional().describe('Strip audio from output'),
  }),
  outputSchema: VideoClipOutput,
  isAvailable: available,
  execute: async ({ sourcePath, outputPath, ...opts }, ctx) => {
    const env = getEnv(ctx)
    try {
      const scopedSource = `users/${ctx.userId}/${sourcePath}`
      const scopedOutput = `users/${ctx.userId}/${outputPath}`
      const object = await env.FILES!.get(scopedSource)
      if (!object) return { error: `Video not found: ${sourcePath}` }
      const response = await clipVideo(env.MEDIA, await object.arrayBuffer(), {
        duration: opts.duration,
        time: opts.time,
        width: opts.width,
        height: opts.height,
        removeAudio: opts.removeAudio,
      })
      const resultBytes = await response.arrayBuffer()
      await env.FILES!.put(scopedOutput, resultBytes, { httpMetadata: { contentType: 'video/mp4' } })
      return { sourcePath, outputPath, sizeBytes: resultBytes.byteLength, duration: opts.duration }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Scissors, displayName: 'Clip Video' },
}

const VideoFrameOutput = z.union([
  z.object({
    sourcePath: z.string(),
    outputPath: z.string(),
    time: z.string(),
    sizeBytes: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const videoFrameDefinition: ToolDefinition<
  { sourcePath: string; outputPath: string; time?: string; width?: number; height?: number },
  z.infer<typeof VideoFrameOutput>
> = {
  name: 'video_frame',
  description:
    'Extract a still image frame from a video at a specific timestamp. Use when the user wants a screenshot/thumbnail from a video.',
  inputSchema: z.object({
    sourcePath: z.string().describe('Path to source video'),
    outputPath: z.string().describe('Path to save the extracted frame image'),
    time: z.string().optional().describe('Timestamp to extract (e.g. "3s", "1m20s"). Default: "0s"'),
    width: z.number().optional().describe('Frame width'),
    height: z.number().optional().describe('Frame height'),
  }),
  outputSchema: VideoFrameOutput,
  isAvailable: available,
  execute: async ({ sourcePath, outputPath, time, width, height }, ctx) => {
    const env = getEnv(ctx)
    try {
      const scopedSource = `users/${ctx.userId}/${sourcePath}`
      const scopedOutput = `users/${ctx.userId}/${outputPath}`
      const object = await env.FILES!.get(scopedSource)
      if (!object) return { error: `Video not found: ${sourcePath}` }
      const response = await extractFrame(env.MEDIA, await object.arrayBuffer(), { time, width, height })
      const resultBytes = await response.arrayBuffer()
      await env.FILES!.put(scopedOutput, resultBytes, { httpMetadata: { contentType: 'image/jpeg' } })
      return { sourcePath, outputPath, time: time || '0s', sizeBytes: resultBytes.byteLength }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: ImageIcon, displayName: 'Extract Frame' },
}

const VideoAudioOutput = z.union([
  z.object({
    sourcePath: z.string(),
    outputPath: z.string(),
    sizeBytes: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const videoAudioDefinition: ToolDefinition<
  { sourcePath: string; outputPath: string },
  z.infer<typeof VideoAudioOutput>
> = {
  name: 'video_audio',
  description: 'Extract the audio track from a video as M4A. Use when the user wants just the audio from a video file.',
  inputSchema: z.object({
    sourcePath: z.string().describe('Path to source video'),
    outputPath: z.string().describe('Path to save the extracted audio (M4A)'),
  }),
  outputSchema: VideoAudioOutput,
  isAvailable: available,
  execute: async ({ sourcePath, outputPath }, ctx) => {
    const env = getEnv(ctx)
    try {
      const scopedSource = `users/${ctx.userId}/${sourcePath}`
      const scopedOutput = `users/${ctx.userId}/${outputPath}`
      const object = await env.FILES!.get(scopedSource)
      if (!object) return { error: `Video not found: ${sourcePath}` }
      const response = await extractAudio(env.MEDIA, await object.arrayBuffer())
      const resultBytes = await response.arrayBuffer()
      await env.FILES!.put(scopedOutput, resultBytes, { httpMetadata: { contentType: 'audio/mp4' } })
      return { sourcePath, outputPath, sizeBytes: resultBytes.byteLength }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Music, displayName: 'Extract Audio' },
}

const VideoSpritesheetOutput = z.union([
  z.object({
    sourcePath: z.string(),
    outputPath: z.string(),
    sizeBytes: z.number(),
  }),
  z.object({ error: z.string() }),
])

export const videoSpritesheetDefinition: ToolDefinition<
  { sourcePath: string; outputPath: string; width?: number; height?: number },
  z.infer<typeof VideoSpritesheetOutput>
> = {
  name: 'video_spritesheet',
  description:
    'Generate a spritesheet (grid of frames) from a video for seek preview. Use when the user needs a visual timeline overview of a video.',
  inputSchema: z.object({
    sourcePath: z.string().describe('Path to source video'),
    outputPath: z.string().describe('Path to save the spritesheet image'),
    width: z.number().optional().describe('Frame width in spritesheet (default: 160)'),
    height: z.number().optional().describe('Frame height in spritesheet (default: 90)'),
  }),
  outputSchema: VideoSpritesheetOutput,
  isAvailable: available,
  execute: async ({ sourcePath, outputPath, width, height }, ctx) => {
    const env = getEnv(ctx)
    try {
      const scopedSource = `users/${ctx.userId}/${sourcePath}`
      const scopedOutput = `users/${ctx.userId}/${outputPath}`
      const object = await env.FILES!.get(scopedSource)
      if (!object) return { error: `Video not found: ${sourcePath}` }
      const response = await generateSpritesheet(env.MEDIA, await object.arrayBuffer(), {
        width: width || 160,
        height: height || 90,
      })
      const resultBytes = await response.arrayBuffer()
      await env.FILES!.put(scopedOutput, resultBytes, { httpMetadata: { contentType: 'image/jpeg' } })
      return { sourcePath, outputPath, sizeBytes: resultBytes.byteLength }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Grid3x3, displayName: 'Video Spritesheet' },
}

export const mediaDefinitions = [
  videoClipDefinition,
  videoFrameDefinition,
  videoAudioDefinition,
  videoSpritesheetDefinition,
] as ToolDefinition<unknown, unknown>[]
