#!/usr/bin/env node
/**
 * Post a release note to the app's What's New feed.
 *
 * This exists so writing the note happens at the moment that actually
 * fires — finishing a deploy — instead of being a separate ritual
 * afterwards that nobody performs.
 *
 *   pnpm changelog:post \
 *     --title "Faster search" \
 *     --body "Search now returns in under 100ms." \
 *     --category improvement \
 *     --release-key "$(git rev-parse --short HEAD)"
 *
 * Auth: APP_URL + CHANGELOG_TOKEN in the environment. The token needs
 * the `updates:write` scope AND must belong to an admin user — the scope
 * alone is not enough (adminMiddleware still runs).
 *
 * Idempotent: pass --release-key and re-running the same deploy updates
 * the entry rather than posting a second one. Pass --draft to stage the
 * wording without showing users anything yet.
 *
 * Deliberately NOT wired into the deploy script. Posting on every deploy
 * fills the feed with entries nobody wrote well; the judgement of "is
 * this worth telling users about" belongs to whoever (or whatever) is
 * doing the release.
 */

const args = process.argv.slice(2)

function flag(name) {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined
}
const has = (name) => args.includes(`--${name}`)

if (has('help') || args.length === 0) {
  console.log(
    [
      'Usage: pnpm changelog:post --title <t> --body <b> [options]',
      '',
      '  --title        <string>   required',
      '  --body         <string>   required, markdown',
      '  --category     <string>   feature | fix | improvement   (default: feature)',
      '  --version      <string>   display label, e.g. v2.2',
      '  --release-key  <string>   stable key (tag/sha) — makes re-posts idempotent',
      '  --highlight               show a one-off banner on the dashboard. Use sparingly',
      '  --draft                   save without publishing',
      '',
      'Environment: APP_URL, CHANGELOG_TOKEN',
    ].join('\n')
  )
  process.exit(has('help') ? 0 : 1)
}

const title = flag('title')
const body = flag('body')
const appUrl = process.env.APP_URL?.replace(/\/$/, '')
const token = process.env.CHANGELOG_TOKEN

const missing = []
if (!title) missing.push('--title')
if (!body) missing.push('--body')
if (!appUrl) missing.push('APP_URL')
if (!token) missing.push('CHANGELOG_TOKEN')
if (missing.length > 0) {
  console.error(`changelog:post — missing required input: ${missing.join(', ')}`)
  process.exit(1)
}

const category = flag('category') ?? 'feature'
const validCategories = ['feature', 'fix', 'improvement']
if (!validCategories.includes(category)) {
  console.error(`changelog:post — --category must be one of: ${validCategories.join(', ')}`)
  process.exit(1)
}

const payload = {
  title,
  body,
  category,
  highlight: has('highlight'),
  publish: !has('draft'),
}
const version = flag('version')
if (version) payload.version = version
const releaseKey = flag('release-key')
if (releaseKey) payload.releaseKey = releaseKey

const res = await fetch(`${appUrl}/api/updates/entries`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
})

const text = await res.text()

if (!res.ok) {
  console.error(`changelog:post — ${res.status} ${res.statusText}`)
  console.error(text)
  if (res.status === 403) {
    console.error(
      '\nA 403 here usually means the token is valid but its owner is not an admin,\n' +
        'or the token is missing the updates:write scope.'
    )
  }
  process.exit(1)
}

let parsed
try {
  parsed = JSON.parse(text)
} catch {
  parsed = {}
}

const verb = parsed.created === false ? 'Updated' : 'Posted'
const state = payload.publish ? 'published' : 'draft'
console.log(`changelog:post — ${verb} "${title}" (${state})`)
if (releaseKey) console.log(`  release key: ${releaseKey}`)
