# Source Code

This directory contains all application source code, split into client and server.

## Structure

```
src/
├── client/          # Frontend (React SPA)
│   ├── main.tsx    # App entry point
│   ├── App.tsx     # Router setup
│   ├── index.css   # Tailwind imports
│   ├── components/ # Shared UI components
│   ├── lib/        # Shared utilities
│   └── modules/    # Feature modules
│
└── server/          # Backend (Hono Worker)
    ├── index.ts    # Main worker entry point
    ├── lib/        # Shared utilities
    ├── middleware/ # Hono middleware
    └── modules/    # Feature modules (backend)
```

## Client Architecture

The client is a React SPA built with Vite. All code runs in the browser.

### Modules
Each feature module contains:
- `components/` - React components
- `hooks/` - Custom hooks (TanStack Query)
- `schemas/` - Zod validation schemas
- `pages/` - Route components
- `types/` - TypeScript types

## Server Architecture

The server is a Hono application running on Cloudflare Workers.

### Modules
Each feature module contains:
- `routes.ts` - Hono route handlers
- `schemas/` - Shared Zod schemas (same as client)
- `db/` - Database schema (Drizzle)

## Module List

1. **auth** - Authentication (better-auth)
2. **dashboard** - Main layout and navigation
3. **todos** - Example CRUD module
4. **categories** - Supporting module for todos
5. **settings** - User preferences
6. **agents** - AI Agents SDK example (Durable Objects)
7. **workflows** - Background tasks example (Cloudflare Workflows)
