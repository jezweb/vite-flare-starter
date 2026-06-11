#!/usr/bin/env node
/**
 * Record the Walkabout guided tour as a video WITH narration audio — fully
 * headless, no popups, no manual steps, repeatable.
 *
 * How: Playwright records the video (recordVideo has no audio track), the page's
 * `Audio.play` is patched to log the exact ms each step's narration starts, and
 * ffmpeg muxes the ORIGINAL tour MP3s onto the video at those offsets. Source-
 * quality audio, perfect repeatability, headless — no getDisplayMedia picker.
 *
 * Usage:
 *   WALKABOUT_URL=https://your-app.workers.dev \
 *   WALKABOUT_AUTH_STATE=.jez/auth-state.json \
 *   node .jez/scripts/record-tour.mjs
 * Output: .jez/videos/tour-demo.mp4
 *
 * AUTH (better-auth / cookie / OAuth — every vite-flare-starter fork): there's no
 * API-key localStorage bootstrap. Provide a Playwright storageState file with a
 * live session cookie. Two ways to make one:
 *   - Sign in by hand once, then in a node repl / script:
 *       await context.storageState({ path: '.jez/auth-state.json' })  // gitignore it
 *   - Mint one headlessly via the test-auth endpoint (TEST_AUTH_TOKEN secret):
 *       curl -sX POST $URL/api/test-auth/cookies -H "X-Test-Auth: $TOKEN" \
 *         -H 'Content-Type: application/json' \
 *         -d '{"email":"demo@test.app.local","name":"Demo"}' \
 *       then write {cookies:[…],origins:[]} to the state file.
 * The cookie expires — re-capture when it lapses. Set STEPS to your step count.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const OUT_DIR = path.join(ROOT, '.jez/videos')
fs.mkdirSync(OUT_DIR, { recursive: true })
const MP4 = path.join(OUT_DIR, 'tour-demo.mp4')

const BASE = process.env.WALKABOUT_URL || 'http://localhost:5173'
const AUTH_STATE = process.env.WALKABOUT_AUTH_STATE || path.join(ROOT, '.jez/auth-state.json')
const STEPS = Number(process.env.WALKABOUT_STEPS || 5)
/** Nudge if voice runs ahead of (+ms) or behind (-ms) the video. */
const SYNC_OFFSET_MS = Number(process.env.WALKABOUT_SYNC_MS || 0)

if (!fs.existsSync(AUTH_STATE)) {
  console.error(`No auth state at ${AUTH_STATE}. See the header of this file for how to make one.`)
  process.exit(1)
}

const mp3 = (n) => path.join(ROOT, `public/tour/step-${n}.mp3`)
const durationS = (file) =>
  Number(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      { encoding: 'utf8' }
    ).trim()
  )
const lastDuration = durationS(mp3(STEPS))

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
  storageState: AUTH_STATE,
})

// Video t=0 ≈ navigation start ≈ performance.timeOrigin, so each Audio.play()'s
// performance.now() IS its offset in the video.
console.log('recording the tour…')
const page = await context.newPage()
await page.addInitScript(() => {
  window.__audioLog = []
  const origPlay = Audio.prototype.play
  Audio.prototype.play = function (...args) {
    window.__audioLog.push({ src: this.src, t: performance.now() })
    return origPlay.apply(this, args)
  }
})
await page.goto(`${BASE}/dashboard?tour=1`)

// Auto-advance walks all steps; wait until the last step's narration starts.
await page.waitForFunction(
  (n) => new Set(window.__audioLog.map((e) => e.src)).size >= n,
  STEPS,
  { timeout: 300_000, polling: 500 }
)
console.log(`last step narrating — letting it finish (${Math.ceil(lastDuration)}s)…`)
await page.waitForTimeout((lastDuration + 2.5) * 1000)

// First play() per src = the step's start offset (replays/resumes ignored).
const audioLog = await page.evaluate(() => window.__audioLog)
const offsets = []
for (let n = 1; n <= STEPS; n++) {
  const hit = audioLog.find((e) => e.src.endsWith(`/tour/step-${n}.mp3`))
  if (!hit) throw new Error(`no play event for step ${n}`)
  offsets.push(Math.max(0, Math.round(hit.t + SYNC_OFFSET_MS)))
}
console.log('step offsets (ms):', offsets.join(', '))

const video = page.video()
await page.close()
const webm = await video.path()
await browser.close()

// Mux: each MP3 delayed to its measured offset, mixed onto the silent video.
console.log('muxing audio…')
const inputs = []
const delays = []
for (let n = 1; n <= STEPS; n++) {
  inputs.push('-i', mp3(n))
  delays.push(`[${n}:a]adelay=${offsets[n - 1]}|${offsets[n - 1]}[a${n}]`)
}
const mixIn = Array.from({ length: STEPS }, (_, k) => `[a${k + 1}]`).join('')
execFileSync(
  'ffmpeg',
  [
    '-y', '-i', webm, ...inputs,
    '-filter_complex', `${delays.join(';')};${mixIn}amix=inputs=${STEPS}:normalize=0[aout]`,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    MP4,
  ],
  { stdio: 'pipe' }
)
fs.rmSync(webm, { force: true })
console.log(`wrote ${MP4} (${Math.round(fs.statSync(MP4).size / 1024 / 1024)}MB)`)
execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'csv', MP4], { stdio: 'inherit' })
