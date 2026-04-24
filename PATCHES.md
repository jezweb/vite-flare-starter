# PATCHES.md

List of fork-specific changes to upstream files. One entry per logical
customisation. Inline `@fork-patch[<id>]` comments in the code point back
to the entry whose `<id>` matches.

**Not a changelog.** A changelog records what happened over time;
PATCHES.md records what's currently different from upstream. Entries
should be updated or removed when the divergence goes away (patch
upstreamed, or extension point added).

See [`docs/PATCHES-guide.md`](./docs/PATCHES-guide.md) for the full
convention, worked examples, and when NOT to use markers.

---

## Entry template

```markdown
## <patch-id>

**Added:** YYYY-MM-DD
**Applied against upstream:** <commit-sha-or-tag>
**Files:**
- path/to/file1.ts
- path/to/file2.tsx

**What:** One paragraph describing what's different.

**Why:** Reason the fork needs this (client constraint, compliance, scope cut).

**Upstream drift risk:** Low | Medium | High — short note on why.
```

---

## Entries

_No entries yet. This is an upstream starter — patches land in forks._
