# Forking Guide for AI Coding Agents

**Last Updated:** 2026-01-05
**Purpose:** Ensure complete separation from the original vite-flare-starter project

---

## Overview

This guide ensures your fork creates **completely separate Cloudflare resources** and removes all framework fingerprints. After following this guide, your fork will be a standalone project with no connection to vite-flare-starter.

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

## Part 1: Clone and Initial Setup

### Step 1.1: Clone the Repository

```bash
git clone https://github.com/jezweb/vite-flare-starter.git YOUR_PROJECT_NAME
cd YOUR_PROJECT_NAME
```

### Step 1.2: Remove Original Git History (Recommended)

For a fresh start:

```bash
rm -rf .git
git init
git add .
git commit -m "Initial commit from vite-flare-starter fork"
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
```

This opens a browser to authenticate. Ensure you're logged into YOUR Cloudflare account.

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

---

## What Gets Fingerprinted (Security Checklist)

If you don't change these, attackers can identify your site uses this starter:

| Location | Default Value | How to Change |
|----------|---------------|---------------|
| Page title | "Vite Flare Starter" | `index.html` |
| App name in UI | "Vite Flare Starter" | `VITE_APP_NAME` env var |
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
