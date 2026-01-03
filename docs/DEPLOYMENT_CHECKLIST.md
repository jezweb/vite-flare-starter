# Production Deployment Checklist

Step-by-step checklist for deploying vite-flare-starter to production on Cloudflare Workers.

---

## Pre-Deployment

### 1. Security Rebranding

**CRITICAL**: Hide framework identity to prevent targeted attacks.

| Item | Action | Status |
|------|--------|--------|
| `VITE_APP_NAME` | Set custom app name | ☐ |
| `VITE_APP_ID` | Set custom ID (used in localStorage) | ☐ |
| `VITE_TOKEN_PREFIX` | Set custom prefix (e.g., `myapp_`) | ☐ |
| `TOKEN_PREFIX` | Match client prefix (server secret) | ☐ |
| `VITE_GITHUB_URL` | Set empty to hide GitHub links | ☐ |
| `index.html` | Update `<title>` and `<meta>` tags | ☐ |
| Favicon | Replace with your own | ☐ |

### 2. Environment Variables

Set all required secrets:

```bash
# Required
echo "$(openssl rand -hex 32)" | npx wrangler secret put BETTER_AUTH_SECRET
echo "https://your-domain.com" | npx wrangler secret put BETTER_AUTH_URL
echo "https://your-domain.com" | npx wrangler secret put TRUSTED_ORIGINS

# Optional: Google OAuth
echo "your-client-id" | npx wrangler secret put GOOGLE_CLIENT_ID
echo "your-client-secret" | npx wrangler secret put GOOGLE_CLIENT_SECRET

# Optional: Email (Resend)
echo "re_xxx" | npx wrangler secret put RESEND_API_KEY

# Optional: Error tracking (Sentry)
echo "https://xxx@sentry.io/xxx" | npx wrangler secret put SENTRY_DSN
echo "production" | npx wrangler secret put SENTRY_ENVIRONMENT

# Optional: AI Gateway
echo "your-gateway-id" | npx wrangler secret put AI_GATEWAY_ID
echo "your-token" | npx wrangler secret put CF_AIG_TOKEN

# Optional: Admin auto-promotion
echo "admin@yourcompany.com,cto@yourcompany.com" | npx wrangler secret put ADMIN_EMAILS
```

### 3. Database Migration

```bash
# Run all migrations on production
pnpm db:migrate:remote

# Verify tables exist
npx wrangler d1 execute vite-flare-starter-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### 4. Build Verification

```bash
# Clean build
rm -rf dist
pnpm build

# Check for errors
pnpm type-check

# Verify dist contents
ls -la dist/
```

---

## Deployment

### 5. Deploy to Cloudflare

```bash
npx wrangler deploy
```

Note the deployed URL (e.g., `https://vite-flare-starter.your-account.workers.dev`).

### 6. Custom Domain (Optional)

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your Worker → Settings → Triggers
3. Add Custom Domain
4. Update DNS if not using Cloudflare DNS

---

## Post-Deployment Verification

### 7. Health Checks

```bash
# Basic health
curl https://your-domain.com/api/health

# Expected response:
# {"status":"ok","version":"0.10.0","database":"connected","storage":"connected"}
```

### 8. Auth Flow Testing

| Test | Expected Result | Status |
|------|-----------------|--------|
| Visit homepage | Loads without errors | ☐ |
| Click Sign In | Shows sign-in page | ☐ |
| Sign up with email | Creates account, sends verification | ☐ |
| Verify email | Email verified, can sign in | ☐ |
| Google OAuth (if enabled) | Redirects to Google, returns | ☐ |
| Sign out | Clears session, redirects | ☐ |

### 9. Admin Access

```bash
# Check admin status (while signed in)
curl -b "your-session-cookie" https://your-domain.com/api/health/admin
```

### 10. Google OAuth Redirect URI

If using Google OAuth, register the callback URL:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client
3. Add Authorized redirect URI:
   ```
   https://your-domain.com/api/auth/callback/google
   ```

---

## Security Hardening

### 11. Security Headers

