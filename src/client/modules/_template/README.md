# Module Template

Reference module for new pages. **Copy this directory** as the starting
point for any new module so the page-grammar contract lands by default
instead of being re-derived.

```bash
cp -r src/client/modules/_template src/client/modules/<your-module>
```

Then:

1. Rename the page component(s) to your module's name
2. Wire the new route in `src/client/App.tsx`
3. Add a nav entry in `src/shared/config/nav.ts`
4. Write your hook(s) in `hooks/use<ThingName>.ts` calling your API endpoints
5. Replace the empty-state copy with something matching your domain

The included files demonstrate three list-page variants plus a detail
page. Pick the one that fits your domain and drop the others:

| File | When to copy |
|---|---|
| `pages/IndexPage.tsx` | "Queue" — text-dominant, scan top-to-bottom (Inbox-style) |
| `pages/CatalogPage.tsx` | "Find-and-act" — 5–30 visual/logo-y items, cards default with list toggle |
| `pages/TablePage.tsx` | "Structured rows" — sort + filter + pagination, 50+ items |
| `pages/DetailPage.tsx` | The detail view paired with any of the above |

If you need more than one list shape (e.g. a CRM with a Contacts table
AND a Tags catalog), copy each scaffold separately into its own module.

See the layout decision table in `CLAUDE.md` for the full picker.

## What's enforced by the template

- `<PageContainer type="…">` outer wrapper picks max-width from page type
- `<PageHeader>` sets document.title + H1 + subtitle in user voice
- `<DetailHeader>` for detail pages — back-link + name + actions cluster
- `<EmptyState>` with icon + title + description + tips + action — never an empty list
- `<PageLoading variant="list" />` skeleton matches the loaded body shape
- Vocabulary template — subtitle leads with a verb in the user's voice
- TanStack Query hook shape — `useThing()`, `useCreateThing()` patterns

## What's NOT in the template

- Auth gating — handled at the layout level (`ProtectedRoute`)
- Feature flags — added per-route in App.tsx + nav.ts
- Backend route — write your Hono module separately

See `docs/PAGE_GRAMMAR.md` for the full contract and
`docs/PRIMITIVES.md` for the decision tree of which primitive to use.
