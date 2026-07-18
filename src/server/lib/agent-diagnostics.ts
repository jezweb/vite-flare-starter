/**
 * Agent diagnostics — surface the agents SDK's diagnostics_channel events
 * as structured logs.
 *
 * The SDK publishes rich lifecycle events on named Node diagnostics
 * channels (`agents:chat`, `agents:schedule`, `agents:mcp`, …) with ZERO
 * overhead when nothing subscribes. Two ways to consume them:
 *
 *  1. In-worker (this module): subscribe to the incident-shaped subset and
 *     emit one JSON line per event, so `wrangler tail` and Workers Logs
 *     show chat-recovery incidents, stalled streams, transcript repairs,
 *     schedule/MCP failures — with no per-agent code.
 *  2. Tail Worker: in production every published event is ALSO forwarded
 *     automatically via `event.diagnosticsChannelEvents` — a fork that
 *     wants durable observability (D1/analytics) attaches a Tail Worker
 *     and needs nothing from this module.
 *
 * Imported once for side effects from `server/index.ts`; module scope runs
 * once per isolate so there is no double subscription. Requires the
 * `nodejs_compat` family of compatibility flags (already set).
 */
import { subscribe } from 'node:diagnostics_channel'

/** Channels worth watching. Full list: agents/dist/observability. */
const WATCHED_CHANNELS = [
  'agents:chat',
  'agents:transcript',
  'agents:fiber',
  'agents:schedule',
  'agents:mcp',
  'agents:workflow',
] as const

/**
 * Log only incident-shaped events. Substring match (not an exact-type list)
 * so new SDK failure events surface without a code change here; routine
 * volume (turn:start/finish, state syncs) stays out of the logs.
 */
const INCIDENT_MARKERS = [
  'recovery',
  'failed',
  'error',
  'stalled',
  'degraded',
  'repaired',
  'evicted',
  'exhausted',
] as const

/** Payload fields that can carry large content — never log bodies. */
const STRIP_FIELDS = new Set(['partialText', 'partialParts', 'messages', 'chunks'])

type DiagnosticEvent = {
  type?: string
  agent?: string
  name?: string
  payload?: Record<string, unknown>
}

function onEvent(message: unknown): void {
  const event = message as DiagnosticEvent
  const type = typeof event?.type === 'string' ? event.type : ''
  if (!INCIDENT_MARKERS.some((marker) => type.includes(marker))) return

  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event.payload ?? {})) {
    if (STRIP_FIELDS.has(key)) continue
    if (typeof value === 'string' && value.length > 500) continue
    payload[key] = value
  }

  // recovery:completed is good news; everything else that matched is a warn.
  const line = JSON.stringify({
    event: 'agent_diagnostic',
    type,
    agent: event.agent,
    instance: event.name,
    ...payload,
  })
  if (type.endsWith(':completed') || type.endsWith(':repaired')) console.log(line)
  else console.warn(line)
}

for (const channel of WATCHED_CHANNELS) {
  subscribe(channel, onEvent)
}
