# Agent Playbooks

Concrete product shapes you can build with the starter, mapped to the
primitives they use. Each playbook is a recipe — what to wire, what
not to bother with, what the user experience should feel like, and
what to avoid.

These are starting points, not constraints. Real products will mix
elements from several playbooks.

---

## How to use this

Each playbook follows the same structure:

- **The shape** — what the product is, in one paragraph
- **Primitives wired** — which starter modules / patterns you turn on
- **Agent persona shape** — what the system prompt looks like
- **First 5 minutes** — what the user sees and does on signup
- **Failure modes** — what goes wrong + how to mitigate
- **Inspiration** — products in the wild doing this well

Start with whichever playbook is closest to what you're building, fork
that section into your product's own docs, modify.

---

## Playbook 1 — Email triage assistant

### The shape

A scheduled agent that runs each morning, scans the user's inbox for
overnight email, classifies (urgent / followup / FYI / spam), and
drafts replies for the user to approve in a queue. User reviews +
approves over coffee. Nothing sends without approval.

### Primitives wired

- **AssistantAgent** subclass per user (`${userId}:morning-triage`)
- **Schedule**: `agent.scheduleEvery(86400, 'doTriage')` for daily fire
- **Tools**: gmail_search (read), gmail_draft (queue draft), `request_email_approval` (queue for review)
- **Approval queue** (Phase A) for every send
- **Memory blocks**: `triage_rules` (user's preferences — "never auto-reply to tom@", "always escalate from finance@"), `recent_actions` (what got drafted last week to avoid duplicates)
- **Notifications** — bell + tab show "X drafts awaiting approval"
- **Budget gate** — soft cap (e.g. $0.50/day) — triage shouldn't eat budget

### Agent persona shape

```
You are a morning email triage assistant. Each morning you read the user's
overnight email and propose actions. NEVER send anything; ALWAYS queue
for approval via `request_email_approval`.

For each new email:
1. Skip if it's automated, marketing, or already handled in <recent_actions>
2. Classify urgent / followup / FYI / spam
3. If a reply makes sense, draft one in the user's voice (read past replies for tone)
4. Queue via request_email_approval with a one-line summary

Be conservative. The user reviews everything. A noisy queue trains them
to ignore the queue.
```

### First 5 minutes

1. Sign in with Google
2. Connect Gmail (OAuth — pre-wired)
3. Page: "Set up your morning triage" → seeded `triage_rules` block they edit
4. Choose fire time (default 8am their TZ)
5. Done. Tomorrow morning: notification + queue full of drafts

### Failure modes

| Failure | Mitigation |
|---|---|
| Drafts feel robotic / off-voice | Memory block: snippets of user's actual past replies; agent reads at start of each turn |
| Duplicate drafts on retry | Track Gmail message-id in `recent_actions`; skip if already drafted |
| User ignores the queue (noise fatigue) | Tighter persona ("be conservative"), better classification, daily summary digest of skipped items |
| Budget runs away with bursty inboxes | Phase D budget gate; cap maxPerSweep equivalent on email count |
| Queue piles up when user is on holiday | Snooze agent endpoint; also expose `/api/scheduled-agents/reminders/:slug` cancel pattern |

### Inspiration

- Superhuman AI Reply (commercial, replies-focused)
- Shortwave (commercial, AI assistant in Gmail)
- claude.ai working in Gmail (manual prompt loop)

---

## Playbook 2 — Daily / weekly briefing

### The shape

Read multiple sources overnight (chat spaces, calendar, news feeds,
KB) and write a single morning briefing. Lands as an email or in-app
notification. Read-only — no destructive actions, no approval queue
needed.

### Primitives wired

- **AssistantAgent** scheduled daily
- **Tools**: web_search, gmail_search (read), calendar_list_events, optionally chat_messages via MCP (Phase J — connect the Jezweb google-chat MCP)
- **Memory blocks**: topics user cares about, people whose updates matter
- **Vectorize semantic memory** (Phase F) — past briefings indexed so the agent can reference "you mentioned X in last Tuesday's brief"
- **R2 + markdown export** (`server/lib/export/markdown.ts`) — save briefing as markdown file user can download
- **Notifications** — "Your brief is ready"
- **Budget gate** — daily caps because briefings can spiral on data-rich days

### Agent persona shape

```
You write a 250-word morning brief for {user.name}. Three sections:
1. **What changed overnight** — calendar, important emails, chat highlights
2. **What needs your attention today** — pending decisions, follow-ups due
3. **Worth knowing** — industry news in topics they follow (1-2 items)

Format: clean markdown, scannable in 30 seconds. Bold the names of people
and the verbs (decisions, asks). No filler. End with a one-line "anything
unusual" callout.

Skip a section entirely if there's nothing real to say. Don't manufacture
content to fill the structure.
```

### First 5 minutes

1. Sign in
2. Connect Google (Calendar + Gmail)
3. Optional: connect Slack / chat MCP
4. Configure topics → memory block "topics_to_track"
5. Choose briefing time + delivery (in-app notification / email)
6. Tomorrow morning: notification, click to read brief

### Failure modes

| Failure | Mitigation |
|---|---|
| Brief becomes generic / stale | Persona insists on specificity; vectorize past briefings to spot repetition |
| Reads sensitive email and surfaces it | Persona explicitly: "skip personal/private email"; user can also gate with Gmail labels |
| Misses important things | Calendar + tagged-by-user contacts → priority pass; explicit `must_track_people` block |
| Runs even when user is OOO | Schedule cancel via REST + UI toggle |

### Inspiration

- Daily.dev (curated dev news, less personalised)
- Reflect / Mem (note-taking with AI surfacing)
- The Sample / Refind (curated newsletter style)

---

## Playbook 3 — CRM-shape (deal/contact tracker with agent)

### The shape

Sales-flavoured app: deals, contacts, companies as entities. Agent
helps with deal followup, contact research, draft outreach. Works
within the user's pipeline rather than replacing it.

### Primitives wired

- **Organizations** (Phase I) — multi-user CRM, team shares deals
- **Entities** (Phase E) — `type='deal'`, `type='contact'`, `type='company'` with org_id scoping
- **AssistantAgent** per user OR per org (one shared agent, per-user persona blocks)
- **SweeperAgent** (Phase H) configured for `type='deal'` with `staleAfterDays=14` — finds deals not touched in 2 weeks, drafts followup
- **Tools**: entity_create/update/list, gmail_send (via approval), web_search (research a company), browser_markdown / firecrawl (scrape company sites)
- **Approval queue** for every email + status change
- **Memory blocks**: ICP definition, sales rules ("escalate deals over $X", "always include calendar link"), tone preferences
- **Vectorize semantic memory** — past conversations indexed so agent surfaces "we discussed similar last quarter with X"
- **BYOK** — clients use their own Anthropic / OpenAI key

### Agent persona shape

```
You help {user.name} manage their sales pipeline at {org.name}.

Capabilities:
- Look up deals + contacts (entity_list, entity_get)
- Research companies (web_search, browser_markdown for their site)
- Draft outreach + followup emails (request_email_approval — never send)
- Update deal status when the user says it changed (entity_update)
- Surface deals that haven't been touched (the daily sweep does this; you summarise)

Be specific. When the user asks about a deal, read it first via entity_get
before guessing. When drafting, pull tone from their past replies in similar
deals (recallSemantic finds these).

Never quote prices, terms, or commitments — those are the user's job.
```

### First 5 minutes

1. Sign up + create org (or accept invite)
2. Tour: deals list (empty), contacts (empty), agent chat (intro)
3. Import option: paste CSV of existing deals → batch entity_create
4. Connect Gmail + Calendar
5. Configure ICP block + sales rules block
6. Schedule SweeperAgent for stale deals (default 14 days)
7. Add first deal manually OR through agent ("track this deal: ...")

### Failure modes

| Failure | Mitigation |
|---|---|
| Multiple users edit same deal — conflicting agent suggestions | Lock entity at draft time (status='under_review'); agent skips locked |
| Agent makes up contact details | Persona: "if you don't have the contact's email, ask the user"; entity_get returns NULL not invented values |
| Followup spam to same contact | `recent_actions` block tracks last contact per email address; SweeperAgent excludes |
| Org-level approvals create review bottleneck | Per-user approval queues by default; org-level only for high-stakes actions |
| Cost runs hot when sweeping 200 stale deals | Phase D budget gate per agent + per-org cap |

### Inspiration

- Attio (modern CRM, entity-flexible)
- Folk (relationship-first CRM)
- Apollo (outbound automation, what to AVOID — too pushy)
- Pipedrive AI (sales coach pattern)

---

## Playbook 4 — Jira / ticket tracker shape

### The shape

Issue tracker: projects, issues, sprints, comments. Agent triages
incoming issues (bug? feature? duplicate?), suggests labels + owners,
drafts responses to reporters. Sweeper picks up stale issues.

### Primitives wired

- **Organizations** — project = org (or org has many projects)
- **Entities** — `type='issue'`, `type='sprint'`, `type='component'`. `external_id` correlates with GitHub PR / Linear issue
- **Webhook ingestion** (Phase B) — GitHub PR / Linear webhook → handleWebhook → creates entity
- **AssistantAgent** per project — knows the codebase / domain
- **SweeperAgent** for stale issues
- **Tools**: entity_*, web_search, browser_markdown, github / linear via MCP if user connects (Phase J)
- **Approval queue** for status changes, comments back to reporter
- **Memory blocks**: project taxonomy (components, priority rubric), team conventions, "wontfix" patterns
- **Vectorize** — past issues indexed for duplicate detection ("this looks like #1234 from 6 months ago")

### Agent persona shape

```
You triage incoming issues for {project.name}.

For each new issue:
1. Read it. If it matches an existing pattern in <project_taxonomy>, label appropriately.
2. Run recallSemantic for duplicates. If you find one, propose closing as duplicate of #N.
3. If priority is unclear, ask the reporter (queue a comment via approval).
4. Suggest an owner from the team based on component (don't assign — propose, user accepts).
5. If the issue is unactionable (vague, no repro), draft a polite "need more info" reply.

Never close issues directly. Never assign — only propose. The user clicks
through approvals.
```

### First 5 minutes

1. Create project (or org)
2. Configure project taxonomy block (components, priority rubric)
3. Add team members
4. Connect GitHub / Linear via webhook (UI shows webhook URL + secret, user pastes into GitHub Settings → Webhooks)
5. Existing issues import via webhook backfill OR manual entity_create
6. First issue arrives → agent triages → user reviews queue

### Failure modes

| Failure | Mitigation |
|---|---|
| Duplicate detection too aggressive (closes legitimate issues) | "Propose duplicate" not "close as duplicate" — user confirms |
| Misclassifies bugs as features (or vice versa) | Persona reads the project_taxonomy block carefully; user corrects via the rules block over time |
| Webhook auth misses (signature mismatch) | Phase B HMAC verification; if a fork builds custom webhook senders, document the format precisely |
| Sweeper drowns in old issues | Default `staleAfterDays=30` for tickets; statusFilter to only chase issues in 'triage' / 'in-progress' |
| Comment threads spiral | Cap agent comments per issue per week (memory block tracker) |

### Inspiration

- Linear (clean entity model, fast UI, AI features measured)
- Plane (self-hosted Jira clone, simpler model)
- Height (AI-native PM, more aggressive automation)
- GitHub Copilot for issues (pull-request review, mostly good)

---

## Playbook 5 — Customer support assistant

### The shape

Support team uses a shared assistant that knows the product, has read
the docs, can search past tickets, drafts responses. Tickets come in
via email or webhook from the support tool (Zendesk, Intercom, etc).
Agent drafts; human approves and sends.

### Primitives wired

- **Organizations** — support team is the org
- **Entities** — `type='ticket'`, `type='customer'` (link via external_id from CRM/CS tool)
- **Webhook ingestion** — incoming ticket from Zendesk/Intercom → handleWebhook → creates entity + queues draft
- **Vectorize semantic memory** — product docs + past resolved tickets indexed; agent retrieves on each triage
- **AssistantAgent** with tools: entity_*, web_search (for product docs), email send via approval, attach KB articles
- **Approval queue** for every customer-facing send
- **Memory blocks**: company tone guide, escalation rules, refund policy, common gotchas
- **MCP integration** (Phase J) — connect Zendesk MCP for direct ticket management
- **BYOK** — each support team uses their own AI key (cost transparency)

### Agent persona shape

```
You draft support responses for {company.name}'s team. Read each ticket,
search the KB and past resolved tickets (recallSemantic), then queue a
draft reply via request_email_approval.

For each ticket:
1. Identify the user's actual question (often buried)
2. Check resolved tickets for the same issue (semantic search)
3. Check KB for relevant article
4. Draft a reply — warm, specific, actionable. Link the article if applicable.
5. If escalation rules trigger (refund > $X, complaint, churned customer), tag for human-only path

Tone: <tone_guide block>. Always sign off as the team, not the AI.
Never promise refunds, timelines, or fixes — those are the team's call.
```

### First 5 minutes

1. Create org, invite team
2. Connect support tool (webhook URL from Phase B)
3. Upload / paste KB articles → indexed in vectorize
4. Configure tone guide + escalation rules
5. Existing ticket pulled via webhook → first draft appears in queue
6. Team reviews + sends → agent learns from their edits (corrections feed memory blocks over time)

### Failure modes

| Failure | Mitigation |
|---|---|
| Hallucinated product features | Persona insists on KB-grounded answers; if not in KB, agent says "I don't know — let me check with the team" |
| Tone-deaf responses to upset customers | Escalation rule: any "frustrated" / "angry" / "cancel" trigger words → human-only path, no draft |
| Repeats same generic reply across tickets | Vectorize the agent's OWN past drafts; persona checks for duplicates |
| Slow review = customer waiting | Per-ticket SLA timer; if approval pending > N hours, page the on-call human |
| Wrong assignee | Don't assign at all — present queue, team self-routes |

### Inspiration

- Intercom Fin (commercial — most mature)
- Zendesk Answer Bot (older, deflection-focused)
- Help Scout's AI features (lighter touch)
- Plain (modern support, AI helping the team not replacing)

---

## Playbook 6 — Document creation

### The shape

User asks for a document; agent generates a polished version. Could
be reports, proposals, contracts (with disclaimer), how-to guides,
client-facing decks. Output lands as a Google Doc + downloadable
markdown.

### Primitives wired

- **AutonomousAgent** (or just chat tools — depends on whether you want long-running workspace or one-shot)
- **Tools**: `docs_create_from_markdown` (Phase 26 — Google Docs), `create_artifact` (HTML preview in chat), web_search (research), browser_markdown (read source pages), R2 + `buildMarkdownDoc` (markdown export)
- **Skills** — common document templates as skills (`/proposal`, `/sow`, `/postmortem`)
- **Memory blocks**: brand voice, company facts, document style guide
- **Approval queue NOT needed** — output is for the user to review directly
- **BYOK** — clients use their own model
- **Vectorize semantic memory** — past documents indexed; agent maintains style consistency

### Agent persona shape

```
You write polished documents for {user.name} at {company.name}.

When the user asks for a document:
1. If structure isn't clear, ask 1-2 questions. Don't ask 5.
2. Research what you need (web_search, browser_markdown).
3. Write a draft. Use the company's voice (memory block).
4. Save as Google Doc via docs_create_from_markdown. Return the URL.
5. Also create_artifact for inline preview if useful.

You don't iterate verbosely. Write the thing, hand it over, let the
user request specific changes.
```

### First 5 minutes

1. Sign in
2. Connect Google (Drive + Docs)
3. Paste a sample of your writing → memory block "voice_sample"
4. Try the agent: "Draft a proposal for X" → in 60s, Google Doc URL + inline preview

### Failure modes

| Failure | Mitigation |
|---|---|
| Document is generic / could-be-anyone's-company | Voice sample memory block; explicit instruction to read it first; vectorize past documents |
| Hallucinated facts (made up stats, fake quotes) | Persona forbids invention; web_search grounds claims with citations; user reviews |
| Wrong document length (too long, too short) | Skills define length expectations per template |
| Slow on big docs | One-shot agent, no streaming UI needed; user waits 30-60s for a polished doc, fine |

### Inspiration

- Notion AI (in-app, good for rough drafts)
- ChatGPT with Canvas (split editing pane)
- Beautiful.ai (decks specifically)
- Reach (sales doc generation)

---

## Playbook 7 — Multi-agent research/writer pipeline

### The shape

Research-heavy task: gather sources, synthesise, write a polished
output. Researcher agent does the search + reading; writer agent does
the prose. Already shipped as worked example.

### Primitives wired

- **ResearcherAgent** + **WriterAgent** (worked examples in `src/server/modules/autonomous-agents/`)
- **Sub-agent handoff** via custom `delegate_to_writer` tool
- **Tools**: web_search, browser_markdown / firecrawl on researcher; LLM-only on writer (no tools — focus)
- **Vectorize semantic memory** on researcher — caches past research per topic
- **Approval queue** optional — research outputs are usually for the user, not destructive

### When to fan out vs single agent

Use multi-agent when:
- The two stages have very different cost profiles (research = flagship + grounding tools; writing = cheap LLM)
- You want different personas (research = curious / sceptical; writer = polished / precise)
- You want separate memory (researcher remembers sources; writer remembers tone preferences)

Use single agent when:
- The task is short and the cost difference doesn't matter
- The user wants to see the agent's research in-line (not abstracted away)

### Inspiration

- GPT Researcher (OSS multi-agent research)
- Perplexity (single agent, good at the research handoff implicitly)
- Stanford STORM (academic-grade multi-agent writing)

---

## Anti-patterns

Things that look good but bite. Avoid.

### Putting agents directly on destructive APIs without approval

"It's just sending an email, what could go wrong?" Agents will
sometimes get the recipient wrong, the subject wrong, or send
duplicates. **Always queue for approval** for any send / post /
publish / transact action. Even your own account isn't safe.

### Recurring agents without budget gates

A scheduled agent that runs hourly with no cost cap will eventually
do something expensive (long context, retries, tool fan-out) and
spike your bill. Phase D budget gate is non-optional for any agent
that fires autonomously.

### One agent with all tools

Resist the urge to give your "main" agent access to everything. Tool
count above ~20 makes the model less reliable at picking the right
one. Tool Search (Phase K) helps, but **multiple specialised agents**
is the better answer when scopes are clear (research vs write,
triage vs respond, etc).

### Per-message agents instead of per-entity / per-user

Agents are DOs. DO instances are cheap but not free; each one has
storage + state + memory. A "new agent per chat message" pattern
churns instances. **Stable partition keys** (`${userId}:${slug}`)
keep state coherent and reduce DO churn.

### Skipping the approval queue UI

The approval queue (Phase A + G) only works if the user actually
sees pending approvals. **Wire the bell badge + the /approvals tab**.
A queue nobody checks is a paper safety belt.

### Trusting the agent's task plan over reality

The "Planned → Reviewed → Concluded" pattern is for human
visibility, not contract. Agents say they'll do X then do Y.
**Verify outputs, not plans.** Cost tracking + agent_runs audit are
the actual receipts.

### Generic-everything personas

"You are a helpful assistant" produces generic-helpful-assistant
output. **Specific personas with examples** of good output produce
the desired voice. Show the model what you want; tell it what to
avoid.

### Memory blocks as a dumping ground

Blocks cost input tokens every turn. **Keep them small + structured.**
Long-tail prose facts go in semantic memory (Vectorize). Blocks are
for rules, preferences, identity facts the model should always know.

---

## Cross-cutting tips

### Persona testing

Before shipping an agent, run 5 representative requests through it
with the production persona. Note where it produces generic output;
tighten the persona; re-run. Most agent quality issues are persona
issues.

### Cost shape

Look at the `agent_runs` table after a week. If a single agent class
dominates spend, either: it's working harder than needed (tighten
persona / reduce maxSteps / cap Tool Search activations) OR it's the
wrong agent for the job (swap to a specialised cheaper one).

### Approval queue hygiene

Stale approvals (sitting > 24h) are signal that the agent is queuing
too much OR the user is overwhelmed. Add a daily digest of pending
approvals — "you have 12 drafts waiting" — instead of letting them
silently accumulate.

### Ship narrow first

The starter has every primitive. The temptation is to wire all of
them in v1. Resist. Ship one workflow end-to-end — say, just email
triage — and use it daily. Other workflows reveal themselves as
"oh, the agent should also do X."