Verify headers are set (already configured in starter):

```bash
curl -I https://your-domain.com | grep -E "(X-Frame|X-Content|Content-Security)"
```

Expected:
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'self'; ...
```

### 12. Rate Limiting

Verify rate limiting is active:

```bash
# Hit login endpoint multiple times
for i in {1..20}; do
  curl -X POST https://your-domain.com/api/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done

# Should see 429 Too Many Requests after threshold
```

### 13. Secrets Audit

```bash
# List all secrets (doesn't show values)
npx wrangler secret list

# Verify no secrets in code
grep -r "sk_live\|whsec_\|re_\|ghp_\|gho_" src/
```

---

## Monitoring Setup

### 14. Sentry Error Tracking (Optional)

1. Create project at [sentry.io](https://sentry.io)
2. Set `SENTRY_DSN` secret
3. Verify errors are captured:
   ```bash
   curl https://your-domain.com/api/debug-sentry  # If you have a test endpoint
   ```

### 15. Cloudflare Analytics

1. Dashboard → Workers & Pages → your-worker → Analytics
2. Enable Web Analytics for frontend
3. Set up alerts for error rate spikes

### 16. Uptime Monitoring

Set up external monitoring:
- [Cloudflare Health Checks](https://developers.cloudflare.com/health-checks/)
- [UptimeRobot](https://uptimerobot.com/) (free tier)
- [Better Uptime](https://betteruptime.com/)

Monitor endpoint:
```
GET https://your-domain.com/api/health
Expected: 200 OK
```

---

## Backup Strategy

### 17. Database Backups

D1 has automatic daily backups, but for manual exports:

```bash
# Export full database
npx wrangler d1 export vite-flare-starter-db --remote --output backup.sql

# Store in version control or secure storage
```

### 18. R2 Bucket Backup

For critical files, enable versioning or replicate to another bucket.

---

## Common Issues

### Auth Redirect Loop

**Symptom**: Sign in succeeds but redirects back to login.

**Fix**: Ensure `TRUSTED_ORIGINS` includes your production domain:
```bash
echo "https://your-domain.com" | npx wrangler secret put TRUSTED_ORIGINS
npx wrangler deploy
```

### OAuth Callback Error

**Symptom**: "redirect_uri_mismatch" from Google.

**Fix**: Register exact callback URL in Google Cloud Console:
```
https://your-domain.com/api/auth/callback/google
```

### 500 Errors on API

**Symptom**: API returns 500 errors.

**Debug**:
```bash
# Check logs
npx wrangler tail

# Common causes:
# - Missing secrets
# - Database not migrated
# - R2 bucket not created
```

### Old Code After Deploy

**Symptom**: Changes not reflected after deploy.

**Fix**:
```bash
rm -rf dist .wrangler
pnpm build
npx wrangler deploy
```

---

## Rollback Procedure

If deployment fails:

```bash
# List recent deployments
npx wrangler deployments list

# Rollback to previous version
npx wrangler rollback
```

---

## Final Checklist

| Category | Item | Status |
|----------|------|--------|
| **Security** | Framework identity hidden | ☐ |
| **Security** | All secrets set | ☐ |
| **Security** | Rate limiting verified | ☐ |
| **Security** | Security headers present | ☐ |
| **Database** | Migrations applied | ☐ |
| **Database** | Backup strategy in place | ☐ |
| **Auth** | Email auth working | ☐ |
| **Auth** | OAuth callbacks registered | ☐ |
| **Auth** | Admin access verified | ☐ |
| **Monitoring** | Error tracking configured | ☐ |
| **Monitoring** | Uptime monitoring active | ☐ |
| **Domain** | Custom domain configured | ☐ |
| **Domain** | SSL certificate valid | ☐ |

---

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler Commands](https://developers.cloudflare.com/workers/wrangler/commands/)
- [D1 Docs](https://developers.cloudflare.com/d1/)
- [better-auth Docs](https://www.better-auth.com/docs)

---

**Created**: 2026-01-03
**Author**: Jeremy Dawes (Jezweb)
