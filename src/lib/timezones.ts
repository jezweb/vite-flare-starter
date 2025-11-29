/**
 * Timezone utilities for the application
 *
 * Provides:
 * - State/country to timezone mapping
 * - Common timezone list for user selection
 * - Date formatting with timezone support
 * - Browser timezone detection
 */

import { formatDistanceToNow } from 'date-fns'
import { toZonedTime, formatInTimeZone } from 'date-fns-tz'

/**
 * Timezone information for display
 */
export interface TimezoneInfo {
  id: string // IANA timezone ID (e.g., 'Australia/Sydney')
  label: string // Human-readable label (e.g., 'Sydney (AEDT)')
  offset: string // UTC offset (e.g., '+11:00')
  region: string // Geographic region (e.g., 'Australia')
}

/**
 * Mapping from Australian states to IANA timezone IDs
 * Handles daylight saving automatically
 */
export const AUSTRALIAN_STATE_TIMEZONES: Record<string, string> = {
  NSW: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  WA: 'Australia/Perth',
  TAS: 'Australia/Hobart',
  NT: 'Australia/Darwin',
  ACT: 'Australia/Sydney', // ACT follows NSW timezone
}

/**
 * Mapping from US states to primary IANA timezone IDs
 * Note: Some states span multiple zones; this uses the most populous city
 */
export const US_STATE_TIMEZONES: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix', // No DST
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Boise',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
  DC: 'America/New_York',
}

/**
 * Mapping from Canadian provinces to IANA timezone IDs
 */
export const CANADIAN_PROVINCE_TIMEZONES: Record<string, string> = {
  AB: 'America/Edmonton',
  BC: 'America/Vancouver',
  MB: 'America/Winnipeg',
  NB: 'America/Halifax',
  NL: 'America/St_Johns',
  NS: 'America/Halifax',
  ON: 'America/Toronto',
  PE: 'America/Halifax',
  QC: 'America/Toronto',
  SK: 'America/Regina', // No DST
  NT: 'America/Yellowknife',
  NU: 'America/Iqaluit',
  YT: 'America/Whitehorse',
}

/**
 * Mapping from New Zealand regions to IANA timezone IDs
 */
export const NZ_REGION_TIMEZONES: Record<string, string> = {
  AUK: 'Pacific/Auckland',
  WGN: 'Pacific/Auckland',
  CAN: 'Pacific/Auckland',
  BOP: 'Pacific/Auckland',
  WKO: 'Pacific/Auckland',
  OTA: 'Pacific/Auckland',
}

/**
 * Mapping from UK regions to IANA timezone IDs
 */
export const UK_REGION_TIMEZONES: Record<string, string> = {
  ENG: 'Europe/London',
  SCT: 'Europe/London',
  WLS: 'Europe/London',
  NIR: 'Europe/London',
}

/**
 * Default timezone for countries without state mapping
 */
export const COUNTRY_DEFAULT_TIMEZONES: Record<string, string> = {
  AU: 'Australia/Sydney',
  US: 'America/New_York',
  CA: 'America/Toronto',
  NZ: 'Pacific/Auckland',
  GB: 'Europe/London',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  JP: 'Asia/Tokyo',
  CN: 'Asia/Shanghai',
  IN: 'Asia/Kolkata',
  SG: 'Asia/Singapore',
  ID: 'Asia/Jakarta',
}

/**
 * Get timezone for a given country and state
 * Falls back to country default if state not found
 */
export function getTimezoneForLocation(
  countryCode?: string | null,
  stateCode?: string | null
): string | null {
  if (!countryCode) return null

  const upperCountry = countryCode.toUpperCase()
  const upperState = stateCode?.toUpperCase()

  // Try state-level mapping first
  if (upperState) {
    switch (upperCountry) {
      case 'AU':
        if (AUSTRALIAN_STATE_TIMEZONES[upperState]) {
          return AUSTRALIAN_STATE_TIMEZONES[upperState]
        }
        break
      case 'US':
        if (US_STATE_TIMEZONES[upperState]) {
          return US_STATE_TIMEZONES[upperState]
        }
        break
      case 'CA':
        if (CANADIAN_PROVINCE_TIMEZONES[upperState]) {
          return CANADIAN_PROVINCE_TIMEZONES[upperState]
        }
        break
      case 'NZ':
        if (NZ_REGION_TIMEZONES[upperState]) {
          return NZ_REGION_TIMEZONES[upperState]
        }
        break
      case 'GB':
        if (UK_REGION_TIMEZONES[upperState]) {
          return UK_REGION_TIMEZONES[upperState]
        }
        break
    }
  }

  // Fall back to country default
  return COUNTRY_DEFAULT_TIMEZONES[upperCountry] || null
}

/**
 * Commonly used timezones for the picker
 * Organized by region for easy selection
 */
