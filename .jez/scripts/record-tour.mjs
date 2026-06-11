#!/usr/bin/env node
/**
 * Record the Walkabout guided tour as a video WITH narration audio — fully
 * headless, no popups, no manual steps, repeatable.
 *
 * Capture: LOSSLESS PNG frames straight from Chrome's screencast API
 * (CDP Page.startScreencast), assembled by ffmpeg at constant quality.
 * Playwright's built-in recordVideo is NOT used — its adaptive VP8 encoder
 * oscillates compression quality frame-to-frame, which reads as the whole page
 * blinking/flashing. PNG source makes that flutter impossible.
 *
 * Audio: the page's Audio.play is patched to log each narration's start
 * (performance.now → epoch via performance.timeOrigin), aligned against the
 * first frame's epoch timestamp, then ffmpeg muxes the ORIGINAL MP3s at those
 * offsets. Source-quality audio, sync by construction.
 *
 * Usage:
 *   WALKABOUT_URL=https://your-app.workers.dev \
 *   WALKABOUT_AUTH_STATE=.jez/auth-state.json \
 *   node .jez/scripts/record-tour.mjs
 * Output: .jez/videos/tour-demo.mp4
 *
 * AUTH (better-auth / cookie / OAuth — every vite-flare-starter fork): no
 * API-key localStorage bootstrap. Provide a Playwright storageState file with a
 * live session cookie:
 *   - Sign in by hand once, then: await context.storageState({ path: '.jez/auth-state.json' })
 *   - Or mint headlessly via the test-auth endpoint (TEST_AUTH_TOKEN secret):
 *       curl -sX POST $URL/api/test-auth/cookies -H "X-Test-Auth: $TOKEN" \
 *         -H 'Content-Type: application/json' -d '{"email":"demo@test.app.local","name":"Demo"}'
 *       then write {cookies:[…],origins:[]} to the state file.
 * gitignore the state file (live cookie); re-capture when it lapses. Set STEPS.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const OUT_DIR = path.join(ROOT, '.jez/videos')
const FRAMES_DIR = path.join(OUT_DIR, 'frames-tmp')
fs.rmSync(FRAMES_DIR, { recursive: true, force: true })
fs.mkdirSync(FRAMES_DIR, { recursive: true })
const MP4 = path.join(OUT_DIR, process.env.WALKABOUT_OUT || 'tour-demo.mp4')

const BASE = process.env.WALKABOUT_URL || 'http://localhost:5173'
const AUTH_STATE = process.env.WALKABOUT_AUTH_STATE || path.join(ROOT, '.jez/auth-state.json')
const STEPS = Number(process.env.WALKABOUT_STEPS || 5)
// Viewport: desktop 1440x900 by default; set WALKABOUT_VIEWPORT=390x844 (+ optional
// WALKABOUT_MOBILE=1) for a 9:16 phone cut (Shorts/Reels).
const [VW, VH] = (process.env.WALKABOUT_VIEWPORT || '1440x900').split('x').map(Number)
const MOBILE = process.env.WALKABOUT_MOBILE === '1'
const DSF = Number(process.env.WALKABOUT_DSF || (MOBILE ? 2 : 1))

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
  viewport: { width: VW, height: VH },
  deviceScaleFactor: DSF,
  isMobile: MOBILE,
  hasTouch: MOBILE,
  storageState: AUTH_STATE,
})

// The take: deep-link straight into the tour; auto-advance does the rest.
console.log('recording the tour (lossless screencast)…')
const page = await context.newPage()
await page.addInitScript(() => {
  window.__audioLog = []
  const origPlay = Audio.prototype.play
  Audio.prototype.play = function (...args) {
    window.__audioLog.push({ src: this.src, t: performance.now() })
    return origPlay.apply(this, args)
  }
})

// Lossless frame capture — write each frame to disk as it arrives, with its
// epoch timestamp. Screencast only sends frames on change, so still moments
// produce few frames; per-frame durations reconstruct real time.
const cdp = await context.newCDPSession(page)
const frameMeta = [] // { file, ts }
let frameN = 0
cdp.on('Page.screencastFrame', (ev) => {
  const file = path.join(FRAMES_DIR, `f-${String(frameN++).padStart(5, '0')}.png`)
  fs.writeFileSync(file, Buffer.from(ev.data, 'base64'))
  frameMeta.push({ file, ts: ev.metadata.timestamp })
  cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => undefined)
})
await cdp.send('Page.startScreencast', {
  format: 'png',
  maxWidth: VW * DSF,
  maxHeight: VH * DSF,
  everyNthFrame: 1,
})

await page.goto(`${BASE}/dashboard?tour=1`)
const timeOrigin = await page.evaluate(() => performance.timeOrigin)

await page.waitForFunction(
  (n) => new Set(window.__audioLog.map((e) => e.src)).size >= n,
  STEPS,
  { timeout: 300_000, polling: 500 }
)
console.log(`last step narrating — letting it finish (${Math.ceil(lastDuration)}s)…`)
await page.waitForTimeout((lastDuration + 2.5) * 1000)

const audioLog = await page.evaluate(() => window.__audioLog)
await cdp.send('Page.stopScreencast').catch(() => undefined)
const endEpochS = Date.now() / 1000
await page.close()
await browser.close()

if (frameMeta.length < 10) throw new Error(`only ${frameMeta.length} frames captured`)
console.log(`${frameMeta.length} lossless frames captured`)

// Audio offsets relative to the first frame, in ms.
const videoStartS = frameMeta[0].ts
const offsets = []
for (let n = 1; n <= STEPS; n++) {
  const hit = audioLog.find((e) => e.src.endsWith(`/tour/step-${n}.mp3`))
  if (!hit) throw new Error(`no play event for step ${n}`)
  const epochS = (timeOrigin + hit.t) / 1000
  offsets.push(Math.max(0, Math.round((epochS - videoStartS) * 1000)))
}
console.log('step offsets (ms):', offsets.join(', '))

// Concat demuxer with real per-frame durations; last frame holds to the end.
const lines = ['ffconcat version 1.0']
for (let i = 0; i < frameMeta.length; i++) {
  const dur =
    i < frameMeta.length - 1
      ? frameMeta[i + 1].ts - frameMeta[i].ts
      : Math.max(0.04, endEpochS - frameMeta[i].ts)
  lines.push(`file '${frameMeta[i].file}'`)
  lines.push(`duration ${dur.toFixed(4)}`)
}
lines.push(`file '${frameMeta.at(-1).file}'`) // concat quirk: repeat last file
const listFile = path.join(FRAMES_DIR, 'list.txt')
fs.writeFileSync(listFile, lines.join('\n'))

console.log('encoding + muxing…')
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
    '-y',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    ...inputs,
    '-filter_complex', `${delays.join(';')};${mixIn}amix=inputs=${STEPS}:normalize=0[aout]`,
    '-map', '0:v', '-map', '[aout]',
    '-fps_mode', 'cfr', '-r', '30',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    MP4,
  ],
  { stdio: 'pipe' }
)
fs.rmSync(FRAMES_DIR, { recursive: true, force: true })
console.log(`wrote ${MP4} (${Math.round(fs.statSync(MP4).size / 1024 / 1024)}MB)`)
execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'csv', MP4], { stdio: 'inherit' })
