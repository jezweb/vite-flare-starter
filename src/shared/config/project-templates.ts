/**
 * Project Templates — bundled blueprints for common workflows.
 *
 * Used by the create-project modal's "From template" tab. Forks customise
 * by editing this file. Each template provides:
 *   - name + description (shown on the card)
 *   - default systemPrompt
 *   - starter memory entries (inserted as `type='context'` on creation)
 *   - suggested first prompts (chips on the new project page)
 *
 * The built-in five (Quoting, Content Writing, SEO Reporting, Prospecting,
 * Customer Support) are sourced from common Jezweb workflows. They're
 * intentionally generic — fork users replace them with their own.
 */

export interface ProjectTemplate {
  /** Unique slug, used in URLs and cache keys */
  slug: string
  /** Card title */
  name: string
  /** Card description */
  description: string
  /** Optional emoji for the card */
  emoji?: string
  /** Default colour token (must match PROJECT_COLORS in projects/colors.ts) */
  color?: string
  /** Default system prompt seeded into `projects.systemPrompt` on creation */
  systemPrompt: string
  /** Memory entries inserted into the new project (scope='project', type='context') */
  starterMemories: Array<{
    name: string
    description: string
    content: string
    type: 'fact' | 'preference' | 'decision' | 'context' | 'reference'
  }>
  /** Suggested first prompts surfaced as chips on the empty project page */
  suggestedFirstPrompts: string[]
  /** What the card's "Includes:" chip row shows */
  includes: string[]
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    slug: 'quoting',
    name: 'Quoting',
    description: 'Draft, refine, and review client quotes with consistent pricing and tone.',
    emoji: '📋',
    color: 'blue',
    systemPrompt:
      'You help draft and refine client quotes. Tone: warm, direct, professional. Use AUD prices including GST unless told otherwise. Always specify scope, exclusions, and payment terms. Default structure: scope summary → line items → total → terms.',
    starterMemories: [
      {
        name: 'quote-tone',
        description: 'Tone guide for quotes',
        type: 'context',
        content:
          'Warm, direct, professional. EN-AU spelling. No em-dashes. Be specific about scope and exclusions — vague quotes lead to disputes.',
      },
      {
        name: 'quote-structure',
        description: 'Default structure',
        type: 'context',
        content:
          'Scope summary (1-2 sentences) → line items with prices → total inc GST → payment terms → assumptions/exclusions → expiry date.',
      },
    ],
    suggestedFirstPrompts: [
      'Draft a quote for a small business website (5 pages, basic CMS)',
      'Help me refine this quote — make the scope clearer',
      'What should I include in the assumptions section?',
    ],
    includes: ['Tone & structure memory', 'AUD inc GST defaults', '3 starter prompts'],
  },
  {
    slug: 'content-writing',
    name: 'Content Writing',
    description: 'Produce website copy, blog posts, and marketing content from briefs.',
    emoji: '✍️',
    color: 'emerald',
    systemPrompt:
      'You write website and marketing copy from briefs and content plans. Tone: matches the brief; default to warm and direct if unspecified. Output formatted markdown. Always include suggested headings, meta description (150-160 chars), and 3-5 internal link opportunities. Use EN-AU spelling unless the brief says otherwise.',
    starterMemories: [
      {
        name: 'copy-output',
        description: 'Default output format',
        type: 'context',
        content:
          'Markdown with H1/H2/H3. End every piece with: suggested meta description (150-160 chars), 3-5 internal link opportunities, target keyword density notes.',
      },
      {
        name: 'copy-tone',
        description: 'Default tone',
        type: 'preference',
        content:
          'Warm, direct, no jargon. EN-AU. No em-dashes. Match the brand voice if a brief specifies one — adapt rather than impose.',
      },
    ],
    suggestedFirstPrompts: [
      'Write a homepage for a Newcastle-based plumber',
      'Draft a 600-word blog post about choosing a CMS',
      'Help me rewrite this paragraph to sound less corporate',
    ],
    includes: ['Output format memory', 'Tone preference', '3 starter prompts'],
  },
  {
    slug: 'seo-reporting',
    name: 'SEO Reporting',
    description: 'Produce monthly client-facing SEO reports from analytics + GSC data.',
    emoji: '📊',
    color: 'amber',
    systemPrompt:
      'You produce monthly SEO reports for clients. Audience: small business owners, not technical. Tone: clear, factual, action-oriented. Structure: TL;DR (3 bullets) → Top wins → Where we struggled → What we are doing next month → Appendix with raw numbers. Avoid jargon — explain CTR, impressions, etc. inline if used.',
    starterMemories: [
      {
        name: 'report-audience',
        description: 'Audience for reports',
        type: 'context',
        content:
          'Small business owners. Not technical. Avoid jargon (CTR, SERP, etc.) — explain inline if you must use them.',
      },
      {
        name: 'report-structure',
        description: 'Default report structure',
        type: 'context',
        content:
          'TL;DR (3 bullets) → Top wins → Where we struggled → What we are doing next month → Appendix with raw numbers.',
      },
    ],
    suggestedFirstPrompts: [
      'Draft an SEO report from these GSC + GA4 numbers',
      'How do I explain ranking drops to a non-technical client?',
      'What should I include this month given the algorithm update?',
    ],
    includes: ['Audience + structure memory', 'Plain-English style', '3 starter prompts'],
  },
  {
    slug: 'prospecting',
    name: 'Prospecting',
    description: 'Find local businesses with underperforming websites and score them as leads.',
    emoji: '🎯',
    color: 'rose',
    systemPrompt:
      'You help identify and qualify local business prospects. For each prospect, return: business name, why it qualifies (specific issue), suggested first-touch (email/call/visit), and a score 1-5. Focus on actionable detail — generic "needs better SEO" is not useful.',
    starterMemories: [
      {
        name: 'prospect-fields',
        description: 'Required fields per prospect',
        type: 'context',
        content:
          'business name, why it qualifies (specific issue, not "bad website"), first-touch suggestion, score 1-5.',
      },
      {
        name: 'prospect-bar',
        description: 'Quality bar',
        type: 'preference',
        content:
          'Be specific. "No mobile responsive" is good. "Needs better SEO" is bad. Reference what specifically would change.',
      },
    ],
    suggestedFirstPrompts: [
      'Find 5 plumbers in Newcastle with underperforming websites',
      'Score this prospect: <paste website URL>',
      'Draft a first-touch email for a prospect with a slow site',
    ],
    includes: ['Field schema memory', 'Quality bar', '3 starter prompts'],
  },
  {
    slug: 'customer-support',
    name: 'Customer Support',
    description: 'Triage support tickets, draft replies, escalate issues, log decisions.',
    emoji: '🎧',
    color: 'violet',
    systemPrompt:
      "You help triage and respond to customer support tickets. For each ticket: classify (bug/feature/question/billing), suggest next action (reply/escalate/close), draft a response if appropriate. Tone: warm, take ownership, no blame. Always acknowledge the customer's frustration before solving.",
    starterMemories: [
      {
        name: 'support-triage',
        description: 'Triage classification',
        type: 'context',
        content:
          'Classify each ticket: bug | feature | question | billing | other. Suggest action: reply | escalate | close.',
      },
      {
        name: 'support-tone',
        description: 'Reply tone',
        type: 'preference',
        content:
          'Warm. Take ownership ("I understand", not "we apologise for any inconvenience"). Acknowledge frustration before solving. No blame.',
      },
    ],
    suggestedFirstPrompts: [
      'Triage this ticket: <paste ticket>',
      'Draft a reply for a customer who is frustrated about a delayed delivery',
      'How should I escalate a P1 incident?',
    ],
    includes: ['Triage memory', 'Tone preference', '3 starter prompts'],
  },
]

export function getTemplate(slug: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.slug === slug)
}
