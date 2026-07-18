/**
 * code_mode renderer — the Code Mode pilot's composition tool.
 *
 * Input is the JavaScript block the model wrote; output is
 * `{ result, logs?, error? }` from the isolated dynamic Worker. Show the
 * code (that's the interesting part — what the agent composed), then logs
 * and the returned result.
 */
import { Code } from '@phosphor-icons/react'
import type { ToolRenderer } from './_shared'

interface CodeModeInput {
  code?: string
}

interface CodeModeOutput {
  result?: unknown
  logs?: string[]
  error?: string
}

function toOutput(value: unknown): CodeModeOutput | null {
  if (!value || typeof value !== 'object') return null
  const out = value as CodeModeOutput
  // Sandbox failures travel inside result.error (see server wrapper) —
  // lift them so the renderer treats both shapes the same. Narrow on the
  // wrapper's `hint` field so a legitimate composition result that happens
  // to contain an `error` string isn't misrendered as a failure.
  const res = out.result as { error?: string; hint?: string } | null | undefined
  if (
    !out.error &&
    res &&
    typeof res === 'object' &&
    typeof res.error === 'string' &&
    typeof res.hint === 'string'
  ) {
    return { ...out, error: res.error }
  }
  return out
}

function stringifyResult(result: unknown): string {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

export const codeModeRenderer: ToolRenderer = {
  match: 'code_mode',
  icon: Code,
  displayName: 'Code Mode',
  summary: (output) => {
    const out = toOutput(output)
    if (out?.error) return 'Composition failed'
    return 'Composed tools in one execution'
  },
  expanded: ({ output, input }) => {
    const out = toOutput(output)
    const code = (input as CodeModeInput | undefined)?.code
    return (
      <div className="space-y-2">
        {code && (
          <pre className="max-h-64 overflow-auto rounded-md border bg-surface-recessed p-3 font-mono text-xs whitespace-pre-wrap">
            {code}
          </pre>
        )}
        {out?.logs && out.logs.length > 0 && (
          <div className="rounded-md border bg-card px-3 py-2">
            <div className="text-xs font-medium text-muted-foreground">Logs</div>
            <pre className="mt-1 max-h-40 overflow-auto font-mono text-xs whitespace-pre-wrap">
              {out.logs.join('\n')}
            </pre>
          </div>
        )}
        {out?.error ? (
          <p className="text-xs text-destructive">{out.error}</p>
        ) : out?.result !== undefined ? (
          <pre className="max-h-64 overflow-auto rounded-md border bg-card p-3 font-mono text-xs whitespace-pre-wrap">
            {stringifyResult(out.result)}
          </pre>
        ) : null}
      </div>
    )
  },
}
