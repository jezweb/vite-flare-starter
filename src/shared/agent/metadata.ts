/**
 * Agent metadata — every AutonomousAgent subclass declares one.
 *
 * Surfaces in the routine setup wizard, the routine list/detail
 * pages, the activity log, and anywhere else the agent's identity
 * is shown to a user. Without metadata, UIs fall back to the raw
 * class name (e.g. `AssistantAgent`) — fine for developers, opaque
 * for everyone else.
 *
 * Convention:
 *
 *   class MyAgent extends AutonomousAgent {
 *     static readonly className = 'MyAgent'
 *     static readonly metadata: AgentMetadata = {
 *       displayName: 'My friendly name',
 *       description: 'One sentence — what it does and when to use it.',
 *       category: 'productivity',
 *     }
 *   }
 *
 * The server registry reads each class's static metadata; the
 * /api/agents/registered endpoint serialises the catalogue for
 * client pickers.
 */

export type AgentCategory =
  | 'general'       // does many things — the default chat-style agent
  | 'sweeper'       // scans entities + queues followups
  | 'researcher'    // gathers information
  | 'writer'        // produces prose
  | 'utility'       // alerts, reminders, single-purpose
  | 'meta'          // watches other agents

export interface AgentMetadata {
  /** Friendly name shown to users (e.g. "ChatBot" instead of `AssistantAgent`). */
  displayName: string
  /** One-line "what does this agent do?" surfaced in pickers + cards. */
  description: string
  /**
   * One-line "use this when…" written for the user, not the AI.
   * Surfaces on dormant agent cards + the type picker so a non-technical
   * user can decide which agent fits their need without parsing the
   * persona description.
   *
   * Optional — falls back to `description` when missing, but every
   * shipped agent should set it. Examples:
   *   - "Use for one-off chats, drafting, and quick lookups."
   *   - "Use to scan a list of items (tickets, leads) for anything stuck."
   */
  userPurpose?: string
  /** Grouping for the picker UI. Pickers may render category sections. */
  category: AgentCategory
  /** Optional Lucide icon name (resolved client-side) — defaults vary
   *  by category if omitted. */
  icon?: string
}
