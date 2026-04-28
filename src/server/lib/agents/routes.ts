/**
 * Agents discovery routes.
 *
 *   GET /api/agents/registered    — agent catalogue for pickers
 *   GET /api/agent-tools/catalog  — tool catalogue for pickers
 *
 * Both are auth-gated so only signed-in users see the catalogue.
 * Fork-users with private tooling can layer additional gating here.
 */
import { Hono } from 'hono'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { listRegisteredAgents } from './registry'

const app = new Hono<AuthContext>()
app.use('*', authMiddleware)

app.get('/registered', async (c) => {
  return c.json({ agents: listRegisteredAgents() })
})

export default app
