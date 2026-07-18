/**
 * Site Tools — live multi-file site previews from the conversation sandbox.
 *
 * The capability tier above artifacts (#40 workspace): an artifact is ONE
 * self-contained document rendered client-side; a SITE is a real project in
 * the conversation's sandbox container — multiple files, npm installs,
 * build steps, a dev server — exposed on a public preview URL.
 *
 * Flow the agent follows: scaffold files with run_shell / sandbox writes,
 * then `site_serve` starts (or restarts) the server as a background
 * process, waits for the port, and opens a Cloudflare **quick tunnel**
 * (`https://<random>.trycloudflare.com`) to it. Quick tunnels need no DNS
 * or zone setup, so previews work from a bare workers.dev deploy. Custom-
 * domain forks can upgrade to same-domain preview URLs via
 * `sandbox.exposePort()` + `proxyToSandbox()` (needs wildcard DNS) — see
 * docs/AGENT_TOOLKIT.md §Sites.
 *
 * Lifecycle notes: the tunnel URL is public-but-unguessable and dies with
 * the container (~10 min idle sleep) — a preview, not a deployment. The
 * server process uses a deterministic id per port so re-serving after
 * edits restarts cleanly instead of stacking processes.
 */
import { z } from 'zod'
import { getSandbox } from '@cloudflare/sandbox'
import { Globe, Prohibit } from '@phosphor-icons/react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'
import { sandboxIdFor } from '@/server/lib/sandbox-id'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSandboxBinding(ctx: AgentContext): any {
  return (ctx.env as unknown as { SANDBOX?: unknown }).SANDBOX
}

const sandboxAvailable = (ctx: AgentContext) => {
  if ((ctx.env as Record<string, unknown>)['VITE_FEATURE_SANDBOX'] === 'false') return false
  return !!getSandboxBinding(ctx)
}

/** Same per-(user, conversation) sandbox as the code tools — shared workspace. */
async function sandboxFor(ctx: AgentContext) {
  const binding = getSandboxBinding(ctx)
  if (!binding) throw new Error('Cloudflare Sandbox not configured — SANDBOX binding missing.')
  return getSandbox(binding, await sandboxIdFor(ctx.userId, ctx.conversationId))
}

const processIdFor = (port: number) => `site-${port}`

const ServeSiteInput = z.object({
  port: z.number().int().min(1024).max(65535).describe('Port the server listens on (e.g. 8000)'),
  command: z
    .string()
    .max(500)
    .optional()
    .describe(
      'Server command. Default serves ./site statically. For an app with a dev server use e.g. "npm run dev -- --port 3000 --host". Must bind 0.0.0.0.'
    ),
  cwd: z
    .string()
    .max(200)
    .optional()
    .describe('Working directory for the command (default /workspace/site)'),
})

const ServeSiteOutput = z.union([
  z.object({
    _site: z.literal(true),
    url: z.string(),
    port: z.number(),
    processId: z.string(),
    command: z.string(),
    note: z.string().optional(),
  }),
  z.object({ error: z.string(), logs: z.string().optional() }),
])

export const serveSiteDefinition: ToolDefinition<
  z.infer<typeof ServeSiteInput>,
  z.infer<typeof ServeSiteOutput>
> = {
  name: 'site_serve',
  description: `Serve a website/app from the conversation sandbox on a PUBLIC preview URL. Use after building a multi-file site in the sandbox (via run_shell — write files under /workspace/site). Starts the server as a background process, waits for the port, and returns an https preview link the user can open and share.

Default (no command): statically serves /workspace/site with python3 http.server — right for plain HTML/CSS/JS sites, no install needed. For framework apps, pass the dev-server command (bind 0.0.0.0).

Re-run after edits: static sites reflect changes immediately; dev servers hot-reload; a changed command/port restarts cleanly. The URL is temporary — it lives while the sandbox is warm (~10 min idle). For content that should persist, artifacts or Files are the durable options.`,
  inputSchema: ServeSiteInput,
  outputSchema: ServeSiteOutput,
  isAvailable: sandboxAvailable,
  execute: async ({ port, command, cwd }, ctx) => {
    try {
      const sandbox = await sandboxFor(ctx)
      const workDir = cwd?.startsWith('/workspace') ? cwd : '/workspace/site'
      const cmd = command ?? `python3 -m http.server ${port} --bind 0.0.0.0 --directory ${workDir}`
      const processId = processIdFor(port)

      await sandbox.exec(`mkdir -p ${workDir}`, { timeout: 5000 })

      // Idempotent restart: kill any previous server on this port first.
      try {
        const existing = await sandbox.getProcess(processId)
        if (existing) await sandbox.killProcess(processId)
      } catch {
        /* no previous process */
      }

      const proc = await sandbox.startProcess(cmd, { processId, cwd: workDir })
      try {
        await proc.waitForPort(port, { mode: 'tcp', timeout: 30_000 })
      } catch {
        const logs = await sandbox
          .getProcessLogs(processId)
          .then((l) => `${l.stdout}\n${l.stderr}`.trim())
          .catch(() => '')
        return {
          error: `Server did not start listening on port ${port} within 30s. Check the command binds 0.0.0.0:${port}.`,
          ...(logs ? { logs: logs.slice(-2000) } : {}),
        }
      }

      const tunnel = await sandbox.tunnels.get(port)
      return {
        _site: true,
        url: tunnel.url,
        port,
        processId,
        command: cmd,
        note: 'Temporary preview — lives while the sandbox is warm. Re-run site_serve to revive after idle; the URL may change.',
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: {
    icon: Globe,
    displayName: 'Serve Site',
    summary: (output) => {
      const o = output as { url?: string; port?: number; error?: string }
      if (o?.error) return 'failed'
      return o?.url ? `${o.url}` : null
    },
  },
}

const StopSiteInput = z.object({
  port: z.number().int().min(1024).max(65535).describe('Port of the running site to stop'),
})

const StopSiteOutput = z.union([
  z.object({ stopped: z.literal(true), port: z.number() }),
  z.object({ error: z.string() }),
])

export const stopSiteDefinition: ToolDefinition<
  z.infer<typeof StopSiteInput>,
  z.infer<typeof StopSiteOutput>
> = {
  name: 'site_stop',
  description:
    'Stop a running site preview: kills the server process and closes its public tunnel. Use when the user is done with a preview or before serving something different on the same port.',
  inputSchema: StopSiteInput,
  outputSchema: StopSiteOutput,
  isAvailable: sandboxAvailable,
  execute: async ({ port }, ctx) => {
    try {
      const sandbox = await sandboxFor(ctx)
      await sandbox.tunnels.destroy(port).catch(() => undefined)
      await sandbox.killProcess(processIdFor(port)).catch(() => undefined)
      return { stopped: true, port }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Prohibit, displayName: 'Stop Site' },
}

export const siteDefinitions = [serveSiteDefinition, stopSiteDefinition] as ToolDefinition<
  unknown,
  unknown
>[]
