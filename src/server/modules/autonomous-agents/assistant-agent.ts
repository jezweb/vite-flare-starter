/**
 * AssistantAgent — worked example of AutonomousAgent
 *
 * A per-user persistent assistant. Each `${userId}:${name}` partition
 * is one DO instance with its own persona, memory blocks, and
 * conversation history. The user can:
 *
 *   - Set persona ("You are my morning-briefing helper for...")
 *   - Stash facts in named blocks ("preferences", "current-projects")
 *   - Chat with the agent — history persists across sessions
 *   - Schedule the agent to fire on its own (daily digest, weekly
 *     check-in, etc) via `scheduleSelfRun`
 *
 * What it demonstrates:
 *   - Subclassing AutonomousAgent with custom toolset
 *   - Reusing the existing chat tool catalog (no parallel tool defs)
 *   - User-scoped tools (Gmail, Calendar) just work because state.userId
 *     flows through to the AgentContext
 *
 * What forks build on top:
 *   - Replace `getToolDefinitions()` with a subset matching the
 *     agent's purpose (a research assistant doesn't need Gmail send)
 *   - Override `buildExtraInstructions()` to inject current date,
 *     unread email count, today's calendar — anything dynamic the
 *     agent should always know
 *   - Wire Cloudflare's AgentMemory service for vector recall over
 *     long conversation history (replaces the sliding window)
 */
import { z } from 'zod'
import { Mail } from 'lucide-react'
import { AutonomousAgent, type AutonomousAgentEnv, type AutonomousAgentState } from '@/server/lib/agents/autonomous-agent'
import { getAccessToken } from '@/server/modules/google-workspace/tokens'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

interface Env extends AutonomousAgentEnv {
  // Agents inheriting AutonomousAgentEnv get all the AI provider keys
  // from the parent shape — no need to redeclare unless you need
  // additional bindings (R2 buckets, KV, etc).
}

/** Schema for the queued send_email payload. Used both client-side
 *  in the UI for editing AND server-side when executing post-approve. */
const SendEmailPayload = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  cc: z.string().email().optional(),
  bcc: z.string().email().optional(),
})
type SendEmailPayload = z.infer<typeof SendEmailPayload>

export class AssistantAgent extends AutonomousAgent<Env, AutonomousAgentState> {
  static override readonly className = 'AssistantAgent'

  /**
   * Tool catalog for this agent. Pulled from the chat module's
   * existing definitions so we don't duplicate code or drift.
   *
   * Curated subset — NOT every chat tool. A persistent assistant
   * should err on the side of fewer, higher-signal tools so the
   * model picks reliably. Add more in your fork as use cases prove
   * out the value.
   */
  protected override async getToolDefinitions(): Promise<ToolDefinition<unknown, unknown>[]> {
    // Lazy import — keeps the cold-start cost off this file's import
    // graph. Only paid when an agent actually runs.
    const { coreDefinitions } = await import('@/server/modules/chat/tools/core')
    const { todoDefinitions } = await import('@/server/modules/chat/tools/todo')
    const { memoryDefinitions } = await import('@/server/modules/chat/tools/memory')
    const { searchDefinitions } = await import('@/server/modules/chat/tools/search')
    return [
      ...coreDefinitions,
      ...memoryDefinitions,
      ...todoDefinitions,
      ...searchDefinitions,
      this.requestEmailApprovalTool(),
    ] as ToolDefinition<unknown, unknown>[]
  }

  /**
   * Worked example of the approval-queue pattern. The LLM calls this
   * INSTEAD of sending email directly. The tool stores the request
   * in `pending_approvals` and returns the approval id — nothing
   * actually sends. The user reviews in the queue UI / API and on
   * approve, `executeApproved('send_email', payload)` runs to
   * actually send via Gmail.
   *
   * The shape here is the canonical pattern for any destructive
   * action: define a request_X_approval tool that calls
   * `requestApproval('do_X', payload)` and returns the id.
   */
  private requestEmailApprovalTool(): ToolDefinition<
    SendEmailPayload,
    { ok: true; approvalId: string; status: 'pending'; summary: string } | { ok: false; error: string }
  > {
    return {
      name: 'request_email_approval',
      description:
        'Queue an email for the user to review and approve before sending. Returns an approval id. Nothing sends until the user approves via /approvals. Always prefer this over silent send for any user-facing email.',
      inputSchema: SendEmailPayload,
      outputSchema: z.union([
        z.object({
          ok: z.literal(true),
          approvalId: z.string(),
          status: z.literal('pending'),
          summary: z.string(),
        }),
        z.object({ ok: z.literal(false), error: z.string() }),
      ]),
      execute: async (payload, _ctx: AgentContext) => {
        try {
          const summary = `Email to ${payload.to}: ${payload.subject.slice(0, 80)}`
          const result = await this.requestApproval('send_email', payload, summary)
          return { ok: true as const, ...result, summary }
        } catch (err) {
          return {
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      },
      render: { icon: Mail, displayName: 'Request Email Approval' },
    }
  }

  /**
   * Approval execute hook — called by the approvals route handler
   * when the user approves a queued request. Receives the
   * (possibly user-edited) payload.
   */
  override async executeApproved(action: string, payload: unknown): Promise<unknown> {
    if (action === 'send_email') {
      const data = SendEmailPayload.parse(payload)
      return this.sendEmailViaGmail(data)
    }
    return super.executeApproved(action, payload) // throws — unknown action
  }

  /**
   * Internal: send via the user's Gmail using their OAuth token.
   * Mirrors the chat module's `gmailSendDefinition` execute body but
   * without the AgentContext indirection — we have direct access to
   * env + state.userId here.
   */
  private async sendEmailViaGmail(
    payload: SendEmailPayload,
  ): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
    if (!this.state.userId) {
      return { ok: false, error: 'AssistantAgent has no owner — cannot send email' }
    }
    const env = this.env as Env & { DB: D1Database }
    const token = await getAccessToken(env as Parameters<typeof getAccessToken>[0], this.state.userId)
    if (!token) {
      return {
        ok: false,
        error: 'Gmail not connected for this user — visit Connectors → Google Workspace.',
      }
    }
    // Build RFC 822 MIME message + base64-url encode for Gmail send.
    const headers = [
      `To: ${payload.to}`,
      ...(payload.cc ? [`Cc: ${payload.cc}`] : []),
      ...(payload.bcc ? [`Bcc: ${payload.bcc}`] : []),
      `Subject: ${payload.subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
    ].join('\r\n')
    const raw = `${headers}\r\n\r\n${payload.body}`
    const encoded = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    })
    if (!resp.ok) {
      const errBody = await resp.text()
      return { ok: false, error: `Gmail send failed: ${resp.status} ${errBody.slice(0, 200)}` }
    }
    const result = (await resp.json()) as { id?: string }
    return { ok: true, messageId: result.id ?? 'unknown' }
  }

  /**
   * Inject current date so the model knows when "today" is — a
   * common gap when scheduled fires happen without a fresh user
   * message that would naturally include time context.
   */
  protected override async buildExtraInstructions(): Promise<string | null> {
    const now = new Date()
    const formatted = new Intl.DateTimeFormat('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Australia/Sydney',
      timeZoneName: 'short',
    }).format(now)
    return `Current date/time: ${formatted}`
  }
}