export const COMMON_TIMEZONES: TimezoneInfo[] = [
  // Australia (primary market)
  {
    id: 'Australia/Sydney',
    label: 'Sydney, Melbourne',
    offset: '+10:00/+11:00',
    region: 'Australia',
  },
  {
    id: 'Australia/Brisbane',
    label: 'Brisbane (No DST)',
    offset: '+10:00',
    region: 'Australia',
  },
  {
    id: 'Australia/Adelaide',
    label: 'Adelaide',
    offset: '+9:30/+10:30',
    region: 'Australia',
  },
  { id: 'Australia/Perth', label: 'Perth', offset: '+8:00', region: 'Australia' },
  {
    id: 'Australia/Darwin',
    label: 'Darwin (No DST)',
    offset: '+9:30',
    region: 'Australia',
  },
  {
    id: 'Australia/Hobart',
    label: 'Hobart',
    offset: '+10:00/+11:00',
    region: 'Australia',
  },

  // New Zealand
  { id: 'Pacific/Auckland', label: 'Auckland', offset: '+12:00/+13:00', region: 'Pacific' },

  // Asia
  { id: 'Asia/Singapore', label: 'Singapore', offset: '+8:00', region: 'Asia' },
  { id: 'Asia/Tokyo', label: 'Tokyo', offset: '+9:00', region: 'Asia' },
  { id: 'Asia/Shanghai', label: 'Shanghai, Beijing', offset: '+8:00', region: 'Asia' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong', offset: '+8:00', region: 'Asia' },
  { id: 'Asia/Seoul', label: 'Seoul', offset: '+9:00', region: 'Asia' },
  { id: 'Asia/Kolkata', label: 'Mumbai, Delhi', offset: '+5:30', region: 'Asia' },
  { id: 'Asia/Dubai', label: 'Dubai', offset: '+4:00', region: 'Asia' },
  { id: 'Asia/Jakarta', label: 'Jakarta', offset: '+7:00', region: 'Asia' },

  // Europe
  { id: 'Europe/London', label: 'London', offset: '+0:00/+1:00', region: 'Europe' },
  { id: 'Europe/Paris', label: 'Paris, Berlin', offset: '+1:00/+2:00', region: 'Europe' },
  { id: 'Europe/Amsterdam', label: 'Amsterdam', offset: '+1:00/+2:00', region: 'Europe' },
  { id: 'Europe/Zurich', label: 'Zurich', offset: '+1:00/+2:00', region: 'Europe' },
  { id: 'Europe/Moscow', label: 'Moscow', offset: '+3:00', region: 'Europe' },

  // Americas
  { id: 'America/New_York', label: 'New York, Toronto', offset: '-5:00/-4:00', region: 'Americas' },
  { id: 'America/Chicago', label: 'Chicago, Dallas', offset: '-6:00/-5:00', region: 'Americas' },
  { id: 'America/Denver', label: 'Denver, Phoenix', offset: '-7:00/-6:00', region: 'Americas' },
  {
    id: 'America/Los_Angeles',
    label: 'Los Angeles, Vancouver',
    offset: '-8:00/-7:00',
    region: 'Americas',
  },
  { id: 'America/Sao_Paulo', label: 'São Paulo', offset: '-3:00', region: 'Americas' },

  // UTC
  { id: 'UTC', label: 'UTC (Coordinated Universal Time)', offset: '+0:00', region: 'UTC' },
]

/**
 * Get browser's timezone
 * Used for auto-detection on first visit
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Check if a timezone ID is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * Get current time in a specific timezone
 */
export function getCurrentTimeInTimezone(timezone: string): Date {
  return toZonedTime(new Date(), timezone)
}

/**
 * Format a date in a specific timezone
 */
export function formatDateInTimezone(
  date: Date | string | number,
  timezone: string,
  formatStr: string = 'MMM d, yyyy h:mm a'
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return formatInTimeZone(dateObj, timezone, formatStr)
}

/**
 * Format time only (e.g., "3:45 PM")
 */
export function formatTimeInTimezone(
  date: Date | string | number,
  timezone: string,
  formatStr: string = 'h:mm a'
): string {
  return formatDateInTimezone(date, timezone, formatStr)
}

/**
 * Format relative time (e.g., "2 days ago")
 * Note: This uses the browser's current time as reference
 */
export function formatRelativeTime(date: Date | string | number, options?: { addSuffix?: boolean }): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return formatDistanceToNow(dateObj, { addSuffix: options?.addSuffix ?? true })
}

/**
 * Format a detailed relative time with days and hours
 * e.g., "2 days, 3 hours ago"
 */
export function formatDetailedRelativeTime(date: Date | string | number): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()

  if (diffMs < 0) {
    return 'just now' // Future date
  }

  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) {
    const remainingHours = diffHours % 24
    if (remainingHours > 0) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''}, ${remainingHours} hour${remainingHours !== 1 ? 's' : ''} ago`
    }
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  }

  if (diffHours > 0) {
    const remainingMinutes = diffMinutes % 60
    if (remainingMinutes > 0) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''}, ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} ago`
    }
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  }

  if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`
  }

  return 'just now'
}

/**
 * Get timezone abbreviation (e.g., 'AEDT', 'PST')
 */
export function getTimezoneAbbreviation(timezone: string, date: Date = new Date()): string {
  try {
    // Format with timezone name
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    })
    const parts = formatter.formatToParts(date)
    const tzPart = parts.find((part) => part.type === 'timeZoneName')
    return tzPart?.value || timezone
  } catch {
    return timezone
  }
}

/**
 * Get current UTC offset for a timezone (e.g., '+11:00')
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    })
    const parts = formatter.formatToParts(date)
    const tzPart = parts.find((part) => part.type === 'timeZoneName')
    const offset = tzPart?.value || ''
    // Convert 'GMT+11:00' to '+11:00'
    return offset.replace('GMT', '')
  } catch {
    return '+00:00'
  }
}

/**
 * Find timezone info by ID
 */
export function findTimezoneById(timezoneId: string): TimezoneInfo | undefined {
  return COMMON_TIMEZONES.find((tz) => tz.id === timezoneId)
}

/**
 * Get display label for a timezone
 */
export function getTimezoneLabel(timezoneId: string): string {
  const info = findTimezoneById(timezoneId)
  if (info) {
    return `${info.label} (${getTimezoneAbbreviation(timezoneId)})`
  }
  // Fallback for timezones not in our list
  const abbrev = getTimezoneAbbreviation(timezoneId)
  const offset = getTimezoneOffset(timezoneId)
  return `${timezoneId.replace(/_/g, ' ').split('/').pop()} (${abbrev} ${offset})`
}
