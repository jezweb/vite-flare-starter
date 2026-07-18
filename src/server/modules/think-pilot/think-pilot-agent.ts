/**
 * ThinkPilotAgent — pilot of Cloudflare's `@cloudflare/think` harness (#think-pilot).
 *
 * Think is the SDK-native sibling of our ChatAgent: same `agents` +
 * `agents/chat` primitives underneath (recovery engine, resumable streams,
 * SkillSource registry), but with three capabilities our stack hand-rolls
 * elsewhere — piloted here so a fork can judge the trade before committing:
 *
 *   - **Actions ledger** — `action({ ... })` side effects with durable
 *     idempotency (replay-safe across recovery retries) and approval
 *     policies. Compare: our approvals module trusts the executor to run
 *     once; the ledger enforces it.
 *   - **Scheduled-task DSL** — `getScheduledTasks()` returns declarative
 *     `"every day at 07:30"` tasks reconciled on startup. Compare: our
 *     Routines module (which stays the user-facing pattern — this DSL is
 *     per-agent-instance, code-declared).
 *   - **Channels** — web is implicit; messengers (Telegram etc.) mount via
 *     `getMessengers()`. Not exercised in the pilot (no bot token in the
 *     starter) but the seam is where a fork would add one.
 *
 * Interop proof: `getSkills()` mounts the same D1-backed `userSkillSource`
 * the chat agent's skill registry uses — one skills store, two harnesses.
 *
 * Instance naming: exactly `<userId>:main` (owner-single access policy —
 * see AGENT_ACCESS_POLICY in server/index.ts). One pilot DO per user,
 * enforced at the route gate: because getScheduledTasks() registers
 * recurring model work on boot, unlimited instances would mean unlimited
 * standing spend.
 *
 * Deliberate opt-outs:
 *   - `workspaceBash = false`: Think's built-in workspace Bash tool needs
 *     `just-bash` (~450KB gzip), which this repo stub-aliases out of the
 *     bundle (see lib/ai/skills/just-bash-stub.ts). Forks that want it:
 *     remove the alias, `pnpm add just-bash`, delete this override.
 *   - Model resolution bypasses Think's AI-Gateway string slugs in favour
 *     of our provider registry, so the pilot honours the same
 *     OPENROUTER_API_KEY / direct-key routing as the rest of the app.
 */
import { Think, action, type ThinkScheduledTasks, type ThinkModel } from '@cloudflare/think'
import type { SkillSource } from 'agents/skills'
import { z } from 'zod'
import type { Env } from '@/server/index'
import { resolveModel } from '@/server/lib/ai/providers'
import { resolveModelRole } from '@/server/lib/ai/roles'
import { userSkillSource } from '@/server/lib/ai/skills/sdk-source'
import { createInAppNotification } from '@/server/modules/notifications/service'

export class ThinkPilotAgent extends Think<Env> {
  /** Owner userId from the `<userId>:main` instance-name convention. */
  private get ownerId(): string {
    return this.name.split(':')[0] ?? ''
  }

  // Think's workspace Bash tool imports `just-bash`, which this build stubs
  // out (throws on construction). Must stay false while the alias exists.
  override workspaceBash = false

  // Parity with ChatAgent: abort turns whose stream goes silent for 3min
  // (covers slow tools; see chat-agent.ts for the reasoning).
  override chatStreamStallTimeoutMs = 180_000

  override getModel(): ThinkModel {
    const role = resolveModelRole(this.env as unknown as Record<string, unknown>, 'reasoner')
    return resolveModel(this.env, role.modelId)
  }

  override getSystemPrompt(): string {
    return [
      'You are the Think pilot assistant — a demo agent running on the',
      "`@cloudflare/think` harness inside this app's Worker.",
      '',
      'You have two actions:',
      '- `record_note` saves a note into your durable workspace. It is',
      '  idempotent per noteId — repeating a call with the same noteId',
      '  replays the stored result instead of writing twice.',
      '- `send_notification` sends the user a real in-app notification.',
      '  It is approval-gated: the user must approve each send.',
      '',
      'A scheduled task named morning-brief runs daily. When it fires you',
      'receive its prompt as a normal turn.',
      '',
      'Skills from the user-facing skills registry are mounted; load one',
      'with the skill tool when its description matches the task.',
    ].join('\n')
  }

  override getActions() {
    const ownerId = this.ownerId
    const env = this.env

    return {
      record_note: action({
        description:
          'Save a markdown note into the agent workspace. Notes are immutable per noteId: ' +
          'repeating a call with identical input replays the original result; reusing a ' +
          'noteId with different content is rejected (ActionKeyConflict). To change a note, ' +
          'pick a new noteId or edit the file in the workspace directly.',
        inputSchema: z.object({
          noteId: z
            .string()
            .regex(/^[a-z0-9-]{1,64}$/, 'lowercase slug')
            .describe('Stable slug identifying the note (idempotency key)'),
          title: z.string().min(1).max(200),
          body: z.string().min(1).max(20_000).describe('Markdown body'),
        }),
        // Domain-stable key → the ledger replays the settled result on
        // recovery retries instead of re-running the write.
        idempotencyKey: ({ input }) => `note:${input.noteId}`,
        execute: async (input, ctx) => {
          const path = `/notes/${input.noteId}.md`
          await (ctx.agent as ThinkPilotAgent).workspace.writeFile(
            path,
            `# ${input.title}\n\n${input.body}\n`
          )
          return { saved: true, path }
        },
      }),

      send_notification: action({
        description:
          'Send the user an in-app notification (bell icon). Requires user approval before it runs.',
        inputSchema: z.object({
          title: z.string().min(1).max(120),
          message: z.string().min(1).max(500),
        }),
        approval: true,
        approvalSummary: 'Send an in-app notification',
        approvalRisk: 'low',
        // Known limit: the D1 insert and the ledger's settle aren't atomic —
        // a crash in between can re-run the insert on recovery. Acceptable
        // for a demo notification; forks wiring real side effects should
        // pass a stable operation id into the external write (UNIQUE +
        // ON CONFLICT) in addition to a ledger idempotencyKey.
        execute: async (input) => {
          await createInAppNotification(env.DB, {
            userId: ownerId,
            type: 'info',
            title: input.title,
            message: input.message,
            data: { entityType: 'think-pilot' },
          })
          return { sent: true }
        },
      }),
    }
  }

  override getScheduledTasks(): ThinkScheduledTasks {
    return {
      'morning-brief': {
        schedule: 'every day at 07:30',
        prompt:
          'The daily morning-brief task fired. Read any notes in /notes/ from your ' +
          'workspace and write a two-sentence summary of what they cover. If there ' +
          'are no notes yet, say so briefly.',
      },
    }
  }

  override getDefaultTimezone(): string | undefined {
    // Wall-clock tasks without this run in UTC. Forks: set AGENT_TIMEZONE.
    const tz = (this.env as { AGENT_TIMEZONE?: string }).AGENT_TIMEZONE
    return tz || undefined
  }

  override getSkills(): SkillSource[] {
    // Same D1-backed registry the chat agent uses (bundled + R2 + GitHub
    // skills, per-user overrides). One skills store, two harnesses.
    return [userSkillSource(this.env, this.ownerId)]
  }
}
