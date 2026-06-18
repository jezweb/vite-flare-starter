/**
 * Walkabout tour steps — the starter's own first-time-user walkthrough. Each
 * step navigates to a real page (live data beats screenshots) with a short
 * on-screen blurb and a pre-generated ElevenLabs narration (public/tour/step-N.mp3,
 * regenerate with .jez/scripts/gen-tour-audio.py after editing).
 *
 * Forking: rewrite these steps for YOUR product — one per page, 5–8 steps is
 * plenty (this starter ships a longer 13-step tour because it's a pattern
 * library showing off every module). Keep the `audio` filenames matching the
 * generator's SCRIPTS dict, add a `data-tour` attribute to every element a
 * narration segment describes, and re-run the generator. Mark a step with
 * `feature` and it auto-drops when that module is flagged off — the audio file
 * just goes unused (cues match by filename).
 */
import { features } from '@/shared/config/features'

export interface TourStep {
  path: string
  title: string
  body: string
  audio: string
  /** CSS selector to scroll to + halo while this step is showing (fallback when
   *  the step has no generated multi-segment cues). */
  highlight?: string
  /** Optional feature flag — the step drops out when the module is disabled. */
  feature?: keyof typeof features
}

const ALL_STEPS: TourStep[] = [
  {
    path: '/dashboard',
    title: 'Home — your workspace at a glance',
    body: 'A snapshot of what needs you and what your agents have been doing. The sidebar takes you everywhere else.',
    audio: '/tour/step-1.mp3',
    highlight: '[data-tour="home-welcome"]',
  },
  {
    path: '/dashboard/chat',
    title: 'AI Chat — the flagship surface',
    body: 'Talk to the agent. It streams answers, calls tools, reads your skills and memory, and renders rich tool output inline.',
    audio: '/tour/step-2.mp3',
    highlight: '[data-tour="chat-input"]',
    feature: 'chat',
  },
  {
    path: '/dashboard/skills',
    title: 'Skills — teach the agent procedures',
    body: 'Markdown SKILL.md files the agent loads on demand. Edit one and the AI Sparkle button rewrites it, with a diff to approve.',
    audio: '/tour/step-3.mp3',
    highlight: '[data-tour="skills-list"]',
    feature: 'skills',
  },
  {
    path: '/dashboard/knowledge',
    title: 'Knowledge — long-form reference',
    body: 'Docs the agent can search or bake into every prompt. Sits between small memories and step-by-step skills.',
    audio: '/tour/step-4.mp3',
    highlight: '[data-tour="knowledge-list"]',
    feature: 'knowledge',
  },
  {
    path: '/dashboard/inbox',
    title: 'Inbox — one attention surface',
    body: 'Findings the agent surfaced and actions it wants approved, merged into one list. Approvals open inline.',
    audio: '/tour/step-5.mp3',
    highlight: '[data-tour="inbox-list"]',
  },
  {
    path: '/dashboard/projects',
    title: 'Projects — organise the work',
    body: 'Group conversations and context. Each project can carry its own memory, system prompt, and default model.',
    audio: '/tour/step-6.mp3',
    highlight: '[data-tour="projects-list"]',
  },
  {
    path: '/dashboard/routines',
    title: 'Routines — recurring agents',
    body: 'Fire an agent on a schedule with a tools allow-list and loaded skills. Findings flow to the channels you choose.',
    audio: '/tour/step-7.mp3',
    highlight: '[data-tour="routines-list"]',
  },
  {
    path: '/dashboard/agents',
    title: 'Agents — the fleet',
    body: 'Every agent the app ships, self-describing. Stateful personas with memory, tools, and a human-in-the-loop approval queue.',
    audio: '/tour/step-8.mp3',
    highlight: '[data-tour="agents-list"]',
  },
  {
    path: '/dashboard/activity',
    title: 'Activity — the audit trail',
    body: 'Every action on the account, with stats by type and a full history. Nothing the agents do is a black box.',
    audio: '/tour/step-9.mp3',
    highlight: '[data-tour="activity-list"]',
    feature: 'activity',
  },
  {
    path: '/dashboard/connections',
    title: 'Connections — plug in your tools',
    body: 'Per-user OAuth to external MCP servers (Gmail, Drive, Notion, Slack). Each connection is labelled and allow-listed per agent.',
    audio: '/tour/step-10.mp3',
    highlight: '[data-tour="connections-list"]',
    feature: 'connectors',
  },
  {
    path: '/dashboard/files',
    title: 'Files — your documents',
    body: 'Upload to R2, scope to a project, preview inline. The agent can read them and the capacity meter tracks your storage.',
    audio: '/tour/step-11.mp3',
    highlight: '[data-tour="files-list"]',
    feature: 'files',
  },
  {
    path: '/dashboard/organization',
    title: 'Organizations — bring your team',
    body: 'Multi-tenant from day one. Invite members, manage roles, switch between your personal space and shared orgs.',
    audio: '/tour/step-12.mp3',
    highlight: '[data-tour="org-members"]',
  },
  {
    path: '/dashboard/settings',
    title: 'Settings — make it yours',
    body: 'Profile, preferences, theme, sessions, data export. That’s the tour — click around, everything you see is yours to explore.',
    audio: '/tour/step-13.mp3',
    highlight: '[data-tour="settings-tabs"]',
  },
]

/** Steps with their module enabled. Audio/cue files are keyed by filename, so
 *  dropping a step never misaligns the rest. */
export const TOUR_STEPS: TourStep[] = ALL_STEPS.filter((s) => !s.feature || features[s.feature])

const STORAGE_KEY = 'walkabout:tour'

export function tourSeen(): boolean {
  return Boolean(localStorage.getItem(STORAGE_KEY))
}

export function markTour(state: 'done' | 'dismissed'): void {
  localStorage.setItem(STORAGE_KEY, state)
}
