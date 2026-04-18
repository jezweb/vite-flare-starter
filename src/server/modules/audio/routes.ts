/**
 * Audio utilities — standalone transcription endpoint.
 *
 * Accepts multipart form data with an `audio` field (WAV/MP3/webm/OGG) and
 * returns `{ text: string }`. Used by the screen-capture feature to turn
 * recorded narration into an editable prompt prefix before sending.
 *
 * Runs on Workers AI via the `@cf/deepgram/nova-3` model so there's no
 * external API key needed. Nova 3 auto-detects language and returns a
 * consolidated transcript in the response's top-level `text` field (falls
 * back to the channel-alternative path on older responses).
 */
import { Hono } from 'hono'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.post('/transcribe', async (c) => {
  const form = await c.req.formData()
  const file = form.get('audio')
  if (!(file instanceof Blob)) {
    return c.json({ error: 'missing audio field' }, 400)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = file.type || 'audio/wav'
  // Nova 3 wants multipart input (see chat/routes.ts for the rationale —
  // raw Uint8Array / data URL paths return `5006: required properties at
  // '/audio' are 'body,contentType'`).
  const upstreamForm = new FormData()
  upstreamForm.append('audio', new Blob([bytes], { type: mime }), 'audio')
  const formResp = new Response(upstreamForm)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await (c.env.AI as any).run('@cf/deepgram/nova-3', {
      audio: {
        body: formResp.body,
        contentType: formResp.headers.get('content-type'),
      },
    })
    const text = (
      result?.text ||
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      ''
    ).trim()
    return c.json({ text })
  } catch (err) {
    console.error(JSON.stringify({ event: 'audio_transcribe_failed', error: String(err) }))
    return c.json({ error: 'transcription failed' }, 500)
  }
})

export default app
