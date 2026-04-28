# Multi-tenant Org UI — Plan (2026-04-28)

**Goal**: turn the existing better-auth Organization plugin (already
wired, schema present, plugin endpoints live) into a visibly
multi-tenant app. Add an org switcher, members page, invite flow,
accept-invitation page, and create-org dialog.

**Non-goals**: custom roles + access-control matrix (better-auth `ac`
plugin) — defer until a fork-user actually needs role granularity
beyond owner/admin/member. Org-scoped resources (project membership
already exists; routines + skills + entities not yet org-scoped) —
also deferred; can layer on top once the UI lands.

---

## Current state (verified)

| What | Where | Status |
|---|---|---|
| `organization` / `member` / `invitation` tables | better-auth plugin schema (migration 0030) | ✅ live |
| `activeOrganizationId` on session | session table | ✅ live |
| Plugin endpoints `/api/auth/organization/*` | `src/server/modules/auth/index.ts:316` | ✅ live (create / list / setActive / inviteUser / acceptInvitation / removeMember / updateMemberRole / leaveOrganization) |
| Custom convenience routes | `src/server/modules/organizations/routes.ts` | ✅ live (`/me`, `/active`, `/me/membership`) |
| Helpers `getActiveOrg`, `listUserOrgs` | `src/server/modules/organizations/helpers.ts` | ✅ live |
| `sendInvitationEmail` config | `auth/index.ts:320` | ❌ undefined — falls back to invitation tokens; we'll wire it from SMTP2Go in Phase 6 |
| Auto-create personal org on signup | not present | ❌ no — first-time users have zero orgs |
| Existing `OrganizationSection` (single-tenant brand) | `SettingsPage.tsx:77` | ⚠️ confusingly named — for app-level brand settings, NOT the multi-tenant orgs |
| Org switcher / members page / invite flow | nothing | ❌ this plan |

The existing `organization` (singular) module is **brand settings** —
the app's own name/address/phone etc., scoped to a single row. It
predates the better-auth plugin and is unrelated. We **don't touch
it** in this plan; just acknowledge the naming overlap and rely on
folder paths to disambiguate (`organization/` vs `organizations/`).

---

## Phases

### Phase 0 — Auto-create personal org on signup (foundation)

Without this, every new user lands on a dashboard where the org
switcher reads "(no org)" and the members page is empty. Bad first
impression and forces a "Create your first org" interstitial.

Wire a `databaseHooks.user.create.after` hook that creates a
personal org named `${user.name}'s workspace` (or `Personal`),
adds the user as `owner`, and sets it as the active org. Idempotent
— if the user already has orgs (re-running the hook), do nothing.

**Files**:
- `src/server/modules/auth/index.ts` — add hook
- `src/server/modules/organizations/seed.ts` (new) — `ensurePersonalOrg(db, userId)` helper

**Risk**: existing users with no orgs need backfill. Add a one-shot
SQL migration to seed personal orgs for everyone.

**Effort**: 30 min

---

### Phase 1 — Hooks + types (foundation)

All UI work depends on hook plumbing. Single new file.

`src/client/modules/organizations/hooks/useOrganizations.ts`:

| Hook | Wraps |
|---|---|
| `useMyOrgs()` | `GET /api/organizations/me` (existing endpoint) |
| `useActiveOrg()` | `GET /api/organizations/active` (existing) |
| `useOrgMembers(orgId)` | `GET /api/auth/organization/list-members?organizationId=...` (plugin) |
| `useInvitations(orgId)` | `GET /api/auth/organization/list-invitations` (plugin) |
| `useCreateOrg()` | `POST /api/auth/organization/create` |
| `useSetActiveOrg()` | `POST /api/auth/organization/set-active` |
| `useInviteMember()` | `POST /api/auth/organization/invite-user` |
| `useAcceptInvitation()` | `POST /api/auth/organization/accept-invitation` |
| `useRemoveMember()` | `POST /api/auth/organization/remove-member` |
| `useUpdateMemberRole()` | `POST /api/auth/organization/update-member-role` |
| `useLeaveOrg()` | `POST /api/auth/organization/leave` |
| `useTransferOwnership()` | `POST /api/auth/organization/update-member-role` (chained: promote new owner, demote self) |

Cache key prefix `['orgs', ...]`. Mutations invalidate `['orgs']`.

**Effort**: 45 min

---

### Phase 2 — Org switcher in sidebar header

Replace the static `Vite Flare Starter` block at the top of
`AppSidebar` with `<OrgSwitcher>`:

- Trigger: button showing active org name + a small chevron
- Dropdown: list my orgs (active marked with check), divider, "Create
  organization", "Manage current organization", "Invite people"
