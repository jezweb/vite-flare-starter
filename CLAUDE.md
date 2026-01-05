# CLAUDE.md - AI Developer Context

**Project:** Vite Flare Starter
**Version:** 0.8.0
**Purpose:** Production-ready authenticated starter kit for Cloudflare Workers

---

## Forking This Project

**If you're an AI coding agent or developer forking this project:**

📖 **Read [FORKING.md](./FORKING.md) first!** It provides step-by-step instructions to:
1. Create your own Cloudflare resources (D1, R2 buckets)
2. Update configuration files
3. Remove all framework fingerprints
4. Deploy to production

---

## Security: Rebranding for Production

**IMPORTANT**: Before deploying to production, rebrand to hide framework identity.

Default values can allow attackers to identify your site uses this starter kit.

### Required Environment Variables

```bash
# Client-side (VITE_ prefix)
VITE_APP_NAME=Your App Name        # Shown in UI, headers, sidebar
VITE_APP_ID=yourapp                # Used for localStorage keys, Sentry
VITE_TOKEN_PREFIX=yap_             # API token prefix (3-4 chars + _)
VITE_GITHUB_URL=                   # Empty to hide GitHub links
VITE_FOOTER_TEXT=© 2025 Your Co    # Custom footer

# Server-side (Cloudflare secrets)
TOKEN_PREFIX=yap_                  # Must match VITE_TOKEN_PREFIX
```

### Also Update

1. **`index.html`** - `<title>` and `<meta>` tags
2. **Favicon** - Replace with your own

### What Gets Fingerprinted (if not changed)

| Location | Default Value | Risk |
|----------|---------------|------|
| Page title/meta | "Vite Flare Starter" | Public |
| API tokens | `vfs_` prefix | Network |
| localStorage | `vite-flare-starter-theme` | DevTools |
| Sentry release | `vite-flare-starter@x.x.x` | Network |
| Landing page | GitHub links | Public |

See `src/shared/config/app.ts` for full configuration options.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Platform** | Cloudflare Workers with Static Assets |
| **Frontend** | React 19 + Vite |
| **Backend** | Hono |
| **Database** | D1 (SQLite) + Drizzle ORM |
| **Auth** | better-auth |
| **AI** | AI Gateway (multi-provider support) |
| **UI** | Tailwind v4 + shadcn/ui |
| **Data Fetching** | TanStack Query |
| **Forms** | React Hook Form + Zod |

---

## UI Patterns

### Pages Over Modals (STRONG PREFERENCE)

**Use dedicated pages instead of modals/dialogs** for most forms and content:

| Use Pages For | Use Modals Only For |
|---------------|---------------------|
| Create/edit forms | Quick confirmations ("Delete?") |
| Multi-step flows | Simple yes/no decisions |
| Data entry | Contextual tooltips/popovers |
| Settings sections | Keyboard shortcut overlays |
| Search/filter views | Loading states |

**Why pages are better:**
- **URLs**: Bookmarkable, shareable, browser history works
- **Space**: Full viewport, no awkward scrolling
- **Accessibility**: No focus trapping issues
- **Mobile**: Better touch experience
- **Testing**: Easier to test with proper routes

**Page pattern**: See `src/client/modules/settings/pages/SettingsPage.tsx` for standard layout:
```tsx
<div className="container max-w-4xl py-8">
  <div className="mb-8">
    <div className="flex items-center gap-2 mb-2">
      <Icon className="h-6 w-6 text-primary" />
      <h1 className="text-3xl font-bold">Page Title</h1>
    </div>
    <p className="text-muted-foreground">Description</p>
  </div>
  {/* Content */}
</div>
```

**When asked to "add a form" or "create X"** → Default to a new page route, not a modal.

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
│   │   │   ├── files/       # File management
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
│   │   │   ├── files/       # File upload/management
│   │   │   ├── organization/# Org settings API
│   │   │   ├── activity/    # Activity logging
│   │   │   ├── feature-flags/# DB-backed feature flags
│   │   │   ├── notifications/# In-app notifications
│   │   │   └── chat/        # AI chat with streaming
│   │   ├── lib/
│   │   │   ├── logger.ts    # JSON structured logging
│   │   │   ├── csv.ts       # CSV export utilities
│   │   │   └── ai/          # Workers AI client + model catalog
│   │   ├── middleware/
│   │   │   ├── auth.ts      # Session/API token auth
│   │   │   └── admin.ts     # Admin role protection
│   │   └── db/schema.ts     # Central schema exports
│   └── shared/
│       ├── schemas/         # Zod validation schemas
│       ├── api-scopes.ts    # API token scope definitions
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
- `/api/health/admin` - Admin status check (requires auth)
- `/api/auth/*` - better-auth handlers (includes password reset)
- `/api/settings/*` - User settings (profile, email, password, avatar, preferences)
- `/api/settings/sessions` - Session management (list, revoke)
- `/api/api-tokens/*` - API token management
- `/api/organization/*` - Organization settings
- `/api/avatar/:userId` - Avatar serving from R2
- `/api/activity/*` - Activity logging (list, entity history, stats)
- `/api/features` - Public feature flags (no auth)
- `/api/admin/feature-flags/*` - Feature flag admin (list, update, sync)
- `/api/notifications/*` - User notifications (list, mark read, delete)
- `/api/chat` - AI chat with streaming responses (POST for messages, GET for history)
- `/api/files/*` - File management (upload, list, download, delete)
- `/api/ai/models` - List available AI models
- `/api/ai/test` - Test AI text generation

