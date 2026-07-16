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

/**
 * base64 → Uint8Array (inverse of bytesToBase64). Used when pulling binary
 * files out of the Sandbox (`readFile(..., { encoding: 'base64' })`) for
 * storage in R2. Throws on malformed input — callers should try/catch.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
