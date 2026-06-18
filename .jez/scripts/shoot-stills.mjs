#!/usr/bin/env node
/**
 * Clean per-module stills (no tour card) for feature cards + og:image.
 * Screenshots each headline page against the seeded showcase session.
 *
 * Usage: WALKABOUT_URL=… WALKABOUT_AUTH_STATE=.jez/auth-state.json node .jez/scripts/shoot-stills.mjs
 * Output: assets/stills/<module>.png (1440×900) + assets/stills/og-image.png (1280×640)
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const OUT = path.join(ROOT, 'assets/stills')
fs.mkdirSync(OUT, { recursive: true })
const BASE = process.env.WALKABOUT_URL || 'http://localhost:5173'
const AUTH_STATE = process.env.WALKABOUT_AUTH_STATE || path.join(ROOT, '.jez/auth-state.json')

const PAGES = [
  ['home', '/dashboard'],
  ['chat', '/dashboard/chat'],
  ['skills', '/dashboard/skills'],
  ['knowledge', '/dashboard/knowledge'],
  ['inbox', '/dashboard/inbox'],
  ['projects', '/dashboard/projects'],
  ['routines', '/dashboard/routines'],
  ['agents', '/dashboard/agents'],
  ['activity', '/dashboard/activity'],
  ['connections', '/dashboard/connections'],
  ['files', '/dashboard/files'],
  ['organizations', '/dashboard/organization'],
  ['settings', '/dashboard/settings'],
]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: AUTH_STATE })
// suppress the first-visit tour offer so stills are clean
await context.addInitScript(() => localStorage.setItem('walkabout:tour', 'done'))
const page = await context.newPage()

for (const [name, p] of PAGES) {
  await page.goto(`${BASE}${p}`)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(1600)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log(`  ${name}.png`)
}
await browser.close()

// resize stills to 1440 max + an og:image crop from home (1280×640, top-anchored)
for (const [name] of PAGES) {
  const f = path.join(OUT, `${name}.png`)
  execFileSync('sips', ['-Z', '1440', f, '--out', f], { stdio: 'pipe' })
}
const og = path.join(OUT, 'og-image.png')
execFileSync('ffmpeg', ['-y', '-i', path.join(OUT, 'home.png'),
  '-vf', 'crop=in_w:in_w/2:0:0,scale=1280:640', og], { stdio: 'pipe' })
console.log(`  og-image.png`)
console.log('done — assets/stills/')
