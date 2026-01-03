# Adding Payments with Stripe

Guide for integrating Stripe subscriptions, one-time payments, and billing management into vite-flare-starter.

**Time estimate**: 4-6 hours for subscriptions, 2-3 hours for one-time payments

---

## When to Add Payments

**Add Stripe when:**
- SaaS with subscription tiers
- One-time purchases or credits
- Usage-based billing
- Marketplace with payouts

**Consider alternatives:**
- Paddle/Lemon Squeezy for tax handling (merchant of record)
- Stripe is best for control and flexibility

---

## What You'll Build

| Feature | Description |
|---------|-------------|
| **Subscriptions** | Monthly/yearly plans with trials |
| **Customer Portal** | Self-service billing management |
| **Webhooks** | Sync subscription status to DB |
| **Usage Metering** | Optional usage-based billing |

---

## Installation

### 1. Install Stripe SDK

```bash
pnpm add stripe
```

### 2. Create Stripe Account

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Create products and prices in the dashboard
3. Get API keys (use test keys for development)

### 3. Set Secrets

```bash
# Stripe secret key
echo "sk_test_..." | npx wrangler secret put STRIPE_SECRET_KEY

# Webhook signing secret (create webhook first)
echo "whsec_..." | npx wrangler secret put STRIPE_WEBHOOK_SECRET

# Redeploy
npx wrangler deploy
```

### 4. Add to Env Types

```typescript
// src/server/env.d.ts or wrangler.jsonc types
interface Env {
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
}
```

---

## Database Schema

Add subscription tracking to your schema:

```typescript
// src/server/modules/billing/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),

  // Stripe IDs
  stripeCustomerId: text('stripeCustomerId').notNull(),
  stripeSubscriptionId: text('stripeSubscriptionId'),
  stripePriceId: text('stripePriceId'),

  // Status
  status: text('status').notNull().default('inactive'), // active, canceled, past_due, trialing
  plan: text('plan').notNull().default('free'), // free, pro, enterprise

  // Billing period
  currentPeriodStart: integer('currentPeriodStart', { mode: 'timestamp' }),
  currentPeriodEnd: integer('currentPeriodEnd', { mode: 'timestamp' }),
  cancelAtPeriodEnd: integer('cancelAtPeriodEnd', { mode: 'boolean' }).default(false),

  // Timestamps
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// Add to central schema exports
// src/server/db/schema.ts
export { subscriptions } from '@/server/modules/billing/db/schema'
```

Generate and run migration:

```bash
pnpm db:generate:named "add-subscriptions"
pnpm db:migrate:local
pnpm db:migrate:remote
```

---

## Stripe Client

Create a Stripe helper:

```typescript
// src/server/lib/stripe.ts
import Stripe from 'stripe'

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia',
    typescript: true,
  })
}

// Price IDs from your Stripe dashboard
export const PRICE_IDS = {
  pro_monthly: 'price_xxx',
  pro_yearly: 'price_xxx',
  enterprise_monthly: 'price_xxx',
  enterprise_yearly: 'price_xxx',
} as const

export const PLAN_FEATURES = {
  free: {
    name: 'Free',
    projects: 3,
    storage: '100MB',
    support: 'Community',
  },
  pro: {
    name: 'Pro',
    projects: 20,
    storage: '10GB',
    support: 'Email',
  },
  enterprise: {
    name: 'Enterprise',
    projects: 'Unlimited',
    storage: '100GB',
    support: 'Priority',
  },
} as const
```

---

## Billing Routes

```typescript
// src/server/modules/billing/routes.ts
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { createStripeClient, PRICE_IDS } from '@/server/lib/stripe'
import { subscriptions } from './db/schema'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

// Get current subscription
app.get('/', async (c) => {
  const db = drizzle(c.env.DB)
  const userId = c.get('userId')

  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get()

  return c.json({
    subscription: subscription || { plan: 'free', status: 'active' },
  })
})

// Create checkout session
app.post('/checkout', async (c) => {
  const db = drizzle(c.env.DB)
  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY)
  const userId = c.get('userId')
  const user = c.get('user')

  const { priceId, successUrl, cancelUrl } = await c.req.json<{
    priceId: string
    successUrl: string
    cancelUrl: string
  }>()

  // Get or create Stripe customer
  let subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get()

  let customerId = subscription?.stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId },
    })
    customerId = customer.id

    // Create subscription record
    await db.insert(subscriptions).values({
      userId,
      stripeCustomerId: customerId,
      status: 'inactive',
      plan: 'free',
    })
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: { userId },
    },
  })

  return c.json({ url: session.url })
})

// Create customer portal session
app.post('/portal', async (c) => {
  const db = drizzle(c.env.DB)
  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY)
  const userId = c.get('userId')

  const { returnUrl } = await c.req.json<{ returnUrl: string }>()

  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get()

  if (!subscription?.stripeCustomerId) {
    return c.json({ error: 'No billing account found' }, 400)
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
  })

  return c.json({ url: session.url })
})

export default app
```

Register in main app:

```typescript
// src/server/index.ts
import billingRoutes from './modules/billing/routes'

app.route('/api/billing', billingRoutes)
```

---

## Webhook Handler

**Critical**: Webhooks sync Stripe events to your database.

