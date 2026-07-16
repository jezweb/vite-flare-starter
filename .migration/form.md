# form

2026-07-16, transformation engine (react-hook-form composition wrapper — not the radix Form primitive; only its Slot + Label types were radix). Verdict: FormControl reimplemented on `useRender` + `mergeProps`, public API fully stable; zero consumer edits.

## Changed

- `src/components/ui/form.tsx`:
  - `FormControl`: radix `Slot.Root` → Base UI `useRender` + `mergeProps` (`@base-ui/react/use-render`, `@base-ui/react/merge-props`), per the skill's manual-Slot idiom. `<FormControl><Input {...field} /></FormControl>` (children-as-slot) keeps working unchanged — the single child element becomes the render target and receives the merged `id`/`aria-describedby`/`aria-invalid`/`data-slot` wiring; a `render` prop is additionally accepted (children then stay as content). Object literal cast (`as React.ComponentProps<'div'>`) applied for the `data-*`-in-mergeProps pitfall.
  - `FormLabel` props type: `React.ComponentProps<typeof LabelPrimitive.Root>` (type-only radix import) → `React.ComponentProps<typeof Label>` (our label.tsx is already a native `<label>` wrapper from batch 1).
  - Everything else (Form/FormField/useFormField/FormItem/FormDescription/FormMessage — pure react-hook-form) untouched.

Consumer sweep: `UserEditDialog.tsx` is the only runtime consumer (3 FormFields; FormControl children are single elements — Input ×2, SelectTrigger ×1). `TagInput.tsx` mentions FormField only in a doc comment; `InputTakeover.tsx` has an unrelated local `interface FormField`. Zero edits needed; public API preserved.

Leftover scan: `grep -n "radix-ui\|@radix-ui"` clean on form.tsx.

## Left alone

- `field.tsx`, `form-section.tsx` — not radix-based.
- react-hook-form integration semantics — unchanged.

## Behavior changes

- None intended. `useRender`'s prop merging follows Base UI semantics (event handlers chained, className joined, external overwrites internal) — equivalent to Slot for the attribute set used here. If FormControl is given multiple children without `render`, it now renders a plain `<div>` wrapper around them instead of radix Slot's runtime error — flag for forks, not hit in this repo.

## Verify by hand

1. Admin → Users → Edit user: labels focus their inputs on click, typing works, submitting with an empty name shows the red FormMessage AND the input gets `aria-invalid` (inspect) + the message id in `aria-describedby`.
2. Role select inside FormControl: opens, changes value, form submits the new role.
