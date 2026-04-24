/**
 * Per-user connector settings — read + write helpers.
 *
 * Contract:
 *   - `getAllowedConnectorTools(env, userId)` returns a Set<string> of
 *     tool names the user has opted-in to. Pass this to the agent toolkit
 *     builder to filter connector tools out of the final tool list.
 *   - Non-connector tools (core, memory, skills, etc.) are never subject
 *     to this filter — they're always ALLOWED.
 *   - If a user has no settings row for a given provider, the provider's
 *     `defaultEnabledTools` apply. That means first-time users don't have
 *     to click anything — they get the sensible read-only subset.
 */
import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { userConnectorSettings } from './db/schema'
import {
  CONNECTOR_PROVIDERS,
  TOOL_TO_PROVIDER,
  getProvider,
  type ConnectorProvider,
} from '@/shared/config/connector-providers'

export interface ConnectorSettingsEnv {
  DB: D1Database
}

/**
 * Returns the set of connector tool names the user has enabled.
 * Non-connector tools (built-ins) are NOT in this set — callers should
 * pass a tool through untouched if `TOOL_TO_PROVIDER[name]` is undefined.
 */
export async function getAllowedConnectorTools(
  env: ConnectorSettingsEnv,
  userId: string,
): Promise<Set<string>> {
  const db = drizzle(env.DB)
  const rows = await db
    .select()
    .from(userConnectorSettings)
    .where(eq(userConnectorSettings.userId, userId))

  // Index rows by connectorId for O(1) lookup.
  const settingsByProvider = new Map(rows.map((r) => [r.connectorId, r]))

  const allowed = new Set<string>()
  for (const provider of CONNECTOR_PROVIDERS) {
    const row = settingsByProvider.get(provider.id)
    // No settings row → defaults apply (provider enabled, default tools on).
    if (!row) {
      for (const tool of provider.defaultEnabledTools) allowed.add(tool)
      continue
    }
    // Master switch off → skip entire provider.
    if (!row.enabled) continue
    // Custom enabled list if set, else defaults.
    const customList = row.enabledToolsJson
      ? (safeParseArray(row.enabledToolsJson) ?? provider.defaultEnabledTools)
      : provider.defaultEnabledTools
    for (const tool of customList) {
      // Defensive: drop names that aren't in the provider's declared set
      // (e.g. from a renamed tool on a prior version).
      if (provider.toolNames.includes(tool)) allowed.add(tool)
    }
  }
  return allowed
}

/**
 * Apply the user's connector filter to a list of tool definitions.
 * Tools not associated with any connector (core, memory, etc.) pass
 * through unchanged. Connector tools are kept only if in `allowed`.
 */
export function filterToolsByUserSettings<T extends { name: string }>(
  tools: T[],
  allowed: Set<string>,
): T[] {
  return tools.filter((t) => {
    const providerId = TOOL_TO_PROVIDER[t.name]
    if (!providerId) return true // not a connector tool → always pass
    return allowed.has(t.name)
  })
}

/**
 * Get the user's settings for a specific provider, merging defaults for
 * missing/partial rows. Used by the per-provider management UI.
 */
export async function getProviderSettings(
  env: ConnectorSettingsEnv,
  userId: string,
  connectorId: string,
): Promise<{
  enabled: boolean
  enabledTools: string[]
  providerDefault: boolean
}> {
  const provider = getProvider(connectorId)
  if (!provider) {
    return { enabled: false, enabledTools: [], providerDefault: true }
  }
  const db = drizzle(env.DB)
  const [row] = await db
    .select()
    .from(userConnectorSettings)
    .where(
      and(
        eq(userConnectorSettings.userId, userId),
        eq(userConnectorSettings.connectorId, connectorId),
      ),
    )
    .limit(1)
  if (!row) {
    return {
      enabled: true,
      enabledTools: [...provider.defaultEnabledTools],
      providerDefault: true,
    }
  }
  return {
    enabled: row.enabled,
    enabledTools: row.enabledToolsJson
      ? (safeParseArray(row.enabledToolsJson) ?? [...provider.defaultEnabledTools])
      : [...provider.defaultEnabledTools],
    providerDefault: false,
  }
}

/**
 * Upsert the user's settings for a provider. Used by the manage-tools UI.
 * Validates that enabledTools is a subset of the provider's declared tools.
 */
export async function updateProviderSettings(
  env: ConnectorSettingsEnv,
  userId: string,
  connectorId: string,
  patch: { enabled?: boolean; enabledTools?: string[] },
): Promise<void> {
  const provider = getProvider(connectorId)
  if (!provider) throw new Error(`Unknown connector: ${connectorId}`)

  // Sanitise: only keep names that are declared by the provider.
  const validTools = patch.enabledTools?.filter((t) => provider.toolNames.includes(t))

  const db = drizzle(env.DB)
  await db
    .insert(userConnectorSettings)
    .values({
      userId,
      connectorId,
      enabled: patch.enabled ?? true,
      enabledToolsJson: validTools ? JSON.stringify(validTools) : null,
    })
    .onConflictDoUpdate({
      target: [userConnectorSettings.userId, userConnectorSettings.connectorId],
      set: {
        ...(patch.enabled != null ? { enabled: patch.enabled } : {}),
        ...(validTools ? { enabledToolsJson: JSON.stringify(validTools) } : {}),
        updatedAt: new Date(),
      },
    })
}

function safeParseArray(json: string): string[] | null {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null
  } catch {
    return null
  }
}

export { TOOL_TO_PROVIDER, CONNECTOR_PROVIDERS }
export type { ConnectorProvider }