```typescript
// src/server/modules/billing/webhook.ts
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import Stripe from 'stripe'
import { createStripeClient } from '@/server/lib/stripe'
import { subscriptions } from './db/schema'

const app = new Hono<{ Bindings: Env }>()

app.post('/webhook', async (c) => {
  const stripe = createStripeClient(c.env.STRIPE_SECRET_KEY)
  const db = drizzle(c.env.DB)

  // Get raw body for signature verification
  const body = await c.req.text()
  const signature = c.req.header('stripe-signature')

  if (!signature) {
    return c.json({ error: 'Missing signature' }, 400)
  }

  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return c.json({ error: 'Invalid signature' }, 400)
  }

  // Handle events
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const subscriptionId = session.subscription as string
      const customerId = session.customer as string

      // Get subscription details
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      const priceId = sub.items.data[0]?.price.id
      const plan = getPlanFromPriceId(priceId)

      await db
        .update(subscriptions)
        .set({
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
          status: 'active',
          plan,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeCustomerId, customerId))

      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string
      const priceId = sub.items.data[0]?.price.id
      const plan = getPlanFromPriceId(priceId)

      await db
        .update(subscriptions)
        .set({
          stripePriceId: priceId,
          status: sub.status,
          plan,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeCustomerId, customerId))

      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string

      await db
        .update(subscriptions)
        .set({
          status: 'canceled',
          plan: 'free',
          stripeSubscriptionId: null,
          stripePriceId: null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeCustomerId, customerId))

      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string

      await db
        .update(subscriptions)
        .set({
          status: 'past_due',
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeCustomerId, customerId))

      // TODO: Send email notification
      break
    }
  }

  return c.json({ received: true })
})

function getPlanFromPriceId(priceId: string): string {
  if (priceId.includes('enterprise')) return 'enterprise'
  if (priceId.includes('pro')) return 'pro'
  return 'free'
}

export default app
```

Register webhook route (no auth middleware):

```typescript
// src/server/index.ts
import webhookRoutes from './modules/billing/webhook'

// Webhook route - no auth, Stripe signature verification instead
app.route('/api/stripe', webhookRoutes)
```

---

## Client Integration

### Subscription Hook

```typescript
// src/client/modules/billing/hooks/useSubscription.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useSubscription() {
  return useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await fetch('/api/billing', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch subscription')
      return res.json()
    },
  })
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (priceId: string) => {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          priceId,
          successUrl: `${window.location.origin}/settings/billing?success=true`,
          cancelUrl: `${window.location.origin}/settings/billing?canceled=true`,
        }),
      })
      if (!res.ok) throw new Error('Failed to create checkout')
      return res.json()
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url
      }
    },
  })
}

export function useCustomerPortal() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/settings/billing`,
        }),
      })
      if (!res.ok) throw new Error('Failed to create portal session')
      return res.json()
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url
      }
    },
  })
}
```

### Pricing Component

```tsx
// src/client/modules/billing/components/PricingTable.tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCheckout, useSubscription } from '../hooks/useSubscription'
import { PRICE_IDS, PLAN_FEATURES } from '@/shared/config/plans'

export function PricingTable() {
  const { data } = useSubscription()
  const checkout = useCheckout()
  const currentPlan = data?.subscription?.plan || 'free'

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {Object.entries(PLAN_FEATURES).map(([key, plan]) => (
        <Card key={key} className={currentPlan === key ? 'border-primary' : ''}>
          <CardHeader>
            <CardTitle>{plan.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>{plan.projects} projects</li>
              <li>{plan.storage} storage</li>
              <li>{plan.support} support</li>
            </ul>
            {key !== 'free' && currentPlan !== key && (
              <Button
                className="mt-4 w-full"
                onClick={() => checkout.mutate(PRICE_IDS[`${key}_monthly`])}
                disabled={checkout.isPending}
              >
                {checkout.isPending ? 'Loading...' : `Upgrade to ${plan.name}`}
              </Button>
            )}
            {currentPlan === key && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Current plan
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

---

## Stripe Webhook Setup

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-app.workers.dev/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

### Local Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:5173/api/stripe/webhook

# Copy the webhook signing secret it displays
```

---

## Feature Gating

Check subscription in middleware:

```typescript
// src/server/middleware/subscription.ts
import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { subscriptions } from '@/server/modules/billing/db/schema'
import type { AuthContext } from './auth'

export function requirePlan(...allowedPlans: string[]) {
  return createMiddleware<AuthContext>(async (c, next) => {
    const db = drizzle(c.env.DB)
    const userId = c.get('userId')

    const subscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .get()

    const plan = subscription?.plan || 'free'

    if (!allowedPlans.includes(plan)) {
      return c.json({
        error: 'Upgrade required',
        currentPlan: plan,
        requiredPlans: allowedPlans,
      }, 403)
    }

    await next()
  })
}
```

Usage:

```typescript
// Only pro and enterprise users
app.post('/api/advanced-feature', requirePlan('pro', 'enterprise'), async (c) => {
  // ...
})
```

---

## Common Gotchas

### 1. Webhook Signature Verification

Always verify signatures. Never trust webhook data without verification.

### 2. Idempotency

Stripe may send the same webhook multiple times. Make your handlers idempotent:

```typescript
// Check if already processed
const existing = await db
  .select()
  .from(webhookEvents)
  .where(eq(webhookEvents.stripeEventId, event.id))
  .get()

if (existing) {
  return c.json({ received: true, skipped: true })
}

// Process and record
await db.insert(webhookEvents).values({ stripeEventId: event.id })
```

### 3. Test vs Live Mode

Use separate webhook endpoints or check `event.livemode`:

```typescript
if (!event.livemode && c.env.ENVIRONMENT === 'production') {
  console.warn('Received test event in production')
  return c.json({ received: true, skipped: true })
}
```

### 4. Customer Portal

Always use Stripe's customer portal for billing management. Don't build your own card update forms.

---

## Resources

- [Stripe Docs](https://stripe.com/docs)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Stripe Checkout](https://stripe.com/docs/checkout)
- [Customer Portal](https://stripe.com/docs/customer-management)

---

**Created**: 2026-01-03
**Author**: Jeremy Dawes (Jezweb)
