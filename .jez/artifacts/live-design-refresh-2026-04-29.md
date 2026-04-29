# Live Design Refresh — 2026-04-29

**Site reviewed:** https://vite-flare-starter.webfonts.workers.dev/
**Context:** Follow-up sweep after a large design/navigation pass.
**Method:** live signed-in review via headed Chrome + Playwright, desktop and
mobile. Compared against the 2026-04-28 live design review.

## Evidence Captured

Fresh screenshots were captured under:

- Desktop: `/tmp/vfs-audit-refresh-20260429/desktop/`
- Mobile: `/tmp/vfs-audit-refresh-20260429/mobile/`
- Flows: `/tmp/vfs-audit-refresh-20260429/flows/`
- Contact sheets:
  - `/tmp/vfs-audit-refresh-20260429/desktop-contact.jpg`
  - `/tmp/vfs-audit-refresh-20260429/mobile-contact.jpg`
  - `/tmp/vfs-audit-refresh-20260429/flows-contact.jpg`

Routes covered: landing, authed sign-in redirect, home, chat, projects,
spaces, skills, connections, routines, new routine, inbox, notifications,
approvals, extract, files, activity, organization, settings, admin,
components, style guide, command palette, browse apps, add custom connection,
new project, new space, notification popover, and mobile sidebar.

## Executive Read

The application is noticeably calmer and more product-like than yesterday.
The biggest wins are the simplified primary navigation, the Connections
rewrite, template-first routine/project/space creation, and mobile settings.

The remaining work is now sharper:

1. Home still needs a true first-run/setup state.
2. Skills still feels like a developer editor before it feels like a user
   capability catalogue.
3. The command palette is still mostly navigation, not the expert control
   layer.
4. Some direct routes and console warnings need cleanup.
5. Landing still sells the whole starter more than it shows the product in the
   first viewport.

This is good progress. The design problem has moved from "too much exposed at
once" to "a few surfaces still reveal their implementation too early."

## What Improved

### 1. Sidebar hierarchy is much better

Desktop primary nav is now:

- Home
- AI Chat
- Inbox
- Projects
- Spaces
- Connections
- Skills
- Routines

This is a major improvement. The previous peer-level Notifications,
Approvals, Activity, Components, and Style Guide made the app feel like a
starter/demo. The new nav feels like an actual product.

Mobile is better again because it groups:

- **Work:** Home, AI Chat, Inbox, Projects, Spaces
- **Setup:** Connections, Skills, Routines

That grouping is exactly the right mental model.

### 2. Connections is much stronger

The page now leads with plain English:

> Connect Gmail, Calendar, Drive, Notion, Slack, and other apps so your AI can
> read and act on them for you.

That is the correct framing. "Browse apps" is now primary, "Add custom" is
secondary, and custom connection copy is much friendlier.

The page now feels like onboarding into capability, not an MCP admin panel.

### 3. New Routine is now template-first

The template strip at the top is a large improvement:

- Routine health
- YouTube digest
- Morning brief

This finally lets users start from an outcome instead of starting from a config
schema. The rest of the form can stay powerful below it.

### 4. New Project and New Space creation are much better

Both modals now put templates first:

- Project templates: Quoting, Content Writing, SEO Reporting, Prospecting,
  Customer Support
- Space templates: Solo workshop, Marketing pod, Support room, Research room,
  Writer's desk, Blank space

This directly addresses the "new users do not know what to create" problem.

### 5. Chat empty state is clearer

The chat page now says:

> What can I help with, Jeremy?

and shows capability chips such as Outlook, OneDrive, Calendar, and 22 skills.
That is much better than generic "AI chat" because it tells the user what the
assistant can currently use.

### 6. Settings mobile is fixed in spirit

Mobile settings now uses a section select instead of cramped horizontal tabs.
That is the right pattern.

### 7. Direct dev surfaces are hidden from primary nav

Activity, Components, Style Guide, Admin, Files, and Extract still exist, but
they no longer dominate normal navigation. Good.

## Remaining High-Priority Findings

### H1. Home still needs a first-run/setup mode

Home is improved as an existing-user dashboard, but it still does not guide a
new user through setup. It leads with pending memory approvals and recent agent
runs, which are useful once the system is active.

For a new or under-configured user, Home should show:

1. Connect your first app.
2. Try AI Chat.
3. Create a project.
4. Create a routine.
5. Review your first pending item.

This can be stateful:

- If no connections: lead with Connections.
- If no projects: suggest creating a project.
- If pending approvals: lead with Pending review.
- If everything is active: show the current dashboard.

The current Home page is good for "I already use this." It still needs "what do
I do first?"

### H2. Skills is still editor-first

Skills remains the most developer-feeling primary page.

The left list is dense, and the right side still opens into source-oriented
detail. That is valuable for builder mode, but the default user question is:

> What does this skill let my AI do, and how do I use it?

Recommended default detail view:

- Skill name and plain-language description.
- Example prompts.
- Where it is used: Chat / Routines.
- Enable/disable.
- Buttons: "Use in chat", "Create routine with this skill".
- Secondary tabs: Source, History, Overrides.

Keep source editing, but do not make it the first impression.

### H3. Command palette needs to become the expert layer

