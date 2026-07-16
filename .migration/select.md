# select

2026-07-16, transformation engine (legacy style `new-york`, classification only — CUSTOMIZED: `size` prop, `align='center'`/`position='item-aligned'` defaults). Verdict: Content → Portal>Positioner>Popup with `alignItemWithTrigger`, Viewport → List, scroll buttons → arrows; 10 consumer files fixed for the `string | null` onValueChange widening; wrapper-level `items` derivation preserves radix trigger-label behavior.

## Changed

- `src/components/ui/select.tsx` — import `radix-ui` → `@base-ui/react/select`.
  - **`Select` root — items derivation (the important decision).** Base UI's `Select.Value` renders the RAW VALUE unless the Root gets an `items` map (verified in `SelectValue.js` → `resolveSelectedLabel`); radix rendered the selected item's ItemText JSX. Rather than touch every `<SelectValue />` consumer or duplicate labels into per-file `items` maps, the wrapper walks its JSX children and derives `items` from any element carrying string/number `value` + `children` (also sees through thin wrappers like `PromptInputSelectItem`/`CodeBlockLanguageSelectorItem`). Explicit `items` prop skips derivation; explicit `SelectValue` children (ModelSelector does this) take precedence in Base UI anyway. Wrapper stays generic (`<Value, Multiple>`) since `Root.Props` is generic.
  - `SelectContent`: Portal > Positioner (`isolate z-50`; forwards `side`/`sideOffset=4`/`align='center'`/`alignOffset`/`alignItemWithTrigger=true` — positioner FORWARD rule) > Popup (keeps our classes; vars → `--available-height`/`--transform-origin`; `data-[state=…]` → `data-open:`/`data-closed:`; added `data-[align-trigger=true]:animate-none` per the base golden so item-aligned open doesn't zoom; radix `position` prop dropped — default was `item-aligned`, which maps to `alignItemWithTrigger` default true). Scroll arrows + `List` (carries our old Viewport `p-1`) now nest inside Popup.
  - `SelectItem`: ItemText FIRST then `ItemIndicator render={<span/>}` (wrapper-shapes anatomy). ItemText is now a `<div>` (was `<span>` in radix), so the old `*:[span]:last:flex …` selector hack — which targeted the ItemText span — was replaced by explicit `flex items-center gap-2 whitespace-nowrap` on ItemText itself; indicator span keeps our `absolute right-2 size-3.5` classes via `render`.
  - `SelectTrigger`: `Icon asChild` → `Icon render={…}`; classes unchanged (`data-[placeholder]:` still fires — Base UI emits `data-placeholder`).
  - `SelectScrollUp/DownButton` → `ScrollUp/DownArrow` + golden positioning additions (`top-0`/`bottom-0 z-10 w-full bg-popover` — Base UI arrows overlay the list).
  - `SelectLabel` → `GroupLabel` (all app usages of SelectLabel sit inside SelectGroup — checked; unlike the menus, no floating-label problem).
- Consumer fixes — `onValueChange` widens to `(value: string | null, eventDetails)`, breaking `Dispatch<SetStateAction<string>>`-style handlers; guarded with `v != null &&`: chart-area-interactive.tsx, CsvImportWizard.tsx (`!v ||` fold into skip-branch), ActivityPage.tsx, EmailLogsTabContent.tsx (×3), UsersTabContent.tsx, FilesPage.tsx, PreferencesSection.tsx (timezone), ModelSelector.tsx. Null can only fire from a null-valued item (none exist), so guards are inert safety.
- Remaining 9 consumer files (ExtractPage, ChatPreferencesSection, OrganizationSection, InviteMemberDialog, KnowledgeDetailPage, NewRoutinePage, UserEditDialog, StyleGuidePage, ComponentsPage, code-block, prompt-input) needed no edits — handlers/types already compatible; labels flow through the derived `items`.

Leftover scan: `grep -n "radix-ui|@radix-ui|position="` clean on select.tsx; no `position="popper"` existed anywhere in src/.

## Left alone

- `native-select.tsx` (plain `<select>`), `combobox.tsx` (cmdk-adjacent) — not radix Select.

## Behavior changes

- **Trigger label source**: derived from the JSX item map instead of radix's live ItemText mirror. If a fork renders items through a component that hides `value`/`children` behind computed props, the trigger will show the raw value — pass `items` to `Select` or children to `SelectValue` there.
- Item-aligned mode is now Base UI's implementation (overlaps trigger, auto-falls back to popper positioning when space is tight or on touch — radix never auto-switched).
- `onValueChange` may deliver `null` (cleared value) — all consumers guard it.
- Typeahead now matches on Base UI's `label` (from items/text content) — radix used `textValue`/text content; no consumer set `textValue`.
- Keyboard: Base UI opens on ArrowDown/Up/Enter/Space like radix; item focus loops.

## Verify by hand

1. Chat input model selector: trigger shows model NAME + cost dots (custom SelectValue children); popup groups by provider; selecting updates and persists.
2. Dashboard chart card (narrow viewport): time-range select trigger shows "Last 3 months" (label, NOT `90d` — this proves the items derivation); open — selected item aligns over the trigger with a check mark on the right.
3. Settings → Preferences timezone select: long list scrolls, scroll arrows appear top/bottom with popover background, typeahead ("syd") jumps to Sydney.
4. Admin → Email logs filters: template/status selects filter and show labels.
5. CSV import wizard mapping row: "— Skip —" placeholder select still maps/skips columns.
