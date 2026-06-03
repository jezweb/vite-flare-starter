/**
 * Chat action chips — preset prompts shown on the empty chat state.
 *
 * Each chip expands to show a list of preset starter prompts. Clicking a
 * preset inserts the text into the input (it doesn't auto-send) so users
 * can edit before asking. Modeled after claude.ai's Write / Strategize /
 * Career chat / Claude's choice chips.
 *
 * Fork: edit or replace these to match your product. Set an empty array to
 * hide the chip row entirely.
 */
import { Pencil, Search, Code2, ListChecks, MapPin, type LucideIcon } from 'lucide-react'

export interface ChipPreset {
  /** Short label shown in the preset list */
  label: string
  /** Text inserted into the input when clicked (user can edit before sending) */
  prompt: string
}

export interface ChatChip {
  /** Text shown on the chip */
  label: string
  /** Lucide icon for the chip */
  icon: LucideIcon
  /** Preset prompts shown when the chip expands */
  presets: ChipPreset[]
}

/**
 * Flat example questions shown beneath the chip row on the empty state.
 * Click-to-send (doesn't open a menu) — the t3.chat pattern. Lowers
 * cold-start effort for users who know exactly what to ask.
 *
 * Fork: replace with product-specific starters. Set to an empty array to
 * hide the example-questions row entirely.
 */
export const CHAT_EXAMPLES: string[] = [
  'Find good coffee shops near Newcastle NSW.',
  'Help me plan a focused 2-hour coding session.',
  "Summarise today's tech news in 5 bullet points.",
  'What are the trade-offs of server components vs client components?',
]

export const CHAT_CHIPS: ChatChip[] = [
  {
    label: 'Write',
    icon: Pencil,
    presets: [
      { label: 'Draft a concise email', prompt: 'Help me draft a concise email about ' },
      { label: 'Rewrite for clarity', prompt: 'Rewrite this to be clearer and more direct:\n\n' },
      {
        label: 'Summarise a long document',
        prompt: 'Summarise this document into 5 bullet points:\n\n',
      },
      {
        label: 'Turn bullet points into prose',
        prompt: 'Turn these bullet points into a well-written paragraph:\n\n',
      },
      { label: 'Write a follow-up message', prompt: 'Write a friendly follow-up message for ' },
    ],
  },
  {
    label: 'Research',
    icon: Search,
    presets: [
      { label: 'Search the web for news', prompt: 'Search the web for the latest news on ' },
      {
        label: 'Compare two options',
        prompt: 'Compare these two options and summarise the trade-offs: ',
      },
      {
        label: 'Explain a concept simply',
        prompt: 'Explain this concept as if I were new to it: ',
      },
      {
        label: 'Find sources for a claim',
        prompt: 'Find reputable sources that back up this claim: ',
      },
      { label: 'Competitor snapshot', prompt: 'Give me a competitor snapshot for ' },
    ],
  },
  {
    label: 'Code',
    icon: Code2,
    presets: [
      { label: 'Debug an error', prompt: 'Help me debug this error:\n\n' },
      {
        label: 'Explain this code',
        prompt: 'Explain what this code does and spot any bugs:\n\n```\n\n```',
      },
      {
        label: 'Refactor for readability',
        prompt: 'Refactor this for readability without changing behaviour:\n\n```\n\n```',
      },
      { label: 'Write tests', prompt: 'Write unit tests for this function:\n\n```\n\n```' },
      {
        label: 'Run Python',
        prompt: 'Run this Python code and show the output:\n\n```python\n\n```',
      },
    ],
  },
  {
    label: 'Plan',
    icon: ListChecks,
    presets: [
      {
        label: 'Break down a project',
        prompt: 'Break this project into a step-by-step plan with deliverables: ',
      },
      { label: 'Draft a meeting agenda', prompt: 'Draft a meeting agenda for ' },
      {
        label: 'Weekly priorities',
        prompt: 'Help me set the top 3 priorities for this week. My context: ',
      },
      { label: 'Risks and blockers', prompt: 'Surface the risks and blockers for this plan: ' },
      { label: 'Decision matrix', prompt: 'Build me a decision matrix comparing these options: ' },
    ],
  },
  {
    label: 'Local',
    icon: MapPin,
    presets: [
      { label: 'Find local businesses', prompt: 'Find the best ' },
      { label: 'Coffee near me', prompt: 'Find great coffee shops near Newcastle NSW.' },
      { label: 'Trade services nearby', prompt: 'Find reputable plumbers near ' },
      { label: 'Mechanic or wrecker search', prompt: 'Find Toyota mechanics or wreckers near ' },
      {
        label: 'Restaurants for tonight',
        prompt: 'Suggest highly-rated restaurants for dinner near ',
      },
    ],
  },
]
