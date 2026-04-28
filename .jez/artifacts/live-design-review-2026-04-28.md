# Live Design Review — 2026-04-28

**Site reviewed:** https://vite-flare-starter.webfonts.workers.dev/
**Method:** live signed-in review via headed Chrome + Playwright. Captured
desktop, mobile, and core-flow screenshots from the production deployment.

## Executive Diagnosis

The product is already technically impressive and broadly coherent. The
problem is not "bad UI"; it is that the interface exposes the whole platform
too early and gives too many equally weighted choices. It reads like a capable
internal admin/workbench rather than an effortless product that reveals power
as the user earns it.

The design goal should be:

> Make the first run feel like "I know exactly what to do next", and make the
> tenth run feel like "I can drive this entire system from the keyboard".

That requires a clearer split between three modes:

1. **Use mode:** chat, inbox, approvals, projects, spaces. This is where normal
   users get work done.
2. **Setup mode:** connectors, routines, skills, organization, settings. This is
   where users add capability.
3. **Builder mode:** admin, activity, files, components, style guide, raw skill
   source, technical details. This is powerful, but should be opt-in or clearly
   secondary.

Right now all three modes are visible at once. That is why the app feels busy
and slightly dev-toolish even though individual pages are well built.

## Evidence Captured

Screenshots were captured under `/tmp` during the live review:

- Desktop page set: `/tmp/vfs-audit-shots/`
- Mobile page set: `/tmp/vfs-audit-mobile/`
- Core flows: `/tmp/vfs-audit-flows/`
- Contact sheets:
  - `/tmp/vfs-audit-contact.jpg`
  - `/tmp/vfs-audit-mobile-contact.jpg`
  - `/tmp/vfs-audit-flows-contact.jpg`

Coverage included landing, sign-in, dashboard home, chat, projects, spaces,
skills, connectors, routines, new routine, inbox, notifications, approvals,
extract, files, activity, organization, settings, admin, components, style
guide, command palette, mobile sidebar, create project, create space, project
detail, space detail, and notification popover.

## Highest-Impact Changes

### 1. Reframe the app around a guided first-run path

The current Home page is useful for an existing user with pending approvals,
but a fresh user needs a setup path. The first screen after sign-in should
answer: "What can I do now, and what should I do first?"

Recommended Home structure:

1. **Today / Pending review** — current cards stay, but only dominate when there
   is real work waiting.
2. **Get set up** — a stateful checklist:
   - Connect Google Workspace
   - Try your first chat
   - Create a project
   - Create a routine
   - Review your first approval
3. **Resume work** — recent projects/spaces/chats.
4. **Explore the platform** — collapsed reference section for the starter kit.

This preserves the pattern-library value without making the first-run screen
feel like a capability brochure.

### 2. Make Connectors the primary onboarding surface

Connectors is the key to user value, but it currently reads partly like MCP
infrastructure. It should look like an app marketplace first, technical MCP
manager second.

Recommended structure:

- Page title: **Connections**
- Plain opener: "Connect Gmail, Calendar, Drive, Notion, Slack, and other apps
  so the AI can read and act on them for you."
- Primary CTA: **Browse apps**
- Secondary CTA: **Add custom connection**
- Sections:
  - Recommended
  - Connected
  - Available apps
  - Custom MCP connections
  - Technical details disclosure

Move "Coming soon" lower. A live product should not lead with unavailable
capability unless it is a roadmap page.

### 3. Collapse the queue surfaces into one mental model

Inbox, Notifications, and Approvals are each sensible, but as separate primary
destinations they create cognitive load:

- **Inbox:** findings + pending review items
- **Approvals:** yes/no decisions
- **Notifications:** FYI alerts

Recommended model:

- Keep one primary nav item: **Inbox**
- Inside it use tabs or filters: `All`, `Needs review`, `Findings`, `Alerts`
- Keep `/dashboard/approvals` as a deep-link/detail route, not a peer primary
  destination.
- Keep NotificationBell, but notifications should feel like a lightweight feed,
  not a separate work surface.

This one change would make the sidebar feel calmer immediately.

### 4. Split Skills into Browse / Use / Edit

Skills is powerful but intimidating because source code is prominent. A normal
user wants to know what a skill does and when to use it; a builder wants source,
history, overrides, and GitHub imports.

Recommended default:

- Left: searchable skill catalogue.
- Right default tab: **Overview**
  - What it does
  - Example prompts
  - Used by routines / chat
  - Enable/disable
- Secondary tabs: `Source`, `History`, `Overrides`.
- "Install from GitHub" and raw YAML/source editing live in Builder mode.

The current implementation can stay, but the default landing should stop being
an editor-first experience.

### 5. Turn Routines into template-first creation

The New Routine page is much better than a raw config form, but it still starts
with configuration. A new user thinks in outcomes:

