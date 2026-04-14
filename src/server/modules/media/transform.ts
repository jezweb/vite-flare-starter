/**
 * Media Transform — Cloudflare Media Transformations binding wrapper
 *
 * Provides video processing at the edge: resize, clip, frame extraction,
 * spritesheet generation, audio extraction/removal.
 *
 * @example
 * import { transformVideo, extractFrame, extractAudio } from '@/server/modules/media/transform'
 *
 * // Resize + clip first 5 seconds
 * const result = await transformVideo(env.MEDIA, videoBytes, {
 *   width: 480, height: 270, duration: '5s',
 * })
 *
 * // Extract frame at 3 seconds
 * const frame = await extractFrame(env.MEDIA, videoBytes, { time: '3s', width: 800 })
 *
 * // Extract audio as M4A
 * const audio = await extractAudio(env.MEDIA, videoBytes)
 */

export interface VideoTransformOptions {
  width?: number
  height?: number
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop'
}

export interface VideoOutputOptions {
  /** Output mode */
  mode?: 'video' | 'frame' | 'spritesheet' | 'audio'
  /** Clip duration (e.g. '5s', '10s') */
  duration?: string
  /** Start time for clip or frame (e.g. '3s', '1m30s') */
  time?: string
  /** Include audio in video output */
  audio?: boolean
}

// Cloudflare Media binding type
interface MediaBinding {
  input(stream: ReadableStream): MediaPipeline
}

interface MediaPipeline {
  transform(options: Record<string, unknown>): MediaPipeline
  output(options: Record<string, unknown>): { response(): Promise<Response> }
}

function toStream(data: ArrayBuffer | Uint8Array | ReadableStream): ReadableStream {
  if (data instanceof ReadableStream) return data
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data instanceof Uint8Array ? data : new Uint8Array(data))
      controller.close()
    },
  })
}

/**
 * Transform a video: resize, crop, clip.
 */
export async function transformVideo(
  media: MediaBinding,
  videoData: ArrayBuffer | Uint8Array | ReadableStream,
  transform: VideoTransformOptions = {},
  output: VideoOutputOptions = {},
): Promise<Response> {
  let pipeline = media.input(toStream(videoData))

  const transformOpts: Record<string, unknown> = {}
  if (transform.width) transformOpts['width'] = transform.width
  if (transform.height) transformOpts['height'] = transform.height
  if (transform.fit) transformOpts['fit'] = transform.fit

  if (Object.keys(transformOpts).length > 0) {
    pipeline = pipeline.transform(transformOpts)
  }

  const outputOpts: Record<string, unknown> = {
    mode: output.mode || 'video',
  }
  if (output.duration) outputOpts['duration'] = output.duration
  if (output.time) outputOpts['time'] = output.time
  if (output.audio !== undefined) outputOpts['audio'] = output.audio

  return pipeline.output(outputOpts).response()
}

/**
 * Extract a still frame from a video at a specific timestamp.
 */
export async function extractFrame(
  media: MediaBinding,
  videoData: ArrayBuffer | Uint8Array | ReadableStream,
  options: { time?: string; width?: number; height?: number; fit?: VideoTransformOptions['fit'] } = {},
): Promise<Response> {
  return transformVideo(
    media,
    videoData,
    { width: options.width, height: options.height, fit: options.fit },
    { mode: 'frame', time: options.time || '0s' },
  )
}

/**
 * Generate a spritesheet (multiple frames) for video preview/seek.
 */
export async function generateSpritesheet(
  media: MediaBinding,
  videoData: ArrayBuffer | Uint8Array | ReadableStream,
  options: { width?: number; height?: number } = {},
): Promise<Response> {
  return transformVideo(
    media,
    videoData,
    { width: options.width, height: options.height },
    { mode: 'spritesheet' },
  )
}

/**
 * Extract audio track from a video as M4A.
 */
export async function extractAudio(
  media: MediaBinding,
  videoData: ArrayBuffer | Uint8Array | ReadableStream,
): Promise<Response> {
  return transformVideo(media, videoData, {}, { mode: 'audio' })
}

/**
 * Clip a video to a specific segment.
 */
export async function clipVideo(
  media: MediaBinding,
  videoData: ArrayBuffer | Uint8Array | ReadableStream,
  options: { time?: string; duration: string; width?: number; height?: number; removeAudio?: boolean },
): Promise<Response> {
  return transformVideo(
    media,
    videoData,
    { width: options.width, height: options.height },
    { mode: 'video', time: options.time, duration: options.duration, audio: options.removeAudio ? false : undefined },
  )
}
