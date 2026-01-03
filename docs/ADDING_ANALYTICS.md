# Adding Analytics

Guide for implementing custom analytics using Cloudflare Workers Analytics Engine and web analytics.

**Time estimate**: 2-3 hours for basic analytics, 4-6 hours for custom dashboards

---

## Options Overview

| Option | Best For | Cost |
|--------|----------|------|
| **Workers Analytics Engine** | Custom events, server-side | Included with Workers |
| **Cloudflare Web Analytics** | Page views, Core Web Vitals | Free |
| **Both** | Complete picture | Free |

---

## Workers Analytics Engine

Track custom server-side events with SQL-queryable data.

### 1. Create Dataset

```bash
npx wrangler analytics create vite-flare-starter-analytics
```

### 2. Add Binding

```jsonc
// wrangler.jsonc
{
  "analytics_engine_datasets": [
    { "binding": "ANALYTICS", "dataset": "vite-flare-starter-analytics" }
  ]
}
```

### 3. Update Types

```typescript
// src/server/env.d.ts
interface Env {
  ANALYTICS: AnalyticsEngineDataset
}
```

---

## Event Tracking

### Analytics Helper

```typescript
// src/server/lib/analytics.ts

export interface AnalyticsEvent {
  // Indexed fields (up to 20, for filtering/grouping)
  index1?: string  // e.g., event_type
  index2?: string  // e.g., user_id
  index3?: string  // e.g., resource_type
  index4?: string  // e.g., resource_id
  index5?: string  // e.g., action

  // Numeric fields (up to 20, for aggregation)
  double1?: number // e.g., duration_ms
  double2?: number // e.g., count
  double3?: number // e.g., value

  // Blob fields (up to 20, for raw data)
  blob1?: string   // e.g., user_agent
  blob2?: string   // e.g., metadata JSON
}

export function trackEvent(
  analytics: AnalyticsEngineDataset,
  event: AnalyticsEvent
) {
  analytics.writeDataPoint({
    indexes: [
      event.index1 || '',
      event.index2 || '',
      event.index3 || '',
      event.index4 || '',
      event.index5 || '',
    ],
    doubles: [
      event.double1 || 0,
      event.double2 || 0,
      event.double3 || 0,
    ],
    blobs: [
      event.blob1 || '',
      event.blob2 || '',
    ],
  })
}

// Convenience functions
export function trackPageView(
  analytics: AnalyticsEngineDataset,
  data: {
    path: string
    userId?: string
    sessionId?: string
    referrer?: string
    userAgent?: string
  }
) {
  trackEvent(analytics, {
    index1: 'page_view',
    index2: data.userId,
    index3: data.path,
    index4: data.sessionId,
    blob1: data.userAgent,
    blob2: data.referrer,
  })
}

export function trackApiCall(
  analytics: AnalyticsEngineDataset,
  data: {
    endpoint: string
    method: string
    userId?: string
    statusCode: number
    durationMs: number
  }
) {
  trackEvent(analytics, {
    index1: 'api_call',
    index2: data.userId,
    index3: data.endpoint,
    index4: data.method,
    index5: String(data.statusCode),
    double1: data.durationMs,
  })
}

export function trackUserAction(
  analytics: AnalyticsEngineDataset,
  data: {
    action: string
    userId: string
    resourceType?: string
    resourceId?: string
    metadata?: Record<string, unknown>
  }
) {
  trackEvent(analytics, {
    index1: 'user_action',
    index2: data.userId,
    index3: data.action,
    index4: data.resourceType,
    index5: data.resourceId,
    blob2: data.metadata ? JSON.stringify(data.metadata) : undefined,
  })
}

export function trackError(
  analytics: AnalyticsEngineDataset,
  data: {
    errorType: string
    message: string
    userId?: string
    endpoint?: string
    stack?: string
  }
) {
  trackEvent(analytics, {
    index1: 'error',
    index2: data.userId,
    index3: data.errorType,
    index4: data.endpoint,
    blob1: data.message,
    blob2: data.stack,
  })
}
```

---

## Middleware Integration

### API Tracking Middleware

```typescript
// src/server/middleware/analytics.ts
import { createMiddleware } from 'hono/factory'
import { trackApiCall, trackError } from '@/server/lib/analytics'

export const analyticsMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now()
  const path = new URL(c.req.url).pathname
  const method = c.req.method

  try {
    await next()

    const duration = Date.now() - start
    const userId = c.get('userId') // From auth middleware

    if (c.env.ANALYTICS) {
      trackApiCall(c.env.ANALYTICS, {
        endpoint: path,
        method,
        userId,
        statusCode: c.res.status,
        durationMs: duration,
      })
    }
  } catch (error) {
    const duration = Date.now() - start

    if (c.env.ANALYTICS) {
      trackError(c.env.ANALYTICS, {
        errorType: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        userId: c.get('userId'),
        endpoint: path,
        stack: error instanceof Error ? error.stack : undefined,
      })
    }

    throw error
  }
})
```

### Usage

```typescript
// src/server/index.ts
import { analyticsMiddleware } from './middleware/analytics'

// Apply to all API routes
app.use('/api/*', analyticsMiddleware)
```

---

## Track User Actions

