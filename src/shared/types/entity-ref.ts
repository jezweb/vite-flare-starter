/**
 * EntityRef — polymorphic entity reference
 *
 * Used consistently across comments, tags, watchers, favourites,
 * and recently-viewed modules. Any "attachable" feature uses this
 * pattern to link to any entity type.
 *
 * @example
 * // An issue in a project tracker
 * { entityType: 'issue', entityId: 'abc-123' }
 *
 * // A wiki page
 * { entityType: 'page', entityId: 'def-456' }
 */
export interface EntityRef {
  entityType: string
  entityId: string
}
