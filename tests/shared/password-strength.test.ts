import { describe, it, expect } from 'vitest'
import {
  checkPasswordStrength,
  getPasswordRequirements,
  getStrengthColor,
} from '@/shared/lib/password-strength'
import { validPasswords, weakPasswords } from '../utils/factories'

describe('Password Strength Validator', () => {
  describe('checkPasswordStrength', () => {
    it('should return very weak for empty password', () => {
      const result = checkPasswordStrength('')
      expect(result.score).toBe(0)
      expect(result.label).toBe('Very Weak')
      expect(result.isValid).toBe(false)
    })

    it('should return very weak for short passwords', () => {
      const result = checkPasswordStrength('short')
      expect(result.score).toBe(0)
      expect(result.label).toBe('Very Weak')
      expect(result.isValid).toBe(false)
      expect(result.feedback).toContain('Use at least 8 characters')
    })

    it('should return weak for passwords with only lowercase', () => {
      const result = checkPasswordStrength('abcdefghij')
      expect(result.isValid).toBe(false)
      expect(result.feedback).toContain('Add uppercase letters')
      expect(result.feedback).toContain('Add numbers')
      expect(result.feedback).toContain('Add special characters')
    })

    it('should return weak for passwords with only numbers', () => {
      const result = checkPasswordStrength('12345678')
      expect(result.isValid).toBe(false)
      expect(result.feedback).toContain('Avoid common patterns')
    })

    it('should detect common password patterns', () => {
      const patterns = ['password123', 'qwerty123', 'abc123456']
      for (const password of patterns) {
        const result = checkPasswordStrength(password)
        expect(result.feedback).toContain('Avoid common patterns')
      }
    })

    it('should detect repeated characters', () => {
      const result = checkPasswordStrength('aaabbbccc123')
      expect(result.feedback).toContain('Avoid common patterns')
    })

    it('should return valid for passwords meeting minimum requirements', () => {
      // 8+ chars with at least 2 character types
      const result = checkPasswordStrength('Password1')
      expect(result.isValid).toBe(true)
    })

    it('should return strong for complex passwords', () => {
      const result = checkPasswordStrength('MyStr0ng!P@ssword')
      expect(result.score).toBeGreaterThanOrEqual(3)
      expect(result.isValid).toBe(true)
    })

    it('should give higher scores for longer passwords', () => {
      const medium = checkPasswordStrength('Password1!')
      const long = checkPasswordStrength('VeryLongPassword1!')
      const veryLong = checkPasswordStrength('ExtremelyLongSecurePassword1!')

      expect(long.score).toBeGreaterThanOrEqual(medium.score)
      expect(veryLong.score).toBeGreaterThanOrEqual(long.score)
    })

    it('should validate all valid password samples', () => {
      for (const password of validPasswords) {
        const result = checkPasswordStrength(password)
        expect(result.isValid).toBe(true)
      }
    })

    it('should reject all weak password samples', () => {
      for (const password of weakPasswords) {
        const result = checkPasswordStrength(password)
        expect(result.isValid).toBe(false)
      }
    })
  })

  describe('getPasswordRequirements', () => {
    it('should return all requirements for empty password', () => {
      const reqs = getPasswordRequirements('')
      expect(reqs).toHaveLength(5)
      expect(reqs.every((r) => !r.met)).toBe(true)
    })

    it('should show length requirement as met for 8+ chars', () => {
      const reqs = getPasswordRequirements('12345678')
      const lengthReq = reqs.find((r) => r.label.includes('8 characters'))
      expect(lengthReq?.met).toBe(true)
    })

    it('should detect lowercase letters', () => {
      const reqs = getPasswordRequirements('abc')
      const lowercaseReq = reqs.find((r) => r.label.includes('lowercase'))
      expect(lowercaseReq?.met).toBe(true)
    })

    it('should detect uppercase letters', () => {
      const reqs = getPasswordRequirements('ABC')
      const uppercaseReq = reqs.find((r) => r.label.includes('uppercase'))
      expect(uppercaseReq?.met).toBe(true)
    })

    it('should detect numbers', () => {
      const reqs = getPasswordRequirements('123')
      const numberReq = reqs.find((r) => r.label.includes('number'))
      expect(numberReq?.met).toBe(true)
    })

    it('should detect special characters', () => {
      const reqs = getPasswordRequirements('!@#')
      const specialReq = reqs.find((r) => r.label.includes('special'))
      expect(specialReq?.met).toBe(true)
    })

    it('should show all requirements met for strong password', () => {
      const reqs = getPasswordRequirements('StrongP@ss123')
      expect(reqs.every((r) => r.met)).toBe(true)
    })
  })

  describe('getStrengthColor', () => {
    it('should return destructive for score 0', () => {
      expect(getStrengthColor(0)).toBe('bg-destructive')
    })

    it('should return orange for score 1', () => {
      expect(getStrengthColor(1)).toBe('bg-orange-500')
    })

    it('should return yellow for score 2', () => {
      expect(getStrengthColor(2)).toBe('bg-yellow-500')
    })

    it('should return green for score 3', () => {
      expect(getStrengthColor(3)).toBe('bg-green-500')
    })

    it('should return emerald for score 4', () => {
      expect(getStrengthColor(4)).toBe('bg-emerald-500')
    })
  })
})
