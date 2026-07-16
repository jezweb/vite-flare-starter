# checkbox

2026-07-16, transformation engine (legacy style `new-york`, classification only; file differed from golden in formatting only). Verdict: 1:1 part mapping with class-attribute renames; element changes from `<button>` to `<span>`.

## Changed

- `src/components/ui/checkbox.tsx` — import swapped to `@base-ui/react/checkbox` (`Root`/`Indicator` names unchanged). Class-mapping rewrites on the root: `data-[state=checked]:` → `data-checked:` (×3, incl. `dark:` variant) and `disabled:cursor-not-allowed disabled:opacity-50` → `data-disabled:*` (Base root renders a `<span>` + hidden `<input>`, so `:disabled` pseudo-class variants are dead code). `peer`, focus-visible ring, and all other classes unchanged.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/checkbox.tsx` → no matches.

## Left alone

- Consumers (inbox rows, InboxPage select-all, CreateSpaceModal, ApiTokensSection, StyleGuidePage, ComponentsPage) — all `onCheckedChange` handlers use the boolean-only shape (`checked === true`, `checked as boolean`) which stays type-safe with Base's `(checked: boolean, eventDetails)` signature. No `checked="indeterminate"` usage exists anywhere.

## Behavior changes

- Rendered element is now `<span role="checkbox">` + always-present hidden `<input>` (radix rendered a `<button>`; hidden input only inside forms). Sibling `peer-disabled:` selectors keyed on the checkbox no longer fire — the migrated `label.tsx` already carries `peer-data-disabled:*` equivalents.
- Indeterminate is a separate `indeterminate` prop in Base (no longer a `checked` value) — unused in this app, so no call-site impact.

## Verify by hand

1. Inbox: row checkboxes + header select-all toggle correctly; check mark renders.
2. StyleGuide checkbox section: disabled checkbox is dimmed with not-allowed cursor; keyboard (Tab + Space) toggles the enabled one; focus ring visible.
