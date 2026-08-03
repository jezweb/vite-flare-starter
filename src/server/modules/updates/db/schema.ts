/**
 * Changelog ("What's New") Schema
 *
 * User-facing release notes. This is deliberately NOT the repo's
 * CHANGELOG.md: that one is for developers maintaining the fork
 * ("bumped compatibility_date"), this one is for the people using the
 * app. Keeping them separate is why there is no "internal" flag here —
 * an entry either belongs in front of users or it belongs in the repo.
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Entry categories. Kept short on purpose — a longer list pushes the
 * author into taxonomy decisions instead of writing the note.
 */
export const CHANGELOG_CATEGORIES = ['feature', 'fix', 'improvement'] as const

export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number]

export const changelogEntries = sqliteTable(
  'changelog_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /**
     * Stable key for the release this entry describes (version tag, commit
     * sha, whatever the deploy path has to hand). Posting the same key
     * twice UPDATES the entry rather than adding a second one, so a
     * re-run deploy cannot double-post. Nullable: hand-written entries
     * that do not correspond to a release do not need one.
     */
    releaseKey: text('release_key'),

    title: text('title').notNull(),
    /** Markdown. Rendered with react-markdown + remark-gfm. */
    body: text('body').notNull(),

    category: text('category', { enum: CHANGELOG_CATEGORIES }).notNull().default('feature'),

    /** Display-only version label, e.g. "v2.2". */
    version: text('version'),

    /**
     * Earns the right to interrupt. A highlighted entry surfaces one
     * dismissible banner on the dashboard home; everything else only
     * moves the quiet dot on the nav item. Set it deliberately and
     * rarely, or the banner stops meaning anything.
     */
    highlight: integer('highlight', { mode: 'boolean' }).notNull().default(false),

    /**
     * Null = draft, invisible to everyone but admins. Lets the deploy
     * path post an entry immediately and leave the wording to be
     * checked before users see it.
     */
    publishedAt: integer('published_at', { mode: 'timestamp' }),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('changelog_entries_release_key_idx').on(table.releaseKey),
    index('changelog_entries_published_at_idx').on(table.publishedAt),
  ]
)

export type ChangelogEntry = typeof changelogEntries.$inferSelect
export type NewChangelogEntry = typeof changelogEntries.$inferInsert

/**
 * Per-user "last seen" marker key in the existing `user_meta` table.
 *
 * Server-side rather than localStorage so the dot clears on every device
 * the user signs in on, and survives a cache clear.
 */
export const UPDATES_LAST_SEEN_KEY = 'updates:last-seen'
