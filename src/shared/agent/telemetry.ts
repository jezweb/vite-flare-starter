/**
 * TelemetrySink — pluggable observability surface for the agent runtime.
 *
 * Every tool call and agent step fires through this interface. Fork authors
 * can plug in D1 writes, console logging, external OTEL exporters, or the
 * no-op impl for tests / early prototyping.
 *
 * Kept as an interface (rather than a concrete class) so Phase B's richer
 * D1-backed sink can be swapped in without changing any tool code.
 */
export interface TelemetryToolEvent {
  /** Canonical tool name (e.g. "gmail_search") */
  name: string
  /** Wall-clock duration from execute() entry to resolve/reject. */
  durationMs: number
  /** `true` if execute() resolved, `false` if it threw. */
  ok: boolean
  /** String form of the thrown error if `ok === false`. */
  error?: string
  /** Approx serialized bytes of input (optional — populated by the adapter). */
  inputSize?: number
  /** Approx serialized bytes of output. */
  outputSize?: number
}

export interface TelemetryStepEvent {
  /** Zero-indexed step number inside the agent loop. */
  index: number
  inputTokens?: number
  outputTokens?: number
  finishReason?: string
}

export interface TelemetrySink {
  recordTool(event: TelemetryToolEvent): void | Promise<void>
  recordStep(event: TelemetryStepEvent): void | Promise<void>
}

/** No-op sink — safe default for tests and early bootstrapping. */
export const nullTelemetry: TelemetrySink = {
  recordTool: () => {},
  recordStep: () => {},
}
