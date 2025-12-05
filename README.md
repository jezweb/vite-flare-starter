# Vite Flare Starter

⚡ Minimal authenticated starter kit for building apps on Cloudflare Workers.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jezweb/vite-flare-starter)

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
git clone https://github.com/jezweb/vite-flare-starter.git my-app
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

### Production Checklist

Before deploying to a new domain, ensure:

1. **Set `TRUSTED_ORIGINS`** to include your production domain(s):
   ```bash
   echo "http://localhost:5173,https://your-app.workers.dev" | npx wrangler secret put TRUSTED_ORIGINS
   ```

2. **Set `BETTER_AUTH_URL` secret** to your exact production URL:
   ```bash
   echo "https://your-app.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
   ```

3. **For Google OAuth**, add redirect URI in Google Cloud Console:
   ```
   https://your-app.workers.dev/api/auth/callback/google
   ```

**Common issues:**
- Auth works but redirects to homepage → Check `TRUSTED_ORIGINS` includes your domain
- OAuth callback fails → Check `BETTER_AUTH_URL` matches your domain exactly
- Google sign-in fails → Check redirect URI is registered in Google Cloud Console

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

### Disable Email Signup

Set `DISABLE_EMAIL_SIGNUP=true` to prevent new email/password registrations:

```bash
# .dev.vars (local)
DISABLE_EMAIL_SIGNUP=true

# Production
echo "true" | npx wrangler secret put DISABLE_EMAIL_SIGNUP
```

**Note:** This only affects email/password signup:
- Existing email users can still log in
- Google OAuth is NOT affected (domain restriction is handled at Google Cloud level)

### Google OAuth

1. Create OAuth credentials at [Google Cloud Console](https://console.cloud.google.com)
2. Set authorized redirect URI: `https://your-app.workers.dev/api/auth/callback/google`
3. Add credentials to `.dev.vars` and production secrets

**Domain Restriction:** To allow only your Google Workspace domain:
- Go to OAuth consent screen → Set "User type" to **Internal**
- Only users from your domain can sign in (e.g., @yourcompany.com)

### Custom Themes

The starter includes 8 built-in color themes plus support for custom themes.

**Using Theme Generators:**
1. Visit a theme generator:
   - [tweakcn](https://tweakcn.com/) - Modern editor with OKLch support
   - [shadcn/ui Themes](https://ui.shadcn.com/themes) - Official hand-picked themes
   - [10000+ Themes](https://ui.jln.dev/) - Browse community themes
2. Copy the generated CSS
3. Go to Settings → Color Theme → Custom
4. Paste the CSS and click "Apply Theme"

**Using Claude Code:**

Ask Claude Code to generate a theme based on your brand:

```
Create a custom theme for my app using brand colors:
- Primary: #2563eb (blue)
- Make it professional and clean
```

Claude will generate the CSS variables which you can paste into the Custom Theme dialog.

**Theme CSS Format:**
```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 220 90% 56%;
  /* ... other variables */
}

.dark {
  --background: 240 10% 3.9%;
  /* ... dark mode variables */
}
```

### App Branding

Customize the app name displayed in the sidebar:

```bash
# .dev.vars (local)
VITE_APP_NAME=My Client App

# Production (in wrangler.jsonc vars or secrets)
```

### Default Theme

Set the default color theme for new users:

```bash
# .dev.vars (local)
VITE_DEFAULT_THEME=blue   # Options: default, blue, green, orange, red, rose, violet, yellow
```

Or edit `src/shared/schemas/preferences.schema.ts` directly for additional control.

### Lock Theme for Client Sites

To prevent users from changing the color theme (useful for branded client sites):

```bash
# .dev.vars (local)
VITE_FEATURE_THEME_PICKER=false
```

**Note:** Users can still switch between light/dark/system mode - only the color theme picker is hidden.

### Hide API Tokens

To hide the API Tokens tab from regular users (power user feature):

```bash
# .dev.vars (local)
VITE_FEATURE_API_TOKENS=false
```

### Trusted Origins (Auth)

Configure allowed origins for authentication (required for production):

```bash
# .dev.vars (local) - comma-separated list
TRUSTED_ORIGINS=http://localhost:5173,https://myapp.workers.dev,https://myapp.com
```

**Note:** `http://localhost:5173` is always included automatically for development.

## License

MIT - see [LICENSE](./LICENSE)