- "Create organization" opens `<CreateOrganizationDialog>`
- Items pre-load via `useMyOrgs()`; switching uses `useSetActiveOrg`
  + `window.location.href = '/dashboard'` to force a clean session
  refetch (per `better-auth-cloudflare.md` rule — SPA nav after auth
  state change is unreliable)

**Files**:
- `src/client/modules/organizations/components/OrgSwitcher.tsx` (new)
- `src/components/app-sidebar.tsx` (modify — replace header block)
- `src/client/modules/organizations/components/CreateOrganizationDialog.tsx` (new)

**Decision A**: Org switcher REPLACES the app name+logo, OR sits
under it? I lean: REPLACES. The app name belongs on the landing
page; once authed, the sidebar header should show "your org context"
(your team's logo + name). Fork-users can override with
`appConfig.logoUrl` when org has no logo.

**Effort**: 1.5 hr

---

### Phase 3 — Organization page (members + settings)

`/dashboard/organization` — single page with tabs:

1. **Members** (default)
   - List members + role + joined date
   - "Invite member" button (top-right) → `<InviteMemberDialog>`
   - Pending invitations list with revoke action
   - Per-row: change role (owner only), remove (owner only)
2. **Settings**
   - Org name + logo URL (editable by owner)
   - Slug (display only — changing it would invalidate invitation links)
   - Created date
   - Danger zone: leave org / delete org (owner only)

Active org context resolved via `useActiveOrg()`. If no active org →
empty state with "Create your first organization" CTA.

Members page top-right has org switcher dropdown for clarity ("you're
managing: Acme Co").

**Files**:
- `src/client/modules/organizations/pages/OrganizationPage.tsx` (new)
- `src/client/modules/organizations/components/MembersList.tsx` (new)
- `src/client/modules/organizations/components/InviteMemberDialog.tsx` (new)
- `src/client/modules/organizations/components/InvitationsList.tsx` (new)
- `src/client/modules/organizations/components/OrgSettingsCard.tsx` (new)
- `src/client/App.tsx` — add route
- `src/shared/config/nav.ts` — add `Organization` entry under "You" cluster

**Decision B**: where in the nav does Organization live?
- Option 1: in the user-menu (Settings / Admin Panel / **Organization** / Sign out)
- Option 2: under the "You" sidebar cluster (Inbox / Notifications / Approvals / **Organization**)

I lean Option 1 — Organization is a settings-adjacent surface, not a
day-to-day destination. The org SWITCHER is the day-to-day handle.

**Effort**: 2.5 hr

---

### Phase 4 — Accept-invitation page (public route)

`/accept-invitation/:token` — public, no auth required to view.

- If signed in → call `accept-invitation` plugin endpoint, on success
  set the new org as active, navigate to `/dashboard/organization`
- If not signed in → store the token in sessionStorage, redirect to
  `/sign-in?return=/accept-invitation/<token>`. After sign-in, the
  PostSignIn handler reads sessionStorage and processes the
  invitation.
- If token invalid/expired → friendly error with "Sign in to your
  account" link.

**Files**:
- `src/client/pages/AcceptInvitationPage.tsx` (new — public route)
- `src/client/App.tsx` — add to public routes
- `src/client/lib/auth-redirect.ts` (existing) — extend post-signin
  handler to consume invitation tokens from sessionStorage

**Decision C**: link format. Better-auth issues `/accept-invitation/<token>`
URLs by default. We can either:
- Use the plugin's URL as-is
- Wrap with our own URL that decodes + calls plugin (more control,
  more code)

Lean: use plugin URL as-is. Keep the moving parts low.

**Effort**: 1 hr

---

### Phase 5 — Wire `sendInvitationEmail` via SMTP2Go

Currently `sendInvitationEmail: undefined` so users invited via the
plugin only get a token in the API response, not an email. Fix this
by wiring SMTP2Go (already configured in `email/` module).

Email content:
- Subject: `${inviter.name} invited you to ${org.name}`
- Body: name + org name + accept-invitation link + plain-text fallback
- Reply-to: inviter's email

If SMTP isn't configured (no `SMTP2GO_API_KEY` env), fall back to
returning the invite link from the invite endpoint and showing a
"Copy link" button in the InviteMemberDialog.

**Files**:
- `src/server/modules/auth/index.ts` — implement `sendInvitationEmail`
- `src/server/modules/email/templates/org-invite.ts` (new)
- `src/client/modules/organizations/components/InviteMemberDialog.tsx`
  — add "Copy link" UX for the fallback path

**Decision D**: HTML email or plain text? Lean plain text + HTML
twin (already the SMTP2Go pattern in this codebase).

**Effort**: 1 hr

---

### Phase 6 — Verify + dogfood (final)

1. Manual smoke test:
   - Sign up a new user → personal org auto-created → switcher shows
   - Create second org → switcher shows both, can flip
   - Invite second user (different email) → email arrives → click
     link → flow handles signed-out + signed-in cases
   - Member arrives at members page → role displayed → owner can
     change role, remove member, transfer ownership
2. UX audit pass (skill: `dev-tools:ux-audit` scoped to org surfaces)
3. Multi-account dogfood (new browser session for the second user)

**Effort**: 1 hr

---

## Total

≈ 8 hours of implementation + audit. Realistic for one focused day.

Could ship Phase 0+1+2 in a single "Routines is now multi-tenant"
PR (≈ 3 hr) and earn the visible win without the full members page.
But the members page IS the surface that makes user-management feel
real, so I'd recommend the full sequence in one go.

---

## File inventory

| File | Action |
|---|---|
| `src/server/modules/auth/index.ts` | Add user-create hook (Phase 0); wire `sendInvitationEmail` (Phase 5) |
| `src/server/modules/organizations/seed.ts` | NEW — `ensurePersonalOrg` helper |
| `src/server/modules/email/templates/org-invite.ts` | NEW — invite email template |
| `drizzle/<timestamp>_seed_personal_orgs.sql` | NEW — backfill existing users |
| `src/client/modules/organizations/hooks/useOrganizations.ts` | NEW |
| `src/client/modules/organizations/components/OrgSwitcher.tsx` | NEW |
| `src/client/modules/organizations/components/CreateOrganizationDialog.tsx` | NEW |
| `src/client/modules/organizations/components/MembersList.tsx` | NEW |
| `src/client/modules/organizations/components/InvitationsList.tsx` | NEW |
| `src/client/modules/organizations/components/InviteMemberDialog.tsx` | NEW |
| `src/client/modules/organizations/components/OrgSettingsCard.tsx` | NEW |
| `src/client/modules/organizations/pages/OrganizationPage.tsx` | NEW |
| `src/client/pages/AcceptInvitationPage.tsx` | NEW (public route) |
| `src/components/app-sidebar.tsx` | Modify — replace static header with OrgSwitcher |
| `src/client/App.tsx` | Add 2 routes (org page + accept-invite public) |
| `src/shared/config/nav.ts` | Add "Organization" item per Decision B |
| `src/client/components/nav-user.tsx` | Add "Organization" link if Decision B = Option 1 |
| `src/client/lib/auth-redirect.ts` | Extend post-signin to consume pending invitations |
| `CLAUDE.md` | Update module table + add Organization to "You" or user-menu |
| `docs/AGENTS.md` | Note that agents can be org-scoped (currently they're user-scoped — fork-users wanting org-scoped agents pass org context in tool inputs) |

---

## Decisions surfaced

| # | Question | My lean |
|---|---|---|
| A | Org switcher REPLACES app logo+name in sidebar header, or sits under it? | Replaces |
| B | Where does the Organization page live in nav — user menu or "You" sidebar cluster? | User menu (Settings-adjacent) |
| C | Use plugin's default `/accept-invitation/<token>` URL or wrap with our own? | Plugin's default |
| D | Email format for invitation? | HTML + plain-text twin (existing pattern) |
| E | Phase 0 backfill — auto-create personal orgs for existing users? | Yes, one-shot SQL migration |
| F | Sunset the existing single-tenant `OrganizationSection` (brand settings)? | Defer — confusing naming, but it serves a different purpose, leave for now |

---

## Risks + mitigations

- **Switching active org** — better-auth's session-scoped active-org
  doesn't always refresh on SPA nav. Mitigation: hard navigate
  (`window.location.href = '/dashboard'`) after switch.
- **Personal-org name collision** — multiple users with the same name
  could create multiple "Personal" orgs. Use the user's id in the
  default slug (e.g. `personal-${userId.slice(0, 8)}`).
- **Invitation tokens leak in URLs** — better-auth rotates tokens
  appropriately; no action.
- **Email failures silent** — wrap in try/catch, log structured event,
  surface in InviteMemberDialog as "email may not have sent — copy
  link instead".
- **Invitation acceptance race** — two users accept the same link
  quickly. better-auth handles this idempotently (second one gets
  "already a member" error). Surface the error gracefully.

---

## Knock-on impacts (for awareness, not in scope)

These are NOT changed by this plan but worth noting for fork-users:

- **Routines, projects, skills, entities, files** are user-scoped today.
  Org-scoping any of them is a follow-up — pattern: add `org_id`
  column, scope the query at module level via `getActiveOrg(c)`.
- **Memory** is already three-scope (user / project / org) so org
  memory will Just Work once orgs have UI.
- **Approvals** are user-scoped — agents queue approvals against
  their owner. For org-shared agents (a future feature), approvals
  would need org-scoping.

These are deliberately outside this plan's scope.

---

## When

Tonight or next session. Independent from any other work — issue #50
is complete; this plan stands alone.

**Last updated**: 2026-04-28
