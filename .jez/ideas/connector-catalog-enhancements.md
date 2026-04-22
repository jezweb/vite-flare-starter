# Connector catalogue UI — future enhancements

Captured during the 2026-04-22 audit. Not blocking; bundle into a polish commit when the catalogue hits ~25+ entries.

## Category filter / grouping in Browse modal

At 12 entries a flat alphabetically-ish list is fine. Once the catalogue hits 25+ (plus user-added custom entries), add:

- Tabs or chip row for category (google / productivity / developer / analytics / communication / jezweb / custom)
- "Popular" / "Recently used" sections above the main list
- Popularity sort is already applied (2026-04-22 fix)

## Connector branding

The catalogue renders each entry with a Lucide icon. For recognised services (Gmail, GitHub, Google Drive) a real brand glyph would be more recognisable than `Mail` / `Github` / `FolderOpen`. Options:

- Simple Icons CDN (`https://cdn.simpleicons.org/gmail`) — cheap, high recognition
- Local SVG collection in `public/connectors/` — zero runtime dependency
- Brand lockup colour accent on the card stripe

Trade-off: Lucide's uniformity is a design strength. Only use branded glyphs where the service has strong visual equity.

## Drive/Gmail real OAuth servers

Catalogue entries currently point at `https://<service>.mcpserver.au/mcp` URLs. These are Jezweb-hosted endpoints that may or may not have a real OAuth server wired. For the starter's fork-friendly story, one of:

- Point catalogue entries at endpoints with real OAuth so the connect flow actually works
- Clearly mark "jezweb-hosted reference" entries as `bearer` auth so the starter's catalogue works end-to-end without external provisioning
- Provide a fork-time catalogue override (`clients/my-fork/catalog.ts`) so forkers can swap to their own provider

## Pending-connection notification on arrival

When the OAuth callback returns and the popup closes, the parent tab polls for the connection state. Consider adding a visible toast / banner on the main Connectors page confirming the connection just activated (or failed), rather than silently updating the row status.
