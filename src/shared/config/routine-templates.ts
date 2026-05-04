/**
 * Routine templates — curated starting points the user can fork.
 *
 * These power both:
 *   - The Templates section on NewRoutinePage (pre-fills the form,
 *     user reviews + saves)
 *   - The legacy `POST /api/routines/seed-examples` bulk-create
 *     endpoint (one click → all templates land disabled)
 *
 * A template is everything you'd type into NewRoutinePage. The agent
 * name slug is derived per-user; we expose `agentNameSlug` instead of
 * a literal `agentName` so the server can stamp the user id onto it.
 *
 * Add new templates here — both surfaces pick them up automatically.
 */

export interface RoutineTemplate {
  /** Stable id for the template (used as the React key). */
  id: string
  /** Card-level emoji/icon for glanceability. */
  emoji: string
  /** Display name shown on the picker card AND used as the routine name. */
  name: string
  /** Short tagline for the picker card (one line). */
  tagline: string
  /** Long-form description seeded into the routine's `description` field. */
  description: string
  /** AutonomousAgent class to drive this routine. */
  agentClass: string
  /**
   * Stable slug for the agent's DO name. The server appends the first
   * 8 chars of the user id so two users can run the same template
   * without colliding (`routine-health-${userId.slice(0, 8)}`).
   */
  agentNameSlug: string
  /** Schedule cadence in seconds. */
  baseInterval: number
  /** Adjust mode — see ADJUST_MODES in NewRoutinePage. */
  adjustMode: 'suggested' | 'direct' | 'fixed'
  /** Whether the routine starts running immediately on create. */
  defaultEnabled: boolean
  /** Instructions injected each fire (the agent's input prompt). */
  inputText: string
  /** Skills the agent loads on each fire. */
  skillsLoaded: string[]
  /** Tools the agent is allowed to call (empty = all). */
  toolsAllowed: string[]
  /** Optional skill to run at SessionEnd to summarise the run. */
  sessionEndSkill: string | null
  /**
   * Optional local-hour gate (0-23). When set, the scheduler only fires
   * this routine when the user's local hour (resolved via their stored
   * timezone) matches this value. Null/undefined = no gate. Goanna slice 6.
   */
  localFireHour?: number | null
}

/**
 * Order matters — first-time users see this list when creating their
 * first routine. Lead with templates that produce immediate user value
 * (Morning brief), then concrete examples (YouTube digest), and place
 * platform-meta tools (Routine health) last so they don't dominate the
 * first impression for someone who has nothing to monitor yet.
 */
