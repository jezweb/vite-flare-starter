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

## When this rule fires

- Request to "add a new tool"
- Editing a tool renderer separately from its server execute
- Any plan that involves touching 2+ files for one logical tool feature
- Model reports "raw JSON dump" for a tool in the chat UI

## Linked plans

- Phase 0 plan: `.jez/artifacts/phase-0-unified-tool-contracts-plan-2026-04-22.md`
- AI SDK standards plan (Phases A-E): `.jez/artifacts/ai-sdk-standards-adoption-plan-2026-04-22.md`

## What this rule is NOT

- Not a prohibition on having shared utilities across tools (helpers like `formatToolDate`, `parseFromHeader` live in `_shared.tsx` and that's fine)
- Not a demand for monolithic tool files — one file per domain (gmail, drive, calendar, search) is good; one file per individual tool would be overkill
- Not a requirement to migrate every existing tool in one commit — the pilot + bulk pattern from the Phase 0 plan is the prescribed approach

**Last Updated**: 2026-04-22
