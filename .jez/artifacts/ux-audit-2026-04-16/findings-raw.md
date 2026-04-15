# UX Audit Raw Findings — 2026-04-16

## Phase 1: Landing & Auth Pages

### Landing Page (`/`)
- **Theme**: Renders in dark mode despite no user preference set. Possibly respecting system preference.
- **Hero**: Clean, good copy. "Build AI apps at the edge" is strong.
- **"View on GitHub" link**: Points to `https://github.com/jezweb/vite-flare-starter` — needs to be configurable via `VITE_GITHUB_URL` (per CLAUDE.md), but hardcoded button is visible without it. Confirmed renders by default — should hide if empty.
- **Feature grid**: 9 cards, no images or screenshots. Could benefit from visual examples or animated GIFs.
- **Trust signals**: Only 3 badges (MIT Licensed, TypeScript, Cloudflare Ready). No testimonials, no "used by" section, no stats.
- **No interactive demo**: "Try the Demo" CTA just goes to sign-up. Consider an inline demo or public demo account.

### Sign-In Page (`/sign-in`)
- **Missing**: No logo, no "back to home" link, no branding in the card.
- **Missing**: No "Don't have an account? Sign up" link. Dead end if email auth enabled but user forgot they have no account.
- **Password field**: Plain text field with no show/hide toggle.
- **Page title**: Same as landing ("Vite Flare Starter"). Should be "Sign in — Vite Flare Starter".
- **Placeholder** `m@example.com` looks abbreviated/cryptic. Could be `you@company.com`.
- **No loading state** visible on initial render. Button not disabled during auth (need to test).
- **No Google button** — expected since not configured, but should show "Google OAuth not configured" helper when all methods disabled.

### Sign-Up Page (`/sign-up`)
- **Registration Closed state** (when disabled): Clean message, good fallback with sign-in link.
- **Form fields**: Full Name, Email, Password, Confirm Password — good standard.
- **Placeholder** "John Doe" is fine but generic — "e.g. Jordan Smith" feels more inviting.
- **Password strength meter**: NONE. No indicator for password strength or requirements.
- **Password requirements**: Not shown. Users don't know constraints until they submit and fail.
- **Terms/Privacy**: No checkbox for "I agree to Terms & Privacy Policy". Legal risk for production apps.
- **Form validation**: Happens on submit only. No inline validation on email format, password match.
- **Success flow**: Auto-redirects to `/dashboard` with no "Welcome" toast or onboarding tour.

### Auth Config Missing from Default
- Fresh clone with no `.dev.vars` → all auth methods disabled → sign-in page shows empty form but submits return error. No user-facing notice "No auth methods configured — see README".
- Forgot password flow: `Forgot your password?` link → `/forgot-password` — need to test.

## Phase 2: Dashboard & Navigation

### Dashboard Home (`/dashboard`)
- **Welcome message**: "Welcome, Test" — picks up first word of name. OK for most cases but "Mary-Jane" would become "Mary-Jane" (fine).
- **Email verification banner**: Orange alert at top is good, but:
  - Only action is "Resend Email" — no hint of what address email was sent to.
  - In dev mode with no email service, this is a dead-end. Need dev bypass.
  - X to dismiss — but re-appears on refresh. Should persist dismissal per session.
- **Feature cards — split personality**: 3 "action cards" with CTAs (AI Chat, Extract, Settings) + 8 "info cards" without CTAs. Inconsistent. All should be clickable or none should tempt.
- **Sidebar: Settings missing**. Navigate to Settings only via user menu. Should have a Settings link in sidebar.
- **Sidebar: No Admin section** despite `ADMIN_EMAILS=test@example.com`. Admin status is set at signup time from env — so first signup gets admin. Need to verify it's actually an admin user (see user menu).
- **Top bar mostly empty**: Just sidebar toggle + notification bell + theme toggle. No search, no breadcrumbs, no page title.
