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

## Part 0: Brand Extraction

The starter ships a **placeholder theme** (the Kumo-derived look in
`src/index.css` and `DESIGN.md`). It is deliberately decent, and an
internal tool may keep it, but keeping it must be a deliberate choice.
The rule is: **never ship the placeholder without a deliberate choice**,
not "always custom". Do this part before building any product surface.
The fork/clone mechanics in Part 1 can come first; the product UI cannot.

### Step 0.1: Gather real brand material

- Fetch the client's real sites (current website, socials, print material
  if they have it) and **screenshot them**.
- Extract the palette (actual hex/oklch values from the material, not
  "roughly blue"), the typography (display + body), and the register
  (how the brand speaks: formal, warm, technical, playful).

### Step 0.2: Fill in DESIGN_BRIEF.md

Record everything in [`DESIGN_BRIEF.md`](./DESIGN_BRIEF.md) at the repo
root: client, brand sources with URLs + screenshots, each palette colour
with its provenance, display type, layout shape, component posture,
voice/register, and one signature move. An unfilled slot in that file
means the extraction isn't done.

A palette swap on stock shadcn is still the generic app. **If the
finished app would be recognisable as shadcn defaults at a glance, the
design step isn't done: the library is the chassis, never the look.**

If there is **no real material** (new brand, internal tool), design
deliberately anyway: choose values, record why in the brief, and note
"kept the neutral default" explicitly if that is the choice.

### Step 0.3: Self-host the display font

Download the chosen display font and serve it from `public/` with
`@font-face` in `src/index.css`. No Google Fonts CDN link: it adds a
third-party request and the placeholder look survives font fallback.

### Step 0.4: Rewrite the token values

Rewrite the values in `src/index.css` from the brief, **before any
product surface is built**. Values are scaffolding; the structure
(single source, `light-dark()`, semantic tokens, two border weights) is
the contract and stays. See `.claude/rules/design-tokens.md`.

### Step 0.5: Delete the theme presets

The preset palettes in `src/lib/themes.ts` are demo-only. They apply
inline CSS variables that **silently override index.css**, which is
exactly the 2026-07 drift incident (themes.ts overrode index.css for two
months before anyone noticed; see `.claude/rules/design-tokens.md`).
Delete them at fork: strip the preset palettes from `themes.ts`, or
remove the theme picker and the presets with it. Your re-tokened
index.css must be the only source of truth.

---

## Part 1: Fork and Initial Setup

> **AI agents — read this first.** When the user says "fork the starter",
> they mean **create a real GitHub fork**, not `git clone`. A clone with
> `rm -rf .git` cuts you off from upstream forever — you lose every
> bug fix, security patch, and improvement that ships to the starter.
> A fork keeps you connected so `git pull upstream main` is a one-liner.
> Before pulling a major release, read [`UPGRADING.md`](./UPGRADING.md) —
> it lists exactly what can break fork code, with the codemods to fix it.
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

### Step 5.3: Decide about the What's New feed

`/dashboard/updates` gives your app user-facing release notes, posted
from your deploy path with `pnpm changelog:post`. It needs no setup:
until you publish an entry the nav item does not render, so a fresh fork
never shows an empty page.

Keep it if you will actually write release notes — it is one command at
deploy time, and it is the only place in the app that tells users
anything changed. Drop it if your app has a single user who is also the
person deploying it.

**To turn it off:** `VITE_FEATURE_UPDATES=false`. Nav item and route go,
code stays as reference. This is the option to reach for.

**To delete it outright**, remove all of: `src/server/modules/updates/`,
`src/client/modules/updates/`, **`src/client/lib/nav-badges.ts`**,
`tests/shared/nav-badges.test.ts`, `tests/server/modules/updates/`,
`scripts/changelog-post.mjs` (+ its `package.json` script), and the
references in `App.tsx`, `nav.ts`, `app-sidebar.tsx`,
`CommandPalette.tsx`, `src/server/db/schema.ts`, `src/server/index.ts`,
and `<WhatsNewBanner />` in `DashboardPage.tsx`.

`nav-badges.ts` and the two components that call it are the ones people
miss — each imports into the deleted module, so skipping them fails the
build. The leftover `updates:*` scope strings and feature flag are inert
and can wait. Full list:
[`src/client/modules/updates/README.md`](./src/client/modules/updates/README.md).

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

- [ ] `DESIGN_BRIEF.md` is filled from real material (or records a deliberate choice to keep the neutral default)
- [ ] `src/index.css` token values match the brief; theme presets deleted from `src/lib/themes.ts`
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
