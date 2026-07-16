# toggle-group

2026-07-16, transformation engine (legacy style `new-york`, classification only — file is CUSTOMIZED: `spacing` prop + context). Verdict: group → callable `ToggleGroup` primitive, items → `Toggle` primitive; 6 consumer files moved to the always-array value model; toggle.tsx transitional dual-cva stripped in the same commit.

## Changed

- `src/components/ui/toggle-group.tsx` — imports → `@base-ui/react/toggle-group` (callable, no `.Root`) + `@base-ui/react/toggle` (items ARE the Toggle primitive in Base UI). Our `ToggleGroupContext` (variant/size/spacing), the `--gap` CSS var, and all class strings kept verbatim — items compose `toggleVariants` exactly as before. `type="single"|"multiple"` prop replaced by Base UI's `multiple` boolean (via passthrough props); `value`/`defaultValue`/`onValueChange` are now always arrays.
- `src/components/ui/toggle.tsx` — **transitional dual cva resolved**: removed `data-[state=on]:bg-accent data-[state=on]:text-accent-foreground` (radix hook kept only while toggle-group was radix) leaving `data-pressed:*` as the single pressed-state hook; removed the TRANSITIONAL comment block.
- Consumer call-sites (all 6, same pattern — drop `type="single"`, wrap value in array, destructure array in handler):
  - `src/components/chart-area-interactive.tsx:173` — `value={[timeRange]}`, `onValueChange={([value]) => value && setTimeRange(value)}` (guard added: deselecting the pressed item yields `[]`).
  - `src/client/modules/_template/pages/CatalogPage.tsx:106`
  - `src/client/modules/agent-observability/pages/AgentObservabilityPage.tsx:109`
  - `src/client/modules/knowledge/pages/KnowledgePage.tsx:160`
  - `src/client/modules/skills/pages/SkillsPage.tsx:184`
  - `src/client/pages/StyleGuidePage.tsx:779` (single) and `:795` — `type="multiple"` → `multiple`.

Leftover scan: `grep -n "radix-ui\|@radix-ui"` clean on toggle-group.tsx + toggle.tsx; `grep -rn "data-\[state=on\]" src/` → zero matches repo-wide.

## Left alone

- `src/components/ui/toggle.tsx` beyond the cva cleanup (already migrated in batch 1).

## Behavior changes

- Single-mode empty state signals as `[]` instead of radix's `""` — every consumer already guarded falsy values (`v && set…`), so pressed-state can never be fully cleared in app UX, same as before.
- `rovingFocus` opt-out no longer exists (roving focus always on) — was never used.
- Radix `loop` → `loopFocus` (default true both) — not used.
- Per-item `onPressedChange` is now available (items are real Toggles) — new capability, unused.

## Verify by hand

1. Dashboard chart card (wide viewport): click "Last 30 days" — chart range updates, pill shows pressed styling; click the pressed pill again — nothing breaks (guard swallows deselect).
2. Skills page cards/list toggle: switch views both ways; pressed state follows; keyboard arrows move focus between the two items.
3. StyleGuide: single-select alignment group keeps exactly one pressed; multiple-select formatting group allows independent toggling.
4. Outline variant borders: adjacent items share borders (spacing=0 classes) with rounded outer corners only.
