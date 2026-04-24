/**
 * Connector settings routes — per-user enable/disable for each provider
 * and for each tool within a provider.
 *
 *   GET    /:id/settings   fetch { enabled, enabledTools, providerDefault }
 *   PATCH  /:id/settings   upsert { enabled?, enabledTools? }
 *
 * The "allowed tools" set is applied server-side in `buildChatTools`
 * via `filterToolsByUserSettings` — changes here affect the next
 * message, not any tool call already in flight.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { getProvider } from '@/shared/config/connector-providers'
import { getProviderSettings, updateProviderSettings } from './settings'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  enabledTools: z.array(z.string()).optional(),
})

app.get('/:id/settings', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const provider = getProvider(id)
  if (!provider) return c.json({ error: 'Unknown connector' }, 404)
  const settings = await getProviderSettings(c.env, userId, id)
  return c.json({
    connectorId: id,
    ...settings,
    // Echo the provider's declared tool set so the client doesn't have
    // to cross-reference — useful for the dialog render.
    toolNames: provider.toolNames,
    defaultEnabledTools: provider.defaultEnabledTools,
  })
})

app.patch('/:id/settings', zValidator('json', patchSchema), async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const provider = getProvider(id)
  if (!provider) return c.json({ error: 'Unknown connector' }, 404)
  const body = c.req.valid('json')
  await updateProviderSettings(c.env, userId, id, body)
  const updated = await getProviderSettings(c.env, userId, id)
  return c.json({
    connectorId: id,
    ...updated,
    toolNames: provider.toolNames,
    defaultEnabledTools: provider.defaultEnabledTools,
  })
})

export default app
