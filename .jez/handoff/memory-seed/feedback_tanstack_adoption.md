---
name: TanStack adoption strategy
description: Keep Query + Table, don't adopt Router/Start/Form. Add optimistic updates + prefetching incrementally.
type: feedback
originSessionId: 81a9b605-104d-47c6-90ea-95d42d80f379
---
TanStack adoption for vite-flare-starter and forks:

**Use:** Query (data fetching), Table (headless tables)
**Don't switch to:** Router (React Router works), Start (Vite+Hono+CF is more proven), Form (React Hook Form + Zod works)
**Add incrementally:** Optimistic updates on mutations, prefetchQuery on hover/focus

**Why:** Migration cost of Router/Start/Form isn't worth it mid-project. Evaluate Router for next greenfield starter.

**How to apply:** When building CRUD features, use optimistic updates for toggle/delete/reorder operations. Use prefetchQuery for route transitions.

Confirmed by Jez 2026-04-15.
