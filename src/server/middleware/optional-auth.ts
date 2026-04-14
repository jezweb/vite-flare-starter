/**
 * Optional Auth Middleware
 *
 * Like authMiddleware but doesn't reject unauthenticated requests.
 * If a valid session exists, populates userId/user in context.
 * If not, request proceeds with no user context.
 *
 * Use for public routes that optionally enhance the experience
 * for logged-in users (e.g. "Sign in for more features" banner,
 * personalised content, edit buttons for admins).
 *
 * @example
 * app.use('/public/*', optionalAuthMiddleware)
 * app.get('/public/status', (c) => {
 *   const user = c.get('user') // may be undefined
 *   return c.json({ status: 'ok', isAdmin: user?.role === 'admin' })
 * })
 */
import { createMiddleware } from 'hono/factory'
import type { Env } from '../index'
import { createAuth } from '../modules/auth'

export type OptionalAuthContext = {
  Bindings: Env
  Variables: {
    userId?: string
    user?: {
      id: string
      email: string
      name: string
      image?: string | null
      role: 'user' | 'manager' | 'admin'
    }
    isAuthenticated: boolean
  }
}

export const optionalAuthMiddleware = createMiddleware<OptionalAuthContext>(async (c, next) => {
  try {
    const auth = createAuth(c.env.DB, {
      BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
      TRUSTED_ORIGINS: c.env.TRUSTED_ORIGINS,
    })

    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    if (session?.user) {
      c.set('userId', session.user.id)
      c.set('user', {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        role: (session.user as { role?: string }).role as 'user' | 'manager' | 'admin' || 'user',
      })
      c.set('isAuthenticated', true)
    } else {
      c.set('isAuthenticated', false)
    }
  } catch {
    c.set('isAuthenticated', false)
  }

  await next()
})
