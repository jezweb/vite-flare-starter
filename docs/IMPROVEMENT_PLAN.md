# Vite Flare Starter - Improvement Plan

**Created:** 2025-12-30
**Status:** Planning
**Estimated Phases:** 8

---

## Overview

This plan addresses gaps identified in the code review, prioritized by impact and effort. Each phase is designed to fit within a single context window.

---

## Phase 1: Quick Wins - Complete Partial Features

**Goal:** Wire up existing backend features to frontend UI
**Effort:** Low
**Dependencies:** None

### 1.1 Feature Flags Admin Tab

| Task | File |
|------|------|
| Create FeaturesTabContent component | `src/client/modules/admin/components/FeaturesTabContent.tsx` |
| Add useFeatureFlags hook | `src/client/modules/admin/hooks/useFeatureFlags.ts` |
| Wire into AdminPage tabs | `src/client/modules/admin/pages/AdminPage.tsx` |

**API Already Exists:**
- `GET /api/features` - List features (public)
- `GET /api/admin/feature-flags` - List with admin details
- `PATCH /api/admin/feature-flags/:key` - Toggle feature

### 1.2 Notification Bell + Dropdown

| Task | File |
|------|------|
| Create NotificationBell component | `src/client/components/NotificationBell.tsx` |
| Create useNotifications hook | `src/client/hooks/useNotifications.ts` |
| Add to DashboardLayout header | `src/client/layouts/DashboardLayout.tsx` |
| Create NotificationDropdown | `src/client/components/NotificationDropdown.tsx` |

**API Already Exists:**
- `GET /api/notifications` - List user notifications
- `PATCH /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/read-all` - Mark all read

### 1.3 Activity Log Page

| Task | File |
|------|------|
| Create ActivityPage | `src/client/modules/activity/pages/ActivityPage.tsx` |
| Create useActivity hook | `src/client/modules/activity/hooks/useActivity.ts` |
| Create ActivityList component | `src/client/modules/activity/components/ActivityList.tsx` |
| Add route to App.tsx | `src/client/App.tsx` |
| Add nav link to sidebar | `src/client/layouts/DashboardLayout.tsx` |

**API Already Exists:**
- `GET /api/activity` - List activities with pagination

### Verification
- [ ] Feature flags can be toggled in Admin > Features tab
- [ ] Notification bell shows unread count
- [ ] Activity page displays user actions
- [ ] All type-check and build pass

---

## Phase 2: Security Hardening

**Goal:** Close security gaps identified in review
**Effort:** Low-Medium
**Dependencies:** None

### 2.1 API Token Scope Enforcement

| Task | File |
|------|------|
| Add scope checking to authMiddleware | `src/server/middleware/auth.ts` |
| Create requireScopes helper | `src/server/middleware/scopes.ts` |
| Apply scopes to sensitive endpoints | Various route files |
| Update API token creation UI | `src/client/modules/api-tokens/` |

**Scopes to Implement:**
- `read:profile` - Read own profile
- `write:profile` - Update own profile
- `read:settings` - Read settings
- `write:settings` - Update settings
- `admin` - Admin operations

### 2.2 Rate Limit Headers

| Task | File |
|------|------|
| Add X-RateLimit-* headers to responses | `src/server/middleware/rate-limit.ts` |
| Add Retry-After on 429 responses | `src/server/middleware/rate-limit.ts` |

**Headers to Add:**
- `X-RateLimit-Limit` - Max requests allowed
- `X-RateLimit-Remaining` - Requests remaining
- `X-RateLimit-Reset` - Unix timestamp of reset
- `Retry-After` - Seconds until retry (on 429)

### 2.3 Password Strength Validation

| Task | File |
|------|------|
| Create password strength validator | `src/shared/utils/password.ts` |
| Add PasswordStrengthMeter component | `src/client/components/PasswordStrengthMeter.tsx` |
| Integrate into SignUpPage | `src/client/modules/auth/SignUpPage.tsx` |
| Integrate into PasswordSection | `src/client/modules/settings/components/PasswordSection.tsx` |
| Add server-side validation | `src/server/modules/auth/index.ts` |

**Requirements:**
- Minimum 8 characters
- At least 1 uppercase
- At least 1 lowercase
- At least 1 number
- Visual strength meter (weak/fair/good/strong)

### Verification
- [ ] API tokens with limited scopes are rejected on unauthorized endpoints
- [ ] Rate limit headers visible in responses
- [ ] Password strength meter shows in signup/change password
- [ ] Weak passwords rejected with helpful message

---

## Phase 3: Email Verification Flow

**Goal:** Complete email verification feature
**Effort:** Medium
**Dependencies:** Email provider configured (Resend)

### 3.1 Backend Updates

| Task | File |
|------|------|
| Enable requireEmailVerification | `src/server/modules/auth/index.ts` |
| Add sendVerificationEmail handler | `src/server/modules/auth/index.ts` |
| Create resend verification endpoint | `src/server/modules/auth/routes.ts` |
| Add verification email template | `src/server/lib/email-templates.ts` |

