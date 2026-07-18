/**
 * Sandbox chat tools — run_python + generate_document (#106).
 *
 * Unit tests with a mocked @cloudflare/sandbox binding: input validation
 * (50KB cap, path traversal), R2 key ownership guarding (isOwnedR2Key),
 * artifact harvest to the caller's FILES prefix, and availability gating.
 * The real container path is post-deploy verification (needs Docker +
 * a deployed containers block) — see docs/AGENT_TOOLKIT.md.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AgentContext } from '@/shared/agent'

const { mockSandbox, mockGetSandbox } = vi.hoisted(() => {
  const mockSandbox = {
    runCode: vi.fn(),
    exec: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    mkdir: vi.fn(),
  }
  return { mockSandbox, mockGetSandbox: vi.fn(() => mockSandbox) }
})

vi.mock('@cloudflare/sandbox', () => ({
  getSandbox: mockGetSandbox,
}))

import {
  runPythonDefinition,
  generateDocumentDefinition,
} from '@/server/modules/chat/tools/code'

const ME = 'user-me'

function makeBucket(objects: Record<string, Uint8Array> = {}) {
  const store = new Map(Object.entries(objects))
  const puts: { key: string; value: unknown }[] = []
  return {
    puts,
    async get(key: string) {
      const bytes = store.get(key)
      if (!bytes) return null
      return {
        size: bytes.length,
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      }
    },
    async put(key: string, value: unknown) {
      puts.push({ key, value })
      return {}
    },
  }
}

function makeCtx(env: Record<string, unknown>): AgentContext {
  return {
    env,
    userId: ME,
    user: { id: ME, email: 'me@test.local', role: 'user' },
    conversationId: 'conv-1',
    model: { id: 'test', provider: 'other', supportsVision: false, supportsTools: true },
    telemetry: { recordTool: async () => {} },
  } as unknown as AgentContext
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSandbox.runCode.mockResolvedValue({ logs: { stdout: ['ok\n'], stderr: [] } })
  mockSandbox.exec.mockResolvedValue({ stdout: 'wrote', stderr: '', exitCode: 0, success: true })
  mockSandbox.readFile.mockResolvedValue({ content: btoa('artifact-bytes') })
  mockSandbox.writeFile.mockResolvedValue(undefined)
  mockSandbox.mkdir.mockResolvedValue(undefined)
})

describe('availability gating', () => {
  it('run_python unavailable without SANDBOX binding', () => {
    expect(runPythonDefinition.isAvailable!(makeCtx({}))).toBe(false)
  })

  it('run_python available with SANDBOX binding', () => {
    expect(runPythonDefinition.isAvailable!(makeCtx({ SANDBOX: {} }))).toBe(true)
  })

  it('VITE_FEATURE_SANDBOX=false disables even with the binding', () => {
    expect(
      runPythonDefinition.isAvailable!(makeCtx({ SANDBOX: {}, VITE_FEATURE_SANDBOX: 'false' }))
    ).toBe(false)
  })

  it('generate_document additionally requires FILES', () => {
    expect(generateDocumentDefinition.isAvailable!(makeCtx({ SANDBOX: {} }))).toBe(false)
    expect(
      generateDocumentDefinition.isAvailable!(makeCtx({ SANDBOX: {}, FILES: makeBucket() }))
    ).toBe(true)
  })
})

describe('run_python guards', () => {
  it('refuses code over 50KB without touching the sandbox', async () => {
    const ctx = makeCtx({ SANDBOX: {} })
    const out = await runPythonDefinition.execute(
      { code: 'x'.repeat(50 * 1024 + 1) },
      ctx
    )
    expect(out).toHaveProperty('error')
    expect((out as { error: string }).error).toContain('50KB')
    expect(mockSandbox.runCode).not.toHaveBeenCalled()
  })

  it("rejects staging another tenant's R2 key before any sandbox/R2 access", async () => {
    const bucket = makeBucket({ 'users/user-victim/data.csv': new Uint8Array([1]) })
    const ctx = makeCtx({ SANDBOX: {}, FILES: bucket })
    const out = await runPythonDefinition.execute(
      { code: 'print(1)', files: [{ r2Key: 'users/user-victim/data.csv' }] },
      ctx
    )
    expect(out).toHaveProperty('error')
    expect((out as { error: string }).error).toContain('own storage prefix')
    expect(mockSandbox.writeFile).not.toHaveBeenCalled()
    expect(mockSandbox.runCode).not.toHaveBeenCalled()
  })

  it('rejects traversal in staged keys and output paths', async () => {
    const ctx = makeCtx({ SANDBOX: {}, FILES: makeBucket() })
    const traversalKey = await runPythonDefinition.execute(
      { code: 'print(1)', files: [{ r2Key: `../users/user-victim/x.csv` }] },
      ctx
    )
    expect(traversalKey).toHaveProperty('error')

    const traversalOut = await runPythonDefinition.execute(
      { code: 'print(1)', outputs: ['../../etc/passwd'] },
      ctx
    )
    expect(traversalOut).toHaveProperty('error')
    expect((traversalOut as { error: string }).error).toContain('/workspace')
    expect(mockSandbox.runCode).not.toHaveBeenCalled()
  })

  it('rejects absolute output paths outside /workspace', async () => {
    const ctx = makeCtx({ SANDBOX: {}, FILES: makeBucket() })
    const out = await runPythonDefinition.execute(
      { code: 'print(1)', outputs: ['/etc/passwd'] },
      ctx
    )
    expect(out).toHaveProperty('error')
  })
})

describe('run_python staging + harvest', () => {
  it('stages owned files (relative key accepted) and harvests artifacts under the user prefix', async () => {
    const csv = new TextEncoder().encode('a,b\n1,2\n')
    const bucket = makeBucket({ [`users/${ME}/reports/data.csv`]: csv })
    const ctx = makeCtx({ SANDBOX: {}, FILES: bucket })

    const out = await runPythonDefinition.execute(
      {
        code: 'print("ok")',
        files: [{ r2Key: 'reports/data.csv' }], // relative → scoped to users/<me>/
        outputs: ['result.csv'],
      },
      ctx
    )

    // Terminal shape preserved (stdout/stderr strings + exitCode number).
    expect(out).toMatchObject({ stdout: 'ok\n', stderr: '', exitCode: 0 })

    // Staged into /workspace/inputs/<basename>, binary-safe write.
    const shaped = out as {
      staged?: { r2Key: string; path: string }[]
      artifacts?: { name: string; r2Key: string; size: number }[]
    }
    expect(shaped.staged).toEqual([
      { r2Key: `users/${ME}/reports/data.csv`, path: '/workspace/inputs/data.csv' },
    ])
    expect(mockSandbox.writeFile).toHaveBeenCalledWith(
      '/workspace/inputs/data.csv',
      expect.any(String),
      { encoding: 'base64' }
    )

    // Harvested artifact lands under the caller's prefix in FILES.
    expect(shaped.artifacts).toHaveLength(1)
    expect(shaped.artifacts![0].name).toBe('result.csv')
    expect(shaped.artifacts![0].r2Key.startsWith(`users/${ME}/sandbox/`)).toBe(true)
    expect(shaped.artifacts![0].size).toBeGreaterThan(0)
    expect(bucket.puts).toHaveLength(1)
    expect(bucket.puts[0].key).toBe(shaped.artifacts![0].r2Key)
  })

  it('missing harvest output becomes a warning, not a failure', async () => {
    mockSandbox.readFile.mockRejectedValueOnce(new Error('no such file'))
    const ctx = makeCtx({ SANDBOX: {}, FILES: makeBucket() })
    const out = await runPythonDefinition.execute(
      { code: 'print(1)', outputs: ['missing.png'] },
      ctx
    )
    expect(out).toMatchObject({ exitCode: 0 })
    expect((out as { warnings?: string[] }).warnings?.[0]).toContain('missing.png')
    expect((out as { artifacts?: unknown[] }).artifacts).toBeUndefined()
  })

  it('uses a conversation-scoped, DNS-safe sandbox id', async () => {
    // Derived (hashed) id, not raw concatenation: the SDK caps ids at 63
    // DNS-shaped chars, and better-auth userIds are mixed-case — the raw
    // `user-…-conv-…` form threw INVALID_SANDBOX_ID_LENGTH in production.
    const ctx = makeCtx({ SANDBOX: {} })
    await runPythonDefinition.execute({ code: 'print(1)' }, ctx)
    const id = mockGetSandbox.mock.calls[0]![1] as string
    expect(id).toMatch(/^sb-u[0-9a-f]{16}-c[0-9a-f]{16}$/)
    expect(id.length).toBeLessThanOrEqual(63)

    // Deterministic: same (user, conversation) → same sandbox.
    mockGetSandbox.mockClear()
    await runPythonDefinition.execute({ code: 'print(2)' }, ctx)
    expect(mockGetSandbox.mock.calls[0]![1]).toBe(id)
  })
})

describe('generate_document', () => {
  it('refuses markdown over 50KB', async () => {
    const ctx = makeCtx({ SANDBOX: {}, FILES: makeBucket() })
    const out = await generateDocumentDefinition.execute(
      { markdown: 'x'.repeat(50 * 1024 + 1), format: 'docx' },
      ctx
    )
    expect(out).toHaveProperty('error')
    expect(mockSandbox.exec).not.toHaveBeenCalled()
  })

  it('generates, harvests, and sanitises the filename', async () => {
    const bucket = makeBucket()
    const ctx = makeCtx({ SANDBOX: {}, FILES: bucket })
    const out = await generateDocumentDefinition.execute(
      { markdown: '# Report\n\nHello', format: 'xlsx', filename: 'My Q3 Report!!' },
      ctx
    )
    const shaped = out as {
      format: string
      artifacts: { name: string; r2Key: string }[]
      summary: string
    }
    expect(shaped.format).toBe('xlsx')
    expect(shaped.artifacts[0].name).toBe('My-Q3-Report.xlsx')
    expect(shaped.artifacts[0].r2Key.startsWith(`users/${ME}/sandbox/`)).toBe(true)
    expect(bucket.puts).toHaveLength(1)
    // exec ran the baked generator against sanitised paths only
    const cmd = mockSandbox.exec.mock.calls[0][0] as string
    expect(cmd).toContain('generate.py xlsx')
    expect(cmd).toContain('/workspace/.docgen/out/My-Q3-Report.xlsx')
  })

  it('surfaces generator failure with stderr tail', async () => {
    mockSandbox.exec.mockResolvedValueOnce({
      stdout: '',
      stderr: 'ModuleNotFoundError: docx',
      exitCode: 1,
      success: false,
    })
    const ctx = makeCtx({ SANDBOX: {}, FILES: makeBucket() })
    const out = await generateDocumentDefinition.execute(
      { markdown: '# X', format: 'docx' },
      ctx
    )
    expect(out).toHaveProperty('error')
    expect((out as { stderr?: string }).stderr).toContain('ModuleNotFoundError')
  })
})
