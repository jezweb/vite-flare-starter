/**
 * VoiceInputExample — minimal Durable Object agent that streams mic audio
 * in, transcribes with Workers AI Deepgram Nova 3, and broadcasts each
 * turn-detected utterance back to the WebSocket client.
 *
 * This is a REFERENCE IMPLEMENTATION for the `@cloudflare/voice` +
 * `agents` SDK pattern. Copy it, rename the class, replace `onTranscript`
 * with your own logic (persist, extract, run an LLM, fan out events, …).
 *
 * See CLAUDE.md → "Pattern 10: Durable Object Agent (voice / streaming WS)"
 * for the end-to-end wiring.
 */
import { Agent, type Connection, type ConnectionContext } from 'agents'
import { withVoiceInput, WorkersAINova3STT } from '@cloudflare/voice'

const InputAgent = withVoiceInput(Agent)

/**
 * The DO name becomes the session id (the last path segment in
 * `/agents/voice-input-example/{name}`). Use whatever makes sense for
 * your domain — session uuid, user id, room id.
 *
 * Env is loosely typed here because the agents base class expects
 * Cloudflare.Env rather than the starter's Env shape. `this.env.AI` is
 * always available because `ai` is bound at the Worker level.
 */
// biome-ignore lint/suspicious/noExplicitAny: binding types cross-compile
export class VoiceInputExample extends InputAgent<any> {
  transcriber = new WorkersAINova3STT(
    (this.env as unknown as { AI: Ai }).AI,
  )

  async onConnect(conn: Connection, _ctx: ConnectionContext): Promise<void> {
    // One WS per session. The DO is created/loaded on first connect and
    // persists while any connection is open (plus a short idle window).
    console.log(
      JSON.stringify({ event: 'voice_ws_connect', sessionId: this.name }),
    )
    conn.send(
      JSON.stringify({ type: 'welcome', sessionId: this.name }),
    )
  }

  /**
   * Fires once per turn-detected utterance. `text` is the finalised
   * transcript from Nova 3 (not the interim partials — those stream
   * direct to the client via `useVoiceInput().interimTranscript`).
   *
   * Replace this body with the real work: insert into D1, run an LLM
   * extraction pass, broadcast structured events, etc.
   */
  async onTranscript(text: string, _conn: Connection): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return
    console.log(
      JSON.stringify({
        event: 'voice_transcript',
        sessionId: this.name,
        text: trimmed,
      }),
    )
    // Broadcast to ALL connected clients of this DO. For a single-WS
    // session this is the same as conn.send; for multi-viewer sessions
    // everyone sees the transcript. Exclude ids via the 2nd arg to skip
    // specific connections.
    this.broadcast(
      JSON.stringify({ type: 'utterance', text: trimmed, ts: Date.now() }),
    )
  }

  async onCallEnd(_conn: Connection): Promise<void> {
    console.log(
      JSON.stringify({ event: 'voice_call_end', sessionId: this.name }),
    )
  }
}
