# What's New: a release-notes surface for the starter

**Status:** approved and built, 2026-08-03
**Date:** 2026-08-03
**Reference:** the Updates page Marcus built in `crosbe-ai`

---

## Correction, added after approval

**Everything this document says about the Crosbe implementation describes
a stale local checkout of `~/Documents/crosbe-ai`, not what is running in
production.** The live version (Crosbe issue #1285) is newer in the two
places that matter most here:

- It **is a modal**, showing entries batched since you last looked. Jez's
  memory of "a what's-new modal" was accurate for the live app; this
  document's claim that the real implementation is only a page plus a
  sidebar dot was wrong, and was an artefact of reading an old checkout.
- Its seen-state is **a per-user watermark in KV**, RBAC-filtered
  server-side. So the `localStorage` criticism below has already been
  fixed upstream. Marcus's live system and this proposal arrived at the
  same conclusion independently, which is the best kind of validation the
  design could have had: server-side per-user seen-state is now doubly
  justified, and it is what shipped.

The per-entry defects called out under "What not to copy" were real in
the checkout that was read. Treat them as reasons the files could not be
pasted across as-is, **not** as a characterisation of Marcus's current
work.

Jez approved the shape below knowing the difference, so the built feature
is page + dot + highlight banner and no modal. The disagreement with
Crosbe is a deliberate product call about this starter's audience, not a
correction of theirs.

---

## Recommendation

**Adapt it. Take the idea, rebuild the code, and ship about half of what Crosbe has.**

Three calls up front:

1. **Page plus a live nav badge. Not a modal.** A modal on first visit
   after a release interrupts someone who opened the app to do a job,
   and it fires for a typo fix just as loudly as for a real release.
   Instead: a quiet dot on the nav item for routine entries, and one
   dismissible inline banner for entries the author explicitly flags as
   a highlight. The app gets to be loud once per real release and silent
   the rest of the time. That is the refinement over a plain dot, and it
   is the answer to "should it be a modal".

   Note this is a **deliberate divergence from live Crosbe, which does
   use a modal** (see the correction above). That is a defensible choice
   for their app, where the audience is a known set of engaged users and
   batching "everything since you last looked" into one interruption is
   worth it. A starter is forked into client apps whose users did not ask
   for our release notes, so the default should err quieter. A fork that
   wants the modal can have it off the same `highlight` flag.

2. **Ship the changelog half. Leave the feature-request voting board
   out.** Reasoning below, it is a real opinion and not a hedge.

3. **Do not port the checked-out Crosbe files.** They violate the
   starter's own DESIGN.md and the checkout carried three behavioural
   defects. Detail in "What not to copy".

Effort for the core: roughly **2 to 2.5 hours of Claude time**.

---

## Why this earns a place in the starter

Every fork of this starter becomes a real client app that gets deployed
repeatedly by an agent. Right now, nothing in the app tells its users
that anything changed. The release note either does not get written, or
it gets written into `CHANGELOG.md` where no end user will ever see it.

The interesting part is not the page. It is that **an agent finishing a
deploy is a moment**, and a moment is the only kind of trigger that
actually fires. Give the deploy path a one-line way to post the note and
release notes start happening. Leave it as "remember to write an entry
in the admin UI afterwards" and they will not.

---

## Where the content comes from in a fork

This is the question that decides whether the feature is alive or
decorative. Four candidate sources:

| Source | Verdict |
|---|---|
| `CHANGELOG.md` in the repo | No. Wrong document, wrong voice |
| Markdown files in the repo | No. Requires a build to publish a note |
| D1 rows via the admin UI only | No. A separate ritual after the deploy, so it gets skipped |
| **D1 rows, posted by the deploy path, editable in the admin UI** | **Yes** |

On the `CHANGELOG.md` option specifically: it is a developers' document
for people maintaining the fork. "Bumped compatibility_date" and "TS 7
Go-native tsc" are correct entries there and meaningless to a client's
staff. What's New is a users' document. They are two documents with two
audiences, and generating one from the other produces a bad version of
both.

The checked-out Crosbe code half-discovered this: its `is_internal` flag
exists because dev and infra entries were landing in the user-facing feed
and had to be hidden after the fact. Better to keep the two documents
separate by design than to build a filter for a mixture that should not
exist. (Live Crosbe filters server-side by RBAC, which is a stronger
version of the same instinct — the mixture is handled by *who is asking*
rather than by a per-row flag.)

So: **D1 is the source of truth**, with three ways in.

- `POST /api/updates/entries` with an API token. This is the deploy-time
  path, and the one that matters.
- `pnpm changelog:post --title "…" --body "…" --category feature` as a
  thin wrapper over that, so a human or an agent can do it without
  thinking about auth.
- The admin UI on the page itself, for editing and for anyone who is not
  at a terminal.

**The post must be idempotent.** Give the table a `releaseKey` unique
column and have the deploy path pass something stable, for example the
version tag or the commit sha. Re-running a deploy then updates the
existing entry instead of adding a duplicate. The checked-out Crosbe code
has no guard here at all, it is a plain `INSERT` against an autoincrement
id, so a re-deploy silently double-posts. (Not checked against live
Crosbe — assume nothing either way about whether they hit this.)

---

## Does the voting board earn a place? No.

Skip it. Four reasons, in order of weight:

1. **It creates an obligation the fork owner did not agree to.** Users
   post requests, nobody triages them, and within a few months the board
   is a public list of things the client asked for and did not get. A
   board that cannot close things becomes a list of grievances. That is
   a support surface, not a feature, and a starter should not turn one
   on by default.
2. **Voting is meaningless below a user count most of these apps will
   never reach.** On a 6-user internal tool, "3 votes" tells you
   nothing, and the board looks abandoned from day one.
3. **Free-text user posts visible to every other user is a moderation
   and content-liability surface.** Fine when the fork owner opts into
   it deliberately. Not fine as a default nobody chose.
4. **It roughly triples the work.** Two extra tables, vote toggling, a
   status workflow, sort modes, per-author delete rules. All of that for
   the optional half.

**But keep the small sibling.** Crosbe's `feedback_items` is the 20% that
earns its place: one table, one POST, admin-only read, no voting, no
public visibility, nothing to moderate. A user hits a problem, types a
sentence, it lands somewhere the admin sees it. That is worth having and
carries almost none of the above cost.

My suggestion is to treat feedback as a separate small proposal rather
than smuggling it in here, because it is genuinely a different feature
and bundling them is how a clean proposal turns into a project. Flagged
as open question 3.

---

## Design sketch

### Schema

New module at `src/server/modules/updates/`, following the same shape as
`activity` and `notifications`. One table:

```
changelog_entries
  id            text pk, crypto.randomUUID()
  releaseKey    text unique, nullable   -- version tag or sha, for idempotent posts
  title         text notnull
  body          text notnull            -- markdown
  category      text notnull default 'feature'   -- feature | fix | improvement
  version       text nullable
  highlight     integer bool default false       -- drives the banner, see below
  publishedAt   integer timestamp nullable       -- null = draft, not visible
  createdAt     integer timestamp
  updatedAt     integer timestamp
```

Deliberate differences from the checked-out Crosbe schema:

- **`publishedAt` nullable instead of `is_internal`.** Draft versus
  published is the distinction that was actually wanted. An agent can
  post an entry at deploy time and leave it unpublished until someone
  looks at the wording. Cleaner than "internal", and it does not need a
  second visibility concept.
- **`highlight`** is what separates a quiet dot from a banner.
- **`releaseKey`** for idempotency.
- Text uuid primary key and timestamp integers, matching the rest of the
  starter's tables rather than the checkout's autoincrement ints.

Register in the barrel at `src/server/db/schema.ts` (one export line),
then `pnpm db:generate`. Migrations are timestamp-prefixed already, so
there is no collision with fork migrations. That problem is solved.

### Routes

`src/server/modules/updates/routes.ts`, mounted in `src/server/index.ts`
as `app.route('/api/updates', updatesRoutes)`.

```
GET    /api/updates/entries      published entries, newest first
GET    /api/updates/summary      { total, latestPublishedAt, unseen }
POST   /api/updates/entries      admin or api-token, upsert on releaseKey
PATCH  /api/updates/entries/:id  admin
DELETE /api/updates/entries/:id  admin
PUT    /api/updates/seen         marks seen for the current user
```

`GET /summary` is the load-bearing one. It is a single cheap query and
it does two jobs: it drives the unseen dot, and it lets the nav item
hide itself entirely when the table is empty. A fresh fork therefore
never shows a client an empty "No updates yet" room. That is better than
a feature flag, because it needs no configuration and it self-corrects
the moment the first entry lands.

One thing to get right: this endpoint is fetched by the sidebar, so it
runs on every page in the app, and `/api/*` goes through `rateLimiter`
(`src/server/index.ts:257`). Give it a generous TanStack Query
`staleTime`, in the order of minutes. Release notes do not need to be
fresh to the second, and a badge query that burns a user's rate limit
budget would be an own goal.

Writes use the existing **`adminMiddleware`** (`src/server/middleware/admin.ts`),
which already does the env allowlist, the DB role check, and the
`emailVerified` trap. Add `'updates:write'` and `'updates:read'` to
`src/shared/api-scopes.ts` so a deploy token can post without being a
full admin token.

**Never port Crosbe's `ADMIN_EMAIL` constant.** It is a hardcoded
`jeremy@jezweb.net` duplicated across the route file and the page
component. In a fork that is wrong in two places at once.

### Seen state

Store it server-side in the existing `user_meta` table under the key
`updates:last-seen`, value `{ lastSeenAt }`.

The **stale checkout** used `localStorage`, which has three problems: the
badge comes back on every device, it is lost on a cache clear, and, most
importantly, `markChangelogSeen()` writes `new Date().toISOString()`
rather than the newest entry the user actually saw. An entry published
while the page is open gets marked seen without ever being rendered.
Write the newest rendered entry's `publishedAt` instead.

In that same checkout `useHasNewChangelog()` reads `localStorage` during
render rather than in an effect, so it is not reactive. Do not reproduce
that.

**Live Crosbe has already moved past this** — it keeps a per-user
watermark in KV, server-side. Two systems reaching the same answer from
opposite directions is the strongest evidence available that server-side
seen-state is the right call, so this section stands as designed. The
only correction is to who gets the criticism: the `localStorage`
approach, not Marcus's current code.

### Client

New module `src/client/modules/updates/`, copied from
`src/client/modules/_template` per its README, which means the page
grammar contract lands by default.

```
src/client/modules/updates/
  pages/UpdatesPage.tsx        PageContainer + PageHeader + EmptyState
  components/UpdateCard.tsx    category pill, version, date, markdown body
  components/UpdateEditor.tsx  admin only, rendered only for role === 'admin'
  components/WhatsNewBanner.tsx  the highlight banner
  hooks/useUpdates.ts          TanStack Query, keys ['updates', …]
```

Route in `src/client/App.tsx` at `/dashboard/updates`, nav entry in
`src/shared/config/nav.ts`.

`react-markdown` and `remark-gfm` are already dependencies, so the body
renders with no new packages. `sonner` is there too if any of this needs
a toast.

### The surfacing rules, which are the actual design

Three tiers, quietest first:

- **Nothing published:** the nav item does not render. No empty room.
- **New entries, none flagged:** a small dot on the nav item. Visiting
  the page clears it. This is the steady state and it is silent.
- **A new entry flagged `highlight`:** one dismissible inline banner at
  the top of the dashboard home. One line, in the content flow, not an
  overlay, not blocking, no backdrop. Dismiss marks seen. It appears
  once and never returns for that entry.

The reason not to use a modal *by default* is that a modal spends the
user's attention on our schedule instead of theirs, and it cannot tell a
patch release from a real one. The `highlight` flag is what buys the
right to interrupt, and because the author has to set it deliberately, it
stays rare.

That is a default, not a verdict on modals. Live Crosbe uses one and it
suits them: a known, engaged audience, and one batched interruption
beats a dot they might never notice. The calculus flips for a starter
because a fork's users never opted into hearing from us. Same `highlight`
flag would drive a modal in a fork that wants one.

### Nav badge plumbing, the one fiddly part

`src/shared/config/nav.ts` is static config. `NavItem` already has a
`badge?: string` field, but it is a fixed string like `'Beta'` rendered
as a Kumo MenuBadge, not a live value. A live dot needs the Sidebar
renderer to overlay runtime state onto the config.

The checked-out Crosbe code solved this by having the Sidebar call
`useHasNewChangelog()` and attach a badge for the one path `/updates`.
That works and is about six lines, but it hardcodes a route into the
layout component.

Cleaner for a starter: add an optional `badgeSource?: 'updates'` to
`NavItem`, and have the Sidebar resolve known sources through a small
map of hooks. It stays config-driven, and the next feature that wants a
count on a nav item has somewhere to put it. This is the piece most
likely to take longer than it looks, so it is worth deciding
deliberately rather than discovering it mid-build.

---

## What not to copy

Everything in this section describes **the stale checkout** (see the
correction at the top). It is the reason the estimate says "port" rather
than "copy", and it would be true of any app's files, because these are
house-style conflicts rather than faults.

The checked-out page cannot be pasted in. It conflicts with the starter's
DESIGN.md in three ways:

- **Icons.** It imports `lucide-react`. The starter moved to Phosphor at
  v2.0.0 and lucide is not a dependency here.
- **Colours.** It uses raw palette classes throughout, for example
  `bg-blue-500/10 text-blue-600 dark:text-blue-400`. DESIGN.md calls raw
  palette classes a smell and bans `dark:` colour variants outright,
  since every token declares both modes via `light-dark()`. Category
  pills should use the status tint tokens.
- **Page anatomy.** It hand-rolls its header, tab bar, loading spinner,
  and empty state. The starter has `PageHeader`, `PageContainer`,
  `PageLoading` and `EmptyState` for exactly these, and the module
  template enforces them.

Plus the three behavioural defects noted earlier: non-idempotent posts,
seen-state written as "now", and a non-reactive localStorage read. The
last two of those are already fixed in live Crosbe.

None of this is a criticism of Crosbe, which is doing its job in its own
app against its own design system, and whose live version had solved the
seen-state problem before this document was written.

---

## Fork and upgrade story

This lands as an **additive** feature, the same category UPGRADING.md
describes for the display kit: "Additive features won't touch fork
code." An existing fork pulling it gets:

| Change | Fork impact |
|---|---|
| New migration file | Run `pnpm db:migrate:remote`. Timestamp prefix, no collision |
| New server module | New files only |
| `src/server/db/schema.ts` | One export line. Trivial conflict at worst |
| `src/server/index.ts` | One import, one `app.route`. Trivial conflict |
| `src/shared/api-scopes.ts` | Two new scope entries |
| New client module | New files only |
| `src/client/App.tsx` | One route |
| **`src/shared/config/nav.ts`** | **The one real conflict risk** |

`nav.ts` is the file FORKING.md explicitly tells a fork to rewrite, so
most forks will have diverged there and will hit a conflict. The
mitigation is cheap: the UPGRADING.md entry should quote the exact
one-line nav item to paste, so a fork that takes its own version of the
file can re-add it in ten seconds without reading the diff.

Nothing breaks if a fork skips it entirely. With no entries published,
the nav item does not render and the routes sit unused.

FORKING.md should get a line in its "things you can delete" list, and
the nav comment block already tells forks how to hide items.

---

## Effort

Claude time, core feature, voting board excluded:

| Slice | Estimate |
|---|---|
| Schema, migration, barrel export | 10 min |
| Server module: routes, admin gate, summary, idempotent upsert | 20 min |
| Client module rebuilt on starter primitives | 40 min |
| Nav badge plumbing plus the `badgeSource` mechanism | 20 min |
| `pnpm changelog:post` plus the API token path | 20 min |
| Docs: CLAUDE.md, UPGRADING.md, FORKING.md, module README | 15 min |
| Tests: vitest route tests, one Playwright pass | 20 min |
| **Total** | **~2h 25m** |

### Proof of done

Not "tests pass". The literal checks:

1. Deploy the starter, run `pnpm changelog:post` from the deploy path,
   then load the app as a non-admin user and see the entry.
2. Run the same post command twice. Confirm one row, not two.
3. Sign in on a second device. Confirm the dot is already cleared there
   after reading it on the first.
4. Publish a `highlight` entry. Confirm the banner appears once,
   dismisses, and does not return on reload.
5. Confirm a fresh fork with an empty table renders no nav item at all.
6. Confirm a non-admin gets 403 from every write route, including the
   summary and seen endpoints behaving correctly for them.

---

## The stale-bundle toast is a different feature

`UpdateToast.tsx` in the Crosbe checkout is not part of this. It solves "the browser
is running an old bundle after a deploy", driven by a build id polled
from `/api/health`, and its value is that users stop hitting bugs that
were already fixed.

It shares a word with this proposal and nothing else. Bundling them
would tie the changelog schema to the deploy pipeline for no benefit.

It is worth doing on its own, and it is smaller than it looks. The
starter already has `/api/health` (`src/server/index.ts:260`), it just
returns dependency checks and no version. So the work is: inject a
`BUILD_ID` at build time, add it to that existing response, poll on
`visibilitychange` plus a slow interval, silently reload when the tab is
backgrounded and idle, toast when it is not. `sonner` is already a
dependency, so it would not need Crosbe's hand-built toast component.

Say the word and it gets its own proposal.

---

## Open questions — all four answered, 2026-08-03

Jez took every recommendation as written. For the record:

1. **No voting board**, not even opt-in.
2. **Banner only, no modal**, knowing live Crosbe uses a modal.
3. **Feedback capture stays out**, as its own future proposal.
4. **Deploy-path posting is agent judgement, never automatic** — so
   `changelog:post` is deliberately not wired into `pnpm deploy`.

The original wording follows.

1. **Voting board: agreed to leave it out?** My recommendation is to
   skip it as a default and let a fork that genuinely wants one build it
   deliberately. If you would rather have it available, the honest
   middle is a documented opt-in module that ships disabled, which costs
   the extra build time but keeps it off by default.

2. **How loud should a highlight release be?** The proposal says one
   dismissible inline banner on the dashboard home, never a modal. If
   you want a modal available for genuinely big releases, it is a small
   addition on top of the same `highlight` flag, but I would rather not
   ship one by default.

3. **Feedback capture: same proposal or its own?** The small private
   version (one table, admin-only read, no voting) is worth having. I
   have kept it out of the estimate above so this proposal stays one
   thing. Happy to fold it in.

4. **Should the deploy path post automatically, or only when asked?** An
   automatic post on every deploy means the table fills with entries
   nobody wrote well. My instinct is that the agent should post only
   when it has something a user would care about, and that the judgement
   of "is this worth telling users about" is exactly the kind of call an
   agent should be making at deploy time rather than a script making it
   by rule.
