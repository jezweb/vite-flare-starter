/**
 * Image Transform — Cloudflare Images binding wrapper
 *
 * Provides a fluent API for all Cloudflare Images operations:
 * resize, crop, format conversion, background removal, face crop,
 * blur, sharpen, brightness, contrast, saturation, rotate, flip,
 * watermark/overlay, border, and metadata extraction.
 *
 * @example
 * import { transformImage } from '@/server/modules/images/transform'
 *
 * // Resize + convert to WebP
 * const result = await transformImage(env.IMAGES, imageBytes, {
 *   width: 800, fit: 'cover', format: 'webp', quality: 80,
 * })
 *
 * // Background removal
 * const result = await transformImage(env.IMAGES, imageBytes, {
 *   segment: 'foreground', format: 'png',
 * })
 *
 * // Face-aware thumbnail
 * const result = await transformImage(env.IMAGES, imageBytes, {
 *   width: 200, height: 200, fit: 'cover', gravity: 'face', format: 'webp',
 * })
 */

export interface TransformOptions {
  // Sizing
  width?: number | 'auto'
  height?: number
  dpr?: number
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad' | 'squeeze'

  // Cropping
  gravity?: 'auto' | 'face' | 'left' | 'right' | 'top' | 'bottom' | { x: number; y: number }
  trim?: { top?: number; right?: number; bottom?: number; left?: number } | 'border'
  zoom?: number

  // Orientation
  rotate?: 90 | 180 | 270
  flip?: 'h' | 'v' | 'hv'

  // Visual effects
  blur?: number       // 1-250
  sharpen?: number    // 0-10
  brightness?: number // 1.0 = unchanged
  contrast?: number   // 1.0 = unchanged
  gamma?: number      // 0.5 darkens, 2.0 lightens
  saturation?: number // 0 = grayscale, 1.0 = unchanged

  // AI features
  segment?: 'foreground'

  // Output
  format?: 'auto' | 'avif' | 'webp' | 'jpeg' | 'png' | 'baseline-jpeg' | 'json'
  quality?: number | 'high' | 'medium-high' | 'medium-low' | 'low'
  compression?: 'fast'
  background?: string  // CSS4 colour
  border?: { color: string; width: number } | { color: string; top?: number; right?: number; bottom?: number; left?: number }
  metadata?: 'copyright' | 'keep' | 'none'
  anim?: boolean
}

export interface TransformResult {
  image: ReadableStream
  contentType: string
}

export interface ImageInfo {
  format: string
  fileSize: number
  width: number
  height: number
}

// Cloudflare Images binding type
interface ImagesBinding {
  input(stream: ReadableStream): ImagePipeline
}

interface ImagePipeline {
  transform(options: Record<string, unknown>): ImagePipeline
  draw(overlay: ImagePipeline, options?: Record<string, unknown>): ImagePipeline
  output(options: { format: string; quality?: number; anim?: boolean }): { response(): Promise<Response> }
  info(): Promise<ImageInfo>
}

/**
 * Transform an image using the Cloudflare Images binding.
 * Returns the transformed image as a Response (stream + content type).
 */
export async function transformImage(
  images: ImagesBinding,
  imageData: ArrayBuffer | Uint8Array | ReadableStream,
  options: TransformOptions,
): Promise<Response> {
  // Create input stream
  const stream = imageData instanceof ReadableStream
    ? imageData
    : new ReadableStream({
        start(controller) {
          controller.enqueue(imageData instanceof Uint8Array ? imageData : new Uint8Array(imageData))
          controller.close()
        },
      })

  // Build transform options (only include set values)
  const transformOpts: Record<string, unknown> = {}
  if (options.width !== undefined) transformOpts['width'] = options.width
  if (options.height !== undefined) transformOpts['height'] = options.height
  if (options.dpr !== undefined) transformOpts['dpr'] = options.dpr
  if (options.fit) transformOpts['fit'] = options.fit
  if (options.gravity) transformOpts['gravity'] = options.gravity
  if (options.trim) transformOpts['trim'] = options.trim
  if (options.zoom !== undefined) transformOpts['zoom'] = options.zoom
  if (options.rotate) transformOpts['rotate'] = options.rotate
  if (options.flip) transformOpts['flip'] = options.flip
  if (options.blur !== undefined) transformOpts['blur'] = options.blur
  if (options.sharpen !== undefined) transformOpts['sharpen'] = options.sharpen
  if (options.brightness !== undefined) transformOpts['brightness'] = options.brightness
  if (options.contrast !== undefined) transformOpts['contrast'] = options.contrast
  if (options.gamma !== undefined) transformOpts['gamma'] = options.gamma
  if (options.saturation !== undefined) transformOpts['saturation'] = options.saturation
  if (options.segment) transformOpts['segment'] = options.segment
  if (options.background) transformOpts['background'] = options.background
  if (options.border) transformOpts['border'] = options.border
  if (options.metadata) transformOpts['metadata'] = options.metadata

  // Build pipeline
  let pipeline = images.input(stream)

  if (Object.keys(transformOpts).length > 0) {
    pipeline = pipeline.transform(transformOpts)
  }

  // Output
  const format = options.format === 'auto' ? 'image/webp' : `image/${options.format || 'webp'}`
  const outputOpts: { format: string; quality?: number; anim?: boolean } = { format }
  if (typeof options.quality === 'number') outputOpts['quality'] = options.quality
  if (options.anim !== undefined) outputOpts['anim'] = options.anim

  return pipeline.output(outputOpts).response()
}

/**
 * Get image metadata without transforming.
 */
export async function getImageInfo(images: ImagesBinding, imageData: ArrayBuffer | Uint8Array | ReadableStream): Promise<ImageInfo> {
  const stream = imageData instanceof ReadableStream
    ? imageData
    : new ReadableStream({
        start(controller) {
          controller.enqueue(imageData instanceof Uint8Array ? imageData : new Uint8Array(imageData))
          controller.close()
        },
      })

  return images.input(stream).info()
}

/**
 * Overlay/watermark one image onto another.
 */
export async function overlayImage(
  images: ImagesBinding,
  baseImage: ArrayBuffer | Uint8Array | ReadableStream,
  overlayImageData: ArrayBuffer | Uint8Array | ReadableStream,
  position: { top?: number; left?: number; bottom?: number; right?: number; opacity?: number; repeat?: boolean },
  outputOptions: { format?: string; quality?: number } = {},
): Promise<Response> {
  const toStream = (data: ArrayBuffer | Uint8Array | ReadableStream) =>
    data instanceof ReadableStream
      ? data
      : new ReadableStream({
          start(controller) {
            controller.enqueue(data instanceof Uint8Array ? data : new Uint8Array(data))
            controller.close()
          },
        })

  const base = images.input(toStream(baseImage))
  const overlay = images.input(toStream(overlayImageData))

  const format = `image/${outputOptions.format || 'webp'}`
  return base
    .draw(overlay, position)
    .output({ format, quality: outputOptions.quality })
    .response()
}
