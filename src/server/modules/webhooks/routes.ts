/**
 * Webhook Receiver Routes
 *
 * Generic webhook handler with HMAC signature verification.
 * Demonstrates the pattern for receiving webhooks from external services
 * (Stripe, GitHub, ElevenLabs, Google Chat, etc.).
 *
 * Usage:
 *   POST /api/webhooks/:provider - Receive webhook from a provider
 *
 * Security:
 *   - HMAC-SHA256 signature verification per provider
 *   - Provider-specific secret from environment
 *   - Raw body preserved for signature validation
 *
 * @example Adding a new provider:
 *   1. Add verification logic to verifySignature()
 *   2. Add handler to processWebhook()
 *   3. Set WEBHOOK_SECRET_<PROVIDER> in wrangler secrets
 */
import { Hono } from 'hono'
import type { Env } from '@/server/index'

type WebhookEnv = { Bindings: Env }

const app = new Hono<WebhookEnv>()

/**
 * Verify webhook signature using HMAC-SHA256
 *
 * Each provider has its own signature format:
 * - Stripe: `Stripe-Signature` header with `t=timestamp,v1=signature`
 * - GitHub: `X-Hub-Signature-256` header with `sha256=signature`
 * - Generic: `X-Webhook-Signature` header with raw HMAC
 */
async function verifySignature(
  provider: string,
  body: string,
  headers: Headers,
  env: Env
): Promise<boolean> {
  // Look up provider-specific secret
  const secretKey = `WEBHOOK_SECRET_${provider.toUpperCase()}` as keyof Env
  const secret = env[secretKey] as string | undefined

  // No secret configured = reject. Set WEBHOOK_SECRET_<PROVIDER> as a wrangler secret.
  if (!secret) {
    console.error(`No webhook secret for provider "${provider}" — rejecting unverified payload`)
    return false
  }

  const signature = headers.get('x-webhook-signature')
    || headers.get('x-hub-signature-256')?.replace('sha256=', '')
    || headers.get('stripe-signature')

  if (!signature) return false

  // HMAC-SHA256 verification
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return expected === signature
}

/**
 * Process webhook payload — add your provider-specific logic here
 */
async function processWebhook(
  provider: string,
  _payload: unknown,
  _env: Env
): Promise<{ processed: boolean; message?: string }> {
  console.log(JSON.stringify({
    event: 'webhook_received',
    provider,
    timestamp: new Date().toISOString(),
  }))

  // Add provider-specific handlers:
  // switch (provider) {
  //   case 'stripe':
  //     return handleStripeWebhook(payload, env)
  //   case 'github':
  //     return handleGitHubWebhook(payload, env)
  //   default:
  //     return { processed: false, message: `Unknown provider: ${provider}` }
  // }

  return { processed: true, message: `Webhook from ${provider} received` }
}

/**
 * POST /api/webhooks/:provider - Receive webhook
 *
 * No auth middleware — webhooks come from external services.
 * Signature verification provides security instead.
 */
app.post('/:provider', async (c) => {
  const provider = c.req.param('provider')
  const body = await c.req.text()

  // Verify signature
  const valid = await verifySignature(provider, body, c.req.raw.headers, c.env)
  if (!valid) {
    console.error(JSON.stringify({ event: 'webhook_signature_invalid', provider }))
    return c.json({ error: 'Invalid signature' }, 401)
  }

  // Parse and process
  try {
    const payload = JSON.parse(body) as unknown
    const result = await processWebhook(provider, payload, c.env)
    return c.json(result)
  } catch (error) {
    console.error(JSON.stringify({
      event: 'webhook_error',
      provider,
      error: error instanceof Error ? error.message : String(error),
    }))
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

export default app
