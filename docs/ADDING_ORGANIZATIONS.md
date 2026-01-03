# Adding Multi-Tenant Organizations

Guide for adding better-auth's organization plugin to vite-flare-starter when you need team collaboration or B2B SaaS features.

**Time estimate**: 2-4 hours for basic setup, 4-8 hours with full features

---

## When to Add Organizations

**Add this plugin when:**
- Multiple users need to share data (team workspaces)
- B2B SaaS with companies as customers
- White-label products requiring tenant isolation
- Enterprise SSO with automatic org provisioning

**Don't add if:**
- Single-user app (personal tools, dashboards)
- Users don't collaborate or share resources
- You just need user roles (use existing `role` field instead)

---

## What You Get

| Feature | Description |
|---------|-------------|
| **Organizations** | Create, update, delete workspaces |
| **Members** | Invite users, assign roles (owner/admin/member) |
| **Invitations** | Email-based invites with expiration |
| **Active Org** | Session tracks current workspace |
| **Teams** | Optional sub-groups within orgs |
| **Permissions** | Role-based access control |

---

## Installation

### 1. Install Package

```bash
pnpm add @better-auth/organization
```

### 2. Generate Schema

```bash
npx @better-auth/cli generate --config ./src/server/modules/auth/index.ts
```

This adds tables: `organization`, `member`, `invitation` (and optionally `team`, `teamMember`).

### 3. Run Migration

```bash
pnpm db:migrate:local
pnpm db:migrate:remote
```

---

## Server Configuration

Update `src/server/modules/auth/index.ts`:

```typescript
import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'

export const auth = betterAuth({
  // ... existing config

  plugins: [
    organization({
      // Allow any authenticated user to create orgs
      allowUserToCreateOrganization: true,

      // Or restrict to specific conditions
      // allowUserToCreateOrganization: async (user) => {
      //   return user.role === 'admin' || user.emailVerified
      // },

      // Limits
      organizationLimit: 5,        // Max orgs per user
      membershipLimit: 100,        // Max members per org

      // Invitation settings
      invitationExpiresIn: 48 * 60 * 60, // 48 hours in seconds

      // Email handler (required for invitations)
      sendInvitationEmail: async ({ email, inviter, organization, url }) => {
        // Use your email service (Resend is already configured)
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)

        await resend.emails.send({
          from: 'noreply@yourdomain.com',
          to: email,
          subject: `Join ${organization.name} on YourApp`,
          html: `
            <p>${inviter.name} invited you to join ${organization.name}.</p>
            <a href="${url}">Accept Invitation</a>
            <p>This invitation expires in 48 hours.</p>
          `,
        })
      },

      // Optional: Teams feature
      // teams: {
      //   enabled: true,
      //   maximumTeams: 10,
      // },
    }),
  ],
})
```

---

## Client Configuration

Update `src/client/lib/auth.ts`:

```typescript
import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || '',
  plugins: [
    organizationClient(),
  ],
})

// Export organization hooks
export const {
  useSession,
  useListOrganizations,
  useActiveOrganization,
} = authClient
```

---

## Database Schema

The plugin creates these tables (auto-generated):

```sql
-- organizations
CREATE TABLE organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo TEXT,
  metadata TEXT,
  createdAt INTEGER NOT NULL
);

-- members (join table)
CREATE TABLE member (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt INTEGER NOT NULL,
  UNIQUE(userId, organizationId)
);

-- invitations
CREATE TABLE invitation (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  inviterId TEXT NOT NULL REFERENCES user(id),
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);
```

---

## API Endpoints (Auto-Created)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/organization/create` | Create organization |
| GET | `/api/auth/organization/list` | List user's organizations |
| GET | `/api/auth/organization/get-full` | Get org with members |
| PATCH | `/api/auth/organization/update` | Update organization |
| DELETE | `/api/auth/organization/delete` | Delete organization |
| POST | `/api/auth/organization/set-active` | Set active org |
| POST | `/api/auth/organization/invite-member` | Send invitation |
| POST | `/api/auth/organization/accept-invitation` | Accept invite |
| POST | `/api/auth/organization/remove-member` | Remove member |
| PATCH | `/api/auth/organization/update-member-role` | Change role |

---

## Usage Examples

### Create Organization

```typescript
const { data, error } = await authClient.organization.create({
  name: 'Acme Corp',
  slug: 'acme-corp',
  logo: 'https://...',
})
```

### List User's Organizations

```typescript
// Hook (reactive)
const { data: orgs, isLoading } = useListOrganizations()

// Or direct call
const { data } = await authClient.organization.list()
```

### Set Active Organization

```typescript
await authClient.organization.setActive({
  organizationId: 'org_123',
})

// Now session includes activeOrganizationId
const session = await authClient.getSession()
console.log(session.session.activeOrganizationId)
```

### Invite Member

```typescript
await authClient.organization.inviteMember({
  organizationId: 'org_123',
  email: 'newuser@example.com',
  role: 'member', // or 'admin'
})
```

### Check Permissions

```typescript
const { data: hasPermission } = await authClient.organization.hasPermission({
  permission: 'member:delete',
})

if (!hasPermission) {
  throw new Error('Not authorized')
}
```

---

## Middleware Pattern

Create `src/server/middleware/organization.ts`:

