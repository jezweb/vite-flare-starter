/**
 * Password Strength Validator
 *
 * Evaluates password strength and provides feedback.
 */

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4 // 0 = Very Weak, 4 = Very Strong
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong'
  feedback: string[]
  isValid: boolean // Meets minimum requirements
}

export interface PasswordRequirement {
  label: string
  met: boolean
}

/**
 * Check password strength
 *
 * Scoring criteria:
 * - Length: 8+ chars (1 point), 12+ chars (2 points)
 * - Contains lowercase letter (1 point)
 * - Contains uppercase letter (1 point)
 * - Contains number (1 point)
 * - Contains special character (1 point)
 * - No common patterns (1 point)
 *
 * Score mapping:
 * 0-1: Very Weak
 * 2-3: Weak
 * 4-5: Fair
 * 6-7: Strong
 * 8+: Very Strong
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return {
      score: 0,
      label: 'Very Weak',
      feedback: ['Enter a password'],
      isValid: false,
    }
  }

  let points = 0
  const feedback: string[] = []

  // Length checks
  if (password.length >= 8) {
    points += 1
    if (password.length >= 12) {
      points += 1
    }
    if (password.length >= 16) {
      points += 1
    }
  } else {
    feedback.push('Use at least 8 characters')
  }

  // Character variety checks
  const hasLowercase = /[a-z]/.test(password)
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)

  if (hasLowercase) points += 1
  else feedback.push('Add lowercase letters')

  if (hasUppercase) points += 1
  else feedback.push('Add uppercase letters')

  if (hasNumber) points += 1
  else feedback.push('Add numbers')

  if (hasSpecial) points += 1
  else feedback.push('Add special characters')

  // Common pattern checks (deduct points)
  const commonPatterns = [
    /^password/i,
    /^123456/,
    /^qwerty/i,
    /^abc123/i,
    /(.)\1{2,}/, // Same character repeated 3+ times
    /^[a-zA-Z]+$/, // Only letters
    /^\d+$/, // Only numbers
  ]

  const hasCommonPattern = commonPatterns.some((pattern) => pattern.test(password))
  if (hasCommonPattern) {
    points = Math.max(0, points - 2)
    feedback.push('Avoid common patterns')
  }

  // Map points to score (0-4)
  let score: 0 | 1 | 2 | 3 | 4
  let label: PasswordStrengthResult['label']

  if (points <= 2) {
    score = 0
    label = 'Very Weak'
  } else if (points <= 3) {
    score = 1
    label = 'Weak'
  } else if (points <= 5) {
    score = 2
    label = 'Fair'
  } else if (points <= 7) {
    score = 3
    label = 'Strong'
  } else {
    score = 4
    label = 'Very Strong'
  }

  // Minimum requirements: 8+ chars AND at least 2 character types
  const characterTypes = [hasLowercase, hasUppercase, hasNumber, hasSpecial].filter(Boolean).length
  const isValid = password.length >= 8 && characterTypes >= 2

  // If valid but low score, provide encouragement
  if (isValid && score < 2 && feedback.length === 0) {
    feedback.push('Consider using a longer password')
  }

  return {
    score,
    label,
    feedback,
    isValid,
  }
}

/**
 * Get detailed password requirements with status
 */
export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      label: 'At least 8 characters',
      met: password.length >= 8,
    },
    {
      label: 'Contains lowercase letter',
      met: /[a-z]/.test(password),
    },
    {
      label: 'Contains uppercase letter',
      met: /[A-Z]/.test(password),
    },
    {
      label: 'Contains number',
      met: /\d/.test(password),
    },
    {
      label: 'Contains special character',
      met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password),
    },
  ]
}

/**
 * Get color class for password strength score
 */
export function getStrengthColor(score: PasswordStrengthResult['score']): string {
  switch (score) {
    case 0:
      return 'bg-destructive'
    case 1:
      return 'bg-orange-500'
    case 2:
      return 'bg-yellow-500'
    case 3:
      return 'bg-green-500'
    case 4:
      return 'bg-emerald-500'
  }
}
