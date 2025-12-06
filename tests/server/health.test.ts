import { describe, it, expect } from 'vitest'
import { env, SELF } from 'cloudflare:test'

describe('Health Check API', () => {
  it('should return 200 OK for /api/health', async () => {
    const response = await SELF.fetch('http://localhost/api/health')
    expect(response.status).toBe(200)
  })

  it('should return JSON with status field', async () => {
    const response = await SELF.fetch('http://localhost/api/health')
    const data = (await response.json()) as { status: string; version: string }

    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('version')
    expect(data).toHaveProperty('timestamp')
    expect(data).toHaveProperty('checks')
  })

  it('should include database check in health response', async () => {
    const response = await SELF.fetch('http://localhost/api/health')
    const data = (await response.json()) as { checks: { database: string } }

    expect(data.checks).toHaveProperty('database')
  })
})

describe('API 404 Handler', () => {
  it('should return 404 for unknown API routes', async () => {
    const response = await SELF.fetch('http://localhost/api/nonexistent')
    expect(response.status).toBe(404)
  })

  it('should return JSON error for unknown API routes', async () => {
    const response = await SELF.fetch('http://localhost/api/nonexistent')
    const data = (await response.json()) as { error: string }

    expect(data).toHaveProperty('error')
    expect(data.error).toBe('Not Found')
  })
})
