# CLAUDE.md - AI Developer Context

**Project:** Vite Flare Starter
**Version:** 0.1.0
**Purpose:** Minimal authenticated starter kit for Cloudflare Workers

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Platform** | Cloudflare Workers with Static Assets |
| **Frontend** | React 19 + Vite |
| **Backend** | Hono |
| **Database** | D1 (SQLite) + Drizzle ORM |
| **Auth** | better-auth |
| **UI** | Tailwind v4 + shadcn/ui |
| **Data Fetching** | TanStack Query |
| **Forms** | React Hook Form + Zod |

---

## Project Structure

```
vite-flare-starter/
├── src/
│   ├── client/              # Frontend (React SPA)
│   │   ├── components/ui/   # shadcn/ui components
│   │   ├── layouts/         # DashboardLayout
│   │   ├── modules/
│   │   │   ├── auth/        # Sign-in/sign-up pages
│   │   │   ├── settings/    # Profile, password, theme
│   │   │   ├── api-tokens/  # API token management
│   │   │   └── organization/# Org settings (timezone, etc.)
│   │   ├── pages/           # Route pages
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── ComponentsPage.tsx
│   │   │   └── StyleGuidePage.tsx
│   │   └── lib/
│   │       ├── auth.ts      # Auth client
│   │       └── utils.ts
│   ├── server/              # Backend (Hono API)
│   │   ├── index.ts         # Main app + routes
│   │   ├── modules/
│   │   │   ├── auth/        # better-auth config
│   │   │   ├── settings/    # Settings API
│   │   │   ├── api-tokens/  # Token management
│   │   │   └── organization/# Org settings API
│   │   ├── middleware/auth.ts
│   │   └── db/schema.ts     # Central schema exports
│   └── shared/
│       ├── schemas/         # Zod validation schemas
│       └── config/features.ts
├── drizzle/                 # Database migrations
├── wrangler.jsonc           # Workers config
├── vite.config.ts           # Vite config
└── drizzle.config.ts        # Drizzle config
```

---

## Key Files

### Server Entry Point
`src/server/index.ts` - Hono app with routes:
- `/api/auth/*` - better-auth handlers
- `/api/settings/*` - User settings
- `/api/api-tokens/*` - API token management
- `/api/organization/*` - Organization settings
- `/api/avatar/:userId` - Avatar serving from R2

### Database Schema
`src/server/db/schema.ts` - Exports all tables:
- `user`, `session`, `account`, `verification` (auth)
- `apiTokens` (API key management)
- `organizationSettings` (business settings)

### Auth Configuration
`src/server/modules/auth/index.ts`:
- Email/password authentication
- Google OAuth (optional)
- Session management (7-day expiry)
- `DISABLE_REGISTRATION` env var support

---

## Common Patterns

### Adding a New API Route

```typescript
// src/server/modules/your-module/routes.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

app.get('/', async (c) => {
  const userId = c.get('userId')
  // Your logic here
  return c.json({ data: [] })
})

export default app

// Then in src/server/index.ts:
import yourRoutes from './modules/your-module/routes'
app.route('/api/your-module', yourRoutes)
```

### Adding a New Database Table

```typescript
// src/server/modules/your-module/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const yourTable = sqliteTable('your_table', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// Add to src/server/db/schema.ts:
export { yourTable } from '@/server/modules/your-module/db/schema'
```

### TanStack Query Hooks

```typescript
// src/client/modules/your-module/hooks/useYourData.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useYourData() {
  return useQuery({
    queryKey: ['your-data'],
    queryFn: async () => {
      const res = await fetch('/api/your-module', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })
}

export function useCreateYourData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateInput) => {
      const res = await fetch('/api/your-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to create')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['your-data'] })
    },
  })
}
```

---

## Environment Variables

### Local Development (`.dev.vars`)

```
BETTER_AUTH_SECRET=your-32-char-secret
BETTER_AUTH_URL=http://localhost:5173
GOOGLE_CLIENT_ID=optional
GOOGLE_CLIENT_SECRET=optional
DISABLE_REGISTRATION=false
```

### Production (Cloudflare Secrets)

```bash
echo "secret" | npx wrangler secret put BETTER_AUTH_SECRET
echo "https://your-app.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
```

---

## Commands

```bash
pnpm dev                    # Start development server
pnpm build                  # Build for production
pnpm deploy                 # Deploy to Cloudflare
pnpm db:generate:named "x"  # Generate migration
pnpm db:migrate:local       # Apply migrations locally
pnpm db:migrate:remote      # Apply migrations to production
pnpm type-check             # Run TypeScript check
```

---

## Cloudflare Bindings

Defined in `wrangler.jsonc`:
- `DB` - D1 database
- `AVATARS` - R2 bucket for user avatars

---

## Feature Flags

See `src/shared/config/features.ts`:
- `styleGuide` - Show style guide page (dev only by default)
- `components` - Show components showcase

---

## Adding shadcn/ui Components

```bash
pnpm dlx shadcn@latest add button dialog form
```

Components are copied to `src/components/ui/`.

---

**Created:** 2025-11-29
**Author:** Jeremy Dawes (Jezweb)
