# avatar

2026-07-16, transformation engine (legacy style `new-york`, classification only; file heavily CUSTOMIZED vs golden — size variants, AvatarBadge/AvatarGroup/AvatarGroupCount extra parts). Verdict: one-line import swap; anatomy is identical in Base UI.

## Changed

- `src/components/ui/avatar.tsx` — import swapped from `radix-ui` to `@base-ui/react/avatar`. `Root`/`Image`/`Fallback` part names, rendered elements (span/img/span), and all classes unchanged. The custom `AvatarBadge`/`AvatarGroup`/`AvatarGroupCount` parts are plain span/div components and needed no changes.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/avatar.tsx` → no matches.

## Left alone

- All 9 consumer files (identity-row, AvatarUpload, MessageRenderer, ContactCard, UserList, …) — they pass only `src`/`alt`/`className`; `onLoadingStatusChange` (same name both sides) and `delayMs` (would rename to `delay`) are used nowhere.

## Behavior changes

- None expected. Base `Fallback` uses `delay` instead of radix `delayMs` — no call sites pass it. Base Image adds `data-starting-style`/`data-ending-style` hooks (unused here).

## Verify by hand

1. Sidebar user menu + admin Users list: avatars with images load; users without images show initials fallback immediately.
2. Settings → Avatar upload: preview swaps after upload (image status change handled by the primitive).
