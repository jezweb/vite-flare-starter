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
  })

  it('denies API token access for routes that have not been allow-listed', () => {
    expect(getApiTokenRouteScopes('GET', '/api/admin/users')).toBeNull()
    expect(getApiTokenRouteScopes('POST', '/api/api-tokens')).toBeNull()
    expect(getApiTokenRouteScopes('GET', '/api/projects')).toBeNull()
  })
})
