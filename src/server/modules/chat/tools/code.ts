/**
 * Code Execution Tools — Cloudflare Sandbox.
 *
 * Run Python, shell, and JavaScript in isolated Linux containers.
 * Omitted from the toolkit when SANDBOX binding is missing (Workers Paid
 * plan required). @see https://developers.cloudflare.com/sandbox/
 */
import { z } from 'zod'
import { Terminal, FileCode2 } from 'lucide-react'
import { getSandbox, type ExecutionResult, type ExecResult } from '@cloudflare/sandbox'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

function normalizeCodeResult(result: ExecutionResult) {
  return {
    stdout: (result.logs?.stdout || []).join(''),
    stderr: (result.logs?.stderr || []).join(''),
    exitCode: result.error ? 1 : 0,
    error: result.error ? `${result.error.name}: ${result.error.message}` : undefined,
  }
}

function normalizeShellResult(result: ExecResult) {
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode ?? 0,
    success: result.success,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSandboxBinding(ctx: AgentContext): any {
  return (ctx.env as unknown as { SANDBOX?: unknown }).SANDBOX
}

const sandboxAvailable = (ctx: AgentContext) => !!getSandboxBinding(ctx)

function userSandbox(ctx: AgentContext) {
  const binding = getSandboxBinding(ctx)
  if (!binding) throw new Error('Cloudflare Sandbox not configured — SANDBOX binding missing.')
  return getSandbox(binding, `user-${ctx.userId}`)
}

const CodeExecOutput = z.union([
  z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    error: z.string().optional(),
  }),
  z.object({ error: z.string() }),
])

const ShellExecOutput = z.union([
  z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    success: z.boolean(),
  }),
  z.object({ error: z.string() }),
])

export const runPythonDefinition: ToolDefinition<
  { code: string; timeout?: number },
  z.infer<typeof CodeExecOutput>
> = {
  name: 'run_python',
  description:
    'Execute Python code in an isolated sandbox container. Has access to common packages (numpy, pandas, requests). Use for data analysis, calculations, or any Python task. Output is captured and returned.',
  inputSchema: z.object({
    code: z.string().describe('Python code to execute'),
    timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
  }),
  outputSchema: CodeExecOutput,
  isAvailable: sandboxAvailable,
  execute: async ({ code, timeout = 30 }, ctx) => {
    try {
      const sandbox = userSandbox(ctx)
      const result = await sandbox.runCode(code, { language: 'python', timeout: timeout * 1000 })
      return normalizeCodeResult(result)
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: FileCode2, displayName: 'Run Python' },
}

export const runShellDefinition: ToolDefinition<
  { command: string; cwd?: string; timeout?: number },
  z.infer<typeof ShellExecOutput>
> = {
  name: 'run_shell',
  description:
    'Run a shell command in an isolated sandbox container. Use for file operations, package management, or any shell task. Runs inside an isolated Linux container, NOT on the host.',
  inputSchema: z.object({
    command: z.string().describe('Shell command to run (e.g. "ls -la", "pip install requests")'),
    cwd: z.string().optional().describe('Working directory (default: /workspace)'),
    timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
  }),
  outputSchema: ShellExecOutput,
  isAvailable: sandboxAvailable,
  execute: async ({ command, cwd, timeout = 30 }, ctx) => {
    try {
      const sandbox = userSandbox(ctx)
      const result = await sandbox.exec(command, { cwd, timeout: timeout * 1000 })
      return normalizeShellResult(result)
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: Terminal, displayName: 'Run Shell' },
}

export const runJsDefinition: ToolDefinition<
  { code: string; timeout?: number },
  z.infer<typeof CodeExecOutput>
> = {
  name: 'run_js',
  description:
    'Execute JavaScript/TypeScript code in an isolated sandbox (Node.js runtime). Use for scripting, npm packages, or quick data transformation.',
  inputSchema: z.object({
    code: z.string().describe('JavaScript or TypeScript code to execute'),
    timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
  }),
  outputSchema: CodeExecOutput,
  isAvailable: sandboxAvailable,
  execute: async ({ code, timeout = 30 }, ctx) => {
    try {
      const sandbox = userSandbox(ctx)
      const result = await sandbox.runCode(code, {
        language: 'javascript',
        timeout: timeout * 1000,
      })
      return normalizeCodeResult(result)
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  render: { icon: FileCode2, displayName: 'Run JavaScript' },
}

export const codeDefinitions = [
  runPythonDefinition,
  runShellDefinition,
  runJsDefinition,
] as ToolDefinition<unknown, unknown>[]
