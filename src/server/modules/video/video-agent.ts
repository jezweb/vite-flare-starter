/**
 * VideoInputExample — Durable Object agent that receives sampled video
 * frames from a browser, runs each frame through a vision model, and
 * broadcasts the caption back over the same WebSocket.
 *
 * # Why this is not just `@cloudflare/voice` for video
 *
 * Cloudflare has no `@cloudflare/video` package with a `withVideoInput(Agent)`
 * mixin (as of 2026-04-22). The layers that DO exist — Cloudflare Realtime
 * SFU, RealtimeKit, raw WebRTC — are lower-level than the voice SDK and
 * require WebRTC track handling. For most product use cases ("describe
 * what the user is showing", "OCR this menu", "transcribe this whiteboard")
 * a simple frames-over-WS pattern is enough AND works today without SFU.
 *
 * This scaffold takes the simple path:
 *   - Client captures from getUserMedia at ~1 frame per N seconds
 *   - Client encodes each frame as JPEG + sends via the `agents` SDK WS
 *   - Server DO receives each frame, calls the AI SDK's generateText with
 *     a vision-capable model, broadcasts the caption back
 *
 * For full-motion realtime (continuous 30fps vision, gaze tracking, object
 * tracking) you'd want Cloudflare Realtime SFU + raw video tracks. Swap
 * the transport layer, keep this DO's agent logic.
 *
 * See CLAUDE.md → "Pattern 10: Durable Object Agent" for the wiring
 * (this class follows the same 4-piece contract as the voice example).
 */
import { Agent, type Connection, type ConnectionContext, type WSMessage } from 'agents'
import { generateText } from 'ai'
import { resolveModel } from '@/server/lib/ai/providers'
import {
  consumeRateLimit,
  rateLimitErrorBody,
  rateLimitHeaders,
} from '@/server/middleware/rate-limit'

// Loosely typed Env — the agents base class expects Cloudflare.Env.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class VideoInputExample extends Agent<any> {
  /**
   * Default vision model — Gemma 4 26B is the current flagship Google
   * multimodal model on Workers AI (gemma-3-27b-it was retired by
   * Cloudflare 2026-05). Free tier. Override per-frame by including
   * `model` in the frame message. See `workers-ai-gotchas.md` for the
   * vision-API shape (chat-style multimodal, not classic image-to-text).
   */
  private defaultModel = '@cf/google/gemma-4-26b-a4b-it'

  async onConnect(conn: Connection, _ctx: ConnectionContext): Promise<void> {
    console.log(JSON.stringify({ event: 'video_ws_connect', sessionId: this.name }))
    conn.send(
      JSON.stringify({
        type: 'welcome',
        sessionId: this.name,
        note: 'Send frames as { type: "frame", image: "data:image/jpeg;base64,...", prompt?: "..." }',
      })
    )
  }

  /**
   * Called for every WS message from the client. Dispatches by `type`:
   *   - "frame": base64 JPEG + optional prompt → vision model → broadcast caption
   *   - "ping":  health check → echo back
   * All other types are ignored.
   */
  async onMessage(conn: Connection, message: WSMessage): Promise<void> {
    // WSMessage can be string | ArrayBuffer | etc — we only care about JSON strings.
    if (typeof message !== 'string') return
    let data: { type?: string; image?: string; prompt?: string; model?: string }
    try {
      data = JSON.parse(message)
    } catch {
      conn.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }))
      return
    }

    if (data.type === 'ping') {
      conn.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
      return
    }

    if (data.type !== 'frame') return

    // Rate-limit per OWNER, not per DO instance name. The instance name is
    // `<userId>:<sessionId>` (client picks sessionId), so keying on this.name
    // let a user cycle sessionIds for unlimited fresh buckets. Key on the
    // userId prefix instead.
    const ownerId = this.name.split(':')[0] || this.name
    const rateLimit = consumeRateLimit({
      key: 'CHAT',
      windowMs: 60 * 60 * 1000,
      identifier: ownerId,
      routeKey: 'WS:VideoInputExample:frame',
    })
    if (!rateLimit.allowed) {
      conn.send(
        JSON.stringify({
          type: 'error',
          ...rateLimitErrorBody(rateLimit),
          headers: rateLimitHeaders(rateLimit),
        })
      )
      return
    }

    if (!data.image || typeof data.image !== 'string') {
      conn.send(JSON.stringify({ type: 'error', message: 'frame requires image: data URL' }))
      return
    }

    // Model allowlist: this is a free-tier vision demo. A client-supplied
    // model was passed straight to resolveModel, which routes paid prefixes
    // (anthropic/, openrouter/, gpt-*) to the operator's keys — a credit-drain
    // vector over the WebSocket. Only allow Workers AI (@cf/ / @hf/) models;
    // anything else falls back to the default.
    const requested = typeof data.model === 'string' ? data.model : ''
    const safeModel =
      requested.startsWith('@cf/') || requested.startsWith('@hf/') ? requested : this.defaultModel
    const start = Date.now()
    try {
      const caption = await this.captionFrame(data.image, data.prompt, safeModel)
      this.broadcast(
        JSON.stringify({
          type: 'caption',
          text: caption,
          model: safeModel,
          durationMs: Date.now() - start,
          ts: Date.now(),
        })
      )
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'video_caption_error',
          sessionId: this.name,
          error: err instanceof Error ? err.message : String(err),
        })
      )
      conn.send(
        JSON.stringify({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      )
    }
  }

  /**
   * Run a vision model against a single frame. Uses the AI SDK's unified
   * generateText with a `file` content part — works across Workers AI,
   * OpenRouter, direct Anthropic/OpenAI, as long as the chosen model
   * supports vision. Default: Gemma 3 27B (Workers AI, free).
   */
  private async captionFrame(
    dataUrl: string,
    prompt: string | undefined,
    modelId: string
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = this.env as any
    const model = resolveModel(env, modelId)
    const userPrompt =
      prompt ??
      'Describe what you see in one short sentence. Note anything unusual, noteworthy, or changes from a typical scene.'

    // Extract mime from the data URL. Fall back to image/jpeg.
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/)
    const mimeType = mimeMatch?.[1] ?? 'image/jpeg'

    const { text } = await generateText({
      model,
      messages: [
        {
          role: 'user',
          // The AI SDK's `file` content part works for images across providers.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [
            { type: 'file', data: dataUrl, mimeType },
            { type: 'text', text: userPrompt },
          ] as any,
        },
      ],
      maxOutputTokens: 200,
    })
    return text.trim()
  }
}
