/**
 * Chunked Uint8Array → base64. `btoa(String.fromCharCode(...bytes))` throws
 * "Maximum call stack size exceeded" once the array passes ~64k bytes (the
 * spread exceeds V8's argument limit), so large images / PDFs / screenshots
 * crash the Worker. Encode in 32k chunks instead. Single source of truth.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
