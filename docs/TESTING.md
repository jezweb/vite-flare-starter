# Testing Guide

Patterns for testing vite-flare-starter with Vitest and Cloudflare's testing tools.

**Time estimate**: 2-3 hours to set up, ongoing for test writing

---

## Current Setup

The starter includes:
- Vitest configured
- `@cloudflare/vitest-pool-workers` for Workers testing
- Basic test examples

---

## Test Structure

```
src/
├── server/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── index.ts
│   │   │   └── __tests__/
│   │   │       └── auth.test.ts
│   │   ├── settings/
│   │   │   ├── routes.ts
│   │   │   └── __tests__/
│   │   │       └── settings.test.ts
│   └── lib/
│       ├── utils.ts
│       └── __tests__/
│           └── utils.test.ts
├── client/
│   ├── components/
│   │   └── __tests__/
│   └── lib/
│       └── __tests__/
└── shared/
    └── schemas/
        └── __tests__/
```

---

## Configuration

### Vitest Config

```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.test.ts', '**/__tests__/**'],
    },
  },
})
```

### Workers Pool Config

```typescript
// vitest.config.workers.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            BETTER_AUTH_SECRET: 'test-secret-32-chars-minimum-ok',
            BETTER_AUTH_URL: 'http://localhost:5173',
          },
        },
      },
    },
  },
})
```

---

## Unit Tests

### Testing Utilities

```typescript
// src/server/lib/__tests__/utils.test.ts
import { describe, it, expect } from 'vitest'
import { formatDate, slugify, truncate } from '../utils'

describe('formatDate', () => {
  it('formats date correctly', () => {
    const date = new Date('2025-01-15T10:30:00Z')
    expect(formatDate(date)).toBe('January 15, 2025')
  })

  it('handles invalid date', () => {
    expect(formatDate(new Date('invalid'))).toBe('Invalid Date')
  })
})

describe('slugify', () => {
  it('converts to lowercase slug', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('removes special characters', () => {
    expect(slugify('Hello! World?')).toBe('hello-world')
  })

  it('handles multiple spaces', () => {
    expect(slugify('Hello   World')).toBe('hello-world')
  })
})

describe('truncate', () => {
  it('truncates long strings', () => {
    expect(truncate('Hello World', 5)).toBe('Hello...')
  })

  it('returns short strings unchanged', () => {
    expect(truncate('Hi', 10)).toBe('Hi')
  })
})
```

### Testing Schemas

```typescript
// src/shared/schemas/__tests__/user.test.ts
import { describe, it, expect } from 'vitest'
import { userProfileSchema } from '../user.schema'

describe('userProfileSchema', () => {
  it('validates valid profile', () => {
    const result = userProfileSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = userProfileSchema.safeParse({
      name: 'John Doe',
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('requires name', () => {
    const result = userProfileSchema.safeParse({
      email: 'john@example.com',
    })
    expect(result.success).toBe(false)
  })
})
```

---

## Integration Tests

### Testing API Routes

```typescript
// src/server/modules/settings/__tests__/settings.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { unstable_dev } from 'wrangler'
import type { UnstableDevWorker } from 'wrangler'

describe('Settings API', () => {
  let worker: UnstableDevWorker

  beforeAll(async () => {
    worker = await unstable_dev('src/server/index.ts', {
      experimental: { disableExperimentalWarning: true },
      vars: {
        BETTER_AUTH_SECRET: 'test-secret-32-chars-minimum-ok',
        BETTER_AUTH_URL: 'http://localhost',
      },
    })
  })

  afterAll(async () => {
    await worker.stop()
  })

  it('GET /api/health returns ok', async () => {
    const res = await worker.fetch('/api/health')
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.status).toBe('ok')
  })

  it('GET /api/settings requires auth', async () => {
    const res = await worker.fetch('/api/settings')
    expect(res.status).toBe(401)
  })
})
```

### Testing with Auth

```typescript
// src/server/__tests__/helpers/auth.ts
import { createAuthClient } from 'better-auth/client'

export async function createTestSession(worker: UnstableDevWorker) {
  // Create test user
  const signupRes = await worker.fetch('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `test-${Date.now()}@example.com`,
      password: 'testpassword123',
      name: 'Test User',
    }),
  })

  // Extract session cookie
  const setCookie = signupRes.headers.get('set-cookie')
  return setCookie
}

// Usage in tests
describe('Protected Routes', () => {
  let sessionCookie: string

  beforeAll(async () => {
    sessionCookie = await createTestSession(worker)
  })

  it('GET /api/settings returns user settings', async () => {
    const res = await worker.fetch('/api/settings', {
      headers: { Cookie: sessionCookie },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.user).toBeDefined()
  })
})
```

---

## Mocking

### Mocking D1

```typescript
// src/server/__tests__/mocks/d1.ts
import { drizzle } from 'drizzle-orm/d1'
import Database from 'better-sqlite3'
import { drizzle as drizzleBetterSqlite } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/server/db/schema'

export function createMockDb() {
  const sqlite = new Database(':memory:')

  // Run migrations using sqlite.run()
  sqlite.run(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      role TEXT DEFAULT 'user',
      createdAt INTEGER NOT NULL
    );
  `)

  return drizzleBetterSqlite(sqlite, { schema })
}