export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: 'morning-brief',
    emoji: '☀️',
    name: 'Morning brief',
    tagline: 'Pulls inbox + calendar each morning into a focused brief.',
    description:
      "Each weekday morning, surveys your inbox + calendar and produces a three-paragraph daily focus brief. Runs the morning-brief skill which knows how to weigh urgency vs noise.",
    agentClass: 'AssistantAgent',
    agentNameSlug: 'morning-brief',
    baseInterval: 24 * 60 * 60,
    adjustMode: 'fixed',
    defaultEnabled: false,
    inputText:
      "It's morning. Run the morning-brief skill against my inbox and calendar for today. Emit one inbox_add finding with the brief.",
    skillsLoaded: ['morning-brief'],
    toolsAllowed: ['inbox_add', 'gmail_search', 'calendar_events'],
    sessionEndSkill: null,
    localFireHour: 7,
  },
  {
    id: 'reflect-daily',
    emoji: '🪞',
    name: 'Daily reflection',
    tagline: 'Each evening, distil the day into findings + a 1-paragraph summary.',
    description:
      "Adapted from goanna's reflect cycle. At the end of each day, your assistant agent surveys the day's agent_runs and recent findings, decides which patterns to promote / dismiss / leave open, files anything new it noticed, and writes a one-paragraph summary. Builds a wiki of patterns over time without you having to remember to journal.",
    agentClass: 'AssistantAgent',
    agentNameSlug: 'reflect-daily',
    baseInterval: 24 * 60 * 60,
    adjustMode: 'fixed',
    defaultEnabled: false,
    inputText:
      "Run the reflect skill. Survey my recent agent_runs (last 24h) and findings (last 7 days), decide what graduates / dismisses / stays open, and file anything new you noticed today. End with a one-paragraph summary as the SessionEnd output.",
    skillsLoaded: ['reflect'],
    toolsAllowed: [
      'record_finding',
      'promote_finding',
      'dismiss_finding',
      'entity_list',
      'recall',
      'search_memory',
    ],
    sessionEndSkill: 'reflect',
    localFireHour: 22,
  },
  {
    id: 'librarian-weekly',
    emoji: '📚',
    name: 'Librarian — weekly curation',
    tagline: 'Cross-pollinates learnings across all your agents into a shared knowledge note.',
    description:
      "Adapted from goanna's coaching/curation review. Each Sunday evening, your assistant agent acts as the librarian — reads recent learnings across ALL your agents, identifies cross-cutting patterns, and promotes stable ones into shared knowledge entities (notes prefixed [Librarian]). Posts a weekly digest into your Inbox. Pair with the daily reflection routine for the full goanna pipeline.",
    agentClass: 'AssistantAgent',
    agentNameSlug: 'librarian-weekly',
    baseInterval: 7 * 24 * 60 * 60,
    adjustMode: 'fixed',
    defaultEnabled: false,
    inputText:
      "Run the librarian-curate skill. Survey learnings across all my agents from the last 7 days. Identify cross-cutting patterns and promote stable ones into shared knowledge entities (entityType note, [Librarian] prefix). Post one weekly digest to my Inbox. End with a 2-3 sentence SessionEnd summary.",
    skillsLoaded: ['librarian-curate'],
    toolsAllowed: ['entity_list', 'entity_create', 'inbox_add'],
    sessionEndSkill: null,
    localFireHour: 18,
  },
  {
    id: 'youtube-digest',
    emoji: '📺',
    name: 'YouTube digest (example)',
    tagline: 'Watches a Chat space for YouTube links + summarises them.',
    description:
      'Watches a Google Chat space for YouTube links, fetches transcripts, summarises, and posts back. Wire your own Google Chat connector + space id to use it.',
    agentClass: 'AssistantAgent',
    agentNameSlug: 'youtube-digest',
    baseInterval: 6 * 60 * 60,
    adjustMode: 'suggested',
    defaultEnabled: false,
    inputText:
      'Look at the last 24h of messages in my designated Google Chat space. For any YouTube links, fetch the transcript, write a 3-bullet summary, post it back to the space, and emit an inbox_add finding for me with the summary.',
    skillsLoaded: ['summarise-url', 'route-finding'],
    toolsAllowed: [],
    sessionEndSkill: 'route-finding',
  },
  {
    id: 'routine-health',
    emoji: '🩺',
    name: 'Routine health (meta)',
    tagline: 'Daily watcher that scans every other routine for issues.',
    description:
      "Daily watcher that scans every other routine for error rates, drift, and runaway cost. Surfaces issues into your Inbox so you don't have to remember to check.",
    agentClass: 'AssistantAgent',
    agentNameSlug: 'routine-health',
    baseInterval: 24 * 60 * 60,
    adjustMode: 'fixed',
    defaultEnabled: false,
    inputText:
      'Run a routine health check. Look at the recent runs of all my routines and emit inbox_add findings for any that need attention. Skip if everything is healthy.',
    skillsLoaded: ['routine-health-check', 'score-importance'],
    toolsAllowed: ['inbox_add', 'find_tools'],
    sessionEndSkill: 'route-finding',
  },
]

/**
 * Resolve a template into the literal `agentName` for a given user.
 * Server endpoints + the NewRoutinePage form both go through this so
 * the slug+suffix scheme is centralised.
 */
export function resolveAgentName(template: RoutineTemplate, userId: string): string {
  return `${template.agentNameSlug}-${userId.slice(0, 8)}`
}