### 3.2 Frontend Updates

| Task | File |
|------|------|
| Create VerifyEmailPage | `src/client/modules/auth/VerifyEmailPage.tsx` |
| Create EmailVerificationBanner | `src/client/components/EmailVerificationBanner.tsx` |
| Add resend verification button | `src/client/modules/auth/VerifyEmailPage.tsx` |
| Show banner in DashboardLayout | `src/client/layouts/DashboardLayout.tsx` |
| Add route for verification callback | `src/client/App.tsx` |

### 3.3 Email Template

```html
Subject: Verify your email address

Hi {{name}},

Please verify your email address by clicking the link below:

[Verify Email]

This link expires in 24 hours.
```

### Verification
- [ ] New signups receive verification email
- [ ] Unverified users see banner in dashboard
- [ ] Resend verification works
- [ ] Clicking link verifies email
- [ ] Verified status shown in profile

---

## Phase 4: Testing Infrastructure

**Goal:** Establish solid test coverage
**Effort:** Medium
**Dependencies:** None

### 4.1 Test Setup

| Task | File |
|------|------|
| Configure Vitest properly | `vitest.config.ts` |
| Add test utilities | `src/test/utils.ts` |
| Create mock factories | `src/test/factories.ts` |
| Add coverage thresholds | `vitest.config.ts` |

### 4.2 Server Tests

| Task | Coverage |
|------|----------|
| Auth middleware tests | `src/server/middleware/__tests__/auth.test.ts` |
| Admin middleware tests | `src/server/middleware/__tests__/admin.test.ts` |
| Rate limit tests | `src/server/middleware/__tests__/rate-limit.test.ts` |
| Settings API tests | `src/server/modules/settings/__tests__/routes.test.ts` |
| Admin API tests | `src/server/modules/admin/__tests__/routes.test.ts` |

### 4.3 Schema Tests

| Task | Coverage |
|------|----------|
| User schema validation | `src/shared/schemas/__tests__/user.test.ts` |
| Settings schema validation | `src/shared/schemas/__tests__/settings.test.ts` |
| Admin schema validation | `src/shared/schemas/__tests__/admin.test.ts` |