The command palette still appears navigation-heavy. It should be where capable
users drive the product.

Add actions such as:

- New project
- New space
- New routine
- Connect Google Workspace
- Browse apps
- Review pending items
- Upload file
- Start chat with selected skill
- Search conversations/spaces/projects

This lets the visible UI stay simple while experienced users get speed.

### H4. `/dashboard/connections` is a 404 while the nav says Connections

The nav label is now **Connections**, but the route remains
`/dashboard/connectors`. That is okay for internal routing, but users and AI
agents will naturally guess `/dashboard/connections`.

Add a redirect:

`/dashboard/connections` -> `/dashboard/connectors`

This is small, but it avoids a rough edge and supports the new vocabulary.

### H5. Console warnings should be cleaned up

Observed during the sweep:

- Manifest warning: `Enctype should be set to either application/x-www-form-urlencoded or multipart/form-data`.
- Chat page warning: `[VoiceClient] Protocol version mismatch: client=1, server=undefined`.

Neither broke the UI, but they matter for polish. The voice warning especially
suggests a disabled/optional feature is still initializing enough to complain.

## Medium-Priority Findings

### M1. Landing still needs a product visual above the fold

The landing page is cleaner and metadata is fixed. The first viewport still
mostly sells through words and stats. For a product with strong screenshots,
the first viewport should show the actual workspace.

Recommended:

- Keep the current headline.
- Add a real product screenshot or interactive product preview in the first
  viewport.
- Split the CTA language for two audiences:
  - "Open Dashboard" / "Try workspace"
  - "Fork on GitHub"

The current page is still builder-oriented. That may be fine for the starter,
but if this is also the product demo, it needs a stronger first visual signal.

### M2. Connections "Browse apps" modal is too thin

The modal is much better conceptually, but it currently presents only one
example in the captured state. It should feel like a catalogue.

Recommended app groups:

- Google Workspace
- Microsoft 365
- Communication
- CRM / Sales
- Project management
- Finance / Accounting
- Custom MCP

Even if many are examples, the modal should make the ecosystem feel broad.

### M3. Template cards need stronger "use this" affordance

Routine/project/space templates are a major improvement. Some cards still read
like static examples until clicked.

Recommended:

- Add hover state + chevron.
- Show "Use template" on hover or as a small right-side affordance.
- After selecting a template, show a visible selected state and prefilled
  fields.

### M4. Inbox keyboard hint is useful but visually noisy

The Inbox now includes keyboard instructions:

> ↑/↓ to move, A to select, E / ? / R / T for bulk mark-read / approve / reject.

This is great for power users, but it competes with the list visually.

Recommendation:

- Move it into a small `Keyboard shortcuts` disclosure or `?` help button.
- Keep a one-line subtle hint only after the user selects a row.

### M5. Approvals "Stale" badge is unclear

The first approval card showed a `Stale` badge. This is probably technically
accurate, but not user-clear.

Recommended language:

- "Needs refresh"
- "Changed since requested"
- "Review again"

If stale approvals cannot safely be approved, the primary button should be
disabled or changed to "Refresh request".

### M6. Extract and Files still feel like standalone utilities

They are now out of primary nav, which is good. Direct pages still feel like
reference modules more than integrated product features.

Recommended:

- Files empty state should emphasize drag/drop and "Use in chat".
- Extract should be framed as "Extract from text or file", with file/chat
  handoff.

## Low-Level Polish

### L1. Organisation spelling is now Australian on title

The page title now says `Organisation`, which matches the user's locale. Good.
Keep an eye on consistency: if the app uses Australian English, make sure
Organization/Organisation does not drift across page labels and URLs.

### L2. Direct dev pages are still reachable

Components and Style Guide are no longer in primary nav, which is enough for
normal users. They can stay directly reachable as builder references.

If you want stricter product polish, add Builder mode gating or a route banner:

> Builder reference page

### L3. Notification page remains thin

Since Notifications is no longer in primary nav, this is less urgent. It can
remain a history page linked from the bell. If it returns to nav later, it will
need more value.

## Recommended Next Implementation Order

### 1. Fix rough edges

- Add `/dashboard/connections` redirect.
- Fix manifest `enctype` warning.
- Stop or fix VoiceClient protocol warning when voice is not active.

### 2. Add first-run Home state

- Stateful setup checklist.
- Hide recent runs until useful.
- Promote Connections if no connected apps exist.

### 3. Make Skills user-first

- Default to Overview instead of Source.
- Add example prompts and "Use in chat".
- Move editing/source deeper.

### 4. Make command palette action-rich

- Add create/setup/review actions.
- Add search across conversations/projects/spaces.
- Add context-aware actions per page.

### 5. Strengthen template affordances

- Visible selection state.
- "Use template" affordance.
- Better prefilled preview after selection.

## Bottom Line

This pass materially improved the product. The app now feels less like a demo
and more like a real AI workspace. The biggest remaining gap is not styling; it
is progressive disclosure:

- New users need a guided setup path.
- Normal users need fewer technical surfaces.
- Expert users need command palette power.
- Builders need source/details, but only after choosing that mode.

Keep going in this direction. The next round should focus on Home onboarding,
Skills re-framing, and command palette power rather than adding more visual
decoration.