```typescript
import { createMiddleware } from 'hono/factory'
import type { AuthContext } from './auth'

export type OrgContext = AuthContext & {
  Variables: {
    organizationId: string
    organizationRole: 'owner' | 'admin' | 'member'
  }
}

/**
 * Requires active organization in session
 */
export const requireOrganization = createMiddleware<OrgContext>(async (c, next) => {
  const session = c.get('session')

  if (!session?.activeOrganizationId) {
    return c.json({ error: 'No active organization' }, 400)
  }

  // Get member role from database
  const db = drizzle(c.env.DB)
  const member = await db
    .select()
    .from(memberTable)
    .where(
      and(
        eq(memberTable.userId, c.get('userId')),
        eq(memberTable.organizationId, session.activeOrganizationId)
      )
    )
    .get()

  if (!member) {
    return c.json({ error: 'Not a member of this organization' }, 403)
  }

  c.set('organizationId', session.activeOrganizationId)
  c.set('organizationRole', member.role as 'owner' | 'admin' | 'member')

  await next()
})

/**
 * Requires specific org roles
 */
export function requireOrgRole(...roles: ('owner' | 'admin' | 'member')[]) {
  return createMiddleware<OrgContext>(async (c, next) => {
    const role = c.get('organizationRole')

    if (!roles.includes(role)) {
      return c.json({ error: 'Insufficient permissions' }, 403)
    }

    await next()
  })
}
```

### Using in Routes

```typescript
import { authMiddleware } from '@/server/middleware/auth'
import { requireOrganization, requireOrgRole } from '@/server/middleware/organization'

const app = new Hono()

// All routes require auth + active org
app.use('*', authMiddleware)
app.use('*', requireOrganization)

// List projects (any member)
app.get('/projects', async (c) => {
  const orgId = c.get('organizationId')
  // Query projects for this org
})

// Delete project (owner/admin only)
app.delete('/projects/:id', requireOrgRole('owner', 'admin'), async (c) => {
  // Only owners and admins can delete
})
```

---

## Scoping Data to Organizations

### Schema Pattern

Add `organizationId` to your data tables:

```typescript
// src/server/modules/projects/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { organization } from '@/server/modules/auth/db/schema'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organizationId')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // ... other fields
})
```

### Query Pattern

Always filter by `organizationId`:

```typescript
app.get('/projects', async (c) => {
  const orgId = c.get('organizationId')

  const results = await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, orgId))

  return c.json(results)
})
```

---

## Enterprise SSO Integration

For Google Workspace / SAML automatic org provisioning, combine with SSO plugin:

```typescript
import { organization } from 'better-auth/plugins'
import { sso } from '@better-auth/sso'

export const auth = betterAuth({
  plugins: [
    organization(),
    sso({
      // Domain-based organization linking
      organizationProvisioning: {
        enabled: true,
        getRole: async ({ user, provider }) => {
          // Assign roles based on IdP claims
          if (user.department === 'Engineering') return 'admin'
          return 'member'
        },
      },
    }),
  ],
})
```

See [SSO Plugin Docs](https://www.better-auth.com/docs/plugins/sso) for full enterprise setup.

---

## Common Gotchas

### 1. Active Organization Not Set on Login

The plugin doesn't auto-set active org on signin. Handle with database hooks:

```typescript
// In auth config
databaseHooks: {
  session: {
    create: {
      after: async (session) => {
        // Find user's first org and set as active
        const membership = await db
          .select()
          .from(member)
          .where(eq(member.userId, session.userId))
          .limit(1)
          .get()

        if (membership) {
          await db
            .update(sessionTable)
            .set({ activeOrganizationId: membership.organizationId })
            .where(eq(sessionTable.id, session.id))
        }
      },
    },
  },
},
```

### 2. Email Delivery Required

Invitations won't work without implementing `sendInvitationEmail`. Use Resend (already in vite-flare-starter deps).

### 3. Session Headers vs userId

From the docs: "The `userId` and session headers cannot be used together" - when passing session headers, `userId` is silently ignored.

### 4. Client-Side Permission Checks

`checkRolePermission()` on client doesn't include dynamic roles. Always verify permissions server-side for sensitive operations.

---

## Migration from Single-User

If your app has existing user data:

1. Create a "Personal" organization for each user
2. Migrate their data to be org-scoped
3. Set the personal org as their active org

```typescript
// Migration script
for (const user of existingUsers) {
  // Create personal org
  const org = await db.insert(organization).values({
    id: crypto.randomUUID(),
    name: `${user.name}'s Workspace`,
    slug: `personal-${user.id}`,
    createdAt: new Date(),
  }).returning().get()

  // Add user as owner
  await db.insert(member).values({
    id: crypto.randomUUID(),
    userId: user.id,
    organizationId: org.id,
    role: 'owner',
    createdAt: new Date(),
  })

  // Migrate their data
  await db
    .update(projects)
    .set({ organizationId: org.id })
    .where(eq(projects.userId, user.id))
}
```

---

## Resources

- [better-auth Organization Plugin](https://www.better-auth.com/docs/plugins/organization)
- [better-auth SSO Plugin](https://www.better-auth.com/docs/plugins/sso) (for enterprise)
- [ZenStack + better-auth Multi-Tenant Guide](https://zenstack.dev/blog/better-auth)
- [better-auth CLI Reference](https://www.better-auth.com/docs/concepts/cli)

---

**Created**: 2026-01-03
**Author**: Jeremy Dawes (Jezweb)
