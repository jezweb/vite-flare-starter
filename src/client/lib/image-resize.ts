/**
 * Client-side image resize utility
 * Resizes images in the browser before upload to reduce bandwidth and storage
 */

export type ResizeOptions = {
  /** Maximum width in pixels */
  maxWidth?: number
  /** Maximum height in pixels */
  maxHeight?: number
  /** JPEG quality (0-1), default 0.9 */
  quality?: number
  /** Output MIME type, default 'image/jpeg' */
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
}

export type ResizeResult = {
  /** Resized image as Blob */
  blob: Blob
  /** Original dimensions */
  original: { width: number; height: number }
  /** New dimensions after resize */
  resized: { width: number; height: number }
  /** Size reduction percentage */
  reduction: number
}

/**
 * Calculate new dimensions while maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth
  let height = originalHeight

  // Scale down if needed
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width)
    width = maxWidth
  }

  if (height > maxHeight) {
    width = Math.round((width * maxHeight) / height)
    height = maxHeight
  }

  return { width, height }
}

/**
 * Resize an image file in the browser
 * @param file - Image file to resize
 * @param options - Resize options
 * @returns Promise resolving to ResizeResult
 */
export async function resizeImage(
  file: File,
  options: ResizeOptions = {}
): Promise<ResizeResult> {
  const {
    maxWidth = 512,
    maxHeight = 512,
    quality = 0.9,
    mimeType = 'image/jpeg',
  } = options

  // Validate file is an image
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image')
  }

  // Load image
  const img = await loadImage(file)

  // Calculate new dimensions
  const original = { width: img.width, height: img.height }
  const resized = calculateDimensions(img.width, img.height, maxWidth, maxHeight)

  // If image is already smaller than max dimensions, optionally skip resize
  const needsResize = original.width > maxWidth || original.height > maxHeight

  if (!needsResize && file.type === mimeType) {
    // Image is already small enough and correct format - return as-is
    return {
      blob: file,
      original,
      resized: original,
      reduction: 0,
    }
  }

  // Create canvas and draw resized image
  const canvas = document.createElement('canvas')
  canvas.width = resized.width
  canvas.height = resized.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // Use better quality settings for resize
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Draw image at new size
  ctx.drawImage(img, 0, 0, resized.width, resized.height)

  // Convert canvas to Blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result)
        } else {
          reject(new Error('Failed to convert canvas to blob'))
        }
      },
      mimeType,
      quality
    )
  })

  // Calculate size reduction
  const reduction = Math.round(((file.size - blob.size) / file.size) * 100)

  return {
    blob,
    original,
    resized,
    reduction,
  }
}

/**
 * Load an image file into an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(img.src) // Clean up
      resolve(img)
    }

    img.onerror = () => {
      URL.revokeObjectURL(img.src) // Clean up
      reject(new Error('Failed to load image'))
    }

    img.src = URL.createObjectURL(file)
  })
}

/**
 * Validate file size before upload
 * @param file - File to validate
 * @param maxSizeInMB - Maximum size in megabytes
 * @returns true if valid, throws error if too large
 */
export function validateFileSize(file: File, maxSizeInMB: number = 5): boolean {
  const maxBytes = maxSizeInMB * 1024 * 1024

  if (file.size > maxBytes) {
    throw new Error(
      `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum of ${maxSizeInMB}MB`
    )
  }

  return true
}

/**
 * Validate file type is an image
 * @param file - File to validate
 * @param allowedTypes - Array of allowed MIME types
 * @returns true if valid, throws error if invalid type
 */
export function validateFileType(
  file: File,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
): boolean {
  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      `File type ${file.type} not allowed. Allowed types: ${allowedTypes.join(', ')}`
    )
  }

  return true
}

/**
 * Complete validation and resize pipeline
 * @param file - Image file to process
 * @param options - Resize options with validation
 * @returns Promise resolving to ResizeResult
 */
export async function validateAndResize(
  file: File,
  options: ResizeOptions & { maxSizeInMB?: number } = {}
): Promise<ResizeResult> {
  const { maxSizeInMB = 5, ...resizeOptions } = options

  // Validate file
  validateFileType(file)
  validateFileSize(file, maxSizeInMB)

  // Resize image
  return resizeImage(file, resizeOptions)
}
