/**
 * Workers AI response coercion
 *
 * Workers AI returns responses in three different shapes depending on
 * the model:
 *
 *   1. Classic vision/text models: `{ response: "..." }`
 *   2. OpenAI-compat chat models (Llama 4, Gemma 4, Mistral, Kimi):
 *      `{ choices: [{ message: { content: "..." } }] }` OR
 *      `{ choices: [{ message: { content: [{ type: "text", text: "..." }] } }] }`
 *   3. Reasoning-mode Kimi K2.6 with tight max_tokens: content is
 *      null and the answer lives in `message.reasoning_content`
 *
 * Calling `.trim()` / `.slice()` directly on `result.choices[0]
 * .message.content` works for some models and crashes for others.
 * The TypeScript types tell you `string`; runtime can deliver an
 * array of content parts; the discrepancy isn't caught until prod.
 *
 * `coerceToString` handles all three shapes plus an end-of-line JSON
 * fallback so downstream parsers always have something to work with.
 *
 * See `~/.claude/rules/workers-ai-content-coercion.md` for the
 * full pattern + the discovery story.
 */

/**
 * Coerce any Workers AI / OpenAI-compat response shape into a single
 * string. Always returns a string — never null/undefined — so the
 * caller can chain `.trim()` etc safely.
 */
export function coerceToString(result: unknown): string {
  if (typeof result === 'string') return result
  if (result == null) return ''
  if (typeof result !== 'object') return String(result)

  const r = result as Record<string, unknown>

  // Shape 1 — classic { response: string }
  if (typeof r['response'] === 'string') return r['response']

  // Shape 2 — OpenAI-compat { choices: [...] }
  const choices = r['choices']
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = (choices[0] as Record<string, unknown>)?.['message']
    if (msg && typeof msg === 'object') {
      const m = msg as Record<string, unknown>
      const content = m['content']
      if (typeof content === 'string') return content
      // 2b — content as array of typed parts (newer OpenAI v2 shape).
      if (Array.isArray(content)) {
        const parts = content
          .map((p) => {
            if (!p || typeof p !== 'object') return ''
            const pp = p as Record<string, unknown>
            return typeof pp['text'] === 'string' ? (pp['text'] as string) : ''
          })
          .filter(Boolean)
        if (parts.length) return parts.join('\n')
      }
      // Shape 3 — Kimi K2.6 reasoning mode: content is null, the
      // answer lives in reasoning_content (or older `reasoning`).
      if (typeof m['reasoning_content'] === 'string') return m['reasoning_content']
      if (typeof m['reasoning'] === 'string') return m['reasoning']
    }
  }

  // Last resort — stringify so a downstream JSON.parse at least has
  // something to attempt + report a clear error on, rather than
  // exploding with `TypeError: result.trim is not a function`.
  return JSON.stringify(result)
}
