/**
 * Walkabout tour steps — the starter's own first-time-user walkthrough. Each
 * step navigates to a real page (live data beats screenshots) with a short
 * on-screen blurb and a pre-generated ElevenLabs narration (public/tour/step-N.mp3,
 * regenerate with .jez/scripts/gen-tour-audio.py after editing).
 *
 * Forking: rewrite these steps for YOUR product — one per page, 5–8 steps. Keep
 * the `audio` filenames matching the generator's SCRIPTS dict, add a `data-tour`
 * attribute to every element a narration segment describes, and re-run the
 * generator. Mark a step with `feature` and it auto-drops when that module is
 * flagged off — the audio file just goes unused (cues match by filename).
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
    title: 'Home — your starting point',
    body: 'A quick snapshot of your workspace. From here the sidebar takes you to chat, projects, skills and everything else.',
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
    body: 'Markdown SKILL.md files the agent loads on demand. Edit one and the AI Sparkle button rewrites it for you, with a diff to approve.',
    audio: '/tour/step-3.mp3',
    highlight: '[data-tour="skills-list"]',
    feature: 'skills',
  },
  {
    path: '/dashboard/inbox',
    title: 'Inbox — one attention surface',
    body: 'Findings the agent surfaces and actions it wants approved, merged into one list. Approvals open inline — no page bounce.',
    audio: '/tour/step-4.mp3',
    highlight: '[data-tour="inbox-list"]',
  },
  {
    path: '/dashboard/settings',
    title: 'Settings — make it yours',
    body: 'Profile, preferences, theme, sessions, data export. That’s the tour — click around, everything you see is yours to explore.',
    audio: '/tour/step-5.mp3',
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
