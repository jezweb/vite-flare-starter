/**
 * Agent prepareStep functions
 *
 * Called before each step in the ToolLoopAgent loop.
 * Used for token budget tracking and dynamic tool management.
 *
 * ## Skill content protection
 *
 * Per agentskills.io client-implementation guide, Step 5: if you add
 * message-level compaction here in future, SKIP any assistant/tool message
 * whose content contains `<skill_content`. That marker identifies activated
 * skill bodies — losing them mid-conversation silently degrades the agent
 * without any visible error. See `SKILL_CONTENT_MARKER` in
 * `server/modules/chat/tools/skills.ts`.
 */
import type { ToolSet, ModelMessage } from 'ai'

interface TokenBudgetOptions {
  maxTotalTokens: number
}

/**
 * Track cumulative token usage across steps and stop the agent
 * when approaching the budget limit by removing all tools.
 */
export function tokenBudgetPrepareStep<TOOLS extends ToolSet>({ maxTotalTokens }: TokenBudgetOptions) {
  return ({ steps }: { steps: Array<{ usage?: { inputTokens?: number; outputTokens?: number } }> }) => {
    const totalTokens = steps.reduce((acc, step) => {
      return acc + (step.usage?.inputTokens ?? 0) + (step.usage?.outputTokens ?? 0)
    }, 0)

    if (totalTokens > maxTotalTokens) {
      // Over budget: force text-only response (no tool calls)
      return { activeTools: [] as Array<keyof TOOLS & string> }
    }

    return {}
  }
}

/**
 * Tool names that should be gated behind explicit user intent. Dangerous
 * operations (sending email, creating calendar events, deleting files)
 * start DISABLED on a fresh turn and only unlock when the latest user
 * message references them, or when the agent already invoked a related
 * tool successfully earlier in the conversation.
 *
 * Keeps the "what's in my inbox?" chat from accidentally triggering
 * `gmail_send` because the model decided to be helpful.
 */
const PRIVILEGED_TOOLS = [
  'gmail_send',
  'gmail_reply',
  'gmail_delete',
  'calendar_create',
  'calendar_update_event',
  'calendar_delete_event',
  'docs_create',
  'docs_append',
  'sheets_append_row',
  'sheets_write_range',
  'drive_delete',
  'fs_delete',
  'fs_write',
  'run_shell',
] as const

type PrivilegedTool = (typeof PRIVILEGED_TOOLS)[number]

/**
 * Keywords per tool that, when seen in a recent user message, unlock that
 * tool for the current step. Kept intentionally coarse — false positives
 * (e.g. user says "send regards" and unlocks gmail_send) are preferable
 * to the model wanting to send an email but being blocked.
 */
const UNLOCK_KEYWORDS: Record<PrivilegedTool, RegExp> = {
  gmail_send: /\bsend\b|\bcompose\b|\bdraft\b|\breply\b|\bforward\b|\bemail\b/i,
  gmail_reply: /\breply\b|\brespond\b|\banswer\b|\bget back\b|\bfollow up\b/i,
  gmail_delete: /\bdelete\b|\btrash\b|\barchive\b|\bremove\b/i,
  calendar_create: /\bschedule\b|\bbook\b|\bmeeting\b|\bappointment\b|\bevent\b|\bremind/i,
  calendar_update_event: /\bmove\b|\breschedule\b|\bchange\b|\bupdate\b|\bedit\b|\bshift\b|\bpostpone\b/i,
  calendar_delete_event: /\bcancel\b|\bdelete\b|\bremove\b|\bscrap\b/i,
  docs_create: /\bdoc\b|\bdocument\b|\bwrite\b|\bcreate\b|\bnew\b|\bstart\b|\bdraft\b/i,
  docs_append: /\bappend\b|\badd\b|\bupdate\b|\bwrite\b|\binsert\b|\bdoc\b|\bdocument\b/i,
  sheets_append_row: /\bappend\b|\badd\b|\brow\b|\blog\b|\brecord\b|\bsheet\b|\bspreadsheet\b/i,
  sheets_write_range: /\bwrite\b|\bupdate\b|\boverwrite\b|\bset\b|\bchange\b|\bsheet\b|\bspreadsheet\b/i,
  drive_delete: /\bdelete\b|\bremove\b|\btrash\b/i,
  fs_delete: /\bdelete\b|\bremove\b|\brm\b/i,
  fs_write: /\bwrite\b|\bcreate\b|\bsave\b|\bstore\b|\bupload\b/i,
  run_shell: /\brun\b|\bexecute\b|\bshell\b|\bbash\b|\bcommand\b|\bscript\b/i,
}

/**
 * Compute which tools are active for the current step, given the history
 * and available tool set. Starts from ALL tools, subtracts privileged
 * tools whose keywords don't appear in the last user message AND which
 * haven't been used successfully in earlier steps.
 */
export function computeActiveTools<TOOLS extends ToolSet>(
  allTools: TOOLS,
  messages: ModelMessage[],
  steps: Array<{ toolCalls?: ReadonlyArray<{ toolName: string }> }>,
): Array<keyof TOOLS & string> {
  const allNames = Object.keys(allTools) as Array<keyof TOOLS & string>
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const lastUserText = lastUser
    ? typeof lastUser.content === 'string'
      ? lastUser.content
      : Array.isArray(lastUser.content)
        ? lastUser.content
            .map((p) => (typeof p === 'object' && p && 'text' in p ? String(p.text ?? '') : ''))
            .join(' ')
        : ''
    : ''

  const alreadyUsed = new Set<string>()
  for (const step of steps) {
    for (const tc of step.toolCalls ?? []) {
      alreadyUsed.add(tc.toolName)
    }
  }

  return allNames.filter((name) => {
    if (!PRIVILEGED_TOOLS.includes(name as PrivilegedTool)) return true
    const privileged = name as PrivilegedTool
    if (alreadyUsed.has(privileged)) return true
    return UNLOCK_KEYWORDS[privileged].test(lastUserText)
  })
}
