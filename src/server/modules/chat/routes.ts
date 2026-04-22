/**
 * Chat API Routes
 *
 * Streaming chat using AI SDK ToolLoopAgent pattern.
 * Features: agent abstraction, smoothStream, token usage logging,
 * reasoning middleware, tool calling, consumeStream for disconnect resilience.
 */
import { Hono } from 'hono'
import { generateText, convertToModelMessages, smoothStream, Output, createAgentUIStreamResponse, safeValidateUIMessages, pruneMessages, consumeStream, streamObject } from 'ai'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, desc, eq, sql } from 'drizzle-orm'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import { DEFAULT_MODEL, getModel, resolveModel, buildChatAgent } from '@/server/lib/ai'
import { convertToMarkdown } from '@/server/lib/ai/documents'
import { createD1ChatStorage } from '@/server/modules/conversations/storage'
import { conversations } from '@/server/modules/conversations/db/schema'
import { logActivityFromContext } from '@/server/modules/activity/log'
import { aiUsageLogs, aiToolCalls } from './db/schema'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)
app.use('*', requireScopes('chat:write'))

/**
 * Build the `"<name> (<size>)"` label embedded in the attachment prefix that
 * the frontend's AttachedFileBlock detects and collapses.
 * e.g. `invoice.pdf (42 KB)` or `file (1.2 MB)` when no filename is available.
 */
function attachmentLabel(part: { filename?: string }, byteLen: number): string {
  const name = part.filename?.trim() || 'file'
  const size = formatBytes(byteLen)
  return `${name} (${size})`
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Auto-generate a short conversation title from the first user/assistant
 * exchange. Uses Workers AI's free Kimi K2.5 — no external API key, fast.
 * Falls back to the truncated first-user-message if the LLM call fails.
 * Fire-and-forget from `onFinish`; client sidebar refreshes on next render.
 */
async function autoTitleConversation(
  env: { AI: Ai; DB: D1Database },
  conversationId: string,
  userId: string,
  messages: Array<{ role: string; parts?: Array<{ type?: string; text?: string }> }>,
): Promise<void> {
  try {
    const firstUser = messages.find((m) => m.role === 'user')
    const firstAssistant = messages.find((m) => m.role === 'assistant')
    if (!firstUser || !firstAssistant) return
    const userText =
      firstUser.parts?.find((p) => p?.type === 'text')?.text?.slice(0, 500) ?? ''
    const assistantText =
      firstAssistant.parts?.find((p) => p?.type === 'text')?.text?.slice(0, 500) ?? ''
    if (!userText || !assistantText) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await (env.AI as any).run('@cf/moonshotai/kimi-k2.5', {
      messages: [
        {
          role: 'system',
          content:
            'Summarise the user\'s intent from this chat exchange into a short, specific title (≤6 words, sentence case, no quotes or trailing punctuation). Reply with ONLY the title text.',
        },
        { role: 'user', content: `USER: ${userText}\n\nASSISTANT: ${assistantText}\n\nTitle:` },
      ],
      max_tokens: 40,
    })
    const raw = (result?.response || result?.text || '').toString().trim()
    const title = raw
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/[.!?]+$/, '')
      .slice(0, 80)
    if (!title || title.length < 3) return

    // Update the stored title. We don't use the storage helper here because
    // updateTitle requires userId ownership — same check; inlined for brevity.
    await drizzle(env.DB)
      .update(conversations)
      .set({ title })
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    console.log(JSON.stringify({ event: 'chat_auto_title', conversationId, title }))
  } catch (err) {
    console.warn(JSON.stringify({ event: 'chat_auto_title_failed', error: String(err) }))
  }
}

