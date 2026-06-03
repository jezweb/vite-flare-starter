/**
 * Space templates — preset bundles for quick-start.
 *
 * Each template seeds the new space with a name suggestion, default
 * description, and an agent set with sensible reply modes. The
 * Templates tab in CreateSpaceModal renders these as cards; on
 * pick, the form pre-fills and the user can still edit before
 * creating.
 *
 * Add new templates here — the modal picks them up automatically.
 */

export type ReplyMode = 'always' | 'mention' | 'proactive' | 'ambient' | 'off'

export interface SpaceTemplateAgent {
  agentClass: string
  agentName: string
  replyMode: ReplyMode
}

export interface SpaceTemplate {
  id: string
  name: string
  /** Short tagline for the template card. */
  tagline: string
  /** Default name to suggest in the form (user can override). */
  suggestedTitle: string
  /** Default description that lands in the space's summary field. */
  description: string
  /** Visual emoji/icon for the card — keeps the picker glanceable. */
  emoji: string
  agents: SpaceTemplateAgent[]
}

export const SPACE_TEMPLATES: SpaceTemplate[] = [
  {
    id: 'solo-workshop',
    name: 'Solo workshop',
    emoji: '✨',
    tagline: 'Just you + every default agent in @-mention mode.',
    suggestedTitle: 'Workshop',
    description:
      'Your personal multi-agent room. @ any of the agents to ask them to help — they stay quiet otherwise.',
    agents: [
      { agentClass: 'AssistantAgent', agentName: 'assistant', replyMode: 'mention' },
      { agentClass: 'ResearcherAgent', agentName: 'research', replyMode: 'mention' },
      { agentClass: 'WriterAgent', agentName: 'writer', replyMode: 'mention' },
    ],
  },
  {
    id: 'marketing-pod',
    name: 'Marketing pod',
    emoji: '📣',
    tagline: 'Research + writing for campaign work.',
    suggestedTitle: 'marketing-pod',
    description:
      'A campaign room. @research finds market context; @writer drafts copy; @assistant helps with ad-hoc tasks.',
    agents: [
      { agentClass: 'AssistantAgent', agentName: 'assistant', replyMode: 'mention' },
      { agentClass: 'ResearcherAgent', agentName: 'research', replyMode: 'mention' },
      { agentClass: 'WriterAgent', agentName: 'writer', replyMode: 'mention' },
    ],
  },
  {
    id: 'support-war-room',
    name: 'Support war room',
    emoji: '🚨',
    tagline: 'Triage incidents with research + comms agents.',
    suggestedTitle: 'incident-room',
    description:
      'Live incident coordination. @research pulls context fast; @writer drafts customer comms; @assistant handles tasks.',
    agents: [
      { agentClass: 'AssistantAgent', agentName: 'assistant', replyMode: 'mention' },
      { agentClass: 'ResearcherAgent', agentName: 'research', replyMode: 'mention' },
      { agentClass: 'WriterAgent', agentName: 'writer', replyMode: 'mention' },
    ],
  },
  {
    id: 'research-room',
    name: 'Research room',
    emoji: '🔎',
    tagline: 'Deep-dive a topic with the researcher.',
    suggestedTitle: 'research',
    description:
      'A focused room for one researcher and you. @research drives, @assistant fills gaps.',
    agents: [
      { agentClass: 'ResearcherAgent', agentName: 'research', replyMode: 'mention' },
      { agentClass: 'AssistantAgent', agentName: 'assistant', replyMode: 'mention' },
    ],
  },
  {
    id: 'writers-desk',
    name: "Writer's desk",
    emoji: '✍️',
    tagline: 'Long-form drafting and editing.',
    suggestedTitle: 'writing-desk',
    description: '@writer drafts and edits long-form copy. @research pulls citations on demand.',
    agents: [
      { agentClass: 'WriterAgent', agentName: 'writer', replyMode: 'mention' },
      { agentClass: 'ResearcherAgent', agentName: 'research', replyMode: 'mention' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank space',
    emoji: '⬜',
    tagline: 'Start empty — pick agents yourself.',
    suggestedTitle: '',
    description: '',
    agents: [],
  },
]

/** Default agent catalogue surfaced in the create modal's "Agents" picker. */
export interface AgentChoice {
  agentClass: string
  agentName: string
  description: string
}

export const AGENT_CATALOGUE: AgentChoice[] = [
  {
    agentClass: 'AssistantAgent',
    agentName: 'assistant',
    description: 'General-purpose: answers questions, drafts, runs tools.',
  },
  {
    agentClass: 'ResearcherAgent',
    agentName: 'research',
    description: 'Researches topics on the web and summarises findings.',
  },
  {
    agentClass: 'WriterAgent',
    agentName: 'writer',
    description: 'Drafts long-form prose / emails from research.',
  },
]
