/**
 * Media Tools — AI agent access to Cloudflare Media Transformations
 *
 * Lets the agent process videos stored in R2: resize, clip segments,
 * extract frames, extract audio, generate spritesheets.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { extractFrame, extractAudio, clipVideo, generateSpritesheet } from '@/server/modules/media/transform'

interface MediaContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  env: { MEDIA?: any; FILES?: R2Bucket }
  userId: string
}

export function buildMediaTools(ctx: MediaContext) {
  if (!ctx.env.MEDIA || !ctx.env.FILES) return {}

  return {
    video_clip: tool({
      description: 'Clip a segment from a video file. Extracts a portion by start time and duration. Can also resize and optionally remove audio. Use when the user wants to trim or cut a video.',
      inputSchema: z.object({
        sourcePath: z.string().describe('Path to source video in the filesystem'),
        outputPath: z.string().describe('Path to save the clipped video'),
        time: z.string().optional().describe('Start time (e.g. "10s", "1m30s"). Default: "0s"'),
        duration: z.string().describe('Clip duration (e.g. "5s", "30s", "1m")'),
        width: z.number().optional().describe('Resize width'),
        height: z.number().optional().describe('Resize height'),
        removeAudio: z.boolean().optional().describe('Strip audio from output'),
      }),
      execute: async ({ sourcePath, outputPath, ...opts }) => {
        try {
          const scopedSource = `users/${ctx.userId}/${sourcePath}`
          const scopedOutput = `users/${ctx.userId}/${outputPath}`

          const object = await ctx.env.FILES!.get(scopedSource)
          if (!object) return { error: `Video not found: ${sourcePath}` }

          const response = await clipVideo(ctx.env.MEDIA, await object.arrayBuffer(), {
            duration: opts.duration,
            time: opts.time,
            width: opts.width,
            height: opts.height,
            removeAudio: opts.removeAudio,
          })
          const resultBytes = await response.arrayBuffer()

          await ctx.env.FILES!.put(scopedOutput, resultBytes, {
            httpMetadata: { contentType: 'video/mp4' },
          })

          return { sourcePath, outputPath, sizeBytes: resultBytes.byteLength, duration: opts.duration }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    video_frame: tool({
      description: 'Extract a still image frame from a video at a specific timestamp. Use when the user wants a screenshot/thumbnail from a video.',
      inputSchema: z.object({
        sourcePath: z.string().describe('Path to source video'),
        outputPath: z.string().describe('Path to save the extracted frame image'),
        time: z.string().optional().describe('Timestamp to extract (e.g. "3s", "1m20s"). Default: "0s"'),
        width: z.number().optional().describe('Frame width'),
        height: z.number().optional().describe('Frame height'),
      }),
      execute: async ({ sourcePath, outputPath, time, width, height }) => {
        try {
          const scopedSource = `users/${ctx.userId}/${sourcePath}`
          const scopedOutput = `users/${ctx.userId}/${outputPath}`

          const object = await ctx.env.FILES!.get(scopedSource)
          if (!object) return { error: `Video not found: ${sourcePath}` }

          const response = await extractFrame(ctx.env.MEDIA, await object.arrayBuffer(), { time, width, height })
          const resultBytes = await response.arrayBuffer()

          await ctx.env.FILES!.put(scopedOutput, resultBytes, {
            httpMetadata: { contentType: 'image/jpeg' },
          })

          return { sourcePath, outputPath, time: time || '0s', sizeBytes: resultBytes.byteLength }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    video_audio: tool({
      description: 'Extract the audio track from a video as M4A. Use when the user wants just the audio from a video file.',
      inputSchema: z.object({
        sourcePath: z.string().describe('Path to source video'),
        outputPath: z.string().describe('Path to save the extracted audio (M4A)'),
      }),
      execute: async ({ sourcePath, outputPath }) => {
        try {
          const scopedSource = `users/${ctx.userId}/${sourcePath}`
          const scopedOutput = `users/${ctx.userId}/${outputPath}`

          const object = await ctx.env.FILES!.get(scopedSource)
          if (!object) return { error: `Video not found: ${sourcePath}` }

          const response = await extractAudio(ctx.env.MEDIA, await object.arrayBuffer())
          const resultBytes = await response.arrayBuffer()

          await ctx.env.FILES!.put(scopedOutput, resultBytes, {
            httpMetadata: { contentType: 'audio/mp4' },
          })

          return { sourcePath, outputPath, sizeBytes: resultBytes.byteLength }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    video_spritesheet: tool({
      description: 'Generate a spritesheet (grid of frames) from a video for seek preview. Use when the user needs a visual timeline overview of a video.',
      inputSchema: z.object({
        sourcePath: z.string().describe('Path to source video'),
        outputPath: z.string().describe('Path to save the spritesheet image'),
        width: z.number().optional().describe('Frame width in spritesheet (default: 160)'),
        height: z.number().optional().describe('Frame height in spritesheet (default: 90)'),
      }),
      execute: async ({ sourcePath, outputPath, width, height }) => {
        try {
          const scopedSource = `users/${ctx.userId}/${sourcePath}`
          const scopedOutput = `users/${ctx.userId}/${outputPath}`

          const object = await ctx.env.FILES!.get(scopedSource)
          if (!object) return { error: `Video not found: ${sourcePath}` }

          const response = await generateSpritesheet(ctx.env.MEDIA, await object.arrayBuffer(), {
            width: width || 160, height: height || 90,
          })
          const resultBytes = await response.arrayBuffer()

          await ctx.env.FILES!.put(scopedOutput, resultBytes, {
            httpMetadata: { contentType: 'image/jpeg' },
          })

          return { sourcePath, outputPath, sizeBytes: resultBytes.byteLength }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
