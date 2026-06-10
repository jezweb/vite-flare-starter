# Going live on Cloudflare

This takes vite-flare-starter from "running on my laptop" to "live in production, on my own domain." It's heavier than a static site: you've got a database, auth, file storage, and AI, so going live means creating those resources in production and wiring secrets. If this is your very first deploy ever, do **cf-astro-starter** first; this one assumes you're comfortable in a terminal.

The README's Quick Start gets you running **locally**. This is the **production** path on top of that.

## What's running (so the steps make sense)

- **Worker**: the app itself, on Cloudflare's edge. `pnpm deploy` builds and ships it.
- **D1**: the SQLite database (users, sessions, your data). It exists twice, a local copy for dev and a remote one for production, migrated separately.
- **R2 buckets**: file storage. They must exist before a deploy that references them, or the deploy fails.
- **Secrets**: auth keys and OAuth credentials. Local ones live in `.dev.vars`; production ones are set with `wrangler secret put` (`.dev.vars` does not ship).
- **better-auth + Google OAuth**: sign-in. The single most common going-live snag is the auth URL and the Google redirect URI not matching the deployed URL. Covered below.

## Step 0 — name it

Rename the worker, the D1 database, and the buckets from `vite-flare-starter*` to your own in `wrangler.jsonc`, *before* you create the remote resources, so the names line up.

## Step 1 — create the remote resources

```bash
pnpm cf:login
npx wrangler d1 create my-app-db          # paste the database_id it prints into wrangler.jsonc
npx wrangler r2 bucket create my-app-avatars
npx wrangler r2 bucket create my-app-files
npx wrangler r2 bucket create my-app-skills
npx wrangler r2 bucket create my-app-data-lake
```

Create *every* bucket your `wrangler.jsonc` lists. A deploy fails if a referenced bucket doesn't exist.

## Step 2 — migrate the production database

```bash
pnpm db:migrate:remote
```

This builds the schema (auth tables and the rest) in the remote D1. Re-run it whenever you add a migration. Local dev uses `pnpm db:migrate:local`, a separate database.

## Step 3 — set production secrets

`.dev.vars` is local only. For production, set each as a real secret (use `printf`, not `echo`, to avoid a trailing newline breaking the value):

```bash
npx wrangler secret put BETTER_AUTH_SECRET     # a long random string
npx wrangler secret put BETTER_AUTH_URL        # your production URL (see the auth note below)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put EMAIL_FROM
npx wrangler secret put EMAIL_API_KEY
npx wrangler secret put APP_NAME
```

Set only the ones your app actually uses. The optional tool keys (search, places, browser) come later if you want those features.

## Step 4 — deploy

```bash
pnpm deploy
```

Live at `https://my-app.<your-name>.workers.dev`. Sign-in won't work yet, the auth URLs need to match, next.

## The auth gotcha (the one that wastes an afternoon)

better-auth and Google OAuth both need the **exact** URL the app is served from:
- `BETTER_AUTH_URL` (the secret you set) must be the deployed URL.
- In Google Cloud Console, the OAuth client's **Authorised redirect URI** must include `<your-url>/api/auth/callback/google`.

If either is wrong, sign-in bounces or fails with no useful error. Set `BETTER_AUTH_URL` to the `.workers.dev` URL (or your domain once you add it), and add the matching redirect URI in Google Console.

## Step 5 — your own domain

Same as any Worker, add routes to `wrangler.jsonc`:

```jsonc
"routes": [
  { "pattern": "yourdomain.com", "custom_domain": true }
]
```

then `pnpm deploy`. If your domain is registered elsewhere, move its DNS to Cloudflare first, that nameserver step is identical to cf-astro-starter's `GOING-LIVE.md`, see there. Then **update `BETTER_AUTH_URL` and the Google redirect URI to the domain** (the auth gotcha again), and redeploy.

Custom domains go in `wrangler.jsonc` `routes`, never the dashboard, a dashboard-added domain gets dropped on the next deploy.

## Recap

create remote D1 + buckets, `pnpm db:migrate:remote`, `wrangler secret put` the secrets, `pnpm deploy`, fix the auth URLs, add your domain, re-point the auth URLs. Heavier than a static site, but each step is one command.