- "Tell me when a customer email needs attention"
- "Summarize unread emails each morning"
- "Watch stale deals"
- "Track project blockers"

Recommended first step:

1. Choose a template or describe the job.
2. App proposes agent, cadence, tools, skill, inbox behavior.
3. User reviews and creates.
4. Advanced config remains available.

This keeps Routines capable for technical users but stops making novice users
learn the abstraction before seeing value.

### 6. Hide developer-only destinations by default

Components and Style Guide should not appear in a normal signed-in user's
dashboard. They are useful for this starter, but they break the product illusion.

Recommendation:

- Gate `Components`, `Style Guide`, possibly `Activity`, behind a `Builder`
  toggle or dev feature flag.
- Keep them accessible via direct URL for starter users.
- Surface Builder mode in the user menu, not the primary sidebar.

## Page-by-Page Findings

### Landing Page

Strengths:

- Strong dark visual presence.
- Clear technical positioning.
- Good proof points and screenshots.

Issues:

- The first viewport is mostly abstract copy. It does not show the actual
  product until later.
- The copy speaks to builders more than end users: "worked example", "fork",
  "modules", "pattern library".
- The metadata is stale: page meta still says "Minimal authenticated starter kit"
  while the visible page promises multi-agent/Spaces.
- The feature grid is exhaustive, but tiring.

Recommendation:

- Put a real product screenshot or interactive product visual in the first
  viewport.
- Split the landing page into two lanes: **Use it as an AI workspace** and
  **Fork it as a starter kit**.
- Change the H1 to something more literal if selling to users; keep the current
  technical headline if selling to builders.

### Sign In

Strengths:

- Very clean.
- Google-only is simple.

Issues:

- Too sparse. It feels like a utility login, not the continuation of the
  landing page.
- No "Back to home", no reassurance, no explanation of why Google is required.

Recommendation:

- Add a small brand header, one-line value reminder, and a footer link back to
  the public site.
- If Google Workspace is a key capability, say: "Google sign-in lets the app
  connect securely to Workspace tools you approve."

### Dashboard Home

Strengths:

- "Pending review" and recent runs are useful.
- Mobile layout works.
- Quick action strip is practical.

Issues:

- Existing-user state dominates, but there is no setup state.
- Agent run labels and technical system facts still appear early.
- The "starter ships" reference belongs below onboarding, not above it.

Recommendation:

- Make Home stateful: empty/new user, active user, builder user.
- Add a first-run setup checklist.
- Move starter/reference material behind a disclosure or Builder mode.

### Chat

Strengths:

- This is the clearest, calmest primary surface.
- The empty state and starter chips are immediately understandable.
- Mobile chat input is usable.

Issues:

- The suggestions are generic rather than shaped by connected tools/projects.
- Attachments, tools, and model selection are present but understated; good for
  simplicity, but expert users need stronger affordances.
- The page does not clearly tell the user what the AI can do with their current
  permissions.

Recommendation:

- Add a small "Available now" capability line: "Can use web, files, skills" or
  "Connect Gmail to let the AI read email."
- Let command palette actions expose expert workflows: attach file, switch
  model, load skill, search conversations.

### Projects

Strengths:

- Simple and readable.
- Project detail page is a useful workspace pattern.

Issues:

- Index is sparse with one project and a large amount of empty canvas.
- Create modal is efficient, but templates/AI-assisted creation are hidden in
  tabs and not emotionally compelling.

Recommendation:

- Add starter project templates or "Create from goal".
- On the detail page, make "Start chat" the clear primary next action and
  introduce memory/files/instructions as supporting panels.

### Spaces

Strengths:

- Space detail is one of the strongest product surfaces.
- Multi-agent chat is visually understandable once inside.

Issues:

- Index copy is still concept-heavy.
- The create modal is power-user friendly but asks a new user to understand
  agent composition and reply modes before seeing the room.

Recommendation:

- Default to templates: Solo workshop, Support room, Research room, Writer room.
- In custom mode, phrase agent selection as "Who should be in this room?"
- In the room, add an empty/welcome composer hint showing `@researcher` or
  `@writer` usage.

### Skills

Strengths:

- Powerful reference implementation.
- Source/preview/history model is valuable for builders.

Issues:

- Editor-first presentation makes skills feel like developer artifacts.
- Toggle controls in a dense list lack enough explanatory context.
- The page asks normal users to care about bundled/R2/GitHub before they know
  why a skill matters.

Recommendation:

- Default to a skill overview, examples, and "Use in chat/routine".
- Move source editing behind Builder mode or a secondary tab.

### Connectors

Strengths:

- Real connections and custom MCP support are valuable.
- Connected app cards have good operational affordances.

Issues:

- Too much infrastructure language.
- "Coming soon" competes with connected apps.
- Native provider panels, MCP cards, and stubs feel like separate products.

Recommendation:

