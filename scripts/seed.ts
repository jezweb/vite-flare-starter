/**
 * Database Seeding Script
 *
 * Generates SQL to seed the local D1 database with test data.
 * Run with: pnpm db:seed
 *
 * Creates:
 * - Test users with passwords
 * - Sample API tokens
 * - Organization settings
 */

import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// Seed data configuration
const SEED_USERS = [
  {
    id: 'seed-user-001',
    email: 'test@example.com',
    name: 'Test User',
    password: 'password123',
  },
  {
    id: 'seed-user-002',
    email: 'admin@example.com',
    name: 'Admin User',
    password: 'admin12345',
  },
]

const SEED_TOKENS = [
  {
    userId: 'seed-user-001',
    name: 'Development Token',
    rawToken: 'vfs_dev_seed_token_1234567890abcdef1234567890',
  },
  {
    userId: 'seed-user-001',
    name: 'CI/CD Token',
    rawToken: 'vfs_cicd_seed_token_abcdef1234567890abcdef12',
  },
]

const SEED_ORG = {
  userId: 'seed-user-001',
  businessName: 'Test Company Pty Ltd',
  businessEmail: 'info@testcompany.com.au',
  timezone: 'Australia/Sydney',
}

/**
 * Hash a token using SHA-256 (matches auth middleware implementation)
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash a password using better-auth's format (salt:hash)
 * Uses scrypt-like approach with PBKDF2
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()

  // Generate 16-byte salt
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])

  // Derive 256-bit hash
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )

  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return `${salt}:${hash}`
}

/**
 * Escape a string for SQL
 */
function escapeSQL(str: string): string {
  return str.replace(/'/g, "''")
}

/**
 * Generate seed SQL
 */
async function generateSeedSQL(): Promise<string> {
  const now = Date.now()
  const statements: string[] = []

  // Header
  statements.push('-- Vite Flare Starter Seed Data')
  statements.push(`-- Generated: ${new Date().toISOString()}`)
  statements.push('')

  // Clear existing seed data (only seed IDs, not all data)
  statements.push('-- Clear previous seed data')
  statements.push(`DELETE FROM organization_settings WHERE userId LIKE 'seed-%';`)
  statements.push(`DELETE FROM apiTokens WHERE userId LIKE 'seed-%';`)
  statements.push(`DELETE FROM session WHERE userId LIKE 'seed-%';`)
  statements.push(`DELETE FROM account WHERE userId LIKE 'seed-%';`)
  statements.push(`DELETE FROM user WHERE id LIKE 'seed-%';`)
  statements.push('')

  // Create users
  statements.push('-- Create seed users')
  for (const user of SEED_USERS) {
    const hashedPassword = await hashPassword(user.password)

    statements.push(`INSERT INTO user (id, name, email, emailVerified, preferences, createdAt, updatedAt)`)
    statements.push(
      `VALUES ('${user.id}', '${escapeSQL(user.name)}', '${escapeSQL(user.email)}', 1, '{"theme":"default","mode":"system"}', ${now}, ${now});`
    )
    statements.push('')

    // Create credential account with password
    const accountId = randomUUID()
    statements.push(
      `INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)`
    )
    statements.push(
      `VALUES ('${accountId}', '${user.id}', '${escapeSQL(user.email)}', 'credential', '${hashedPassword}', ${now}, ${now});`
    )
    statements.push('')
  }

  // Create API tokens
  statements.push('-- Create seed API tokens')
  for (const token of SEED_TOKENS) {
    const tokenId = randomUUID()
    const hashedToken = await hashToken(token.rawToken)
    const tokenPrefix = token.rawToken.substring(0, 12) + '...'

    statements.push(
      `INSERT INTO apiTokens (id, userId, name, token, tokenPrefix, createdAt, updatedAt)`
    )
    statements.push(
      `VALUES ('${tokenId}', '${token.userId}', '${escapeSQL(token.name)}', '${hashedToken}', '${tokenPrefix}', ${now}, ${now});`
    )
    statements.push('')
  }

  // Create organization settings
  statements.push('-- Create seed organization settings')
  const orgId = randomUUID()
  statements.push(
    `INSERT INTO organization_settings (id, userId, businessName, businessEmail, timezone, createdAt, updatedAt)`
  )
  statements.push(
    `VALUES ('${orgId}', '${SEED_ORG.userId}', '${escapeSQL(SEED_ORG.businessName)}', '${escapeSQL(SEED_ORG.businessEmail)}', '${SEED_ORG.timezone}', ${now}, ${now});`
  )
  statements.push('')

  return statements.join('\n')
}

/**
 * Main entry point
 */
async function main() {
  console.log('🌱 Generating seed data...\n')

  // Generate SQL
  const sql = await generateSeedSQL()

  // Write to temp file
  const tempFile = '/tmp/vite-flare-seed.sql'
  writeFileSync(tempFile, sql)

  console.log('📝 Seed SQL generated\n')

  // Execute against local D1
  console.log('💾 Applying to local D1 database...\n')
  try {
    execSync(`npx wrangler d1 execute vite-flare-starter-db --local --file=${tempFile}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
  } finally {
    unlinkSync(tempFile)
  }

  console.log('\n✅ Seed complete!\n')
  console.log('Test credentials:')
  console.log('─'.repeat(50))
  for (const user of SEED_USERS) {
    console.log(`  Email:    ${user.email}`)
    console.log(`  Password: ${user.password}`)
    console.log('')
  }
  console.log('API tokens (for Bearer auth):')
  console.log('─'.repeat(50))
  for (const token of SEED_TOKENS) {
    console.log(`  ${token.name}:`)
    console.log(`  ${token.rawToken}`)
    console.log('')
  }
}

main().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
