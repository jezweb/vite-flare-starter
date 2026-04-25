/**
 * Webhook receiver — generic external event ingestion for autonomous agents
 *
 * Routes:
 *   POST /api/webhooks/agent/:class/:slug
 *     Body: arbitrary JSON.
 *     Headers (one of):
 *       - `X-Webhook-Signature: sha256=<hex>` — HMAC-SHA256 of body
 *         with the agent's webhook secret. Standard pattern (GitHub,
 *         Slack, Stripe, Shopify).
 *       - `X-Webhook-Secret: <secret>` — plain shared secret. Use
 *         only for closed integrations behind TLS where rotation is
 *         easy.
 *
 *   The route looks up the agent by `${class}:${slug}` (note: NOT
 *   userId-prefixed — webhook senders don't know the user id; the
 *   slug is the addressable piece). Verifies the signature against
 *   the agent's stored webhook secret, then calls
 *   `agent.handleWebhook(payload, headers)`.
 *
 *   Returns 200 immediately on success (most webhook senders retry
 *   on non-2xx; long agent runs would cause duplicate fires).
 *
 * Auth model:
 *   The signature IS the auth — no session cookie. This endpoint is
 *   intentionally public-internet-facing. Anyone with the URL +
 *   secret can fire the agent.
 *
 * To get an agent's webhook URL:
 *   GET /api/webhooks/agent/:class/:slug/info
 *     Returns the URL + secret for the authenticated user's agent.
 *     This route IS auth-gated. The owner copies the URL+secret into
 *     the external sender's webhook config.
 */
import { Hono } from 'hono'
import { getAgentByName } from 'agents'
import type { AutonomousAgent } from '@/server/lib/agents/autonomous-agent'
import { verifyHmacSha256, verifySharedSecret } from '@/server/lib/agents/webhook-verify'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'

interface WebhookEnv {
  // Agent bindings are dynamic — looked up by string.
  [key: string]: unknown
}

const app = new Hono<AuthContext>()

const SLUG_RE = /^[a-zA-Z0-9_-]+$/

// ─── Public webhook receiver ──────────────────────────────────────
// NOT auth-gated — signature IS the auth. Mounted before the auth
// middleware below.

app.post('/agent/:agentClass/:slug', async (c) => {
  const agentClass = c.req.param('agentClass')
  const slug = c.req.param('slug')
  if (!SLUG_RE.test(agentClass) || !SLUG_RE.test(slug)) {
    return c.json({ error: 'Invalid path' }, 400)
  }
  const env = c.env as unknown as WebhookEnv
  const binding = env[agentClass] as DurableObjectNamespace | undefined
  if (!binding) return c.json({ error: `Unknown agent class: ${agentClass}` }, 404)

  // Read raw body BEFORE Hono parses it — HMAC must verify the
  // exact bytes the sender signed. Cloning the request lets us read
  // the body once for the signature, then again for handleWebhook.
  const body = await c.req.text()

  // Resolve the agent stub. The slug here is NOT userId-prefixed
  // because webhook senders don't know the user id — they just
  // know the URL the user gave them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = (await getAgentByName(binding as any, slug)) as unknown as AutonomousAgent
  const expectedSecret = await agent.getWebhookSecret()

  // Try HMAC first (preferred), fall back to plain shared secret.
  const sigHeader = c.req.header('x-webhook-signature') || c.req.header('X-Webhook-Signature')
  const plainHeader = c.req.header('x-webhook-secret') || c.req.header('X-Webhook-Secret')

  let verified = false
  if (sigHeader) {
    verified = await verifyHmacSha256(expectedSecret, body, sigHeader)
  } else if (plainHeader) {
    verified = verifySharedSecret(expectedSecret, plainHeader)
  }
  if (!verified) {
    // Don't leak which check failed or what the expected value is.
    return c.json({ error: 'Signature verification failed' }, 401)
  }

  // Parse the body now that the signature passed. Webhook payloads
  // are conventionally JSON; if they're not, the agent gets the raw
  // string and decides what to do.
  let payload: unknown = body
  try {
    payload = JSON.parse(body)
  } catch {
    /* keep as string */
  }

  // Collect headers as a plain object so the agent can introspect
  // sender-specific fields (X-GitHub-Event, X-Slack-Signature, etc).
  const headers: Record<string, string> = {}
  c.req.raw.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v
  })

  // Fire the agent. We intentionally await the result here — for
  // long-running webhooks consider returning 202 immediately + using
  // ctx.waitUntil to invoke the agent in the background. For most
  // webhook payloads the agent runs in <2s.
  try {
    const result = await agent.handleWebhook(payload, headers)
    return c.json({ success: true, result })
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'webhook_handler_failed',
        agentClass,
        slug,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    return c.json({ success: false, error: 'Handler failed' }, 500)
  }
})

// ─── Authenticated info endpoint ──────────────────────────────────
// Returns the webhook URL + secret to the agent's owner. This is
// what the user copies into the external sender's config.

const authedApp = new Hono<AuthContext>()
authedApp.use('*', authMiddleware)

authedApp.get('/agent/:agentClass/:slug/info', async (c) => {
  const agentClass = c.req.param('agentClass')
  const slug = c.req.param('slug')
  if (!SLUG_RE.test(agentClass) || !SLUG_RE.test(slug)) {
    return c.json({ error: 'Invalid path' }, 400)
  }
  const userId = c.get('userId')
  const env = c.env as unknown as WebhookEnv
  const binding = env[agentClass] as DurableObjectNamespace | undefined
  if (!binding) return c.json({ error: `Unknown agent class: ${agentClass}` }, 404)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = (await getAgentByName(binding as any, slug)) as unknown as AutonomousAgent
  await agent.setOwner(userId, slug)
  const secret = await agent.getWebhookSecret()
  // Reconstruct the public URL from the inbound request — works in
  // dev (localhost) and prod (workers.dev or custom domain).
  const requestUrl = new URL(c.req.url)
  const url = `${requestUrl.origin}/api/webhooks/agent/${agentClass}/${slug}`
  return c.json({
    url,
    secret,
    /** HMAC pattern (preferred): set X-Webhook-Signature: sha256=<hex>
     *  where hex is HMAC-SHA256(body, secret). */
    headerHmac: 'X-Webhook-Signature: sha256=<HMAC_SHA256(body, secret)>',
    /** Plain pattern: set X-Webhook-Secret: <secret>. Closed integrations only. */
    headerPlain: 'X-Webhook-Secret: <secret>',
  })
})

authedApp.post('/agent/:agentClass/:slug/rotate', async (c) => {
  const agentClass = c.req.param('agentClass')
  const slug = c.req.param('slug')
  if (!SLUG_RE.test(agentClass) || !SLUG_RE.test(slug)) {
    return c.json({ error: 'Invalid path' }, 400)
  }
  const userId = c.get('userId')
  const env = c.env as unknown as WebhookEnv
  const binding = env[agentClass] as DurableObjectNamespace | undefined
  if (!binding) return c.json({ error: `Unknown agent class: ${agentClass}` }, 404)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = (await getAgentByName(binding as any, slug)) as unknown as AutonomousAgent
  await agent.setOwner(userId, slug)
  const result = await agent.regenerateWebhookSecret()
  return c.json({ success: true, secret: result.secret })
})

// Mount the authed sub-app under the same root so /info and /rotate
// are reachable at /api/webhooks/agent/:class/:slug/info etc.
app.route('/', authedApp)

export default app
