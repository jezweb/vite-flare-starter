/**
 * ElevenLabs Voice Agent Configuration
 *
 * Multi-agent architecture supporting:
 * - Dashboard agents for authenticated users with CRM context
 * - Public agents for visitors on marketing/support pages
 *
 * Configure agent IDs in .dev.vars:
 *   VITE_ELEVENLABS_DASHBOARD_AGENT_ID=agent_xxxx
 *   VITE_ELEVENLABS_PUBLIC_AGENT_ID=agent_yyyy
 */

export interface VoiceAgentConfig {
  /** Agent ID from ElevenLabs */
  id: string
  /** Display name for the agent */
  name: string
  /** Where this agent should appear */
  location: 'dashboard' | 'public' | 'both'
  /** Optional: restrict to specific page paths */
  pages?: string[]
  /** Widget position */
  position?: 'bottom-right' | 'bottom-left'
  /** Optional theme overrides */
  theme?: {
    primaryColor?: string
    backgroundColor?: string
  }
}

/**
 * Configured voice agents
 * Add more agents here as needed
 */
export const voiceAgents: Record<string, VoiceAgentConfig> = {
  dashboard: {
    id: import.meta.env['VITE_ELEVENLABS_DASHBOARD_AGENT_ID'] || '',
    name: 'CRM Assistant',
    location: 'dashboard',
    position: 'bottom-right',
  },
  public: {
    id: import.meta.env['VITE_ELEVENLABS_PUBLIC_AGENT_ID'] || '',
    name: 'Customer Support',
    location: 'public',
    position: 'bottom-right',
  },
}

/**
 * Get the appropriate agent for a given location
 *
 * @param pathname - Current route pathname
 * @param isAuthenticated - Whether user is logged in
 * @returns Agent config or null if no agent should be shown
 */
export function getAgentForLocation(
  pathname: string,
  isAuthenticated: boolean
): VoiceAgentConfig | null {
  const isDashboard = pathname.startsWith('/dashboard')

  // Dashboard pages: show dashboard agent for authenticated users
  if (isDashboard && isAuthenticated) {
    const agent = voiceAgents['dashboard']
    // Only return if agent ID is configured
    if (agent && agent.id) {
      return agent
    }
  }

  // Public pages (not dashboard): show public agent
  if (!isDashboard) {
    const agent = voiceAgents['public']
    // Only return if agent ID is configured
    if (agent && agent.id) {
      return agent
    }
  }

  return null
}

/**
 * Check if any voice agent is configured
 * Useful for conditional rendering
 */
export function hasVoiceAgentConfigured(): boolean {
  return Object.values(voiceAgents).some((agent) => agent.id)
}
