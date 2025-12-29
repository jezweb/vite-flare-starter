/**
 * CSV Export Utilities
 *
 * Generic utilities for generating CSV exports from data.
 * Includes proper escaping, timezone-aware timestamps, and helper functions.
 */

import { formatInTimeZone } from 'date-fns-tz'

const TIMEZONE = 'Australia/Sydney'
const DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss'

/**
 * Escape a value for CSV format
 * - Wrap in quotes if contains comma, quote, or newline
 * - Double any internal quotes
 */
export function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const str = String(value)

  // Check if quoting needed
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * Format a timestamp for CSV output
 * Converts to Australia/Sydney timezone
 */
export function formatTimestamp(
  date: Date | number | null | undefined,
  timezone: string = TIMEZONE
): string {
  if (!date) return ''

  try {
    const d = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(d.getTime())) return ''
    return formatInTimeZone(d, timezone, DATE_FORMAT)
  } catch {
    return ''
  }
}

/**
 * Parse JSON tags field and format for CSV
 * ["tag1", "tag2"] -> "tag1, tag2"
 */
export function formatTags(tagsJson: string | null | undefined): string {
  if (!tagsJson) return ''

  try {
    const tags = JSON.parse(tagsJson)
    if (Array.isArray(tags)) {
      return tags.join(', ')
    }
    return ''
  } catch {
    return ''
  }
}

/**
 * Strip HTML tags from content (for notes export)
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''

  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
    .replace(/&amp;/g, '&') // Decode ampersands
    .replace(/&lt;/g, '<') // Decode less than
    .replace(/&gt;/g, '>') // Decode greater than
    .replace(/&quot;/g, '"') // Decode quotes
    .replace(/&#39;/g, "'") // Decode apostrophes
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}

/**
 * Column definition for CSV generation
 */
export interface CSVColumn<T> {
  header: string
  getValue: (row: T) => unknown
}

/**
 * Generate CSV string from array of objects
 * @param data Array of row objects
 * @param columns Column definitions with headers and value extractors
 */
export function generateCSV<T>(data: T[], columns: CSVColumn<T>[]): string {
  const lines: string[] = []

  // Header row
  lines.push(columns.map((col) => escapeCSV(col.header)).join(','))

  // Data rows
  for (const row of data) {
    const values = columns.map((col) => escapeCSV(col.getValue(row)))
    lines.push(values.join(','))
  }

  return lines.join('\r\n')
}

/**
 * Create a CSV file download response
 */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  })
}

// ============================================
// LOOKUP MAP UTILITIES
// ============================================

/**
 * User lookup info - commonly used across exports
 */
export interface UserLookup {
  email: string
  name: string
}

/**
 * Build a user lookup map from DB query results
 * Reusable across all export routes that need user info
 */
export function buildUserMap(
  users: Array<{ id: string; email: string; name: string }>
): Map<string, UserLookup> {
  return new Map(users.map((u) => [u.id, { email: u.email, name: u.name }]))
}

/**
 * Build a simple name lookup map (for contacts, companies, etc.)
 */
export function buildNameMap<T extends { id: string }>(
  items: T[],
  getName: (item: T) => string
): Map<string, string> {
  return new Map(items.map((item) => [item.id, getName(item)]))
}

/**
 * Contact lookup map builder (first + last name)
 */
export function buildContactMap(
  contacts: Array<{ id: string; firstName: string; lastName: string }>
): Map<string, string> {
  return new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]))
}

/**
 * Get value from user map with fallback
 */
export function getUserEmail(
  userMap: Map<string, UserLookup>,
  userId: string | null | undefined
): string {
  if (!userId) return ''
  return userMap.get(userId)?.email || ''
}

/**
 * Get user name from map with fallback
 */
export function getUserName(
  userMap: Map<string, UserLookup>,
  userId: string | null | undefined
): string {
  if (!userId) return ''
  return userMap.get(userId)?.name || ''
}

/**
 * Get value from a string map with fallback
 */
export function getMapValue(map: Map<string, string>, key: string | null | undefined): string {
  if (!key) return ''
  return map.get(key) || ''
}

/**
 * Format a boolean value for CSV
 */
export function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  return value ? 'Yes' : 'No'
}

/**
 * Format JSON field for CSV (parse and join if array, or stringify)
 */
export function formatJSON(value: string | null | undefined): string {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.join(', ')
    }
    return JSON.stringify(parsed)
  } catch {
    return value
  }
}
