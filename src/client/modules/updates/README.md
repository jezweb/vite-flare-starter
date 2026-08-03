# Updates — "What's New"

User-facing release notes: a page at `/dashboard/updates`, a quiet dot on
the nav item when there is something unread, and one dismissible banner
for entries flagged as a highlight.

## Where entries come from

D1, posted by whoever runs the deploy:

```bash
APP_URL=https://your-app.example CHANGELOG_TOKEN=vfs_… \
pnpm changelog:post \
  --title "Faster search" \
  --body "Search now returns in under 100ms." \
  --category improvement \
  --release-key "$(git rev-parse --short HEAD)"
```

The token needs the `updates:write` scope **and** must belong to an admin
user — the scope alone is not enough, `adminMiddleware` still runs.

`--release-key` makes the post idempotent: re-running the same deploy
updates that entry instead of adding a second one, via a real SQL
`ON CONFLICT` rather than a check-then-insert, so two concurrent deploys
cannot both decide the row is missing. Publication is sticky: once an
entry is live, a re-post keeps its original date and cannot pull it back
to draft. `--draft` saves without publishing, so the wording can be
checked before users see it.

Admins can write, publish, unpublish and delete entries on the page
itself. **Editing and deleting are browser-session only** — no API token
can reach `PATCH` or `DELETE`, because automation amends by re-posting
the same `releaseKey` and so never needs an arbitrary entry id. A leaked
deploy token can add a note; it cannot rewrite or erase history.

**This is not `CHANGELOG.md`.** That file is for developers maintaining
the fork ("bumped compatibility_date"); this is for the people using the
app. Two audiences, two documents — don't generate one from the other.

**Posting is a judgement call, not a deploy step.** It is deliberately
not wired into `pnpm deploy`: posting on every deploy fills the feed with
entries nobody wrote well. Post when there is something a user would
care about.

## How loud it gets

Three tiers, quietest first:

| State | Surface |
|---|---|
| Nothing published | The nav item does not render at all |
| Unread entries | A dot on the nav item |
| Unread entry with `highlight` | One dismissible banner on the dashboard home |

Hiding is deliberately about a *successful* empty read. If the summary
request fails the item stays visible: a transient rate-limit or network
blip must not remove working navigation for the rest of the session.

Two things the hiding does NOT cover, both fine and both worth knowing
before a fork is surprised by them. The command palette (⌘K) reads
`NAV_SECTIONS` directly and will offer "What's new" even when the sidebar
hides it — it is a real route that renders a proper empty state, not a
dead link. And `DashboardLayout` uses the same static config to resolve
document titles, which works regardless of hidden state.

No modal, by design. A modal spends the user's attention on our schedule
and cannot tell a patch release from a real one. `highlight` is what buys
the right to interrupt, and because it has to be set per entry it stays
rare. If every entry gets flagged, the banner stops meaning anything.

## Seen state

Stored server-side in `user_meta` under `updates:last-seen`, so the dot
clears on every device and survives a cache clear.

The marker is set to the `publishedAt` of the newest entry the page
actually **rendered**, never "now". Stamping "now" would swallow an entry
published while the page sat open — it would count as seen without ever
having been shown. The server clamps the value: never backwards, never
past the newest published entry.

## Files

| Path | What |
|---|---|
| `src/server/modules/updates/` | Schema, routes |
| `src/client/modules/updates/` | Page, card, editor, banner, hooks |
| `src/client/lib/nav-badges.ts` | Resolves `badgeSource: 'updates'` to the dot + hide state |
| `scripts/changelog-post.mjs` | The deploy-time poster |
| `tests/server/modules/updates/routes.test.ts` | Idempotency, admin gate, seen-state |

## Removing it from a fork

Delete both module directories, the `/dashboard/updates` route in
`App.tsx`, the nav entry in `src/shared/config/nav.ts`, the
`changelogEntries` line in `src/server/db/schema.ts`, the `app.route`
line in `src/server/index.ts`, and `<WhatsNewBanner />` in
`DashboardPage.tsx`. Leave the table; an unused table costs nothing and
dropping it needs a migration.
