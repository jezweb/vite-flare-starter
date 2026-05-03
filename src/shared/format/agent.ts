/**
 * Translate raw agent class names + cadence + outcome / trigger / role
 * enums into friendly labels for the UI.
 *
 * Single source of truth for "what does this enum value mean to a
 * human?" — the alternative is every component inventing its own
 * string. When we add new values, update here and every surface
 * picks up the new label automatically.
 */

/**
 * Format an agent class name into a friendly display name. Pickers
 * pre-resolve via the /api/agents/registered endpoint and pass the
 * registry map in. For one-off cases without the registry (e.g.
 * historical agent_runs rows) the fallback drops the trailing 'Agent'
 * suffix and adds a space before each capital — `MyCustomAgent` →
 * `My Custom`.
 */
export function formatAgentClass(
  className: string,
  registry?: Map<string, { displayName: string }>,
): string {
  const meta = registry?.get(className)
  if (meta) return meta.displayName
  // Well-known non-AutonomousAgent sources of approvals + findings.
  // These are emitted by the platform itself rather than by a registered
  // agent class, so the registry lookup misses them and the fallback
  // would otherwise leak the snake_case enum into the UI.
  switch (className) {
    case 'memory_extraction':
    case 'memory':
      return 'AI memory'
    case 'system':
      return 'system'
  }
  // Snake_case fallback (agentClass arrived as `my_custom_class`).
  if (className.includes('_')) {
    return className
      .replace(/_+/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase())
  }
  // CamelCase fallback (`MyCustomAgent` → `My Custom`).
  return className.replace(/Agent$/, '').replace(/([A-Z])/g, ' $1').trim() || className
}

export function formatOutcome(outcome: string | null | undefined): string {
  switch (outcome) {
    case 'ok': return 'Success'
    case 'error': return 'Error'
    case 'budget_exceeded': return 'Hit cost cap'
    case 'started': return 'Running'
    default: return outcome ?? '—'
  }
}

export function formatTrigger(trigger: string | null | undefined): string {
  switch (trigger) {
    case 'rest': return 'Manual'
    case 'schedule': return 'Scheduled'
    case 'webhook': return 'Webhook'
    case 'inter_agent': return 'via another agent'
    default: return trigger ?? '—'
  }
}

export function formatRole(role: string | null | undefined): string {
  switch (role) {
    case 'owner': return 'Owner'
    case 'admin': return 'Admin'
    case 'member': return 'Member'
    case 'manager': return 'Manager'
    case 'user': return 'Member'
    default: return role ?? '—'
  }
}

export function formatImportance(importance: string | null | undefined): string {
  switch (importance) {
    case 'high': return 'High'
    case 'medium': return 'Medium'
    case 'low': return 'Low'
    default: return importance ?? ''
  }
}

/**
 * Cadence label — used wherever the schedule cadence is rendered to
 * end users. The 1-day case spells out "Once a day" because "every 1d"
 * reads as raw config to non-technical users.
 */
export function formatCadenceInterval(intervalSeconds: number | null | undefined): string {
  if (intervalSeconds == null || intervalSeconds <= 0) return 'on demand'
  const m = intervalSeconds / 60
  if (m < 1) return `every ${intervalSeconds}s`
  if (m < 60) return m === 1 ? 'every minute' : `every ${Math.round(m)} minutes`
  const h = m / 60
  if (h === 1) return 'Hourly'
  if (h < 24) return `Every ${formatNum(h)} hours`
  const d = h / 24
  if (d === 1) return 'Once a day'
  if (d === 7) return 'Once a week'
  return `Every ${formatNum(d)} days`
}

/**
 * "Adjust mode" describes whether the agent can propose its own
 * cadence changes. The raw enum values (`fixed | suggested | auto`)
 * read as opaque to end users — these labels make the behaviour
 * explicit.
 */
export function formatAdjustMode(mode: string | null | undefined): string {
  switch (mode) {
    case 'fixed': return 'Locked to your schedule'
    case 'suggested': return 'AI proposes changes, you review'
    case 'direct': return 'AI tunes itself automatically'
    default: return mode ?? '—'
  }
}

/**
 * Hooks fire after a routine run completes (e.g. summarise, post to a
 * Space). Most routines have none — surface that as plain English
 * rather than the raw `(none)` placeholder.
 */
export function formatHooks(hooks: string[] | null | undefined): string {
  if (!hooks || hooks.length === 0) return 'Nothing extra after each run'
  if (hooks.length === 1) return `Runs "${hooks[0]}" after each run`
  return `Runs ${hooks.length} skills after each run`
}

/**
 * Strip provider prefix + path so `@cf/moonshotai/kimi-k2.6` becomes
 * `kimi-k2.6`. The full id is implementation detail; the friendly tail
 * matches what the model picker shows. Keep the full id available via
 * `title=` on the rendering element.
 */
export function formatModelId(id: string): string {
  return id.split('/').pop() ?? id
}

function formatNum(n: number): string {
  return Math.round(n) === n ? String(n) : n.toFixed(1)
}

/**
 * Auto-derive a slug-safe instance name from a routine name. Used as
 * the default value for the `agentName` field so the user doesn't
 * have to invent a slug every time.
 */
export function deriveInstanceName(routineName: string, userIdSuffix?: string): string {
  const base = routineName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'routine'
  return userIdSuffix ? `${base}-${userIdSuffix.slice(0, 8)}` : base
}
