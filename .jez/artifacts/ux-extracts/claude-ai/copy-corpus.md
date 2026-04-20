# Copy Corpus — claude.ai

Verbatim text extracted 2026-04-20. For writers referencing the claude.ai voice.

---

## Greeting

- `Good afternoon, Jeremy`
- `Good morning, Jeremy`
- `Good evening, Jeremy`

Pattern: `Good {morning|afternoon|evening}, {FirstName}`. No exclamation.

---

## Compose placeholders

- `How can I help you today?` (default on `/new`)
- `Type / for skills` (when skills are installed)
- `Reply...` (inside a conversation)
- `Find a small todo in the codebase and do it` (Claude Code compose)
- `Search or start a chat` (command palette)
- `Search projects...`
- `Search your chats...`
- `Project name`
- `Search…` (inside Design)

---

## Preset prompt categories (observed variants)

Category labels (two variants seen in the same account, different sessions):

- Variant A: `Write`, `Learn`, `Code`, `Life stuff`, `Claude's choice`
- Variant B: `Write`, `Strategize`, `Career chat`, `Claude's choice`

Full preset prompts: see the main pattern-library.md tables under [Home / New Chat](./pattern-library.md#home--new-chat).

Clicking a preset tab auto-fills compose with a structured starter:

> Hi Claude! Could you brainstorm creative ideas? If you need more information from me, ask me 1-2 key questions right away. If you think I should give you more context …

> Hi Claude! Could you help me develop and hone a strategy? If you need more information from me, ask me 1-2 key questions right away. If you think I should give you more context …

Template shape: `"Hi Claude! Could you {task}? If you need more information from me, ask me 1-2 key questions right away. If you think I should give you more context …"`.

---

## Primary CTAs

- `New chat`
- `New project`
- `New artifact`
- `New session`
- `Share`
- `Download`
- `Create`
- `Create share link`
- `Go back home`
- `Skip intro`
- `Disconnect`
- `Turn on`
- `Select` (enter select mode in Recents)

---

## Model picker

- `Opus 4.7 / Most capable for ambitious work`
- `Sonnet 4.6 / Most efficient for everyday tasks`
- `Haiku 4.5 / Fastest for quick answers`
- `Adaptive thinking / Thinks for more complex tasks`
- `More models ›`
- (tooltip) `Opus consumes usage limits faster than other models`

---

## Attach / + menu

- `Add files or photos`
- `Take a screenshot`
- `Add to project ›`
- `Add from GitHub`
- `Skills ›`
- `Connectors ›`
- `Ask Jezweb` (org-specific agent — label varies per org)
- `Research`
- `Web search` (toggle — shown with ✓ when enabled)
- `Use style ›`

---

## Share modal

- Title: `Share chat`
- Subtitle: `Only messages up to this point will be shared.`
- Option 1: `Keep private / Only you have access`
- Option 2: `Shared / Anyone in Jezweb can view`
- Button: `Create share link`

---

## Conversation footer

- Default: `Claude is AI and can make mistakes. Please double-check responses.`
- When citations present: `Claude is AI and can make mistakes. Please double-check cited sources.`

---

## Thought-process summaries (assistant message lead-in)

- `Synthesized blog content to extract relevant guidance ›`
- `Synthesizing insights on bottlenecks and agent-native concepts ›`
- `Architected three markdown essays in Jez's voice ›`

Pattern: past-tense verb + object + `›` chevron. One-line preview of internal reasoning.

---

## Customize hub

- h1: `Customize Claude`
- Subtitle: `Skills, connectors, and plugins shape how Claude works with you.`
- Card 1 title: `Connect your apps`
- Card 1 subtitle: `Let Claude read and write to the tools you already use.`
- Card 2 title: `Create new skills`
- Card 2 subtitle: `Teach Claude your processes, team norms, and expertise.`

---

## Skills detail

- Meta labels: `Added by`, `Last updated`, `Trigger` (with values like `Slash command + auto`)
- Section label: `Description` (with ⓘ info-tooltip trigger)

---

## Connectors detail

- Top action: `Disconnect`
- Section: `Tool permissions`
- Subtitle: `Choose when Claude is allowed to use these tools.`
- Group headers: `Read-only tools`, `Write/delete tools` (with counters)
- Permission dropdowns: `Needs approval ▾`, `Always allow ▾`

---

## Projects

- h1: `Projects`
- Search placeholder: `Search projects...`
- Sub-tabs: `Your projects`, `Team`, `Shared with you`
- Sort: `Sort by Activity ▾`
- Card footer: `Updated N months ago`
- Badge: `Example project`

---

## Project detail

- Back link: `← All projects`
- Meta join: `Created by you · Shared with your org`
- Tabs: `Your chats | Activity`
- Privacy note: `🔒 Your chats are private until shared`
- Right-sidebar sections: `Memory`, `Instructions`, `Files`
- Permission chips: `🔒 Only you`, `👥 All project users`
- Status line: `Some tools are off · Turn on`
- Capacity line: `1% of project capacity used`

---

## Artifacts

- h1: `Artifacts`
- CTA: `New artifact`
- Tab: `Your artifacts`
- Card meta: `Last edited N months ago · Published`
- Format pills: `MD`, `JSX`, `HTML`

---

## Recents

- h1: `Chats`
- CTA: `+ New chat`
- Sub-header: `Your chats with Claude` + `Select` (row-selection mode)
- Row meta: `Last message N ago` (N = hours / days / weeks / months)

---

## Claude Code

- Title: `Claude Code` (serif)
- Badge: `Research preview`
- Nav items: `New session`, `Routines`
- Filter: `All projects ▾`
- Banner: `Try Claude Code on desktop` / `Download`
- Compose placeholder: `Find a small todo in the codebase and do it`
- Context chips: `☁ Select a repository`, `Default ▾` / `Full Access ▾`
- Auto-session-naming: `mac-{adjective}-{noun}` (e.g. `mac-sequential-avalanche`, `mac-splendid-elephant`, `mac-purrfect-reddy`, `mac-wild-duckling`, `mac-concurrent-summit`, `mac-idempotent-pie`, `mac-glistening-unicorn`, `mac-agile-moore`, `mac-reactive-catmull`, `mac-splendid-elephant`)

---

## Claude Design

- Title: `Claude Design` (serif)
- Subtitle: `by Anthropic Labs`
- Badge: `Research Preview`
- Intro display type: `Import your team's design system`
- Intro dismiss: `Skip intro`
- Content types: `Prototype`, `Slide deck`, `From template`, `Other`
- New-prototype fidelity: `Wireframe`, `High fidelity`
- Design-system selector: `None ▾`
- CTA: `+ Create`
- Privacy note: `Anyone in Jezweb with the link can see your project by default.`
- Sidebar tabs: `Recent`, `Your designs`, `Examples`, `Design systems`
- Onboarding card: `Learn about Claude Design / Quick tutorial`
- Identity chips in header: `👤 Jeremy`, `🏢 Jezweb`, `📚 Docs`

---

## 404 page

- h1: `Page not found`
- Subtitle: `Claude can help with many things, but finding this page isn't one of them.`
- Button: `Go back home`

---

## Keyboard shortcuts sheet

- Modal title: `Keyboard shortcuts`
- Section: `General`
- Section: `In chats`
- Labels: `Quick chat or search`, `Incognito chat`, `Toggle sidebar`, `Keyboard shortcuts`, `Settings`, `Send message`, `New line in message`, `Toggle extended thinking`, `Upload file`, `Stop Claude's response`

---

## Command palette

- Placeholder: `Search or start a chat`
- Sections: `Quick actions`, `Recents ›`, `Actions ›`
- Footer: `Select ↑↓ | Actions ⇥ | Open menu ⌘K`

---

## Plan indicator

- User footer: `Jeremy Dawes / Max plan`

Pattern: `{Full name} / {Plan tier}`. Tier values likely include `Free`, `Pro`, `Max`, `Team`, `Enterprise`.

---

## Tone notes for writers

- **Apostrophes typographic**: `Claude's`, `isn't`, `I'm`, `you're`
- **Sentence-case headings**: `Page not found` (not `Page Not Found`), `Customize Claude`
- **No exclamation marks** in chrome
- **Verb-first CTAs**: `New chat`, `Create`, `Turn on`, `Teach Claude your processes`
- **Second-person "you"**: `Let Claude read and write to the tools you already use.`
- **First-person "Claude"**: `Claude can help with many things, but finding this page isn't one of them.`
- **Plural "we" absent** — never used in UI chrome
- **No em-dashes** in UI chrome
- **Privacy reassurance right-sized**: one short clause, immediately where it's relevant
- **Muted disclaimer tone**: not apologetic, not defensive — matter-of-fact ("Claude is AI and can make mistakes")
