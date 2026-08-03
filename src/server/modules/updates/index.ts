/**
 * Updates Module — user-facing release notes ("What's New").
 */

export {
  changelogEntries,
  CHANGELOG_CATEGORIES,
  UPDATES_LAST_SEEN_KEY,
} from './db/schema'
export type { ChangelogEntry, NewChangelogEntry, ChangelogCategory } from './db/schema'
export { default as updatesRoutes } from './routes'
