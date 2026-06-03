/**
 * Credentials API — manage BYOK service keys
 *
 * Routes scoped to the authenticated user. Org-scoped credentials
 * managed via /api/credentials?owner=org (admin role required).
 *
 * Plain-text key values are NEVER returned by GET — only metadata
 * (provider, label, lastFour, status, dates). Once set, you can
 * rotate (PUT same provider/label) or revoke; you cannot read back.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import {
  listServiceCredentials,
  setServiceKey,
  revokeServiceKey,
  SUPPORTED_PROVIDERS,
  type CredentialEnv,
} from '@/server/lib/credentials'
import { getActiveOrg } from '@/server/modules/organizations/helpers'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const PROVIDER_RE = /^[a-z0-9_]+$/

const OwnerQuerySchema = z.object({
  owner: z.enum(['user', 'org']).optional(),
})

app.get('/providers', (c) => {
  return c.json({ providers: SUPPORTED_PROVIDERS })
})

app.get('/', zValidator('query', OwnerQuerySchema), async (c) => {
  const userId = c.get('userId')
  const ownerType = c.req.valid('query').owner ?? 'user'
  if (ownerType === 'org') {
    const org = await getActiveOrg(c)
    if (!org) return c.json({ error: 'No active organisation' }, 401)
    if (org.role !== 'owner' && org.role !== 'admin') {
      return c.json({ error: 'Org credentials require admin/owner role' }, 403)
    }
    const credentials = await listServiceCredentials(c.env as unknown as CredentialEnv, {
      organizationId: org.organizationId,
    })
    return c.json({ owner: 'org', organizationId: org.organizationId, credentials })
  }
  const credentials = await listServiceCredentials(c.env as unknown as CredentialEnv, { userId })
  return c.json({ owner: 'user', credentials })
})

const SetSchema = z.object({
  provider: z.string().regex(PROVIDER_RE).min(1).max(50),
  value: z.string().min(8).max(2000),
  label: z.string().regex(PROVIDER_RE).max(50).optional(),
  owner: z.enum(['user', 'org']).optional(),
})

app.put('/', zValidator('json', SetSchema), async (c) => {
  const userId = c.get('userId')
  const { provider, value, label, owner } = c.req.valid('json')
  const env = c.env as unknown as CredentialEnv
  const ownerType = owner ?? 'user'
  if (ownerType === 'org') {
    const org = await getActiveOrg(c)
    if (!org) return c.json({ error: 'No active organisation' }, 401)
    if (org.role !== 'owner' && org.role !== 'admin') {
      return c.json({ error: 'Setting org credentials requires admin/owner role' }, 403)
    }
    const result = await setServiceKey(
      env,
      { organizationId: org.organizationId },
      provider,
      value,
      label !== undefined ? { label } : undefined
    )
    return c.json({ owner: 'org', provider, ...result })
  }
  const result = await setServiceKey(
    env,
    { userId },
    provider,
    value,
    label !== undefined ? { label } : undefined
  )
  return c.json({ owner: 'user', provider, ...result })
})

const RevokeSchema = z.object({
  provider: z.string().regex(PROVIDER_RE).min(1).max(50),
  label: z.string().regex(PROVIDER_RE).max(50).optional(),
  owner: z.enum(['user', 'org']).optional(),
})

app.post('/revoke', zValidator('json', RevokeSchema), async (c) => {
  const userId = c.get('userId')
  const { provider, label, owner } = c.req.valid('json')
  const env = c.env as unknown as CredentialEnv
  const ownerType = owner ?? 'user'
  if (ownerType === 'org') {
    const org = await getActiveOrg(c)
    if (!org) return c.json({ error: 'No active organisation' }, 401)
    if (org.role !== 'owner' && org.role !== 'admin') {
      return c.json({ error: 'Revoking org credentials requires admin/owner role' }, 403)
    }
    const result = await revokeServiceKey(
      env,
      { organizationId: org.organizationId },
      provider,
      label !== undefined ? { label } : undefined
    )
    return c.json({ owner: 'org', provider, ...result })
  }
  const result = await revokeServiceKey(
    env,
    { userId },
    provider,
    label !== undefined ? { label } : undefined
  )
  return c.json({ owner: 'user', provider, ...result })
})

export default app
