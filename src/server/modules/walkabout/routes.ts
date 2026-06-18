/**
 * /api/walkabout — the ask-the-app Guide.
 *
 * The Guide answers strictly from the app guide in knowledge.ts (its ONLY truth
 * source) and defers to the human contact for anything it doesn't cover —
 * never inventing features, limits, or prices. Internal model choice goes
 * through the `composer` role (#87): a fast model with thinking OFF, because a
 * reasoning model burns the output budget thinking and can return empty content
 * on a bounded answer.
 *
 * EVERY question is logged to D1, success or failure — the question log
 * (/dashboard/questions) is the roadmap: what users ask is the next tour script
 * and the next feature.
 *
 * Rate limiting is applied globally by the `rateLimiter` middleware via the
 * RATE_LIMITS / ENDPOINT_LIMITS entry for POST /api/walkabout/ask.
 */
import { Hono } from 'hono'
import { generateText } from 'ai'
import { drizzle } from 'drizzle-orm/d1'
import { desc, eq } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { resolveModel, resolveModelRole, thinkingOffProviderOptions } from '@/server/lib/ai'
import { walkaboutQuestions } from './db/schema'
import { APP_GUIDE } from './knowledge'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

const MAX_QUESTION_CHARS = 500

app.post('/ask', async (c) => {
  const userId = c.get('userId')

  let body: { question?: string; pagePath?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, 400)
  }
  const question = (body.question ?? '').trim()
  const pagePath = (body.pagePath ?? '').slice(0, 200) || null
  if (!question) {
    return c.json({ error: 'question is required', code: 'MISSING_FIELD' }, 400)
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return c.json(
      { error: `Question too long (max ${MAX_QUESTION_CHARS} characters)`, code: 'INVALID_FIELD' },
      400
    )
  }

  const id = crypto.randomUUID()
  const db = drizzle(c.env.DB)
  const start = Date.now()

  // Bounded, templated answer → composer role (fast, thinking off).
  const role = resolveModelRole(c.env as unknown as Record<string, unknown>, 'composer')
  const system =
    `You are the in-app Guide for this application, answering a signed-in user's question. ` +
    `Answer ONLY from the app guide below. If the guide doesn't cover it, say so plainly and ` +
    'point them to the contact in the guide — never invent features, prices, or behaviour. Be ' +
    'concrete and brief: plain text, short dashed lists where they help, no markdown headings, ' +
    `under 120 words. When a page is relevant, name it the way the app does (e.g. "the Skills ` +
    `page").\n\n--- APP GUIDE ---\n${APP_GUIDE}`
  const prompt = `${pagePath ? `(Asked from the ${pagePath} page.)\n` : ''}${question}`

  let answer: string | null = null
  let errorMessage: string | null = null
  try {
    const { text } = await generateText({
      model: resolveModel(c.env, role.modelId),
      system,
      prompt,
      maxOutputTokens: 1024,
      providerOptions: thinkingOffProviderOptions(role),
    })
    answer = (text || '').trim() || null
    if (!answer) errorMessage = 'Empty answer from model'
  } catch (err) {
    errorMessage = String(err)
  }

  const latencyMs = Date.now() - start

  // Log regardless of outcome — failed questions are still signal.
  await db.insert(walkaboutQuestions).values({
    id,
    userId,
    question,
    answer,
    pagePath,
    modelUsed: role.modelId,
    latencyMs,
    errorMessage,
  })

  if (!answer) {
    console.error(JSON.stringify({ event: 'walkabout_assist_failed', id, error: errorMessage }))
    return c.json(
      {
        error: 'The guide could not answer right now — try again in a moment',
        code: 'ASSIST_FAILED',
      },
      502
    )
  }

  console.info(JSON.stringify({ event: 'walkabout_assist_answered', id, latencyMs }))
  return c.json({ id, answer })
})

app.get('/questions', async (c) => {
  const userId = c.get('userId')
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 100)))
  const db = drizzle(c.env.DB)
  const rows = await db
    .select()
    .from(walkaboutQuestions)
    .where(eq(walkaboutQuestions.userId, userId))
    .orderBy(desc(walkaboutQuestions.createdAt))
    .limit(limit)
  return c.json({ questions: rows })
})

export type WalkaboutRoutes = typeof app

export default app
