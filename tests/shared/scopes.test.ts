import { describe, it, expect } from 'vitest'
import {
  API_TOKEN_SCOPES,
  ALL_SCOPES,
  SCOPE_CATEGORIES,
  type ApiTokenScope,
} from '@/shared/config/scopes'

describe('API Token Scopes Configuration', () => {
  describe('ALL_SCOPES', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(ALL_SCOPES)).toBe(true)
      expect(ALL_SCOPES.length).toBeGreaterThan(0)
    })

    it('should contain no duplicates', () => {
      const uniqueScopes = new Set(ALL_SCOPES)
      expect(uniqueScopes.size).toBe(ALL_SCOPES.length)
    })

    it('should have valid scope format (resource:action)', () => {
      for (const scope of ALL_SCOPES) {
        expect(scope).toMatch(/^[a-z]+:[a-z]+$/)
      }
    })
  })

  describe('API_TOKEN_SCOPES', () => {
    it('should have description for every scope', () => {
      for (const scope of ALL_SCOPES) {
        expect(API_TOKEN_SCOPES[scope]).toBeDefined()
        expect(typeof API_TOKEN_SCOPES[scope]).toBe('string')
        expect(API_TOKEN_SCOPES[scope].length).toBeGreaterThan(0)
      }
    })

    it('should not have extra scopes not in ALL_SCOPES', () => {
      const definedScopes = Object.keys(API_TOKEN_SCOPES) as ApiTokenScope[]
      for (const scope of definedScopes) {
        expect(ALL_SCOPES).toContain(scope)
      }
    })
  })

  describe('SCOPE_CATEGORIES', () => {
    it('should include all scopes across categories', () => {
      const allCategorizedScopes: string[] = []
      for (const scopes of Object.values(SCOPE_CATEGORIES)) {
        allCategorizedScopes.push(...scopes)
      }

      // Every scope should be in a category
      for (const scope of ALL_SCOPES) {
        expect(allCategorizedScopes).toContain(scope)
      }
    })

    it('should have non-empty category names', () => {
      for (const categoryName of Object.keys(SCOPE_CATEGORIES)) {
        expect(categoryName.length).toBeGreaterThan(0)
      }
    })

    it('should have non-empty scope arrays per category', () => {
      for (const [category, scopes] of Object.entries(SCOPE_CATEGORIES)) {
        expect(scopes.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Expected scopes', () => {
    it('should include profile scopes', () => {
      expect(ALL_SCOPES).toContain('profile:read')
      expect(ALL_SCOPES).toContain('profile:write')
    })

    it('should include settings scopes', () => {
      expect(ALL_SCOPES).toContain('settings:read')
      expect(ALL_SCOPES).toContain('settings:write')
    })

    it('should include activity scope', () => {
      expect(ALL_SCOPES).toContain('activity:read')
    })

    it('should include notifications scopes', () => {
      expect(ALL_SCOPES).toContain('notifications:read')
      expect(ALL_SCOPES).toContain('notifications:write')
    })

    it('should include chat scopes', () => {
      expect(ALL_SCOPES).toContain('chat:read')
      expect(ALL_SCOPES).toContain('chat:write')
    })

    it('should include AI scope', () => {
      expect(ALL_SCOPES).toContain('ai:use')
    })
  })
})
