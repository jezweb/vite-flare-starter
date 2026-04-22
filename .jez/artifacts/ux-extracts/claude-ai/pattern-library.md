# Pattern Library: claude.ai

**Extracted**: 2026-04-20
**URL**: https://claude.ai
**Scope**: Whole app (authenticated, Max plan + Jezweb org membership)
**Focus lens**: none — broad capture
**Viewports**: 1440×900 baseline + 375×812 mobile
**Browser**: Playwright MCP (logged-in session) + Chrome MCP (earlier dark-theme probe)
**Screenshots**: 23 in `./screenshots/` — all saved to disk, referenced inline
**Extract methodology**: DOM inspection (role/aria/placeholder/labelling), keyboard-triggered state changes (Cmd+K, Cmd+/, F8), navigation across every primary surface, explicit click-to-open for modals and menus, responsive resize, textual observation of copy and structure.

---

## Contents

1. [App overview](#app-overview)
2. [Theme and typography](#theme-and-typography)
3. [Wayfinding](#wayfinding)
4. [Home / New Chat](#home--new-chat)
5. [Compose card](#compose-card)
6. [Conversation view](#conversation-view)
7. [Project detail](#project-detail)
8. [Lists & Grids](#lists--grids)
9. [Command palette](#command-palette)
10. [Keyboard shortcut sheet](#keyboard-shortcut-sheet)
11. [Model picker](#model-picker)
12. [Attach / + menu](#attach---menu)
13. [Share modal](#share-modal)
14. [Customize (Skills + Connectors)](#customize-skills--connectors)
15. [Sub-products (Code, Design)](#sub-products-code-design)
16. [404 page](#404-page)
17. [Responsive (mobile 375)](#responsive-mobile-375)
18. [Copy & Microcopy](#copy--microcopy)
19. [Notable absences](#notable-absences)
20. [Observed variants / A-B signals](#observed-variants--a-b-signals)
21. [Re-extraction](#re-extraction)
22. [How VFS consumes this](#how-vfs-consumes-this)

---

## App overview

Claude.ai is a single-page app centred around a **collapsed icon rail** (56px) on the left, with a main content area that adapts to the surface. Layouts:

- **1-column centred**: home (`/new`), conversation view, list pages
- **2-column**: Claude Code (`/code`) — sessions left + compose right
- **3-column**: Customize (`/customize/*`) — app rail + customize nav + main content
- **3-column (project)**: Project detail (`/project/{id}`) — app rail + main chat list + right-side project sidebar (Memory / Instructions / Files)

The rail never goes away (except in mobile). Top bars are minimal — a conversation view shows only `Share` and a title dropdown; most lists have just a header and an action button top-right. No persistent footer.

### Sitemap (authenticated routes)

| Path | Surface | Screenshot |
|------|---------|-----------|
| `/new` | New-chat home with compose + preset categories | `010-home-default-light.png` |
| `/chat/{uuid}` | Individual conversation | `080-chat-conversation-light.png` |
| `/recents` | All chats list with search | `030-recents-light.png` |
| `/projects` | Projects grid | `020-projects-grid-light.png` |
| `/project/{uuid}` | Project detail (sidebar with Memory/Instructions/Files) | `130-project-detail-light.png` |
| `/artifacts/my` | User's artifacts grid | `040-artifacts-grid-light.png` |
| `/code` | Claude Code web (research preview) | `060-code-sessions-light.png` |
| `/code/draft_{uuid}` | Claude Code session |  same as above |
| `/design` | Claude Design landing (Anthropic Labs) | `070-design-landing-light.png`, `071-design-home-light.png` |
| `/customize` | Skills + Connectors hub | `050-customize-hub-light.png` |
| `/customize/skills` | Skills list + detail | `051-customize-skills-light.png` |
| `/customize/connectors` | Connectors list + detail | `052-customize-connectors-light.png` |
| `/login` | Sign-in landing (unauth) | `005-login-landing.png` |
| 404 | Not-found page | `090-404-light.png` |

---

## Theme and typography

### Two themes

- **Light**: near-white (`#F8F7F4`-ish warm cream) background with dark text. Cards are subtly raised with a thin 1px border (barely visible) + shadow. Default on systems with light OS preference. See `010-home-default-light.png`.
- **Dark**: near-black (`#111`-ish) with warm off-white text. Same layout. Activates on systems with dark OS preference (captured via Chrome MCP earlier, IDs `ss_6021ecs4p`, `ss_8281oo9wt` — not saved to disk).

**No in-app toggle observed** — the theme follows OS preference.

### Typography

- **Body / UI**: sans-serif (looks like Inter or similar)
- **Headings + assistant-message body**: **transitional serif** (feels like Tiempos Text or Caslon) — this is the signature typography choice. It gives assistant responses a "publishing" quality distinct from the input UI and sets Claude apart from every other chat app.
- **Display type in Claude Design**: sans-serif, rounded, playful — entirely different identity. Design is its own product.
- **Monospace**: used sparingly — filenames in artifact cards (`oauth-setup-guide.jsx`, `sxm-dealer-app-proposal-v3.md`) and inline code chips in responses.

### Accent colour

- **Ember orange** (`#D97757`-ish) — the starburst logo, citation pill tints, focus states in some places, and (the most distinctive touch) a subtle orange glow around the **page viewport edge** when a modal is open. Sits between rose and terracotta.
- **Blue** (`#3B82F6`-ish) — used for focus rings on inputs, toggle switches, active-state underlines on tabs, and the "currently-enabled" highlight on menu items (see Web search in `111-attach-menu-light.png`). The Anthropic brand sparingly reaches for blue; it signals "system / UI state" rather than "brand".

### Border-radius ladder

- Cards: ~16-20px
- Compose card: ~20-24px (visibly rounder)
- Modal: ~20-24px matches compose
- Buttons: ~8-10px (pills for primary, rectangular with small radius for secondary)
- Key-glyph pills (in keyboard sheet): ~6px squares

---

## Wayfinding

### Icon rail (default)

Fixed left, 56px wide, full viewport height. Top-to-bottom:

1. Sidebar-toggle icon (top-left)
2. `+` new chat
3. 🔍 search
4. 💼 customize (briefcase)
5. 💬 chats (speech-bubble)
6. 📦 projects (box)
7. ✨ artifacts (sparkle-grid)
8. `</>` code
9. 🎨 design (palette)
10. — spacer —
11. 📥 download-cloud badge (with blue indicator dot — "install desktop" hint)
12. 👤 circular user avatar (bottom)

Active-page indicator: subtle rounded background tint behind the active icon. No stripe, no border.

Reference: `010-home-default-light.png` (collapsed rail visible on left).

### Expanded sidebar

Triggered by clicking the sidebar-toggle or pressing `⌘.`. ~260-280px wide.

- Top: "Claude" wordmark (serif) + collapse-toggle
- Primary actions listed with keyboard shortcuts:
  - `+ New chat ⇧⌘O`
  - `🔍 Search ⌘K`
  - `💼 Customize` (no shortcut)
- Nav links (no shortcuts shown): `Chats`, `Projects`, `Artifacts`, `Code`, `Design`
- `Recents` section header with `Hide` inline affordance
- Flat list of recent conversation links (~25 items, then `All chats` link)
- Footer: user avatar + `Jeremy Dawes / Max plan` + download-cloud + sort controls

Reference: `040-artifacts-grid-light.png` shows an expanded sidebar context.

### Current-location indicator

Active row gets a slightly darker/warmer background fill behind the whole row. No left-edge stripe. Inactive icons/rows are plain.

### Breadcrumbs

Absent. The only "back to parent" affordance is the `← {parent}` chevron in Customize sub-pages and project detail (`← All projects`).

### Back navigation

Browser back works. Sub-pages of Customize provide an explicit `← Customize` chevron. Project detail shows `← All projects`. Not otherwise present.

---

## Home / New Chat

Route: `/new`. Reference: `010-home-default-light.png`.

### Org indicator

Small chip above the greeting: `🏢 Jezweb` — workspace/org context indicator. Pill-style, neutral, ~14px. Present when user belongs to a workspace.

### Greeting

- Pattern: `Good {morning|afternoon|evening}, {FirstName}` — no exclamation, warm neutral
- Type: serif, ~48px, centred
- Leading glyph: ember-orange starburst (the Claude logo)
- Position: ~30% down the viewport

### Compose card

Centred, ~720-760px wide (narrower than the main content area). See [Compose card](#compose-card) for full detail.

### Preset prompt tabs

Row of 4-5 chips below the compose card. Each chip has a small icon + label.

**Observed variant A** (dark theme, Chrome MCP session):
`Write · Learn · Code · Life stuff · Claude's choice`

**Observed variant B** (light theme, Playwright session, same user):
`Write · Strategize · Career chat · Claude's choice`

Conclusion: claude.ai rotates categories / A-B tests them / personalises by recent behaviour. The *concept* is stable — 4-5 categories with contextual sub-prompts — the labels are not.

### Tab interaction

Clicking a tab does two things simultaneously (see `011-home-write-tab-light.png`):

1. **Auto-fills the compose** with a structured starter prompt, e.g. *"Hi Claude! Could you brainstorm creative ideas? If you need more information from me, ask me 1-2 key questions right away. If you think I should give you more context …"* — this is a cleverly framed template that encourages Claude to clarify before answering
2. **Opens a sub-popover** immediately below the compose with 5 more-specific prompts + a `×` to dismiss + the tab label as title with its icon

The sub-popover's first item is keyboard-focused (blue outline ring). Arrow-key navigate + Enter to select.

### Verbatim preset prompts

**Variant A (dark-theme session)**:

| Write | Learn | Code | Life stuff | Claude's choice |
|---|---|---|---|---|
| Draft an outline for my project | Create a study plan | Assess my approach to debugging problems | Create a personal budget | Examine nature phenomena |
| Help me identify my writing weaknesses | Develop a learning framework based on my personal heroes | Create technical specifications | Create a personal development plan | Investigate scientific mysteries |
| Write case studies | Transform a dry subject into something fascinating | Develop coding standards | Develop self-care practices | Explore ancient wisdom |
| Develop content calendars | Compare learning resources | Help me develop a personal learning roadmap for coding | Plan special celebrations | Explore thought experiments |
| Draft email newsletters | Create educational games | Look over my code and give me tips | Create cleaning routines | Explore a fascinating concept |

**Variant B (light-theme session)** — `Write` and `Strategize` captured:

| Write | Strategize |
|---|---|
| Brainstorm creative ideas | Help me develop and hone a strategy |
| Write executive summaries | Develop KPI dashboards |
| Develop character profiles | Design a strategy inspired by patterns found in nature |
| Write grant proposals | Plan expansion opportunities |
| Create user documentation | Design a strategy game based on my business challenges |

### Top-right area

- 👻 ghost icon — notifications drawer (aria: `"Notifications (F8)"`). `F8` is an unusual but memorable shortcut.

---

## Compose card

Appears in multiple contexts with small variations.

### Anatomy

- **Background**: slightly raised from page (`#fff` on light, `#1a1a1a` on dark) with thin 1px border
- **Border-radius**: ~20-24px — noticeably rounder than cards
- **Placeholder text**: rotates by context (see below)
- **Bottom bar**:
  - Bottom-left: `+` attach-entry button (aria `"Add files, connectors, and more"`)
  - Bottom-right: model label as a clickable dropdown — e.g. `Opus 4.7 Adaptive ▾`
  - Far-right: 4-bar-equaliser voice-mode icon (aria `"Use voice mode"`)
- **Send**: no visible send button until text entered — `⏎` is the primary send

### Placeholder variants

| Context | Placeholder | Screenshot |
|---------|-------------|-----------|
| `/new` home, initial | `How can I help you today?` | `010-home-default-light.png` |
| `/new` home, after skills installed | `Type / for skills` | (captured via `/new` after skills page visit — same session drift) |
| `/chat/{uuid}` reply | `Reply...` | `080-chat-conversation-light.png` |
| `/code/draft_{uuid}` session | `Find a small todo in the codebase and do it` | `060-code-sessions-light.png` |
| `/project/{uuid}` | `How can I help you today?` | `130-project-detail-light.png` |

The `/` trigger invoking skills is confirmed by the placeholder change — it's a slash-command UX for invoking project-level skills.

### Auto-fill from preset tab

Clicking a preset tab (see [Home](#home--new-chat)) pre-populates the textbox with a structured template. The text is editable before sending.

### Voice mode

The equaliser glyph opens a voice-first interaction mode. Not exercised in this extract.

---

## Conversation view

Route: `/chat/{uuid}`. Reference: `080-chat-conversation-light.png`.

### Header

- **Left**: conversation title + `▾` chevron (rename / menu trigger)
- **Right**: `📄` document-icon (likely "view as markdown" or artefact) + `Share` outlined button

Minimal — no model indicator in header, no "back" button, no settings, no star in header (projects have star, individual chats don't by default).

### User message

- **Alignment**: right, but the bubble starts from left-of-centre — messages take the reading column's width, not just a speech-bubble on the far right
- **Background**: filled light-grey rounded rectangle (`#F2F2EE`-ish on light)
- **Typography**: sans-serif body, regular weight
- **No avatar, no sender name, no timestamp by default**
- **Padding**: ~16-20px
- **Links**: rendered inline as underlined text
- Hover actions (from aria harvest): `Edit`, `Copy`

### Assistant message

- **Alignment**: left, edge of reading column
- **No bubble chrome** — just text on the page background
- **Typography**: **transitional serif** body — biggest single visual differentiation from the user message
- **Bold / emphasis**: rendered inline in serif
- **Lists / tables / code**: standard markdown rendering
- **Hover actions**: `Retry` (×2 — plain vs with edits?), `Copy` (×2 — plain vs markdown?), `Give positive feedback`, `Give negative feedback`

### Thought-process summary

Inline between messages or just above an assistant response:

- One-line summary prefixed by no glyph, suffixed by `›` chevron
- Examples captured: *"Synthesized blog content to extract relevant guidance ›"*, *"Synthesizing insights on bottlenecks and agent-native concepts ›"*, *"Architected three markdown essays in Jez's voice ›"*
- Clickable to expand the reasoning content
- Muted colour, smaller than response body

### Citation pills

Inline tinted pills at the end of cited sentences. Caught in dark-theme capture as `claude` (rose-tinted) — indicates RAG-fetched content. Click presumably expands a source panel (not exercised this session).

### Scroll-to-bottom affordance

When scrolled up mid-conversation, a **floating down-arrow button** appears centred-above the compose card. Aria `"Scroll to bottom"`. Visible in `080-chat-conversation-light.png`.

### Reply compose

Sticky to bottom. `Reply...` placeholder. Model picker shows the conversation's current model (can differ from home default).

### Footer disclaimer

Muted text, centred below compose:

- **Default**: `Claude is AI and can make mistakes. Please double-check responses.`
- **When citations present**: `Claude is AI and can make mistakes. Please double-check cited sources.`

The string changes dynamically based on content — subtle but observed.

---

## Project detail

Route: `/project/{uuid}`. Reference: `130-project-detail-light.png`.

### Layout — 3-column

1. **App icon rail** (56px)
2. **Main column** (primary — takes most of the width): project header + compose card + chat list
3. **Right sidebar** (~360px): Memory / Instructions / Files

### Main column

- **Back link**: `← All projects`
- **Project title**: serif, h1 style
- **Description**: regular sans-serif below title
- **Meta line**: `Created by you · Shared with your org` — dot-separator joined
- **Top-right actions**: `⋯` menu, ★ star (favourite — filled black when active), `Share` button
- **Compose card**: full standard compose (see [Compose card](#compose-card)) — lives inside the project scope
- **Tabs**: `Your chats | Activity`
- **Privacy note** beside tabs: `🔒 Your chats are private until shared`
- **Chat list**: each row = title + `Last message N ago` — same format as Recents but filtered to this project

### Right sidebar — Memory

- **Header**: `Memory` + permission chip `🔒 Only you` + pencil-edit icon
- **Content**: text preview of the memory (truncates at ~2 lines with ellipsis)
- **Meta**: `Last updated N days ago`

### Right sidebar — Instructions

- **Header**: `Instructions` + permission chip `👥 All project users` + pencil-edit icon
- **Content**: text preview of project instructions
- **Tool strip**: ~16 brand-icon chips in a grid — each is a connector/skill enabled for this project. Some have different brand icons (solid fill), suggesting mixed provider types
- **Status line**: `Some tools are off · Turn on` (clickable link)

### Right sidebar — Files

- **Header**: `Files` + permission chip `👥 All project users` + `+` add button
- **Capacity bar**: thin progress bar + `N% of project capacity used`
- **File grid**: 3-column mini-cards, each showing filename, line count, format pill (`MD`, etc)

### Memory / Instructions / Files pattern

Clear separation:

| Scope | Memory | Instructions | Files |
|-------|--------|--------------|-------|
| Who can see | Only you | All project users | All project users |
| Edit | Pencil icon | Pencil icon | `+` add + inline actions |
| Purpose | Private assistant-side context | Shared project system prompt | Shared knowledge base |

This three-layer model (private memory / shared system prompt / shared files) is a pattern other chat apps could adopt.

---

## Lists & Grids

### Projects grid (`/projects`)

Reference: `020-projects-grid-light.png`. 

- **Header**: serif h1 `Projects` + dark `+ New project` pill button top-right
- **Search bar**: full-width input with magnifier icon, `Search projects...` placeholder, visible blue focus-ring in capture
- **Sub-tabs**: `Your projects | Team | Shared with you` — blue underline on active
- **Sort control**: `Sort by Activity ▾` right-aligned under sub-tabs
- **Layout**: 2-column grid (at 1440 viewport)
- **Card anatomy**:
  - Bold project name
  - 2-3 line description (sans-serif)
  - `Updated N months ago` footer (small, muted)
  - Hover: subtle background tint (not shown — inferred)
  - Some cards have an `Example project` pill badge next to the name (grey, filled)

### Artifacts grid (`/artifacts/my`)

Reference: `040-artifacts-grid-light.png`.

- **Header**: serif h1 `Artifacts` + dark `New artifact` pill button top-right
- **Sub-tabs**: `Your artifacts` (blue underline; other tabs may appear for orgs — single tab in this capture)
- **Layout**: 2-column at 1440 (was 3-column in an earlier account with more artifacts)
- **Card anatomy**:
  - Large **rendered preview** of the artifact content — if markdown/code, shows the first ~100 words; if embed, shows the rendered first-frame
  - Bottom of preview card: view-count badge (eye icon + number) in pill chip
  - Below preview: filename in a slightly bolder sans (looks like a mono variant): `oauth-setup-guide.jsx`, `sxm-dealer-app-proposal-v3.md`
  - Meta line: `Last edited N months ago · Published` (visibility badge on right)

### Recent chats (`/recents`)

Reference: `030-recents-light.png`.

- **Header**: serif h1 `Chats` + dark `+ New chat` pill
- **Search bar**: full-width with `Search your chats...` placeholder
- **Sub-header row**: `Your chats with Claude` + `Select` (a row-selection mode — confirms bulk-actions ARE available once you enter select mode)
- **Row anatomy**: bold title + `Last message N ago` — emoji-prefixed titles preserved
- **Truncation**: ellipsis on long titles
- **Hover action**: `⋯` three-dot button (revealed on hover — not shown in capture)
- **Date grouping**: not used — flat chronological list

### Skills list (inside Customize)

Reference: `051-customize-skills-light.png`.

Grouped by `Personal skills` (collapsible) and `Organization skills` (collapsible). Each group header has a `▾` disclosure. Skill rows have a scroll-document icon + lowercase-hyphen skill name. Search icon + `+` add at the top-right of the list column.

### Connectors list (inside Customize)

Reference: `052-customize-connectors-light.png`.

Grouped by category (`Web` shown, others off-screen). Each row: brand icon + connector name + optional `CUSTOM` pill (for user-added MCPs). The current account has ~25 connectors, many `CUSTOM`.

---

## Command palette

Trigger: `⌘K` from anywhere. References: `100-command-palette-light.png`.

### Layout

- Centred modal, ~700px wide (smaller on light than the impression given by dark capture)
- Rounded-card chrome, soft shadow, no visible outer glow on light theme (unlike dark)
- Dimmed backdrop (~40% overlay)

### Input row

- Icon-less input with `Search or start a chat` placeholder
- `×` dismiss top-right

### Sections

Each section header is clickable (`›` disclosure to expand/show more):

1. **Quick actions** — default-expanded, just `New chat` with `⏎` enter-hint on the right
2. **Recents ›** — default-expanded with 5 most-recent items
   - Mixed row types: projects (box icon), chats (speech icon), Code sessions (`</>` icon)
   - Subtitle column: project-owner name (for projects) or relative time ("Today", "Yesterday", "Past week", "Just now")
3. **Actions ›** — default-expanded with top-level nav items (Projects, Ask Jezweb, Code, …)
   - "Ask Jezweb" appears as an action here — the org agent surfaces in multiple menus (palette, attach menu)

### Row focus

Focused row: neutral background fill + `⏎` enter-glyph on the right.

### Footer hint bar

Always visible at the bottom: `Select ↑↓ | Actions ⇥ | Open menu ⌘K`. Each key is a rounded-square pill.

### Keyboard

- `⌘K` toggle
- `↑↓` move
- `⏎` select
- `⇥` switch to actions mode on a row
- `Esc` dismiss

---

## Keyboard shortcut sheet

Trigger: `⌘/`. Reference: `101-keyboard-shortcuts-light.png`.

### Layout

- Centred modal, ~420px wide — narrower than the command palette
- Title `Keyboard shortcuts` + `×` close
- Two sections with header labels: `General`, `In chats`

### Row format

`Label` (sans-serif, left) → key-stack (right). Each key is an individual rounded-square pill. Multi-key combos render as separate pills with a small gap, e.g. `⇧` `⌘` `I`.

### Complete shortcut list

| Section | Action | Keys |
|---------|--------|------|
| General | Quick chat or search | `⌘K` |
| General | Incognito chat | `⇧⌘I` |
| General | Toggle sidebar | `⌘.` |
| General | Keyboard shortcuts | `⌘/` |
| General | Settings | `⇧⌘,` |
| In chats | Send message | `⏎` |
| In chats | New line in message | `⇧⏎` |
| In chats | Toggle extended thinking | `⇧⌘E` |
| In chats | Upload file | `⌘U` |
| In chats | Stop Claude's response | `Esc` |

Note: `?` (alone) does **not** open the sheet — it's `⌘/` specifically. The shortcut to open the shortcut sheet is itself listed in the sheet (recursive self-documentation — nice touch).

---

## Model picker

Trigger: click the `Opus 4.7 Adaptive ▾` label in any compose card. Reference: `110-model-picker-light.png`.

### Anatomy

- Popover anchored to the model-picker label (bottom-right of compose)
- ~260px wide
- Rounded-card chrome, soft shadow

### Rows — top tier (3 models)

Each row: model name (bold) + description line (muted, smaller).

| Model | Description |
|-------|-------------|
| **Opus 4.7** | Most capable for ambitious work |
| **Sonnet 4.6** | Most efficient for everyday tasks |
| **Haiku 4.5** | Fastest for quick answers |

The selected row is rendered in reverse (dark bg + light text) with a ✓ check on the right.

### Usage warning tooltip

When Opus 4.7 is selected, a **hover callout to the right** of the model-picker row appears: *"Opus consumes usage limits faster than other models"*. Black-on-black with muted body — warning style.

### Adaptive thinking toggle

Row below the three models:

- Label: `Adaptive thinking`
- Subtitle: `Thinks for more complex tasks`
- Right-side: blue iOS-style switch (on/off)

This is **a separate axis from model choice** — any model can have adaptive thinking on.

### More models

Bottom of popover: `More models ›` — expand-arrow suffix. Likely leads to legacy models, Opus 4.6, research models, etc. Not exercised.

---

## Attach / + menu

Trigger: click the `+` in the compose card's bottom bar. Reference: `111-attach-menu-light.png`.

### Layout

- Popover anchored to the `+` (bottom-left of compose)
- ~240px wide
- Rounded-card chrome, soft shadow

### Rows (in order)

| Icon | Label | Behaviour | Notes |
|------|-------|-----------|-------|
| 📎 | Add files or photos | Upload file from device | First row, topmost priority |
| 📷 | Take a screenshot | Opens screen-capture UI | Browser permission dialog expected |
| 📦 | Add to project › | Attach project as context | Submenu: list of user's projects |
| 🐙 | Add from GitHub | Connect + pick repo | Single-step GitHub integration |
| 📜 | Skills › | Pick a skill to invoke | Submenu of installed skills |
| 🧩 | Connectors › | Pick a connector | Submenu of connected MCPs |
| 🏢 | Ask Jezweb | Route to Jezweb-org assistant | Org-specific agent entry |
| 🔎 | Research | Enter deep-research mode | Button — probably toggles a flag on the compose |
| 🌐 | **Web search** ✓ | Toggle web-search | Highlighted in blue with ✓ — currently enabled. Toggle state, not navigate |
| 🎨 | Use style › | Pick a writing-style preset | Submenu |

Key observations:

- `+` is a **single entry point** for all out-of-compose content. No separate upload button, no separate connector menu, no separate skills picker. This keeps the compose visually clean.
- **Enabled-state indication**: blue text + ✓ on a row that's currently active (see Web search). Not a toggle switch — the ✓ indicates "this is on"; clicking toggles it off.
- Mixed submenu-chevrons (`›`) and action items (no chevron) — submenus lead somewhere, action items do something immediately.

---

## Share modal

Trigger: click `Share` in a conversation view. Reference: `120-share-modal-light.png`.

### Layout

- Centred modal, ~460px wide
- Title `Share chat` + `×` close
- Subtitle: `Only messages up to this point will be shared.`

### Options (single-select)

| Icon | Label | Description | Selected indicator |
|------|-------|-------------|-------------------|
| 🔒 | Keep private | Only you have access | ✓ on right (default) |
| 🏢 | Shared | Anyone in Jezweb can view | (unselected) |

No public-link option visible on this account. This may be:
- A Max-plan-only limitation
- An org-admin policy (org sharing allowed but no public link)
- The public-share option is behind an additional interaction (click Shared → then public-link option appears)

### Primary button

`Create share link` (filled dark, bottom-right). Must click Create after choosing visibility.

### Pattern significance

The "messages up to this point will be shared" clause is a **subtle but important** piece of copy. It sets expectations for share-link + continue-editing flows — the share freezes at the current turn, not live-updates as you continue chatting.

---

## Customize (Skills + Connectors)

Route: `/customize`. Reference: `050-customize-hub-light.png`, `051-customize-skills-light.png`, `052-customize-connectors-light.png`.

### Hub layout (`/customize`)

3-column shell:

1. App icon rail (56px)
2. Customize nav (~220px): `← Customize` title + `Skills`, `Connectors` items
3. Main content: centred illustration + h1 + subtitle + two cards

### Hub content

- Hand-drawn **pencil-style toolbox illustration** (contrasts the geometric polish elsewhere — feels more human)
- Serif h1: `Customize Claude`
- Subtitle: `Skills, connectors, and plugins shape how Claude works with you.`
- Two rounded cards with circular icon + title + subtitle:
  - `Connect your apps` / `Let Claude read and write to the tools you already use.`
  - `Create new skills` / `Teach Claude your processes, team norms, and expertise.`

### Skills detail view (`/customize/skills`)

4-column variant:

1. Rail
2. Customize nav
3. Skills list (~280px): grouped by `Personal skills` + `Organization skills`, each with `▾` disclosure; skill rows have scroll-icon + hyphen-case name
4. Main content: selected skill details

**Skill detail anatomy** (for `aussie-business-english`):

- Top row: skill name (bold heading) + `Share` button + blue on/off toggle + `⋯` menu
- Meta strip (3-column):
  - `Added by / Your admin`
  - `Last updated / Mar 13, 2026`
  - `Trigger / Slash command + auto` — tells how the skill is invoked
- `Description` section with `ⓘ` info tooltip trigger + paragraph
- **Rendered content preview** in a white card — Markdown with headings, paragraphs, tables all rendered in the serif voice. View/code toggle top-right (eye + `</>`).

### Connectors detail view (`/customize/connectors`)

4-column, same as Skills, but list is connectors grouped by category (`Web`, others off-screen). Selected connector shows:

- Brand icon + connector name top + `Disconnect` button
- MCP URL row with copy button: e.g. `https://archive.mcpserver.au/mcp` + copy icon
- `Tool permissions` heading + subtitle `Choose when Claude is allowed to use these tools.`
- **Read-only tools** section (collapsible, counter `1`) + `Needs approval ▾` right-aligned dropdown (per-tool permission setting)
- **Write/delete tools** section (counter `1`) + `Always allow ▾` dropdown
- Each tool row: tool name + three-state icon row (approve ✓ / hand-stop ✋ / deny 🚫) to set per-tool override

This per-tool tri-state permission pattern is sophisticated — more granular than "approve all / deny all" typical of chat-tool wrappers.

---

## Sub-products (Code, Design)

### Claude Code web (`/code`)

Reference: `060-code-sessions-light.png`.

Breaks from the app shell:

- **2-column layout**: sessions list (~580px) on left, compose on right
- Title: `Claude Code` (serif) + `Research preview` pill badge
- Primary actions: `+ New session`, `Routines` (lightning-bolt)
- `All projects ▾` filter + slider-icon preferences control
- Sessions grouped by `Today` / `Older`
- Row: radio-bullet + session title + desktop-monitor icon (with green/amber dot = connection status)
- Right compose: orange pixel-art mascot above a standard compose card
- Compose placeholder: `Find a small todo in the codebase and do it`
- Extra below compose: `☁ Select a repository` chip + `Default ▾` agent-scope chip (Full Access / Default)
- Bottom-left dismissible banner: `🍎 Try Claude Code on desktop / Download / ×`

Session naming: `mac-sequential-avalanche`, `mac-splendid-elephant`, `mac-purrfect-reddy`, `mac-wild-duckling`, `mac-concurrent-summit` — host-adjective-noun slugs. Cute without being unprofessional.

### Claude Design (`/design`)

Reference: `070-design-landing-light.png`, `071-design-home-light.png`.

Entirely different identity:

- **Sans-serif rounded display type**: `Import your team's design system` (intro screen)
- **Warm cream background**, illustrated icons, gentle animation on intro
- `Skip intro` button bottom-right

Home after intro (`071-design-home-light.png`):

- Header: `Claude Design` (serif) + `Research Preview` pill + `by Anthropic Labs` subtitle
- Footer of header area: `👤 Jeremy`, `🏢 Jezweb`, `📚 Docs` identity chips
- **Left column** (~360px): "New prototype" form
  - Content-type tabs: `Prototype · Slide deck · From template · Other`
  - `Project name` input
  - `Design system / None ▾` dropdown
  - 2-option visual picker: `Wireframe` vs `High fidelity` — each a rounded-rect preview thumbnail
  - `+ Create` salmon/pink CTA
  - Privacy subtitle: `Anyone in Jezweb with the link can see your project by default.`
- **Right column**: tabs `Recent | Your designs | Examples | Design systems` + search input + `Learn about Claude Design / Quick tutorial` card

The tone is more playful than claude.ai main — research-preview product in a sibling universe.

---

## 404 page

Reference: `090-404-light.png`.

- Centred, plenty of whitespace
- Ember starburst + `Claude` wordmark (paired, like a logo)
- Serif h1 `Page not found`
- Subtitle (muted): *"Claude can help with many things, but finding this page isn't one of them."* — on-brand, first-person, not generic "Error 404"
- Dark pill button: `Go back home`
- No sidebar, no chrome — standalone layout

The typographic apostrophe in `isn't` is intact. Consistent with the rest of the product.

---

## Responsive (mobile 375)

References: `200-home-mobile-375-light.png`, `201-projects-mobile-375-light.png`.

### Breakpoint behaviour

At 375px:

- **Sidebar rail**: collapses entirely, replaced by a single sidebar-toggle icon top-left (hamburger-adjacent)
- **Top-right**: notification ghost-icon stays
- **Claude wordmark**: absent from the header
- **Main content**: full-width, edge padding ~16-20px
- **Compose card**: full-width (no max-width constraint)
- **Preset chip row**: wraps to 2 rows (4 chips don't fit horizontally at 375px)
- **Greeting**: "Good afternoon, Jeremy" — the text slightly exceeds viewport width and clips at the right edge. Minor issue — could be fixed with tighter letter-spacing or smaller font size at 375px.

### Mobile projects list

- Header: h1 + `+ New project` pill (stays at 375, just smaller)
- Search: full-width
- Sub-tabs: horizontally scroll (`Your projects | Team | Shar...` with visible clip-indicator scrollbar)
- Sort icon becomes icon-only (no "Sort by" label)
- Cards stack: 1 per row

No bottom-tab-bar navigation observed — the collapsed rail is the only nav surface. To navigate on mobile, tap the sidebar-toggle to expand.

---

## Copy & Microcopy

### Verbs in CTAs

- `New chat`, `New project`, `New artifact`, `New session` — consistent verb-noun
- `Share`, `Disconnect`, `Create`, `Download`, `Hide`, `Skip intro`, `Turn on` — single-word imperative verbs dominate

### Sentence-case for headings

All h1s use sentence case: `Projects`, `Artifacts`, `Customize Claude`, `Page not found`, `Claude Design`.

### Microcopy voice

- **Direct and inviting** without being chirpy. `How can I help you today?` (no exclamation). `Good afternoon, Jeremy` (not "Good afternoon!").
- **No "we"** in UI chrome. Everything is either first-person-Claude ("Claude can help with many things") or imperative-to-user ("Choose when Claude is allowed to use these tools").
- **Privacy reassurance is explicit and short**: *"Only you have access"*, *"Anyone in Jezweb can view"*, *"Your chats are private until shared"*, *"Only you can see your project by default"*. Each at the moment it's relevant.
- **Error / not-found tone is friendly**: *"Claude can help with many things, but finding this page isn't one of them."*
- **Disclaimer is precise**: *"Claude is AI and can make mistakes. Please double-check responses"* or, when citations present, *"...please double-check cited sources"*.

### Typographic polish

- **All apostrophes are typographic** (`'` not `'`) — verified in `Claude's choice`, `isn't`, `I'm`, `Stop Claude's response`
- **Em-dashes absent** from UI chrome (Jez's voice preference appears to align with claude.ai's in this regard)
- **No emoji in chrome** except functional ones in menus (🔒, 🏢, 📎, 📷). User-inserted emoji in titles are preserved.

### Plan surface

`Jeremy Dawes / Max plan` in the expanded-sidebar footer. Plan tier is visible at a glance; Max is positioned near identity.

---

## Notable absences

Patterns deliberately NOT present on claude.ai:

- **No "?" shortcut** — only `⌘/` opens the keyboard sheet
- **No breadcrumbs** — flat hierarchy with `← {parent}` when needed
- **No avatars on user messages** — identity implicit from alignment
- **No read/unread state** on chats
- **No pinning** in Recents (only per-chat actions via `⋯`)
- **No tags/labels** — organising is by project only
- **No visible bulk actions** by default — need to enter `Select` mode first (visible on `/recents`)
- **No undo** for destructive actions — only confirm-then-gone
- **No activity feed on dashboard** — project detail has an `Activity` tab but no global one
- **No model comparison** surface — pick one before sending
- **No collapsible sections in Recents** — flat list, no date groups
- **No public-link share** visible on this account (only private / org-scoped)
- **No in-chat "copy link to message"** — only whole-conversation share
- **No keyboard shortcut for next/previous chat** — palette-driven nav
- **No in-app dark/light toggle** — follows OS preference
- **No inbox-style notifications centre** — only the `F8` top-right drawer (pop-out, not a page)
- **No billing / settings gear in the top nav** — lives behind the avatar + `⇧⌘,`
- **No bottom-tab-bar on mobile** — sidebar is the only nav surface
- **No live-streaming status line** showing current "Claude is typing…" — uses the thought-process summary line instead

---

## Observed variants / A-B signals

- **Preset category labels differ** between sessions: `Write/Learn/Code/Life stuff/Claude's choice` vs `Write/Strategize/Career chat/Claude's choice` — rotating or personalised
- **Compose placeholder differs**: `How can I help you today?` vs `Type / for skills` — skill-discovery prompt on accounts with installed skills
- **Artifacts thumbnails differ**: dark placeholder (one session) vs rendered previews (another session) — possibly related to artifact type or processing state, not user-account

These are strong signals that claude.ai ships weekly and A-B tests in production. **Any comparison from a VFS audit should cite the capture date and viewport** — not just "claude.ai does X".

---

## Re-extraction

This library is a snapshot of **2026-04-20**. Claude.ai drifts weekly — prompt categories, model names, attach-menu contents, nav structure, and keyboard shortcuts all change. Re-extract every **6-8 weeks** while VFS is actively benchmarking. Check `web.archive.org/web/2026*/claude.ai/new` for historical comparisons.

Priority re-captures when returning:
- Home preset categories (rotate fastest)
- Model picker contents (changes when new models ship)
- Attach menu (new tools added per release)
- `F8` notifications drawer (never captured — try harder next time)

---

## How VFS consumes this

The VFS chat module (`src/client/modules/chat/`) has been audited against claude.ai repeatedly in 2026-04. This library formalises the comparison bar. Future `ux-audit` runs should cite specific sections here rather than "my memory of claude.ai" — e.g. *"Conversation view lacks the scroll-to-bottom floating button (ref: [Conversation view — Scroll-to-bottom affordance](#scroll-to-bottom-affordance))"*.

### Strong candidates for VFS adoption (captured during extract, not yet implemented)

- **Preset prompt tabs** on the chat empty state with 4-5 categories × 5 prompts each — absent in VFS today. Each tab auto-fills with a structured template + opens a sub-popover of specific prompts.
- **Typographic apostrophes** across all UI copy — mechanical but brand-differentiating
- **Placeholder-that-teaches**: rotate based on installed capabilities (`Type / for skills` after skills added). VFS has no equivalent.
- **Thought-process summary line** above responses (`"Synthesized X ›"`) — VFS renders reasoning but not as a one-line summary chip above the response
- **Scroll-to-bottom floating button** — VFS lacks this pattern
- **Conversation disclaimer that changes based on content** — "double-check cited sources" when citations present, "double-check responses" otherwise. VFS has a static footer.
- **Model picker with descriptions** ("Most capable for ambitious work") instead of just model ID. VFS shows IDs.
- **`+ attach` single entry point** for files, tools, skills, research, web-search. VFS has a scattered toolbar today.
- **Enabled-state indication in menu rows** (blue text + ✓ for "currently on") — cheap UX cue
- **Keyboard shortcut cheat sheet** — VFS has `Cmd+K` palette but no `⌘/` sheet
- **Friendly 404 page with brand wordmark** — VFS NotFoundPage (added 2026-04-19) already does this, well-aligned with claude.ai's tone. Keep it.
- **Org identity chip** above the greeting (`🏢 Jezweb`) — useful for multi-workspace users, useful pattern for when VFS gains workspaces
- **Page-edge orange focus ring when a modal is open** — distinctive brand moment; trivial to implement
- **Three-layer project context model**: private memory / shared instructions / shared files — clear semantic separation
- **Typographic serif for assistant messages** — the single most distinctive visual choice. VFS uses sans throughout.

### Weak candidates / don't adopt

- **Flat Recents list with no date groups** — VFS has date grouping and it's more usable at scale for longer conversation histories
- **Three-column Customize layout** — VFS settings is a tabbed single column and works fine at small scale
- **"Research preview" badges** — VFS isn't a research preview
- **Ember-orange accent** — VFS has its own brand; don't clone the colour, clone the *pattern* (distinctive accent used sparingly for brand moments)
- **F8 notifications shortcut** — non-standard; not worth copying