### Middleware
`src/server/middleware/`:
- `auth.ts` - Session/API token authentication
- `admin.ts` - Admin role authorization (requires authMiddleware first)
- `security.ts` - Security headers (CSP, X-Frame-Options, etc.)
- `rate-limit.ts` - Rate limiting for sensitive endpoints
- `request-id.ts` - Request ID generation and tracking

### Error Tracking
`src/server/lib/sentry.ts` and `src/client/lib/sentry.ts`:
- Sentry integration for error tracking (optional, requires SENTRY_DSN)
- Request ID included in all error reports for correlation
- X-Request-ID header returned in all API responses

### Database Schema
`src/server/db/schema.ts` - Exports all tables:
- `user`, `session`, `account`, `verification` (auth) - user has `role` field
- `apiTokens` (API key management)
- `files` (user file uploads, metadata stored in D1, content in R2)
- `organizationSettings` (business settings)
- `activityLogs` (audit trail)
- `featureFlags` (DB-backed feature toggles)
- `userNotifications` (in-app notifications)

### Auth Configuration
`src/server/modules/auth/index.ts`:
- **OAuth-only by default** - email/password is disabled
- Google OAuth (optional, domain restriction via Google Cloud Console)
- Session management (7-day expiry)
- `/api/auth/config` endpoint - returns enabled auth methods for UI

**Auth Method Control (OAuth-only by default):**
| Env Var | Effect |
|---------|--------|
| `ENABLE_EMAIL_LOGIN=true` | Enable email/password authentication |
| `ENABLE_EMAIL_SIGNUP=true` | Also allow new email signups (requires `ENABLE_EMAIL_LOGIN`) |

The SignInPage and SignUpPage automatically adapt based on `/api/auth/config`.
Google OAuth is unaffected by these settings - use Google Cloud Console for domain restrictions.

### Admin System
Role-based access control with automatic promotion:
- User roles: `user`, `manager`, `admin`
- `ADMIN_EMAILS` env var - comma-separated list of emails auto-promoted to admin
- `/api/health/admin` - Check if current user is admin
- Admin middleware auto-promotes matching emails on first request

**Usage:**
```typescript
import { authMiddleware } from '@/server/middleware/auth'
import { adminMiddleware, type AdminContext } from '@/server/middleware/admin'

const app = new Hono<AdminContext>()
app.use('*', authMiddleware)    // Must come first
app.use('*', adminMiddleware)   // Checks admin role
```

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
# Email login is disabled by default (OAuth-only). Uncomment to enable:
# ENABLE_EMAIL_LOGIN=true
# ENABLE_EMAIL_SIGNUP=true
ADMIN_EMAILS=admin@example.com,jeremy@jezweb.net

# AI Gateway (optional - enables multi-provider AI)
AI_GATEWAY_ID=default
CF_AIG_TOKEN=your-gateway-auth-token

# Error tracking (optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ENVIRONMENT=development
```

### Client-side Environment Variables

Add to `.env` or `.env.local` for Vite:
```
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
VITE_SENTRY_ENVIRONMENT=development
VITE_APP_VERSION=0.1.0
```

### Production (Cloudflare Secrets)

```bash
echo "secret" | npx wrangler secret put BETTER_AUTH_SECRET
echo "https://your-app.workers.dev" | npx wrangler secret put BETTER_AUTH_URL

# Optional: Sentry error tracking
echo "https://xxx@sentry.io/xxx" | npx wrangler secret put SENTRY_DSN
echo "production" | npx wrangler secret put SENTRY_ENVIRONMENT
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
- `AI` - Workers AI binding (optional, used as fallback)

---

## AI Gateway (Multi-Provider Support)

The AI module uses Cloudflare AI Gateway for unified access to all AI providers.

### Supported Providers

| Provider | Models | API Key Required |
|----------|--------|------------------|
| **Workers AI** | Llama, Qwen, Gemma, etc. | No (free) |
| **OpenAI** | GPT-4o, GPT-4-turbo | Yes (BYOK) |
| **Anthropic** | Claude Sonnet 4.5, etc. | Yes (BYOK) |
| **Google AI** | Gemini 2.5 Pro/Flash | Yes (BYOK) |
| **Groq** | Llama 3.3 70B (fast) | Yes (BYOK) |
| **Mistral** | Mistral Large/Small | Yes (BYOK) |

### Usage

```typescript
import { createAIGatewayClient, DEFAULT_MODEL } from '@/server/lib/ai'

// Create client (works with any provider)
const ai = createAIGatewayClient(c.env)

// Use free Workers AI model
const result = await ai.chat(messages, { model: '@cf/meta/llama-3.1-8b-instruct' })

// Use external provider (requires BYOK in AI Gateway dashboard)
const result = await ai.chat(messages, { model: 'gpt-4o' })
const result = await ai.chat(messages, { model: 'claude-sonnet-4-5-20250929' })
```

### Configuration

1. Create AI Gateway: https://dash.cloudflare.com/ai/ai-gateway
2. Add provider API keys in gateway dashboard (BYOK)
3. Set environment variables:
   ```
   AI_GATEWAY_ID=your-gateway-id
   CF_AIG_TOKEN=your-auth-token  # Optional, for authenticated gateways
   ```

### Key Files

- `src/server/lib/ai/gateway.ts` - AI Gateway client
- `src/server/lib/ai/providers.ts` - Provider and model registry
- `src/server/modules/chat/routes.ts` - Chat API routes

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
**Updated:** 2026-01-05
**Author:** Jeremy Dawes (Jezweb)
