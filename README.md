# Vite Flare Starter

⚡ Minimal authenticated starter kit for building apps on Cloudflare Workers.

## What's Included

- **Authentication** - better-auth with email/password + Google OAuth
- **User Settings** - Profile, password, theme preferences
- **Dashboard Layout** - Responsive sidebar navigation
- **UI Components** - Full shadcn/ui component library
- **Component Showcase** - Reference page for all available components
- **Theme System** - Dark/light/system mode support
- **API Structure** - Hono backend with auth middleware
- **Database** - Cloudflare D1 with Drizzle ORM

## Tech Stack

| Layer | Technology |
|-------|------------|
| Platform | Cloudflare Workers with Static Assets |
| Frontend | React 19 + Vite |
| Backend | Hono |
| Database | D1 (SQLite) + Drizzle ORM |
| Auth | better-auth |
| UI | Tailwind v4 + shadcn/ui |
| Data Fetching | TanStack Query |
| Forms | React Hook Form + Zod |

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-username/vite-flare-starter.git my-app
cd my-app
pnpm install
```

### 2. Create Cloudflare Resources

```bash
# Login to Cloudflare
pnpm cf:login

# Create D1 database
npx wrangler d1 create vite-flare-starter-db
# Copy the database_id to wrangler.jsonc

# Create R2 bucket for avatars
npx wrangler r2 bucket create vite-flare-starter-avatars
```

### 3. Configure Environment

```bash
# Copy example env file
cp .dev.vars.example .dev.vars

# Edit .dev.vars with your values:
# - BETTER_AUTH_SECRET (generate with: openssl rand -hex 32)
# - BETTER_AUTH_URL (http://localhost:5173 for local)
# - Optional: Google OAuth credentials
```

### 4. Generate and Apply Migrations

```bash
# Generate migration from schema
pnpm db:generate:named "initial_schema"

# Apply migration locally
pnpm db:migrate:local
```

### 5. Start Development

```bash
pnpm dev
# Open http://localhost:5173
```

### 6. Deploy to Production

```bash
# Apply migration to remote database
pnpm db:migrate:remote

# Set production secrets
echo "your-secret" | npx wrangler secret put BETTER_AUTH_SECRET
echo "https://your-app.workers.dev" | npx wrangler secret put BETTER_AUTH_URL

# Deploy
pnpm deploy
```

## Project Structure

```
vite-flare-starter/
├── src/
│   ├── client/              # Frontend (React SPA)
│   │   ├── components/ui/   # shadcn/ui components
│   │   ├── layouts/         # DashboardLayout
│   │   ├── modules/
│   │   │   ├── auth/        # Sign-in/sign-up pages
│   │   │   └── settings/    # User settings module
│   │   ├── pages/           # Route pages
│   │   └── lib/             # Utilities
│   ├── server/              # Backend (Hono API)
│   │   ├── modules/
│   │   │   ├── auth/        # Auth configuration
│   │   │   ├── settings/    # Settings routes
│   │   │   └── api-tokens/  # API token management
│   │   ├── middleware/      # Auth middleware
│   │   └── db/schema.ts     # Central schema exports
│   └── shared/              # Shared code (Zod schemas)
├── drizzle/                 # Database migrations
├── wrangler.jsonc           # Cloudflare Workers config
└── vite.config.ts           # Vite build config
```

## Adding a New Module

1. **Create Backend** - Add routes in `src/server/modules/your-module/`
2. **Create Schema** - Add Drizzle table in `src/server/modules/your-module/db/schema.ts`
3. **Export Schema** - Add export to `src/server/db/schema.ts`
4. **Generate Migration** - Run `pnpm db:generate:named "add_your_table"`
5. **Register Routes** - Mount in `src/server/index.ts`
6. **Create Frontend** - Add pages/hooks/components in `src/client/modules/your-module/`
7. **Add Route** - Update `src/client/App.tsx`

## Configuration

### Disable New Registrations

Set `DISABLE_REGISTRATION=true` in your environment to prevent new sign-ups:

```bash
# .dev.vars (local)
DISABLE_REGISTRATION=true

# Production
echo "true" | npx wrangler secret put DISABLE_REGISTRATION
```

This disables email sign-up and Google OAuth registration.

### Google OAuth

1. Create OAuth credentials at [Google Cloud Console](https://console.cloud.google.com)
2. Set authorized redirect URI: `https://your-app.workers.dev/api/auth/callback/google`
3. Add credentials to `.dev.vars` and production secrets

## License

MIT - see [LICENSE](./LICENSE)
