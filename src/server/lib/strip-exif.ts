/**
 * strip-exif — remove EXIF / XMP metadata from JPEG bytes before they hit R2.
 *
 * GPS coordinates in EXIF leak home addresses, client sites, and event
 * locations to anyone who downloads the image (or who exports it from a
 * Content piece). Stripping at upload time fixes the leak at source rather
 * than relying on per-piece export discipline.
 *
 * Strategy: walk the JPEG marker chain and skip APP1 / APP13 (EXIF, XMP,
 * Photoshop IPTC). Keep APP0 (JFIF) and APP2 (ICC colour profile — needed
 * for accurate colours on phone displays). Everything from SOS onwards is
 * compressed scan data; copy verbatim.
 *
 * Workers-native — no Pillow, no Cloudflare Images binding required. Pure
 * byte walking. Returns the input unchanged for non-JPEG inputs (we only
 * try when contentType is image/jpeg or the magic bytes match).
 */

// JPEG marker constants. APP0 (JFIF) and APP2 (ICC) are kept; we only act on
// the strippable ones below. Documented for readers who want to know which
// segments were considered.
const SOS = 0xffda // Start of Scan (compressed data follows)
const EOI = 0xffd9 // End of Image
const APP1 = 0xffe1 // EXIF, XMP — strippable
const APP13 = 0xffed // Photoshop IPTC — strippable

/**
 * Strip EXIF/XMP from a JPEG buffer. Returns a new Uint8Array.
 * If input isn't a valid JPEG, returns the input unchanged.
 */
export function stripJpegExif(input: Uint8Array): Uint8Array {
  if (input.length < 4) return input
  // Verify SOI marker
  if (input[0] !== 0xff || input[1] !== 0xd8) return input

  const out: number[] = [0xff, 0xd8] // copy SOI
  let pos = 2

  while (pos < input.length - 1) {
    if (input[pos] !== 0xff) {
      // Marker chain corrupted — bail and return original
      return input
    }
    // Skip 0xff fill bytes
    while (input[pos + 1] === 0xff && pos + 1 < input.length) pos++

    const marker = (input[pos]! << 8) | input[pos + 1]!

    // SOS — compressed data follows; copy from here to end verbatim
    if (marker === SOS) {
      for (let i = pos; i < input.length; i++) out.push(input[i]!)
      return new Uint8Array(out)
    }
    if (marker === EOI) {
      out.push(0xff, 0xd9)
      return new Uint8Array(out)
    }

    // Standalone markers (no length) — RST0-7 and a few others
    if (marker >= 0xffd0 && marker <= 0xffd7) {
      out.push(input[pos]!, input[pos + 1]!)
      pos += 2
      continue
    }

    // Marker with length: 2-byte big-endian length follows
    if (pos + 3 >= input.length) return input
    const segLen = (input[pos + 2]! << 8) | input[pos + 3]!
    if (segLen < 2 || pos + 2 + segLen > input.length) return input

    // Decide whether to keep or strip
    const isStrippable =
      marker === APP1 || // EXIF (incl GPS) or XMP
      marker === APP13 || // Photoshop IPTC
      // APP3-12, APP14-15 — assorted vendor metadata, safe to drop
      (marker >= 0xffe3 && marker <= 0xffec) ||
      (marker >= 0xffee && marker <= 0xffef)

    if (!isStrippable) {
      // Copy this segment whole
      for (let i = 0; i < 2 + segLen; i++) out.push(input[pos + i]!)
    }
    // Either way, advance past it
    pos += 2 + segLen
  }

  return new Uint8Array(out)
}

/**
 * Best-effort EXIF strip for any uploaded image. Currently handles JPEG only.
 * PNG and WebP are returned unchanged (they don't carry EXIF GPS by default
 * from phones). HEIC isn't handled at the Worker layer — most browsers
 * convert to JPEG on file pick.
 */
export function stripImageMetadata(buffer: ArrayBuffer, contentType: string): ArrayBuffer {
  const bytes = new Uint8Array(buffer)
  const isJpeg =
    contentType === 'image/jpeg' ||
    contentType === 'image/jpg' ||
    (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
  if (!isJpeg) return buffer
  const stripped = stripJpegExif(bytes)
  // ArrayBuffer view — return underlying buffer.
  return stripped.buffer.slice(
    stripped.byteOffset,
    stripped.byteOffset + stripped.byteLength,
  ) as ArrayBuffer
}
