# Forking Guide for AI Coding Agents

**Last Updated:** 2026-01-05
**Purpose:** Ensure complete separation from the original vite-flare-starter project

---

## Overview

This guide ensures your fork creates **completely separate Cloudflare resources** and removes all framework fingerprints. After following this guide, your fork will be a standalone project with no connection to vite-flare-starter.

> **Found something rough during the fork build?** Open an issue —
> see [CONTRIBUTING.md](./CONTRIBUTING.md) for the shape that works
> well. Fork-builder reports are how the starter improves; recent
> ones shipped within an hour of being filed because they were
> diagnostic. PRs back from your fork are also welcome.

**Who is this for?**
- AI coding agents (Claude Code, Cursor, etc.) setting up a forked project
- Human developers forking for a new client/project

**What you'll create:**
- Your own D1 database
- Your own R2 storage buckets
- Your own Worker deployment
- Rebranded configuration with no framework markers

---

## Prerequisites

Before starting:

- [ ] Cloudflare account (free tier works) - [Sign up](https://dash.cloudflare.com/sign-up)
- [ ] Node.js 18+ installed
- [ ] pnpm installed (`npm install -g pnpm`)
- [ ] Git installed

---

## Part 1: Fork and Initial Setup

> **AI agents — read this first.** When the user says "fork the starter",
> they mean **create a real GitHub fork**, not `git clone`. A clone with
> `rm -rf .git` cuts you off from upstream forever — you lose every
> bug fix, security patch, and improvement that ships to the starter.
> A fork keeps you connected so `git pull upstream main` is a one-liner.
>
> If you can't create a fork (e.g. the user explicitly says "I just want
> a snapshot"), then a detached clone is fine — but verify the intent
> before discarding `.git`.

### Step 1.1: Fork on GitHub

Either:

```bash
# Using the GitHub CLI (recommended — clones in one step)
gh repo fork jezweb/vite-flare-starter --clone --remote --fork-name YOUR_PROJECT_NAME
cd YOUR_PROJECT_NAME
```

Or via the GitHub UI: click **Fork** at <https://github.com/jezweb/vite-flare-starter>,
name your fork, then:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_PROJECT_NAME.git
cd YOUR_PROJECT_NAME
git remote add upstream https://github.com/jezweb/vite-flare-starter.git
```

After this, `git remote -v` should show **two** remotes:
- `origin` → your fork
- `upstream` → jezweb/vite-flare-starter

### Step 1.2: (Optional) Detach completely

Skip this unless you specifically want a snapshot with no upstream
relationship. Detaching means you'll never pick up upstream fixes
without manual cherry-picking.

```bash
git remote remove upstream
rm -rf .git
git init
git add .
git commit -m "Initial commit (detached snapshot from vite-flare-starter)"
```

### Step 1.3: Install Dependencies

```bash
pnpm install
```

---

## Part 2: Create Your Cloudflare Resources

**CRITICAL:** You must create your own resources. Do NOT use `vite-flare-starter-db`, `vite-flare-starter-avatars`, or `vite-flare-starter-files`.

### Step 2.1: Login to Cloudflare

```bash
npx wrangler login
npx wrangler whoami   # confirm the right account
```

This opens a browser to authenticate. Ensure you're logged into YOUR Cloudflare account.

> **⚠️ Custom-domain users — read this before creating resources.**
>
> Cloudflare bindings (D1, R2, Worker, etc.) and the DNS zone for your
> custom domain MUST be on the **same Cloudflare account**. If your
> domain `example.com` is on account A but you create D1 on account B,
> the worker will deploy fine but `wrangler deploy` won't be able to
> attach the custom domain — you'll see a route conflict or the domain
> will silently never serve traffic.
>
> Run `wrangler whoami` after every `wrangler login` and verify the
> account email matches the account that owns your domain (check the
> Cloudflare dashboard → Websites → click your domain → top-right shows
> the account name).
>
> If you discover after the fact that resources are on the wrong account,
> the cleanest fix is to delete D1 + R2 + Worker on the wrong account and
> recreate them on the account where the zone lives. ~10 minutes plus a
> re-migrate. (See gh #57.)

### Step 2.2: Create Your D1 Database

```bash
npx wrangler d1 create YOUR_PROJECT_NAME-db
```

**Save the output!** You'll see something like:

```
✅ Successfully created DB 'YOUR_PROJECT_NAME-db'!

[[d1_databases]]
binding = "DB"
database_name = "YOUR_PROJECT_NAME-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id`** - you'll need it in Step 3.

### Step 2.3: Create Your R2 Buckets

```bash
# For user avatars/profile images
npx wrangler r2 bucket create YOUR_PROJECT_NAME-avatars

# For file uploads
npx wrangler r2 bucket create YOUR_PROJECT_NAME-files
```

### Step 2.4: Verify Your Resources

```bash
# List your D1 databases
npx wrangler d1 list

# List your R2 buckets
npx wrangler r2 bucket list
```

**Checkpoint:** You should see YOUR resources listed, not `vite-flare-starter-*`.

---

## Part 3: Update Configuration Files

### Step 3.1: Update wrangler.jsonc

Open `wrangler.jsonc` and make these changes:

```jsonc
{
  // Line 4: Change worker name
  "name": "YOUR_PROJECT_NAME",  // Was: "vite-flare-starter"

  // Line 7: REMOVE or UPDATE account_id
  // "account_id": "...",  // DELETE this line or set to YOUR account ID

  // Lines 29-35: Update D1 database
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "YOUR_PROJECT_NAME-db",      // Was: "vite-flare-starter-db"
      "database_id": "YOUR_DATABASE_ID_HERE",       // From Step 2.2
      "migrations_dir": "drizzle"
    }
  ],

  // Lines 40-48: Update R2 buckets
  "r2_buckets": [
    {
      "binding": "AVATARS",
      "bucket_name": "YOUR_PROJECT_NAME-avatars"    // Was: "vite-flare-starter-avatars"
    },
    {
      "binding": "FILES",
      "bucket_name": "YOUR_PROJECT_NAME-files"      // Was: "vite-flare-starter-files"
    }
  ]
}
```

### Step 3.2: Update package.json

**Line 2:** Change the project name:

```json
{
  "name": "your-project-name",  // Was: "vite-flare-starter"
  "version": "0.1.0",           // Reset version for your fork
  ...
}
```

**Database Scripts (if you changed DB name):**

Find and replace `vite-flare-starter-db` with `YOUR_PROJECT_NAME-db` in these scripts:
- `db:migrate:local`
- `db:migrate:remote`
- `db:migrate:list:local`
- `db:migrate:list:remote`

---

## Part 4: Rebrand the Application

### Step 4.1: Set Environment Variables

Create/update `.dev.vars` for local development:

```bash
# Application Branding (CRITICAL - hides framework identity)
VITE_APP_NAME=Your App Name
VITE_APP_ID=yourapp
VITE_TOKEN_PREFIX=yap_
VITE_GITHUB_URL=
VITE_FOOTER_TEXT=© 2025 Your Company

# Auth (generate new secrets!)
BETTER_AUTH_SECRET=your-32-char-secret-here
BETTER_AUTH_URL=http://localhost:5173

# Optional
ADMIN_EMAILS=admin@yourcompany.com
```

### Step 4.2: Update index.html

Edit `index.html`:

```html
<title>Your App Name</title>
<meta name="title" content="Your App Name" />
<meta name="description" content="Your app description" />
```

### Step 4.3: Replace Favicon

Replace `public/favicon.svg` with your own favicon.

### Step 4.4: Customise Chat starters and Routine templates

These ship with sensible-but-generic content for the demo. Leaving them
unchanged is the equivalent of shipping with placeholder hero copy — the
chat surface looks like a starter that wasn't customised. (See gh #56.)

| File | What to change |
|---|---|
| `src/shared/config/chat-chips.ts` | Replace the `CHAT_CHIPS` (Write / Research / Code / Plan / Local) and `CHAT_EXAMPLES` ("Find good coffee shops near Newcastle NSW", etc.) with prompts that match your product's verbs and domain. First impression of the chat surface — make these specific. |
| `src/shared/config/routine-templates.ts` | Replace the bundled examples (`routine-health` + `youtube-digest`) with templates relevant to your users. The seed button and RoutinesPage UI iterate this list automatically. |

Both files are well-typed and well-located — the only change needed is editing the contents. No other code touches these arrays.

### Step 4.5: Replace LandingPage (if you want a custom homepage)

`src/client/pages/LandingPage.tsx` is the unauthenticated homepage. The
route is wrapped in `<PublicLayout />` which **already provides a header
+ footer**. Don't add your own `<header>` or you'll get two stacked
headers. (See gh #53.) The layout component is at
`src/client/layouts/PublicLayout.tsx` if you want to customise the wrapping
chrome itself.

---

## Part 5: Update Documentation

**IMPORTANT:** Update YOUR copy of these docs so future developers (and AI agents) see YOUR project info.

### Step 5.1: Update CLAUDE.md

Make these updates to your fork's CLAUDE.md:

1. **Project header section:**
   - Change project name from "Vite Flare Starter" to your name
   - Update version
   - Change "Purpose" to describe YOUR project

2. **Remove Jezweb-specific references:**
   - Search for "Jezweb" and update or remove
   - Search for "Vite Flare Starter" and update
   - Update author/maintainer info

3. **Update the "Forking" section** to reference your project (or remove it)

### Step 5.2: Update README.md

1. Change project title and description
2. Update demo URL to your deployment
3. Update author/maintainer information
4. Remove or update GitHub links

---

## Part 6: Apply Database Migrations

```bash
# Apply migrations to local database
pnpm run db:migrate:local
```

Expected output:
```
✅ Successfully applied X migrations!
```

---

## Part 7: Verify Everything Works

### Step 7.1: Start Development Server

```bash
pnpm dev
```

### Step 7.2: Test the Application

- [ ] http://localhost:5173 loads successfully
- [ ] Application shows YOUR name (not "Vite Flare Starter")
- [ ] Sign-up creates a new user
- [ ] Sign-in works
- [ ] Dashboard displays

### Step 7.3: Verify Resource Separation

```bash
# Confirm YOUR database is being used
npx wrangler d1 list

# Confirm YOUR buckets are configured
npx wrangler r2 bucket list
```

### Step 7.4: Search for Remaining References

Search your codebase for any remaining framework references:

```bash
grep -r "vite-flare-starter" --include="*.json" --include="*.jsonc" --include="*.md" --include="*.ts" --include="*.html"
```

Update any found references to your project name.

---

## Part 7.5: Optional Integrations

The starter ships with several optional integrations. Each is disabled by default when its credentials aren't set — the agent simply won't see those tools. Enable the ones you need; ignore the rest.

### Google Workspace connector (26 tools)

Per-user OAuth for Gmail, Drive, Calendar, Docs, Sheets, and Tasks. Users connect via **Connectors → Google Workspace → Connect** after signing in.

1. **Google Cloud Console**:
   - Create an OAuth 2.0 Client ID (the same one you use for Google sign-in can work, or create a new one)
   - Add authorised redirect URI: `https://YOUR_WORKER_URL/api/google-workspace/oauth/callback`
   - Enable these APIs on the project: Gmail, Drive, Calendar, Docs, Sheets, Tasks
2. **Set secrets** (re-use GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET if already set for OAuth sign-in):
   ```bash
   printf "your-client-id" | npx wrangler secret put GOOGLE_CLIENT_ID
   printf "your-client-secret" | npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
3. **Scopes**: the connector requests a union of read + write scopes when a user connects. Users see exactly what they're granting. Individual tools check `requireActiveToken(ctx, 'gmail.send')` etc. — a user who granted only read-only scopes gets a clean "This action needs the X scope" error on write tools.

**To disable entirely**: leave `GOOGLE_CLIENT_ID` unset, or filter the connector from `src/client/modules/connectors/catalogue.ts`. The 26 Workspace tools won't appear in the agent's toolkit.

**Privileged-tool gating**: all 10 write tools (`gmail_send`, `gmail_reply`, `calendar_create`, `calendar_update_event`, `calendar_delete_event`, `docs_create`, `docs_append`, `sheets_append_row`, `sheets_write_range`, `drive_create_folder`, `tasks_create`) are hidden from the model unless the latest user message contains an unlock keyword (e.g. "reply", "schedule", "append"). Add custom gating rules in `src/server/lib/ai/prepare-step.ts`.

### Google Places (`places_search`, `places_details`)

Map answers paired with the inline `show_map` UI. Requires Places API (New) enabled on a Google Cloud project.

```bash
printf "your-google-places-key" | npx wrangler secret put GOOGLE_PLACES_API_KEY
```

### Web search (`web_search`)

Pick any ONE of the four supported providers. The agent uses whichever key is set.

```bash
# One of these:
printf "your-serper-key"  | npx wrangler secret put SERPER_API_KEY   # 2,500 free/month
printf "your-brave-key"   | npx wrangler secret put BRAVE_API_KEY    # $5 monthly credits
printf "your-tavily-key"  | npx wrangler secret put TAVILY_API_KEY   # 1,000 free credits/month
printf "your-exa-key"     | npx wrangler secret put EXA_API_KEY      # paid
```

### Browser Rendering tools (`browser_markdown`, `browser_extract`, etc.)

Requires a Cloudflare API token with "Browser Rendering - Edit" permission.

```bash
printf "your-cf-account-id" | npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
printf "your-cf-api-token"  | npx wrangler secret put CLOUDFLARE_API_TOKEN
```

### Code execution (`run_python`, `run_shell`, `run_js`)

Requires the Workers Paid plan and a `SANDBOX` Durable Object binding. See Cloudflare Sandbox docs for setup.

### MCP Connectors (per-user OAuth to external MCP servers)

Opt-in feature flag: `VITE_FEATURE_CONNECTORS=true` in `.dev.vars` or the production secret bag. Users can then connect their own MCP servers from **Connectors** page. Tokens are AES-GCM encrypted at rest using:

```bash
printf "$(openssl rand -hex 32)" | npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

### Voice + Video agent examples

Opt-in feature flags: `VITE_FEATURE_VOICE_AGENT=true`, `VITE_FEATURE_VIDEO_AGENT=true`. Reference implementations of the Durable Object + `agents` SDK pattern for streaming voice / vision. See CLAUDE.md Pattern 10 and 10b.

---

## Part 8: First Deployment

### Step 8.1: Set Production Secrets

```bash
# Generate a NEW production secret (different from dev!)
openssl rand -base64 32

# Set secrets
echo "your-production-secret" | npx wrangler secret put BETTER_AUTH_SECRET
echo "https://YOUR_PROJECT_NAME.YOUR_SUBDOMAIN.workers.dev" | npx wrangler secret put BETTER_AUTH_URL

# CRITICAL: Set trusted origins (auth fails without this!)
echo "http://localhost:5173,https://YOUR_PROJECT_NAME.YOUR_SUBDOMAIN.workers.dev" | npx wrangler secret put TRUSTED_ORIGINS
```

### Step 8.2: Migrate Remote Database

```bash
pnpm run db:migrate:remote
```

### Step 8.3: Deploy

```bash
pnpm run build
pnpm run deploy
```

### Step 8.4: Update BETTER_AUTH_URL

After deployment, you'll get your Worker URL. Update the secret:

```bash
echo "https://YOUR_ACTUAL_WORKER_URL.workers.dev" | npx wrangler secret put BETTER_AUTH_URL
```

### Step 8.5: Verify your custom domain serves on both A and AAAA

If you added a custom domain via `wrangler.jsonc` `routes` (not just the
`workers.dev` URL), verify both A (IPv4) and AAAA (IPv6) records are
present on the zone after the first deploy. Cloudflare provisioning
sometimes adds only AAAA — IPv4-only clients can't reach the site
until A appears too. (See gh #54.)

```bash
dig +short A example.com
dig +short AAAA example.com
```

If only AAAA returns: try `wrangler deploy` again, or add the A record
manually via the Cloudflare dashboard (Websites → your zone → DNS →
Records → Add → A → name=`@` content=`192.0.2.1` proxied=on; the actual
IP is irrelevant when proxied — Workers serves traffic regardless of the
target). The `workers.dev` URL works as a clean IPv4 fallback while the
custom domain settles.

---

## What Gets Fingerprinted (Security Checklist)

If you don't change these, attackers can identify your site uses this starter:

| Location | Default Value | How to Change |
|----------|---------------|---------------|
| Page title | "Vite Flare Starter" | `index.html` |
| App name in UI | "Vite Flare Starter" | `VITE_APP_NAME` env var |
| Sidebar logo badge | Auto-generated "V" from name | `VITE_APP_LOGO_URL=/logo.png` (drop logo in `public/`) |
| localStorage keys | `vite-flare-starter-theme` | `VITE_APP_ID` env var |
| API tokens | `vfs_` prefix | `VITE_TOKEN_PREFIX` env var |
| Sentry release | `vite-flare-starter@x.x.x` | `VITE_APP_ID` env var |
| GitHub links | jezweb repo | `VITE_GITHUB_URL` (set empty to hide) |
| Worker name | `vite-flare-starter` | `wrangler.jsonc` |
| Database name | `vite-flare-starter-db` | `wrangler.jsonc` |
| R2 buckets | `vite-flare-starter-*` | `wrangler.jsonc` |

---

## Verification Checklist

After completing all steps, verify:

- [ ] `wrangler.jsonc` has YOUR database_id (not the original)
- [ ] `wrangler.jsonc` has YOUR bucket names
- [ ] `wrangler.jsonc` has no `account_id` or has YOUR account_id
- [ ] `package.json` has YOUR project name
- [ ] `.dev.vars` has YOUR branding env vars set
- [ ] `index.html` has YOUR title and meta tags
- [ ] `CLAUDE.md` describes YOUR project
- [ ] `npx wrangler d1 list` shows YOUR database
- [ ] `npx wrangler r2 bucket list` shows YOUR buckets
- [ ] `grep -r "vite-flare-starter"` returns no results in config files
- [ ] Application displays YOUR app name, not "Vite Flare Starter"
- [ ] Local development works
- [ ] (If deployed) Production deployment works

---

## Common Mistakes

### 1. Forgetting to Set TRUSTED_ORIGINS

**Symptom:** User signs in but lands on homepage (auth silently fails)

**Fix:** Set the TRUSTED_ORIGINS secret:
```bash
echo "http://localhost:5173,https://your-domain.workers.dev" | npx wrangler secret put TRUSTED_ORIGINS
```

### 2. Using Original Database ID

**Symptom:** Database operations fail or affect wrong data

**Fix:** Create YOUR database and use YOUR database_id in wrangler.jsonc

### 3. Not Setting VITE_APP_ID

**Symptom:** localStorage keys still show "vite-flare-starter"

**Fix:** Set `VITE_APP_ID=yourapp` in `.dev.vars`

### 4. Keeping Original account_id

**Symptom:** Deploy fails with "not authorized" or deploys to wrong account

**Fix:** Remove `account_id` from wrangler.jsonc (Wrangler will use your logged-in account)

### 5. Not Updating BETTER_AUTH_URL After Deploy

**Symptom:** Authentication fails in production

**Fix:** After first deploy, update the secret with your actual Worker URL

---

## Keeping in sync with upstream

If your fork intends to pull bug fixes and features from
`vite-flare-starter` over time, follow the `PATCHES.md` convention from
day one. It's a lightweight way to track which parts of the fork diverge
from upstream, so merges later stay tractable.

The short version:

- Prefer extension points (`nav.ts`, `features.ts`, skills, tool modules,
  connectors) over editing shared code.
- For unavoidable edits, add a `// @fork-patch[some-id]` comment above
  the changed block.
- Add a matching entry in `PATCHES.md` at the repo root explaining what
  and why.

Full convention + worked example:
[`docs/PATCHES-guide.md`](./docs/PATCHES-guide.md).

New forks inherit timestamp-prefixed migrations (`drizzle.config.ts` has
`prefix: "timestamp"`), so your migrations won't collide with upstream's
when you merge. If you don't plan to sync with upstream after the initial
fork, you can skip the `PATCHES.md` convention entirely — delete the
file and move on.

---

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [D1 Database Documentation](https://developers.cloudflare.com/d1/)
- [R2 Storage Documentation](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)

---

## Need Help?

If you encounter issues:

1. Check that all steps in this guide were completed
2. Verify your Cloudflare resources exist and are correctly named
3. Check environment variables are set correctly
4. Open an issue on the original repository (for bugs in the starter kit)
