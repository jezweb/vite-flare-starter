import { customType } from 'drizzle-orm/sqlite-core'

/**
 * Forgiving timestamp column for better-auth managed tables on Cloudflare D1.
 *
 * Why this exists:
 * Better-auth on Cloudflare Workers (no Drizzle adapter) writes timestamps in
 * mixed formats — sometimes ISO 8601 strings (`datetime('now')` SQL default),
 * sometimes Unix epoch *seconds* (when JS code passes `Math.floor(Date.now()/1000)`).
 * SQLite's flexible typing accepts both into the same column.
 *
 * Reading these with the built-in `integer({mode: 'timestamp'})` mode coerces
 * the string to NaN → `Date(NaN).toISOString()` throws "Invalid time value".
 *
 * This custom type unifies all incoming shapes to a JS Date object so existing
 * consumers (`user.createdAt.toISOString()`) keep working unchanged. Outgoing
 * writes use ISO strings so the on-disk format converges over time.
 *
 * SQL comparisons against `gt()`/`lt()` with a Date arg get serialised to ISO
 * via `toDriver`. SQLite text comparison on ISO 8601 strings is lexicographic
 * which matches chronological order — so filters still work.
 */
export const isoTimestamp = customType<{ data: Date; driverData: string | number }>({
  dataType() {
    return 'text'
  },
  toDriver(value: Date): string {
    return value.toISOString()
  },
  fromDriver(value: string | number): Date {
    // Numeric (or numeric-string) values: better-auth writes Unix *seconds*.
    // Distinguish ms vs s by magnitude: anything above ~1e11 is already ms.
    if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
      const n = typeof value === 'number' ? value : Number(value)
      const ms = n > 1e11 ? n : n * 1000
      const d = new Date(ms)
      if (Number.isNaN(d.getTime())) {
        throw new Error(`isoTimestamp: invalid numeric timestamp from driver: ${value}`)
      }
      return d
    }
    // ISO 8601 string
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) {
      throw new Error(`isoTimestamp: invalid ISO 8601 value from driver: ${value}`)
    }
    return d
  },
})
