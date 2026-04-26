/**
 * Organizations API — thin layer over the better-auth Organization plugin
 *
 * Most org operations (create / list / add member / set active /
 * accept invitation) come from the plugin itself at
 * /api/auth/organization/*. See https://www.better-auth.com/docs/plugins/organization
 *
 * This module adds:
 *   - GET /api/organizations/me            — list orgs I'm a member of
 *   - GET /api/organizations/active        — current active org (with my role)
 *   - GET /api/organizations/me/membership — convenience: both above in one call
 *
 * Forks layer per-product routes (org settings, billing, etc) here as
 * the product matures.
 */
import { Hono } from 'hono'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { getActiveOrg, listUserOrgs } from './helpers'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.get('/me', async (c) => {
  const userId = c.get('userId')
  const orgs = await listUserOrgs(c.env.DB, userId)
  return c.json({ total: orgs.length, organizations: orgs })
})

app.get('/active', async (c) => {
  const active = await getActiveOrg(c)
  return c.json({ active })
})

app.get('/me/membership', async (c) => {
  const userId = c.get('userId')
  const [orgs, active] = await Promise.all([listUserOrgs(c.env.DB, userId), getActiveOrg(c)])
  return c.json({
    organizations: orgs,
    active,
  })
})

export default app
