/**
 * Code Execution Tools — Cloudflare Sandbox
 *
 * Run Python, shell, and JavaScript in isolated Linux containers via the
 * Cloudflare Sandbox SDK (Workers Paid plan). Sandbox is THE Cloudflare-
 * recommended way to safely run untrusted code from agents.
 *
 * Always-present tools — when SANDBOX binding is missing, they return
 * a clear setup message rather than failing silently.
 *
 * @see https://developers.cloudflare.com/sandbox/
 */
import { tool } from 'ai'
import { z } from 'zod'
import { getSandbox, type ExecutionResult, type ExecResult } from '@cloudflare/sandbox'

/** Normalise runCode (CodeInterpreter) output to a flat shape */
function normalizeCodeResult(result: ExecutionResult) {
  return {
    stdout: (result.logs?.stdout || []).join(''),
    stderr: (result.logs?.stderr || []).join(''),
    exitCode: result.error ? 1 : 0,
    error: result.error ? `${result.error.name}: ${result.error.message}` : undefined,
  }
}

/** Normalise exec (shell) output */
function normalizeExecResult(result: ExecResult) {
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode ?? 0,
    success: result.success,
  }
}

interface CodeEnv {
  /** Optional — the Cloudflare Sandbox Durable Object binding */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SANDBOX?: any
}

interface CodeContext {
  env: CodeEnv
  userId: string
}

const SETUP_MESSAGE =
  'Cloudflare Sandbox not configured. Add a SANDBOX Durable Object binding to wrangler.jsonc — see https://developers.cloudflare.com/sandbox/. Requires Workers Paid plan.'

/** Get a per-user sandbox container (persistent across requests for that user). */
function userSandbox(ctx: CodeContext) {
  if (!ctx.env.SANDBOX) throw new Error(SETUP_MESSAGE)
  return getSandbox(ctx.env.SANDBOX, `user-${ctx.userId}`)
}

export function buildCodeTools(ctx: CodeContext) {
  return {
    run_python: tool({
      description: 'Execute Python code in an isolated sandbox container. Has access to common packages (numpy, pandas, requests). Use for data analysis, calculations, or any Python task. Output is captured and returned.',
      inputSchema: z.object({
        code: z.string().describe('Python code to execute'),
        timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
      }),
      execute: async ({ code, timeout = 30 }) => {
        try {
          const sandbox = userSandbox(ctx)
          const result = await sandbox.runCode(code, { language: 'python', timeout: timeout * 1000 })
          return normalizeCodeResult(result)
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    run_shell: tool({
      description: 'Run a shell command in an isolated sandbox container. Use for file operations, package management, or any shell task. Note: runs inside an isolated Linux container, NOT on the host.',
      inputSchema: z.object({
        command: z.string().describe('Shell command to run (e.g. "ls -la", "pip install requests")'),
        cwd: z.string().optional().describe('Working directory (default: /workspace)'),
        timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
      }),
      execute: async ({ command, cwd, timeout = 30 }) => {
        try {
          const sandbox = userSandbox(ctx)
          const result = await sandbox.exec(command, { cwd, timeout: timeout * 1000 })
          return normalizeExecResult(result)
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),

    run_js: tool({
      description: 'Execute JavaScript/TypeScript code in an isolated sandbox (Node.js runtime). Use for scripting, npm packages, or quick data transformation.',
      inputSchema: z.object({
        code: z.string().describe('JavaScript or TypeScript code to execute'),
        timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
      }),
      execute: async ({ code, timeout = 30 }) => {
        try {
          const sandbox = userSandbox(ctx)
          const result = await sandbox.runCode(code, { language: 'javascript', timeout: timeout * 1000 })
          return normalizeCodeResult(result)
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  }
}
