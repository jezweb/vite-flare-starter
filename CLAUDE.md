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
│   │       ├── auth.ts           # Auth client
│   │       ├── api-client.ts     # Centralized fetch wrapper
│   │       ├── error-reporting.ts# Error boundary utilities
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
│       └── config/
│           ├── features.ts  # Feature flags
│           ├── app.ts       # App branding config
│           └── constants.ts # Shared constants (limits, timeouts)
├── drizzle/                 # Database migrations
├── wrangler.jsonc           # Workers config
├── vite.config.ts           # Vite config
└── drizzle.config.ts        # Drizzle config
```

---

## Key Files

### Server Entry Point
`src/server/index.ts` - Hono app with routes:
- `/api/health` - Health check with DB/R2 status and version
- `/api/auth/*` - better-auth handlers (includes password reset)
- `/api/settings/*` - User settings (profile, email, password, avatar, preferences)
- `/api/settings/sessions` - Session management (list, revoke)
- `/api/api-tokens/*` - API token management
- `/api/organization/*` - Organization settings
- `/api/avatar/:userId` - Avatar serving from R2

### Middleware
`src/server/middleware/`:
- `auth.ts` - Session/API token authentication
- `security.ts` - Security headers (CSP, X-Frame-Options, etc.)
- `rate-limit.ts` - Rate limiting for sensitive endpoints

### Database Schema
`src/server/db/schema.ts` - Exports all tables:
- `user`, `session`, `account`, `verification` (auth)
- `apiTokens` (API key management)
- `organizationSettings` (business settings)

### Auth Configuration
`src/server/modules/auth/index.ts`:
- Email/password authentication
- Google OAuth (optional, domain restriction via Google Cloud Console)
- Session management (7-day expiry)
- `DISABLE_EMAIL_SIGNUP` - blocks new email accounts, Google OAuth unaffected

---

## Deployment Gotchas

**CRITICAL: When deploying to a new domain:**

1. **Set `TRUSTED_ORIGINS`** to include your production domain(s):
   ```bash
   echo "http://localhost:5173,https://your-domain.workers.dev" | npx wrangler secret put TRUSTED_ORIGINS
   ```
   Without this, auth will silently fail and redirect to homepage.

2. **Set `BETTER_AUTH_URL` secret** to exact production URL:
   ```bash
   echo "https://your-domain.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
   ```

3. **Google OAuth redirect URI** must be registered in Google Cloud Console:
   ```
   https://your-domain.workers.dev/api/auth/callback/google
   ```

**Symptoms of misconfiguration:**
- User signs in but lands on homepage → `TRUSTED_ORIGINS` missing domain
- OAuth callback 500 error → `BETTER_AUTH_URL` mismatch
- Google "redirect_uri_mismatch" → URI not registered in Google Cloud

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
DISABLE_EMAIL_SIGNUP=false
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
pnpm db:seed                # Seed local database with test data
pnpm test                   # Run tests
pnpm test:watch             # Run tests in watch mode
pnpm type-check             # Run TypeScript check
```

---

## Cloudflare Bindings

Defined in `wrangler.jsonc`:
- `DB` - D1 database
- `AVATARS` - R2 bucket for user avatars

---

## Feature Flags

See `src/shared/config/features.ts`. Control via `VITE_FEATURE_*` env vars:

- `styleGuide` - Show style guide page (dev only by default)
- `components` - Show components showcase
- `themePicker` - Show color theme picker (set `VITE_FEATURE_THEME_PICKER=false` to hide for branded client sites)
- `apiTokens` - Show API Tokens tab in settings (set `VITE_FEATURE_API_TOKENS=false` to hide)

## App Configuration

See `src/shared/config/app.ts`. Control via env vars:

- `VITE_APP_NAME` - Application name in sidebar (default: "Vite Flare Starter")
- `VITE_DEFAULT_THEME` - Default color theme for new users (default: "default", options: default, blue, green, orange, red, rose, violet, yellow)

---

## Custom Theming

The starter includes 8 built-in themes plus custom theme support via CSS import.

### Theme Files

- `src/lib/themes.ts` - Theme definitions and CSS parser
- `src/shared/schemas/preferences.schema.ts` - Theme types including `CustomThemeColors`
- `src/client/modules/settings/components/PreferencesSection.tsx` - Theme UI

### Generating Custom Themes

When asked to create a custom theme, generate CSS in this format:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 220 90% 56%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 220 90% 56%;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  /* ... dark variants */
}
```

**Color format:** HSL values without `hsl()` wrapper: `H S% L%` (e.g., `220 90% 56%`)

### Key Functions

```typescript
import { parseThemeCSS, validateThemeColors, applyTheme } from '@/lib/themes'

// Parse CSS from theme generators
const parsed = parseThemeCSS(cssString)

// Validate theme has all required variables
const { valid, missing } = validateThemeColors(parsed.light)

// Apply theme (supports custom colors)
applyTheme('custom', 'dark', customTheme)
```

---

## Adding shadcn/ui Components

```bash
pnpm dlx shadcn@latest add button dialog form
```

Components are copied to `src/components/ui/`.

---

**Created:** 2025-11-29
**Author:** Jeremy Dawes (Jezweb)
