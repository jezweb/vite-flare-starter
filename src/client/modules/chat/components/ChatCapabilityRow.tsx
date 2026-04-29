/**
 * ChatCapabilityRow — "what your AI can do right now" strip for the
 * chat empty state.
 *
 * Reads three sources in parallel:
 *   - GET /api/google-workspace/status     (native Google connector)
 *   - GET /api/microsoft-workspace/status  (native Microsoft connector)
 *   - GET /api/mcp-connections             (custom MCP connections)
 *   - GET /api/skills/summary              (skill count)
 *
 * Renders one active chip per connected provider plus a count chip for
 * skills. If nothing is connected, falls back to a single inactive
 * prompt chip ("Connect apps to extend chat") so the user always sees
 * the affordance.
 *
 * Each chip is a Link to the relevant settings page so the user can
 * jump straight to wiring up more capabilities.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Mail, FolderOpen, CalendarDays, Plug, Sparkles } from 'lucide-react'
import { CapabilityChip, CapabilityRow } from '@/components/ui/capability-chip'
import { apiClient } from '@/client/lib/api-client'
import { useConnections } from '@/client/modules/connectors/hooks/useConnectors'
import { useSkillSummary } from '@/client/modules/skills/hooks/useSkills'

interface WorkspaceStatus {
  enabled: boolean
  connected: boolean
  email?: string | null
  scopes?: string[]
}

function useGoogleWorkspaceStatus() {
  return useQuery({
    queryKey: ['google-workspace-status'],
    queryFn: () => apiClient.get<WorkspaceStatus>('/api/google-workspace/status'),
    staleTime: 30_000,
  })
}

function useMicrosoftWorkspaceStatus() {
  return useQuery({
    queryKey: ['microsoft-workspace-status'],
    queryFn: () => apiClient.get<WorkspaceStatus>('/api/microsoft-workspace/status'),
    staleTime: 30_000,
  })
}

export function ChatCapabilityRow() {
  const google = useGoogleWorkspaceStatus()
  const microsoft = useMicrosoftWorkspaceStatus()
  const connections = useConnections()
  const skills = useSkillSummary()

  // Native Google: derive product chips from granted scopes so the user
  // sees "Gmail · Drive · Calendar" rather than the generic "Google".
  const googleProducts: Array<{ icon: typeof Mail; label: string }> = []
  if (google.data?.connected) {
    const scopes = google.data.scopes ?? []
    const has = (token: string) => scopes.some((s) => s.includes(token))
    if (has('gmail')) googleProducts.push({ icon: Mail, label: 'Gmail' })
    if (has('drive')) googleProducts.push({ icon: FolderOpen, label: 'Drive' })
    if (has('calendar')) googleProducts.push({ icon: CalendarDays, label: 'Calendar' })
    // Generic fallback if scopes aren't readable
    if (googleProducts.length === 0) {
      googleProducts.push({ icon: Plug, label: 'Google' })
    }
  }

  // Microsoft: do the same, but the scope strings are PascalCase.
  const microsoftProducts: Array<{ icon: typeof Mail; label: string }> = []
  if (microsoft.data?.connected) {
    const scopes = microsoft.data.scopes ?? []
    const has = (token: string) => scopes.some((s) => s.toLowerCase().includes(token))
    if (has('mail')) microsoftProducts.push({ icon: Mail, label: 'Outlook' })
    if (has('files')) microsoftProducts.push({ icon: FolderOpen, label: 'OneDrive' })
    if (has('calendar')) microsoftProducts.push({ icon: CalendarDays, label: 'Calendar' })
    if (microsoftProducts.length === 0) {
      microsoftProducts.push({ icon: Plug, label: 'Microsoft 365' })
    }
  }

  const activeConnections = (connections.data?.connections ?? []).filter(
    (c) => c.status === 'active',
  )
  const skillCount = skills.data?.count ?? 0

  const totalActive =
    googleProducts.length + microsoftProducts.length + activeConnections.length

  // Empty fallback — let the user know they CAN extend chat without
  // burying the affordance under "Connect more" jargon.
  if (totalActive === 0 && skillCount === 0) {
    return (
      <CapabilityRow className="justify-center pt-1">
        <Link to="/dashboard/connections" className="rounded-full hover:opacity-80 transition-opacity">
          <CapabilityChip state="inactive" icon={Plug} label="Connect apps to extend chat" />
        </Link>
      </CapabilityRow>
    )
  }

  return (
    <CapabilityRow className="justify-center pt-1">
      {googleProducts.map((p) => (
        <Link
          key={`g-${p.label}`}
          to="/dashboard/connections"
          className="rounded-full hover:opacity-80 transition-opacity"
        >
          <CapabilityChip icon={p.icon} label={p.label} />
        </Link>
      ))}
      {microsoftProducts.map((p) => (
        <Link
          key={`m-${p.label}`}
          to="/dashboard/connections"
          className="rounded-full hover:opacity-80 transition-opacity"
        >
          <CapabilityChip icon={p.icon} label={p.label} />
        </Link>
      ))}
      {activeConnections.map((c) => (
        <Link
          key={c.id}
          to="/dashboard/connections"
          className="rounded-full hover:opacity-80 transition-opacity"
        >
          <CapabilityChip icon={Plug} label={c.displayName} />
        </Link>
      ))}
      {skillCount > 0 && (
        <Link
          to="/dashboard/skills"
          className="rounded-full hover:opacity-80 transition-opacity"
        >
          <CapabilityChip
            state="count"
            icon={Sparkles}
            label={`${skillCount} ${skillCount === 1 ? 'skill' : 'skills'}`}
          />
        </Link>
      )}
    </CapabilityRow>
  )
}
