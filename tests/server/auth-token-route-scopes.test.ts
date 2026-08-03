import { describe, expect, it } from 'vitest'
import { getApiTokenRouteScopes } from '@/server/middleware/auth'

describe('API token route scopes', () => {
  it('maps explicitly supported routes to required scopes', () => {
    expect(getApiTokenRouteScopes('PATCH', '/api/settings/profile')).toEqual(['profile:write'])
    expect(getApiTokenRouteScopes('GET', '/api/activity')).toEqual(['activity:read'])
    expect(getApiTokenRouteScopes('DELETE', '/api/notifications/abc')).toEqual([
      'notifications:write',
    ])
    expect(getApiTokenRouteScopes('POST', '/api/chat/extract')).toEqual(['chat:write'])
    expect(getApiTokenRouteScopes('GET', '/api/updates/entries')).toEqual(['updates:read'])
    expect(getApiTokenRouteScopes('POST', '/api/updates/entries')).toEqual(['updates:write'])
    expect(getApiTokenRouteScopes('PUT', '/api/updates/seen')).toEqual(['updates:write'])
  })

  it('keeps updates PATCH and DELETE session-only', () => {
    // A deploy amends by re-POSTing the same releaseKey, so automation
    // never needs an arbitrary entry id. A leaked deploy token therefore
    // cannot rewrite or erase published history.
    expect(getApiTokenRouteScopes('PATCH', '/api/updates/entries/abc')).toBeNull()
    expect(getApiTokenRouteScopes('DELETE', '/api/updates/entries/abc')).toBeNull()
  })

  it('denies API token access for routes that have not been allow-listed', () => {
    expect(getApiTokenRouteScopes('GET', '/api/admin/users')).toBeNull()
    expect(getApiTokenRouteScopes('POST', '/api/api-tokens')).toBeNull()
    expect(getApiTokenRouteScopes('GET', '/api/projects')).toBeNull()
  })
})
