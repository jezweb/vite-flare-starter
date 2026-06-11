/**
 * The app guide the ask-the-app Guide answers from.
 *
 * This is the Guide's ONLY source of truth — keep it factual and current as
 * features ship. Facts here come from the code and the docs, never from
 * imagination (no invented pricing, limits, or behaviour). When a feature
 * changes (pages, flows, flags), update THIS FILE in the same commit.
 *
 * Forking: replace this wholesale with YOUR product's guide. Same shape — what
 * the app is, every page, every flow, limits, who to contact.
 */
export const APP_GUIDE = `
This is an app built on the Vite Flare Starter — a full-stack Cloudflare Workers
application: React front end, Hono API, D1 database, better-auth sign-in, and an
AI agent powered by Workers AI plus optional hosted models. Signed-in users get a
dashboard with an AI chat agent, skills, projects, an inbox, connectors, and
settings. It is a pattern library as much as a product: most surfaces are
reference implementations a developer can fork and adapt.

SIGNING IN
Google OAuth by default; email/password is optional and off unless the fork
enables it. Sessions last 7 days. New sign-ups can be restricted to an allowlist
of emails or domains. Admins are set by an env var.

DASHBOARD PAGES
- Home (/dashboard): the landing snapshot of the workspace, with the sidebar to
  everything else.
- AI Chat (/dashboard/chat): the flagship. A streaming chat agent that calls
  tools, reads your skills and memory, renders rich tool output inline (tables,
  images, terminal blocks), supports vision and structured output, and shows a
  sources strip and token usage. It can search its own tools on demand
  (find_tools / list_tools) so the model only loads what a turn needs. Messages
  can be edited, regenerated, searched, and exported (JSON or Markdown).
- Skills (/dashboard/skills): Claude Agent Skills — markdown SKILL.md files the
  agent loads on demand (progressive disclosure: name + description always, full
  body via load_skill, referenced files via fs_read). Edit a skill and the AI
  Sparkle button rewrites it from a plain-language instruction; you approve the
  change via a diff. Skills can be bundled in the repo, uploaded, or pulled from
  GitHub. A skill marked always_active is baked into every chat's system prompt.
- Inbox (/dashboard/inbox): one attention surface merging findings (things the
  agent surfaced) and approvals (actions an agent wants a human to OK). Approval
  rows open inline — no page bounce. Sorted by importance, then due, then created.
- Projects (/dashboard/projects): group conversations and work; a project can
  carry its own memory and context that the chat agent picks up.
- Connections (/dashboard/connections): per-user OAuth or bearer connections to
  external MCP servers (Gmail, Drive, Notion, Slack, Atlassian, and more). Each
  connection can be labelled and allow-listed per agent, so personal and work
  accounts stay separate.
- Routines (/dashboard/routines): saved recurring-agent configs — fire an agent
  every N seconds with a tools allow-list, loaded skills, and hooks. Findings get
  dispatched to channels (the inbox, a notification, an approval queue, a space,
  or a webhook). The schedule self-adjusts to keep cost flat over many fires.
- Knowledge (/dashboard/knowledge): long-form reference documents per user,
  project, or org. Either baked into every prompt (always) or searched on demand
  (knowledge_search + load_knowledge). It sits between small memories and
  procedural skills.
- Settings (/dashboard/settings): profile, preferences, theme (light / dark /
  system), active sessions, API tokens, and a full data export.
- The Guide question log (/dashboard/questions): every question asked of this
  in-app Guide, newest first — the questions users actually ask are the roadmap.

THE AI AGENT
The chat agent runs as a Durable Object per (user, conversation). It can call
tools — built-in ones and any tools inherited from your connected MCP servers.
Notable compositional tools: start_batch_task (process many items in parallel
with per-item retry and a progress page), with_review (a cheap model drafts, a
smarter one scores and the draft is rewritten until it passes), and propose_patch
(stage a config edit — a skill or setting — for you to approve). Internal helper
calls pick a model by job: a fast "composer" model with thinking off for bounded
tasks like titles and extraction, a "reasoner" model with thinking on for
open-ended work.

MEMORY & SKILLS & KNOWLEDGE (how the agent learns)
- Memories: small structured facts, recalled semantically and ranked by
  similarity, importance, recency, and frequency.
- Skills: procedures the agent follows (markdown).
- Knowledge: long-form reference docs.
Together they let the agent get more capable without code changes.

DEMO VIDEOS & THIS TOUR
The guided tour you can take from this Guide walks the real pages with voice
narration and a spotlight that follows the narration. The same engine records
narrated demo videos headlessly (see the Walkabout module) — so the owner never
has to record a walkthrough by hand.

LIMITS & DATA
- Data is scoped to your account by default (a fork can switch to shared/team
  mode). Rows always record their creator.
- Question-asking through this Guide is rate-limited per user.
- Workers AI is free-tier; hosted models (Claude, GPT, Gemini, others) need an
  API key configured by the operator.

WHO TO CONTACT
For anything this app can't answer — new features, pricing, account issues —
contact Jeremy Dawes at Jezweb: jeremy@jezweb.net or 0411 056 876.
`.trim()
