import { describe, it, expect } from 'vitest'
import { createApiTokenSchema, scopeSchema } from '@/shared/schemas/api-token.schema'
import { ALL_SCOPES, API_TOKEN_SCOPES } from '@/shared/config/scopes'
import { testScopes } from '../utils/factories'

describe('API Token Schemas', () => {
  describe('scopeSchema', () => {
    it('should accept valid scopes', () => {
      for (const scope of ALL_SCOPES) {
        const result = scopeSchema.safeParse(scope)
        expect(result.success).toBe(true)
      }
    })

    it('should reject invalid scopes', () => {
      const invalidScopes = ['invalid:scope', 'admin:super', 'read:all', '']
      for (const scope of invalidScopes) {
        const result = scopeSchema.safeParse(scope)
        expect(result.success).toBe(false)
      }
    })

    it('should have descriptions for all scopes', () => {
      for (const scope of ALL_SCOPES) {
        expect(API_TOKEN_SCOPES[scope]).toBeDefined()
        expect(typeof API_TOKEN_SCOPES[scope]).toBe('string')
      }
    })
  })

  describe('createApiTokenSchema', () => {
    it('should accept valid token creation input', () => {
      const input = {
        name: 'Test Token',
        scopes: ['profile:read', 'settings:read'],
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should require a name', () => {
      const input = {
        name: '',
        scopes: ['profile:read'],
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Name is required')
      }
    })

    it('should trim whitespace from name', () => {
      const input = {
        name: '  Test Token  ',
        scopes: ['profile:read'],
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('Test Token')
      }
    })

    it('should reject names over 100 characters', () => {
      const input = {
        name: 'a'.repeat(101),
        scopes: ['profile:read'],
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('100 characters')
      }
    })

    it('should require at least one scope', () => {
      const input = {
        name: 'Test Token',
        scopes: [],
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('At least one scope')
      }
    })

    it('should default scopes to profile:read', () => {
      const input = {
        name: 'Test Token',
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.scopes).toEqual(['profile:read'])
      }
    })

    it('should reject invalid scopes in array', () => {
      const input = {
        name: 'Test Token',
        scopes: ['profile:read', 'invalid:scope'],
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should accept optional expiresAt timestamp', () => {
      const input = {
        name: 'Test Token',
        scopes: ['profile:read'],
        expiresAt: Date.now() + 3600000, // 1 hour from now
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should reject negative expiresAt', () => {
      const input = {
        name: 'Test Token',
        scopes: ['profile:read'],
        expiresAt: -1000,
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should accept valid test scopes', () => {
      const input = {
        name: 'Test Token',
        scopes: [...testScopes.valid],
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should reject invalid test scopes', () => {
      const input = {
        name: 'Test Token',
        scopes: [...testScopes.invalid],
      }
      const result = createApiTokenSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })
})