/**
 * POST /api/chat - Streaming chat endpoint (AI SDK ToolLoopAgent)
 *
 * Accepts AI SDK UIMessage format from useChat hook.
 * Uses ToolLoopAgent for the agent loop, createAgentUIStreamResponse for streaming.
 * Supports conversation persistence via optional conversationId.
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { model: requestedModel, conversationId: existingConversationId } = body
    // projectId is accepted from the client ONLY for new conversations — it
    // tells the server which project this conversation should belong to. For
    // existing conversations we always trust the stored row, not the payload
    // (stops a client from flipping project mid-chat to get elevated
    // instructions). `null` explicitly unbinds at creation.
    //
    // Defensive parse: reject anything that isn't a UUID-shaped string to
    // prevent a malicious client sending a 10MB payload as projectId.
    // Strict v4 UUID regex — won't match "aaa" or "----" which the prior
    // looser regex allowed.
    const rawProjectId = body.projectId
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const clientProjectId: string | null =
      typeof rawProjectId === 'string' && UUID_RE.test(rawProjectId) ? rawProjectId : null
    // systemPrompt is intentionally server-controlled — client cannot override.
    // Fork-users: change this in buildChatAgent's default instructions.
    const systemPrompt = undefined
    // Accept both legacy { messages } and new { message, allMessages } shapes
    const messages = (body.messages || body.allMessages || (body.message ? [body.message] : [])) as Array<{ role: string; content?: unknown; parts?: unknown[] }>

    // Server-side limits: cap message count and attachment sizes
    if (messages.length > 200) {
      return c.json({ error: 'Too many messages (max 200)' }, 400)
    }

    const userId = c.get('userId')
    const user = c.get('user') as { name?: string; email?: string; role?: string } | undefined
    const storage = createD1ChatStorage(c.env.DB)

    // Title derived from the first user message — used lazily when we finally
    // persist the conversation in `onFinish`. Strips <skill_content> wrappers
    // so slash-activated skills (e.g. /plan-task) don't leak XML into the
    // breadcrumb or activity feed.
    const firstUserMsg = messages.find((m: { role: string }) => m.role === 'user')
    const stripSkillWrapper = (text: string): string =>
      text.replace(/<skill_content\b[^>]*>[\s\S]*?<\/skill_content>\s*/gi, '').trim()
    const extractTitle = (msg: typeof firstUserMsg): string => {
      if (!msg) return 'New conversation'
      if (typeof msg.content === 'string' && msg.content.trim()) {
        const cleaned = stripSkillWrapper(msg.content)
        if (cleaned) return cleaned.slice(0, 80)
      }
      const parts = msg.parts as Array<{ type?: string; text?: string }> | undefined
      const textPart = parts?.find((p) => p?.type === 'text' && typeof p.text === 'string' && p.text.trim())
      if (textPart?.text) {
        const cleaned = stripSkillWrapper(textPart.text)
        if (cleaned) return cleaned.slice(0, 80)
      }
      return 'New conversation'
    }

    // Generate the conversation id upfront so the client can navigate to the
    // permalink, but DO NOT insert the row until we have real messages to save.
    // Inserting eagerly caused ghost empty conversations whenever a stream
    // failed before `onFinish` could persist any messages.
    let conversationId = existingConversationId as string | undefined
    const isNewConversation = !conversationId
    if (!conversationId) {
      conversationId = crypto.randomUUID()
    }

    // Resolve the effective projectId. For existing conversations the stored
    // row wins — trusting the client on this would let a user flip projects
    // mid-chat and inherit someone else's instructions. For new ones we
    // accept what the client declared.
    const effectiveProjectId = isNewConversation
      ? clientProjectId
      : await storage.getProjectId(conversationId, userId)

    // Build the agent (model, tools, system prompt, logging — all encapsulated)
    const { agent, startTime, modelId } = await buildChatAgent({
      env: c.env as unknown as Parameters<typeof buildChatAgent>[0]['env'],
      userId,
      user: user || undefined,
      modelId: requestedModel,
      systemPrompt,
      projectId: effectiveProjectId,
    })

    // Pre-process file attachments: convert non-image files to text/transcription
    // so they work with models that only accept image file parts.
    for (const msg of messages) {
      if (msg.role !== 'user' || !msg.parts) continue
      const parts = msg.parts as Array<{ type: string; url?: string; mediaType?: string; data?: string; text?: string }>
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!
        if (part.type !== 'file') continue
        const mime = part.mediaType || ''
        // Images pass through — models handle them natively
        if (mime.startsWith('image/')) continue
        try {
          if (!part.url?.startsWith('data:')) continue
          const base64 = part.url.split(',')[1] || ''
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

          let textContent = ''

          // Audio files: transcribe via Workers AI (Deepgram Nova 3).
          // Nova 3 expects the multipart input shape: `{ audio: { body, contentType } }`
          // — raw Uint8Array / number[] / data URL all return `5006: required
          // properties at '/audio' are 'body,contentType'`.
          if (mime.startsWith('audio/')) {
            try {
              const form = new FormData()
              form.append('audio', new Blob([new Uint8Array(bytes)], { type: mime }), 'audio')
              const formResp = new Response(form)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const result: any = await (c.env.AI as any).run('@cf/deepgram/nova-3', {
                audio: {
                  body: formResp.body,
                  contentType: formResp.headers.get('content-type'),
                },
              })
              const transcript = (result?.text || result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim()
              textContent = transcript
                ? `[Audio transcription]:\n\n${transcript}`
                : '[Audio file attached but transcription returned no text.]'
            } catch (err) {
              console.warn(JSON.stringify({ event: 'audio_transcription_failed', error: String(err) }))
              textContent = '[Audio file attached but transcription failed. Use the transcribe_audio tool to retry.]'
            }
          // Text-ish formats — inline directly (skip the round-trip through AI)
          } else if (mime.startsWith('text/') || mime === 'application/json') {
            const decoded = new TextDecoder().decode(bytes)
            // Prefix format `[Attached file: <name> (<size>)]` is detected by
            // the client's AttachedFileBlock renderer to show a collapsible
            // card instead of the raw extracted text. Keep this stable.
            textContent = `[Attached file: ${attachmentLabel(part as { filename?: string }, bytes.length)}]\n\n${decoded}`
          // Everything else (PDF, DOCX, XLSX, PPTX, HTML, RTF, EPUB, legacy Office, etc.)
          // — delegate to convertToMarkdown which uses env.AI.toMarkdown() with
          // safe fallbacks. Handles ZIP-based office formats correctly so the
          // model sees real document text, not PK-header binary garbage.
          } else {
            const markdown = await convertToMarkdown(
              c.env as unknown as Parameters<typeof convertToMarkdown>[0],
              bytes,
              mime,
              { filename: (part as { filename?: string }).filename },
            )
            textContent = `[Attached file: ${attachmentLabel(part as { filename?: string }, bytes.length)}]\n\n${markdown}`
          }

          if (textContent) {
            parts[i] = { type: 'text', text: textContent } as typeof part
          }
        } catch (err) {
          console.warn('Failed to convert file attachment:', err)
        }
      }
    }

    // Validate loaded messages against current tool schemas (handles schema drift)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validation = await safeValidateUIMessages({ messages, tools: agent.tools as any })
    const validatedMessages = validation.success ? validation.data : messages

    // Stream the agent response to the client
    const response = await createAgentUIStreamResponse({
      agent,
      uiMessages: validatedMessages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      originalMessages: validatedMessages as any,
      experimental_transform: smoothStream({ chunking: 'word' }),
      sendReasoning: true,
      // Enable native source parts (e.g. Gemini googleSearch grounding).
      // Custom tool sources are aggregated client-side in SourcesFooter.
      sendSources: true,
      // Without this the assistant message lands in D1 with an empty id, failing the PK.
      generateMessageId: () => crypto.randomUUID(),
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            conversationId,
            model: modelId,
            inputTokens: part.totalUsage?.inputTokens,
            outputTokens: part.totalUsage?.outputTokens,
            durationMs: Date.now() - startTime,
          }
        }
        return undefined
      },
      // Per-step telemetry — one row per tool call, enables the admin panel's
      // "Recent tool errors" strip and future latency/reliability dashboards.
      onStepFinish: async (stepResult) => {
        const { stepNumber, toolCalls, toolResults, usage } = stepResult
        if (toolCalls.length === 0) return
        try {
          const db = drizzle(c.env.DB)
          const rows = toolCalls.map((tc) => {
            const result = toolResults.find((tr) => tr.toolCallId === tc.toolCallId)
            const toolError =
              result && 'output' in result === false && 'error' in result
                ? String((result as { error: unknown }).error)
                : null
            return {
              userId,
              model: modelId,
              stepIndex: stepNumber,
              toolName: tc.toolName,
              toolDurationMs: null,
              toolError,
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            }
          })
          await db.insert(aiToolCalls).values(rows)
          const errored = rows.filter((r) => r.toolError)
          if (errored.length > 0) {
            console.log(
              JSON.stringify({
                event: 'tool_error',
                stepIndex: stepNumber,
                userId,
                model: modelId,
                conversationId,
                errors: errored.map((r) => ({ tool: r.toolName, error: r.toolError })),
              }),
            )
          }
        } catch (err) {
          console.error(
            JSON.stringify({ event: 'step_finish_telemetry_error', error: String(err) }),
          )
        }
      },
      // Structured error logging for stream-level failures (network, provider,
      // parse errors). Tool-specific errors are captured in onStepFinish above.
      onError: (error) => {
        console.error(
          JSON.stringify({
            event: 'chat_stream_error',
            userId,
            model: modelId,
            conversationId,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message, stack: error.stack }
                : String(error),
          }),
        )
        return error instanceof Error ? error.message : 'An error occurred during chat streaming.'
      },
      onFinish: async ({ messages: finalMessages }) => {
        // Persist conversation messages to D1. For brand-new conversations,
        // insert the parent conversation row LAZILY here — this prevents ghost
        // empty conversations whenever streaming fails before any message
        // completes. If onFinish never fires, nothing is saved.
        console.log(JSON.stringify({ event: 'chat_onFinish', conversationId, messageCount: finalMessages.length, firstRole: finalMessages[0]?.role }))
        try {
          if (isNewConversation) {
            await storage.createConversationWithId(conversationId!, userId, {
              title: extractTitle(firstUserMsg),
              model: requestedModel || DEFAULT_MODEL,
              systemPrompt,
              projectId: effectiveProjectId,
            })
            // Activity log moved here too so empty conversations don't pollute
            // the audit trail.
            await logActivityFromContext(c, {
              action: 'create',
              entityType: 'conversation',
              entityId: conversationId!,
              entityName: extractTitle(firstUserMsg),
              metadata: { model: requestedModel || DEFAULT_MODEL },
            })
          }
          await storage.saveChat({ conversationId: conversationId!, messages: finalMessages })
          console.log(JSON.stringify({ event: 'chat_saved', conversationId, messageCount: finalMessages.length }))

          // For brand-new conversations, ask an LLM to summarise the first
          // exchange into a short, specific title. Fire-and-forget — the
          // client sidebar will pick up the new title on its next query.
          if (isNewConversation) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            autoTitleConversation(c.env as any, conversationId!, userId, finalMessages as any)
          }
        } catch (err) {
          console.error(JSON.stringify({ event: 'chat_save_error', error: String(err), conversationId }))
        }
      },
      // Consume a tee'd copy server-side — ensures onFinish fires even if client disconnects
      consumeSseStream: async ({ stream }) => {
        await consumeStream({ stream })
      },
    })

    return response
  } catch (error) {
    console.error('Chat error:', error)
    return c.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      500
    )
  }
})

