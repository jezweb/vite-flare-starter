/**
 * In-app glossary — see gh #47.
 *
 * One entry per major concept. Drives `/dashboard/help`. New users get a
 * plain-English answer when they think "what's a skill?" without having
 * to land on the page first.
 *
 * Adding a new entry:
 *   1. Add a row below with a stable `id` (kebab-case).
 *   2. Optional `feature` flag — entry is hidden when the matching
 *      `VITE_FEATURE_*` is false. Use the same key as the nav config.
 *   3. Keep `summary` ~50 words; `whenToUse` ~30 words. Glossary is
 *      reference, not tutorial.
 */
import {
  Activity,
  CheckSquare,
  FileText,
  FolderKanban,
  Hash,
  MessageSquare,
  Plug,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export interface GlossaryEntry {
  id: string
  name: string
  icon: LucideIcon
  summary: string
  whenToUse: string
  action?: { label: string; route: string }
  /** Hide if this feature flag is off. Optional. */
  feature?: 'chat' | 'spaces' | 'activity' | 'files'
}

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    id: 'chat',
    name: 'Chat',
    icon: MessageSquare,
    summary:
      'A one-on-one conversation with an AI agent. Pick a model, type a prompt, and the agent responds — sometimes calling tools (search, calendar, files) along the way. Each chat keeps its own history.',
    whenToUse:
      'Quick exploration, drafting, or working through a problem. If the work is ongoing or shared, put it in a project instead.',
    action: { label: 'Open AI Chat', route: '/dashboard/chat' },
    feature: 'chat',
  },
  {
    id: 'projects',
    name: 'Projects',
    icon: FolderKanban,
    summary:
      'Long-running spaces that bind shared memory, instructions, and files to multiple chats. Conversations inside a project inherit its context automatically.',
    whenToUse:
      'Ongoing work — a side product, a customer engagement, a research thread. Anything where context should carry across sessions.',
    action: { label: 'Open Projects', route: '/dashboard/projects' },
  },
  {
    id: 'spaces',
    name: 'Spaces',
    icon: Hash,
    summary:
      'Multi-user rooms where humans and AI agents talk side by side. Mention an @agent and it responds inline; threads keep replies tidy.',
    whenToUse:
      'Team conversations that need an AI participant — standups with a research agent, design reviews with a writing agent, etc.',
    action: { label: 'Open Spaces', route: '/dashboard/spaces' },
    feature: 'spaces',
  },
  {
    id: 'memory',
    name: 'Memory',
    icon: Sparkles,
    summary:
      'Persistent facts the AI remembers about you, a project, or your organisation. Three trust modes per user: ask before saving, save automatically, or never save.',
    whenToUse:
      'Anything you would otherwise repeat in every chat — your name, your tone preferences, your timezone, project conventions.',
    action: { label: 'Manage memory', route: '/dashboard/settings#memory' },
  },
  {
    id: 'skills',
    name: 'Skills',
    icon: Sparkles,
    summary:
      'Reusable prompts the AI can invoke via `/skill-name` in chat. Bundled examples include `/morning-brief`, `/research`, `/summarise-url`. You can edit them or add your own.',
    whenToUse:
      'Tasks you do repeatedly — give them a slash command, then trigger from any chat without retyping the instructions.',
    action: { label: 'Open Skills', route: '/dashboard/skills' },
  },
  {
    id: 'connectors',
    name: 'Connectors',
    icon: Plug,
    summary:
      'Links to external services (Google Workspace, Microsoft 365, MCP servers) so the AI can read your Gmail, schedule meetings, browse your Drive, and more.',
    whenToUse:
      'Once per service. The AI uses the connector silently — you only see results when it acts.',
    action: { label: 'Open Connections', route: '/dashboard/connections' },
  },
  {
    id: 'approvals',
    name: 'Approvals',
    icon: CheckSquare,
    summary:
      'Review queue for actions agents want to take on your behalf — sending email, posting to chat, saving memory. You approve or reject before anything leaves the app.',
    whenToUse: 'Any time you let an agent act with side effects. Approvals are the safety net.',
    action: { label: 'Open Approvals', route: '/dashboard/approvals' },
  },
  {
    id: 'files',
    name: 'Files',
    icon: FileText,
    summary:
      'Documents, images, and audio you upload to the app. Files attached to a project become context for any chat in that project.',
    whenToUse:
      'When the AI needs to read something — a brief, a contract, a screenshot. Drop it in chat or attach it to a project.',
    action: { label: 'Open Files', route: '/dashboard/files' },
    feature: 'files',
  },
  {
    id: 'activity',
    name: 'Activity',
    icon: Activity,
    summary:
      'Audit log of everything created, edited, or deleted in the app — sign-ins, items created, items updated, items archived — with timestamps.',
    whenToUse:
      'When you need to know "what changed and when" — debugging, sharing a recap with a teammate, or auditing an agent run.',
    action: { label: 'Open Activity', route: '/dashboard/activity' },
    feature: 'activity',
  },
]