```typescript
// In routes
app.post('/api/projects', async (c) => {
  const userId = c.get('userId')
  const { name } = await c.req.json()

  // Create project...
  const project = await createProject(name, userId)

  // Track action
  if (c.env.ANALYTICS) {
    trackUserAction(c.env.ANALYTICS, {
      action: 'create_project',
      userId,
      resourceType: 'project',
      resourceId: project.id,
      metadata: { projectName: name },
    })
  }

  return c.json({ project })
})
```

---

## Querying Analytics

Use the Analytics Engine API to query your data:

```typescript
// src/server/modules/admin/routes.ts
app.get('/analytics/api-calls', adminMiddleware, async (c) => {
  const { startDate, endDate } = c.req.query()

  const query = `
    SELECT
      index3 as endpoint,
      index4 as method,
      COUNT(*) as requests,
      AVG(double1) as avg_duration_ms,
      SUM(CASE WHEN index5 >= '400' THEN 1 ELSE 0 END) as errors
    FROM vite-flare-starter-analytics
    WHERE
      index1 = 'api_call'
      AND timestamp >= '${startDate}'
      AND timestamp <= '${endDate}'
    GROUP BY endpoint, method
    ORDER BY requests DESC
    LIMIT 50
  `

  // Use Cloudflare API to query
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${c.env.CF_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  )

  const data = await response.json()
  return c.json(data)
})
```

---

## Cloudflare Web Analytics

For client-side page views and Core Web Vitals.

### 1. Enable in Dashboard

1. Go to Cloudflare Dashboard → Analytics & Logs → Web Analytics
2. Add your site
3. Copy the beacon script

### 2. Add to HTML

```html
<!-- index.html -->
<head>
  <!-- Cloudflare Web Analytics -->
  <script
    defer
    src="https://static.cloudflareinsights.com/beacon.min.js"
    data-cf-beacon='{"token": "your-token-here"}'
  ></script>
</head>
```

### 3. SPA Page Tracking

For React Router, track virtual page views:

```typescript
// src/client/lib/analytics.ts
export function trackPageView(path: string) {
  // Cloudflare Web Analytics auto-tracks, but for SPAs:
  if (typeof window !== 'undefined' && (window as any).__cfBeacon) {
    // Beacon handles this automatically for history changes
  }

  // Custom tracking if needed
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'page_view', { page_path: path })
  }
}

// Use in router
import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

export function usePageTracking() {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname)
  }, [location.pathname])
}
```

---

## Custom Events (Client-Side)

Track custom frontend events:

```typescript
// src/client/lib/analytics.ts
export async function trackClientEvent(
  eventName: string,
  properties?: Record<string, unknown>
) {
  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ eventName, properties }),
    })
  } catch (error) {
    console.warn('Analytics tracking failed:', error)
  }
}

// Usage
trackClientEvent('button_click', { buttonId: 'signup-cta', page: '/pricing' })
trackClientEvent('feature_used', { feature: 'dark-mode' })
trackClientEvent('form_submitted', { formName: 'contact' })
```

### Server Endpoint

```typescript
// src/server/modules/analytics/routes.ts
app.post('/track', async (c) => {
  const userId = c.get('userId')
  const { eventName, properties } = await c.req.json()

  if (c.env.ANALYTICS) {
    trackUserAction(c.env.ANALYTICS, {
      action: eventName,
      userId: userId || 'anonymous',
      metadata: properties,
    })
  }

  return c.json({ success: true })
})
```

---

## Analytics Dashboard

### Stats Component

```tsx
// src/client/modules/admin/components/AnalyticsDashboard.tsx
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function AnalyticsDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['analytics-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/analytics/stats', { credentials: 'include' })
      return res.json()
    },
  })

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.totalRequests?.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.avgResponseTime}ms</div>
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.errorRate}%</div>
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Active Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.activeUsers}</div>
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </CardContent>
      </Card>
    </div>
  )
}
```

---

## Metrics to Track

### Essential

| Metric | Index Fields | Double Fields |
|--------|--------------|---------------|
| API calls | endpoint, method, status | duration_ms |
| User signups | - | count |
| Errors | error_type, endpoint | - |
| Feature usage | feature_name, user_id | - |

### Growth

| Metric | How to Calculate |
|--------|------------------|
| DAU | Unique user_ids per day |
| MAU | Unique user_ids per month |
| Retention | Users active in week N vs week 0 |
| Churn | Users not active in last 30 days |

### Performance

| Metric | How to Track |
|--------|--------------|
| P50/P95/P99 latency | Percentile of double1 (duration) |
| Error rate | Errors / Total requests |
| Apdex | (Satisfied + Tolerating/2) / Total |

---

## Common Gotchas

### 1. Data Retention

Analytics Engine retains data for 90 days. Export for longer retention.

### 2. Cardinality Limits

Index fields support high cardinality but avoid unbounded values (like full URLs with query params).

### 3. Sampling

At high volume, data may be sampled. Use aggregation queries.

### 4. Privacy

Don't track PII in analytics. Use user IDs, not emails.

---

## Resources

- [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)
- [Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)
- [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/)

---

**Created**: 2026-01-03
**Author**: Jeremy Dawes (Jezweb)