- Rebuild as an app marketplace with setup status.
- Use technical detail disclosures for MCP/OAuth/token language.

### Routines

Strengths:

- List view is calm.
- NewRoutinePage has good plain-language section headings.

Issues:

- The abstraction is still exposed before the outcome.
- Users need templates and recommended defaults.

Recommendation:

- Template-first creation with advanced config available.
- Show expected output: "This routine will add findings to Inbox."

### Inbox / Approvals / Notifications

Strengths:

- Rows and cards are much clearer than raw agent logs.
- Approval cards explain memory actions well.

Issues:

- Three separate surfaces fragment the user's mental model.
- Notification page is too light to justify a primary sidebar destination.

Recommendation:

- Make Inbox the primary queue.
- Fold approvals and notifications into filters/deep links.

### Extract, Files, Activity

Strengths:

- Extract and Files are functional, focused utilities.
- Activity is useful for admins/builders.

Issues:

- Extract feels like a standalone demo rather than part of the product.
- Files needs a richer upload/drop empty state.
- Activity is technical and should be Builder/Admin mode.

Recommendation:

- Connect Extract to Chat/Files as "Extract from document".
- Promote drag/drop in Files.
- Hide Activity from normal primary nav.

### Organization, Settings, Admin

Strengths:

- Settings and Admin are dense but organized.
- Organization member management is clear.

Issues:

- Settings tabs overflow on mobile and become a horizontal text strip.
- Admin is a strong builder/admin surface, not a normal user surface.

Recommendation:

- On mobile, settings should become a vertical list of sections or a select.
- Admin should stay in user menu or Builder mode.

## Mobile Findings

Mobile is functional, but several pages become control-first rather than
orientation-first:

- Skills list is too dense for first contact.
- New Routine is a long form with important choices below the fold.
- Settings tabs are cramped horizontally.
- Sidebar works well, but because the sidebar is the only map, the number of
  primary destinations feels heavier on mobile.

Recommendation:

- Reduce primary mobile nav to Home, Chat, Projects/Spaces, Inbox, and More.
- Put setup/builder destinations behind More.
- Use one-column cards with clearer next actions, not dense grids.

## Visual System Recommendations

1. **Adopt a page grammar.** Every page should use the same components:
   `PageHeader`, `PageToolbar`, `ListRow`, `DetailPanel`, `SetupCard`,
   `EmptyState`.
2. **Use cards only for things users dwell inside.** Queues should be rows.
3. **Use one density scale.** Current pages vary from airy marketing to dense
   admin. Define compact, default, and spacious modes.
4. **Stop leaking raw system terms.** Anything from an enum/class/id goes
   through a formatter.
5. **Keep technical detail available, not dominant.** Technical users love
   detail; new users should not see it first.
6. **Make all click targets unmistakable.** Rows need chevrons, hover states,
   and consistent right-side metadata.
7. **Add meaningful empty states everywhere.** Empty state should answer:
   what is this, why does it matter, what do I do next?

## Expert User Layer

The way to serve technical users is not by putting every setting on the page.
It is by making power available through explicit expert affordances:

- Command palette actions for every common task.
- Keyboard shortcuts for navigation and approval decisions.
- Saved filters/views for Inbox, Activity, Routines.
- Advanced disclosures for IDs, JSON, raw tool payloads, MCP URLs.
- Builder mode toggle for Components, Style Guide, Activity, raw skill source,
  and admin diagnostics.

This lets normal screens stay simple without reducing power.

## Implementation Sequence

### Phase 1 — Calm the Shell

- Move Approvals and Notifications under Inbox.
- Hide Components, Style Guide, and Activity from normal sidebar.
- Rename Connectors to Connections.
- Add Builder mode entry in the user menu.
- Update stale landing metadata.

### Phase 2 — First-Run Path

- Add Home setup checklist.
- Rewrite Connectors as marketplace/onboarding.
- Add Chat capability line based on connected tools.
- Add project/space/routine templates as first-class choices.

### Phase 3 — Page Grammar

- Extract shared page primitives.
- Convert queue surfaces to rows.
- Convert setup pages to progressive sections.
- Move technical details to disclosures.

### Phase 4 — High-Polish Pass

- Landing first viewport with real product visual.
- Sign-in page context and trust copy.
- Mobile navigation simplification.
- Settings mobile tab replacement.
- Motion/hover/focus consistency pass.

### Phase 5 — Expert Layer

- Command palette actions.
- Saved views and keyboard shortcuts.
- Builder mode.
- Rich technical disclosures and export/debug affordances.

## Bottom Line

The app does not need more decoration. It needs hierarchy. The best next design
work is to decide what normal users should see first, what builders should see
on request, and what should only appear as technical detail. Once that split is
made, the existing shadcn base and module implementations are strong enough to
become a much more polished, delightful product with relatively small,
systematic changes.
