# One-File Tool Definitions

## Core rule

A new agent tool in vite-flare-starter must be definable in a SINGLE location using the `ToolDefinition` contract. Server `execute` + client `render` metadata live in the same object.

Never add a tool by editing a server file AND a separate client file. If that feels necessary, the contract is wrong — fix the contract first.

## Target architecture (post-Phase 0)

Each tool is a `ToolDefinition<Input, Output>` from `src/shared/agent/tool.ts`:

```ts
export const gmailSearch: ToolDefinition<GmailSearchInput, GmailSearchOutput> = {
  name: 'gmail_search',
  description: '...',
  inputSchema: GmailSearchInputSchema,
  outputSchema: GmailSearchOutputSchema,      // REQUIRED, not optional
  isAvailable: (ctx) => ctx.env has gmail scope,
  needsApproval: false,
  execute: async (input, ctx) => { /* server-only code */ },
  render: {                                    // client-side metadata
    icon: Mail,
    displayName: 'Gmail Search',
    summary: (output) => `${output.count} messages`,
    expanded: ({ output, input }) => <GmailSearchCard ... />,
  },
}
```

Registration: add to the domain file's `definitions` export array. One place.

## Why this rule

Tools have dual natures (server executes, client renders). Without a unified shape:
- Duplicate output types (server zod schema + client interface) drift
- Renderers get forgotten → raw JSON dump in the UI
- Per-user `isAvailable` gates get scattered across module-level early returns
- Adding Zod `outputSchema` becomes an optional "Phase A" afterthought instead of a required contract
- Telemetry hooks end up applied inconsistently per tool

The `ToolDefinition` contract makes all of the above enforceable by the type system.

## Current state (transitional)

Until Phase 0 lands, tools are still split:
- `src/server/modules/chat/tools/*.ts` — server-side `tool()` objects
- `src/client/modules/chat/components/tool-renderers/*.tsx` — client renderers

When editing or adding tools in this transitional state:

1. **If Phase 0 is complete** — follow the one-file pattern above
2. **If Phase 0 is in progress** — migrate the domain you're touching into the new shape as part of your change
3. **If Phase 0 hasn't started yet** — still add the tool in both places (server + renderer), BUT:
   - Add `outputSchema` even though it's not required yet (future-proof)
   - Flag in the PR / commit message that Phase 0 would consolidate these
   - Do NOT invent a third shape

## Rendering coverage requirement

Every tool must satisfy at least one of these so it doesn't drop to a
generic-wrench JSON dump in the chat transcript:

1. **`_ui` marker output** — tool returns `{ _ui: 'show_*', ... }` and is
   handled by `client/modules/chat/components/chat-ui/ChatUiElement.tsx`
   or `InputTakeover.tsx`. Suits agent-authored interactive elements.
2. **Output matches a registered shape renderer** in
   `client/modules/chat/components/tool-renderers/shapes.tsx` — stdout/
   stderr/exitCode → terminal block, image URLs → preview, markdown
   bodies → prose, `{rows, columns}` → table. Free rich UX with no
   per-tool client code.
3. **Bespoke domain renderer** registered in
   `client/modules/chat/components/tool-renderers/index.ts` — for
   product-critical UX where generic shapes can't capture the domain
   (Gmail thread, calendar grid, etc.).
4. **At minimum a `render` block** with `icon`, `displayName`, and a
   `summary(output)` string — appears in `defaults.tsx` so the tool
   gets a polished pill even if the body falls to JSON.

Run `pnpm tool-coverage` (script TBD when added) to audit current
state. Aim ≥ 75% rich coverage across the registry.

Brains-trust origin (2026-05-07): three-of-four reviewers converged on
shape renderers as the right architecture over either bulk-bespoke or
universal `_ui`. See `.jez/audits/2026-05-07-tool-ui-and-connectors-
brains-trust.md` for the full reasoning.

## When this rule fires

- Request to "add a new tool"
- Editing a tool renderer separately from its server execute
- Any plan that involves touching 2+ files for one logical tool feature
- Model reports "raw JSON dump" for a tool in the chat UI
- Tool returns an output shape that doesn't match any rendered shape

## Linked plans

- Phase 0 plan: `.jez/artifacts/phase-0-unified-tool-contracts-plan-2026-04-22.md`
- AI SDK standards plan (Phases A-E): `.jez/artifacts/ai-sdk-standards-adoption-plan-2026-04-22.md`

## What this rule is NOT

- Not a prohibition on having shared utilities across tools (helpers like `formatToolDate`, `parseFromHeader` live in `_shared.tsx` and that's fine)
- Not a demand for monolithic tool files — one file per domain (gmail, drive, calendar, search) is good; one file per individual tool would be overkill
- Not a requirement to migrate every existing tool in one commit — the pilot + bulk pattern from the Phase 0 plan is the prescribed approach

**Last Updated**: 2026-04-22