// Usage
describe('User Service', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
  })

  it('creates user', async () => {
    await db.insert(schema.user).values({
      id: 'test-id',
      email: 'test@example.com',
      name: 'Test',
      createdAt: new Date(),
    })

    const user = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, 'test-id'))
      .get()

    expect(user?.email).toBe('test@example.com')
  })
})
```

### Mocking R2

```typescript
// src/server/__tests__/mocks/r2.ts
export function createMockR2(): R2Bucket {
  const storage = new Map<string, { body: ArrayBuffer; metadata: any }>()

  return {
    async put(key: string, value: ReadableStream | ArrayBuffer | string, options?: any) {
      const body = typeof value === 'string'
        ? new TextEncoder().encode(value)
        : value instanceof ArrayBuffer
          ? value
          : await new Response(value).arrayBuffer()

      storage.set(key, { body, metadata: options })
      return { key, size: body.byteLength } as R2Object
    },

    async get(key: string) {
      const item = storage.get(key)
      if (!item) return null

      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(item.body))
            controller.close()
          },
        }),
        arrayBuffer: async () => item.body,
        text: async () => new TextDecoder().decode(item.body),
      } as R2ObjectBody
    },

    async delete(key: string) {
      storage.delete(key)
    },

    async list(options?: any) {
      const keys = Array.from(storage.keys())
        .filter(k => !options?.prefix || k.startsWith(options.prefix))

      return {
        objects: keys.map(key => ({ key })),
        truncated: false,
      }
    },
  } as unknown as R2Bucket
}
```

### Mocking External APIs

```typescript
// src/server/__tests__/mocks/stripe.ts
import { vi } from 'vitest'

export const mockStripe = {
  customers: {
    create: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
    retrieve: vi.fn().mockResolvedValue({ id: 'cus_test123', email: 'test@example.com' }),
  },
  subscriptions: {
    create: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
    retrieve: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
  },
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({ id: 'cs_test123', url: 'https://checkout.stripe.com/...' }),
    },
  },
}

// Usage
vi.mock('stripe', () => ({
  default: vi.fn(() => mockStripe),
}))
```

---

## Component Tests

### Testing React Components

```typescript
// src/client/components/__tests__/Button.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../ui/button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('handles click', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click me</Button>)

    fireEvent.click(screen.getByText('Click me'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('can be disabled', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} disabled>Click me</Button>)

    fireEvent.click(screen.getByText('Click me'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies variant styles', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByText('Delete')).toHaveClass('bg-destructive')
  })
})
```

### Testing Hooks

```typescript
// src/client/hooks/__tests__/useAuth.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSession } from '@/lib/auth'

const wrapper = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useSession', () => {
  it('returns null when not authenticated', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session: null }),
    })

    const { result } = renderHook(() => useSession(), { wrapper })

    await waitFor(() => {
      expect(result.current.data?.session).toBeNull()
    })
  })

  it('returns session when authenticated', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { id: 'session-123' },
        user: { id: 'user-123', email: 'test@example.com' },
      }),
    })

    const { result } = renderHook(() => useSession(), { wrapper })

    await waitFor(() => {
      expect(result.current.data?.user?.email).toBe('test@example.com')
    })
  })
})
```

---

## E2E Tests (Optional)

For full end-to-end testing with Playwright:

```bash
pnpm add -D @playwright/test
```

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('user can sign up', async ({ page }) => {
    await page.goto('/sign-up')

    await page.fill('input[name="email"]', 'newuser@example.com')
    await page.fill('input[name="password"]', 'securepassword123')
    await page.fill('input[name="name"]', 'New User')

    await page.click('button[type="submit"]')

    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('text=New User')).toBeVisible()
  })

  test('user can sign in', async ({ page }) => {
    await page.goto('/sign-in')

    await page.fill('input[name="email"]', 'existing@example.com')
    await page.fill('input[name="password"]', 'password123')

    await page.click('button[type="submit"]')

    await expect(page).toHaveURL('/dashboard')
  })

  test('protected routes redirect to login', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page).toHaveURL('/sign-in')
  })
})
```

---

## Test Commands

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test"
  }
}
```

---

## CI Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install

      - run: pnpm type-check

      - run: pnpm test:coverage

      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## Best Practices

### 1. Test Naming

```typescript
// Good - describes behavior
it('returns 401 when user is not authenticated')
it('creates user with hashed password')

// Bad - describes implementation
it('calls authMiddleware')
it('uses bcrypt')
```

### 2. Arrange-Act-Assert

```typescript
it('updates user name', async () => {
  // Arrange
  const user = await createTestUser()

  // Act
  await updateUserName(user.id, 'New Name')

  // Assert
  const updated = await getUser(user.id)
  expect(updated.name).toBe('New Name')
})
```

### 3. Test Isolation

```typescript
beforeEach(() => {
  // Reset state before each test
  vi.clearAllMocks()
})

afterEach(async () => {
  // Clean up test data
  await db.delete(users).where(like(users.email, 'test-%'))
})
```

### 4. Meaningful Assertions

```typescript
// Good - specific assertion
expect(response.status).toBe(201)
expect(data.user.email).toBe('test@example.com')

// Bad - too generic
expect(response).toBeTruthy()
expect(data).toBeDefined()
```

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/)
- [Testing Library](https://testing-library.com/)
- [Playwright](https://playwright.dev/)

---

**Created**: 2026-01-03
**Author**: Jeremy Dawes (Jezweb)