/**
 * POST /api/chat/complete - Non-streaming chat endpoint
 */
app.post('/complete', async (c) => {
  try {
    const body = await c.req.json()
    const { messages, model: requestedModel } = body

    const modelId = requestedModel || DEFAULT_MODEL
    const modelConfig = getModel(modelId)

    // Prune old reasoning and tool calls to reduce context size
    const modelMessages = pruneMessages({
      messages: await convertToModelMessages(messages),
      reasoning: 'before-last-message',
      toolCalls: 'before-last-message',
    })

    const { text, usage } = await generateText({
      model: resolveModel(c.env, modelId),
      messages: modelMessages,
      maxOutputTokens: modelConfig?.defaultMaxTokens ?? 16384,
    })

    return c.json({
      success: true,
      message: { role: 'assistant' as const, content: text },
      model: modelId,
      usage,
    })
  } catch (error) {
    console.error('Chat error:', error)
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Chat failed' },
      500
    )
  }
})

/**
 * GET /api/chat/usage - Get token usage stats for the authenticated user
 */
app.get('/usage', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)

  const [totals] = await db
    .select({
      totalRequests: sql<number>`count(*)`,
      totalTokens: sql<number>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)`,
      totalPromptTokens: sql<number>`coalesce(sum(${aiUsageLogs.promptTokens}), 0)`,
      totalCompletionTokens: sql<number>`coalesce(sum(${aiUsageLogs.completionTokens}), 0)`,
    })
    .from(aiUsageLogs)
    .where(eq(aiUsageLogs.userId, userId))

  const recent = await db
    .select()
    .from(aiUsageLogs)
    .where(eq(aiUsageLogs.userId, userId))
    .orderBy(desc(aiUsageLogs.createdAt))
    .limit(10)

  return c.json({ totals, recent })
})

// ============================================================================
// STRUCTURED OUTPUT
// ============================================================================

const extractSchemas = {
  summary: z.object({
    title: z.string().describe('A concise title for the text'),
    summary: z.string().max(200).describe('A brief summary in 1-2 sentences'),
    keyPoints: z.array(z.string()).max(5).describe('Key points from the text'),
    wordCount: z.number().describe('Approximate word count of the input'),
  }),
  entities: z.object({
    people: z.array(z.string()).describe('Named people mentioned'),
    places: z.array(z.string()).describe('Locations and places mentioned'),
    organizations: z.array(z.string()).describe('Companies, teams, or organizations'),
    dates: z.array(z.string()).describe('Dates and time references'),
  }),
  sentiment: z.object({
    overall: z.enum(['positive', 'negative', 'neutral', 'mixed']).describe('Overall sentiment'),
    score: z.number().min(-1).max(1).describe('Sentiment score from -1 (negative) to 1 (positive)'),
    reasoning: z.string().describe('Brief explanation of the sentiment assessment'),
  }),
} as const

type ExtractSchema = keyof typeof extractSchemas

/**
 * POST /api/chat/extract - Structured data extraction
 *
 * Uses AI SDK generateObject with Zod schemas to extract
 * structured data from text. Requires a tool-capable model.
 */
app.post('/extract', async (c) => {
  try {
    const body = await c.req.json()
    const { text, schema: schemaName } = body as { text: string; schema: ExtractSchema }

    if (!text || !schemaName || !extractSchemas[schemaName]) {
      return c.json(
        { error: 'Required: text (string) and schema (summary | entities | sentiment)' },
        400
      )
    }
    if (text.length > 100_000) {
      return c.json({ error: 'Text too long (max 100,000 characters)' }, 400)
    }

    // Use a tool-capable model for structured output
    const modelId = '@cf/moonshotai/kimi-k2.5'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = extractSchemas[schemaName] as any
    const { output } = await generateText({
      model: resolveModel(c.env, modelId),
      output: Output.object({ schema }),
      prompt: `Extract the following from this text:\n\n${text}`,
    })

    return c.json({
      success: true,
      schema: schemaName,
      model: modelId,
      data: output,
    })
  } catch (error) {
    console.error('Extract error:', error)
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Extraction failed' },
      500
    )
  }
})

/**
 * POST /api/chat/stream-extract - Streaming structured data extraction
 *
 * Like /extract but streams the object progressively via AI SDK streamObject.
 * Client consumes with useObject() hook from @ai-sdk/react.
 */
app.post('/stream-extract', async (c) => {
  try {
    const body = await c.req.json()
    const { text, schema: schemaName } = body as { text: string; schema: ExtractSchema }

    if (!text || !schemaName || !extractSchemas[schemaName]) {
      return c.json(
        { error: 'Required: text (string) and schema (summary | entities | sentiment)' },
        400
      )
    }
    if (text.length > 100_000) {
      return c.json({ error: 'Text too long (max 100,000 characters)' }, 400)
    }

    const modelId = '@cf/moonshotai/kimi-k2.5'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = extractSchemas[schemaName] as any
    const result = streamObject({
      model: resolveModel(c.env, modelId),
      schema,
      prompt: `Extract the following from this text:\n\n${text}`,
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('Stream extract error:', error)
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Extraction failed' },
      500
    )
  }
})

/**
 * Hono RPC type export for type-safe client usage
 *
 * @example
 * import { hc } from 'hono/client'
 * import type { ChatRoutes } from '@/server/modules/chat/routes'
 * const client = hc<ChatRoutes>('/api/chat')
 */
export type ChatRoutes = typeof app

export default app