### 4.4 Test Commands

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:ui": "vitest --ui"
}
```

### Verification
- [ ] `pnpm test` runs all tests
- [ ] Coverage report generated
- [ ] Key middleware has >80% coverage
- [ ] CI would catch breaking changes

---

## Phase 5: Error Tracking & Observability

**Goal:** Production-ready error handling and monitoring
**Effort:** Low-Medium
**Dependencies:** Sentry account (free tier works)

### 5.1 Error Tracking Setup

| Task | File |
|------|------|
| Add Sentry SDK | `package.json` |
| Configure Sentry client | `src/client/lib/sentry.ts` |
| Configure Sentry server | `src/server/lib/sentry.ts` |
| Update error boundary | `src/client/components/ErrorBoundary.tsx` |
| Add to error handler | `src/server/index.ts` |

### 5.2 Request ID Tracking

| Task | File |
|------|------|
| Create requestId middleware | `src/server/middleware/request-id.ts` |
| Pass requestId to logger | `src/server/lib/logger.ts` |
| Include in error reports | `src/server/lib/sentry.ts` |
| Return in response headers | `src/server/middleware/request-id.ts` |

### 5.3 Environment Variables

```
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ENVIRONMENT=production
```

### Verification
- [ ] Errors captured in Sentry dashboard
- [ ] Request IDs in logs and headers
- [ ] Source maps uploaded for stack traces
- [ ] Error boundary catches React errors

---

## Phase 6: User Experience Polish

**Goal:** Improve UX with standard patterns
**Effort:** Low-Medium
**Dependencies:** Phase 1 (notifications)

### 6.1 Data Export (GDPR)

| Task | File |
|------|------|
| Create export endpoint | `src/server/modules/settings/export.ts` |
| Add "Export My Data" button | `src/client/modules/settings/components/ProfileSection.tsx` |
| Generate JSON/CSV of user data | `src/server/modules/settings/export.ts` |

### 6.2 Advanced User Search (Admin)

| Task | File |
|------|------|
| Add filter params to user list API | `src/server/modules/admin/routes.ts` |
| Update userListQuerySchema | `src/shared/schemas/admin.schema.ts` |
| Create UserFilters component | `src/client/modules/admin/components/UserFilters.tsx` |
| Add to UsersTabContent | `src/client/modules/admin/components/UsersTabContent.tsx` |

**Filters:**
- Role (user/manager/admin)
- Email verified (yes/no)
- Created date range
- Last active date range

### 6.3 Confirmation Dialogs

| Task | File |
|------|------|
| Create ConfirmDialog component | `src/components/ui/confirm-dialog.tsx` |
| Add to revoke session action | `src/client/modules/settings/components/SessionsSection.tsx` |
| Add to revoke all sessions (admin) | `src/client/modules/admin/components/UserList.tsx` |
| Add to delete API token | `src/client/modules/api-tokens/` |

### 6.4 Empty States

| Task | File |
|------|------|
| Create EmptyState component | `src/components/ui/empty-state.tsx` |
| Add to user list | `src/client/modules/admin/components/UserList.tsx` |
| Add to activity list | `src/client/modules/activity/components/ActivityList.tsx` |
| Add to notifications | `src/client/components/NotificationDropdown.tsx` |
| Add to API tokens | `src/client/modules/api-tokens/` |

### Verification
- [ ] Users can export their data as JSON
- [ ] Admin can filter users by role/date/status
- [ ] Destructive actions show confirmation
- [ ] Empty lists show helpful message + CTA

---

## Phase 7: Chat Persistence

**Goal:** Save and resume chat conversations
**Effort:** Medium
**Dependencies:** None

### 7.1 Database Schema

| Task | File |
|------|------|
| Create conversations table | `src/server/modules/chat/db/schema.ts` |
| Create messages table | `src/server/modules/chat/db/schema.ts` |
| Generate migration | `drizzle/migrations/` |
| Add to central schema | `src/server/db/schema.ts` |

**Schema:**
```sql
conversations (id, userId, title, model, createdAt, updatedAt)
messages (id, conversationId, role, content, createdAt)
```

### 7.2 API Updates

| Task | File |
|------|------|
| GET /api/chat/conversations | `src/server/modules/chat/routes.ts` |
| POST /api/chat/conversations | `src/server/modules/chat/routes.ts` |
| GET /api/chat/conversations/:id | `src/server/modules/chat/routes.ts` |
| DELETE /api/chat/conversations/:id | `src/server/modules/chat/routes.ts` |
| Save messages on chat completion | `src/server/modules/chat/routes.ts` |

### 7.3 Frontend Updates

| Task | File |
|------|------|
| Create ConversationList sidebar | `src/client/modules/chat/components/ConversationList.tsx` |
| Add conversation selection | `src/client/modules/chat/pages/ChatPage.tsx` |
| Load previous messages | `src/client/modules/chat/hooks/useConversation.ts` |
| Add "New Chat" button | `src/client/modules/chat/pages/ChatPage.tsx` |
| Auto-generate titles | `src/server/modules/chat/routes.ts` |

### Verification
- [ ] Conversations persist across page reloads
- [ ] Sidebar shows conversation history
- [ ] Can switch between conversations
- [ ] Can delete conversations
- [ ] New chat starts fresh

---

## Phase 8: Developer Experience

**Goal:** Improve DX for developers using this starter
**Effort:** Low
**Dependencies:** None

### 8.1 Pre-commit Hooks

| Task | File |
|------|------|
| Install husky | `package.json` |
| Install lint-staged | `package.json` |
| Configure pre-commit | `.husky/pre-commit` |
| Configure lint-staged | `package.json` or `.lintstagedrc` |

**Pre-commit runs:**
- `biome check --apply`
- `tsc --noEmit`

### 8.2 Seed Data Expansion

| Task | File |
|------|------|
| Add activity seed data | `scripts/seed.ts` |
| Add notification seed data | `scripts/seed.ts` |
| Add sample API tokens | `scripts/seed.ts` |
| Add feature flag defaults | `scripts/seed.ts` |

### 8.3 Development Scripts

| Task | File |
|------|------|
| Add reset-db script | `scripts/reset-db.ts` |
| Add create-admin script | `scripts/create-admin.ts` |
| Add generate-token script | `scripts/generate-token.ts` |
| Update package.json scripts | `package.json` |

### 8.4 Documentation Updates

| Task | File |
|------|------|
| Update CLAUDE.md with new features | `CLAUDE.md` |
| Add API documentation | `docs/API.md` |
| Update README with new features | `README.md` |
| Add CHANGELOG.md | `CHANGELOG.md` |

### Verification
- [ ] Pre-commit prevents unformatted code
- [ ] `pnpm db:seed` creates realistic test data
- [ ] Helper scripts work as documented
- [ ] Documentation matches current state

---

## Future Considerations (Not in this plan)

These were identified but deferred:

| Feature | Reason |
|---------|--------|
| Multi-tenancy | Adds significant complexity |
| Additional OAuth providers | Low priority, easy to add later |
| Webhook system | Enterprise feature |
| Background job queue | Requires infrastructure changes |
| User invitation system | Can add in future phase |
| Multi-provider email | Current Resend setup sufficient |

---

## Summary

| Phase | Focus | Effort |
|-------|-------|--------|
| 1 | Quick Wins - Wire existing features | Low |
| 2 | Security Hardening | Low-Medium |
| 3 | Email Verification | Medium |
| 4 | Testing Infrastructure | Medium |
| 5 | Error Tracking | Low-Medium |
| 6 | UX Polish | Low-Medium |
| 7 | Chat Persistence | Medium |
| 8 | Developer Experience | Low |

**Total estimated phases:** 8
**Recommended order:** Sequential (1-8)

Each phase has clear verification criteria and can be completed independently if needed.
