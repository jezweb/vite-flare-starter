#!/usr/bin/env node
/**
 * Record a narrated FEATURE DEMO video — the harness performs real actions
 * (typing, filtering, clicking) on cue with the narration. Fully headless.
 *
 * The engine for the demo tiers beyond the overview tour: training clips
 * ("here's how X works", 30-60s) and quick highlight cuts for socials.
 *
 * Each demo = ordered segments of { say, do?, delayMs? }. Narration is generated
 * ONCE via ElevenLabs /with-timestamps (cached by text hash), so we know the
 * second each segment starts — actions fire on those offsets while the harness
 * records (lossless PNG frames via CDP screencast), then ffmpeg muxes the MP3 on.
 *
 * Usage:
 *   WALKABOUT_URL=https://app  WALKABOUT_AUTH_STATE=.jez/auth-state.json \
 *     node .jez/scripts/record-demo.mjs [demo-name]      record (default: all)
 *   …  node .jez/scripts/record-demo.mjs --check [name]   run actions only — no
 *     narration, no video, fail loudly. Because actions use ROLE-BASED locators,
 *     --check doubles as an accessibility + dead-journey smoke test.
 * Output: .jez/videos/demo-<name>.mp4
 *
 * AUTH: better-auth/cookie apps use a Playwright storageState file (see
 * record-tour.mjs header for how to mint one). No API-key bootstrap.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const OUT_DIR = path.join(ROOT, '.jez/videos')
const CACHE_DIR = path.join(OUT_DIR, 'demo-cache')
fs.mkdirSync(CACHE_DIR, { recursive: true })

const BASE = process.env.WALKABOUT_URL || 'http://localhost:5173'
const AUTH_STATE = process.env.WALKABOUT_AUTH_STATE || path.join(ROOT, '.jez/auth-state.json')
const ELEVEN_KEY = fs
  .readFileSync(path.join(os.homedir(), 'Documents/.jez/secrets/elevenlabs-jezweb-com.md'), 'utf8')
  .match(/sk_[a-f0-9]{40,}/)[0]
const VOICE = 'IKne3meq5aSn9XLyUdCD' // Charlie — Australian, conversational

if (!fs.existsSync(AUTH_STATE)) {
  console.error(`No auth state at ${AUTH_STATE}. See record-tour.mjs header for how to make one.`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Demo definitions. say = narration; do = action fired when that line starts
// (optional delayMs shifts the action later into the line). Prefer ROLE-based
// locators (getByRole) so --check doubles as an accessibility regression test;
// data-tour selectors are fine for SPOTLIGHT regions (not controls).
// ---------------------------------------------------------------------------
const DEMOS = {
  'skills-quickstart': {
    start: '/dashboard/skills',
    segments: [
      {
        say: "Skills are how you teach the agent. Here's the library — each one a short markdown file the agent loads only when it's relevant.",
      },
      {
        say: 'Looking for something specific? Just start typing to filter.',
        delayMs: 1400,
        do: async (page) => {
          const input = page.locator('[data-tour="skills-list"] input').first()
          await input.scrollIntoViewIfNeeded()
          await input.click()
          await input.pressSequentially('review', { delay: 130 })
        },
      },
      {
        say: 'Open one to read it, edit it, or hit the AI Sparkle button to rewrite it from a plain-language instruction — you approve the change as a diff.',
        delayMs: 1600,
        do: (page) => page.getByRole('link', { name: /code review/i }).first().click(),
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// Narration: generate once per text-hash via /with-timestamps, cache mp3+cues.
// ---------------------------------------------------------------------------
async function narrationFor(name, segments) {
  const texts = segments.map((s) => s.say)
  const fullText = texts.join(' ')
  const hash = crypto.createHash('sha256').update(fullText).digest('hex').slice(0, 12)
  const mp3Path = path.join(CACHE_DIR, `${name}.mp3`)
  const cuesPath = path.join(CACHE_DIR, `${name}.cues.json`)
  if (fs.existsSync(cuesPath)) {
    const cached = JSON.parse(fs.readFileSync(cuesPath, 'utf8'))
    if (cached.hash === hash && fs.existsSync(mp3Path)) return { mp3Path, ...cached }
  }
  console.log(`  generating narration (${fullText.length} chars)…`)
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: fullText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
      }),
    }
  )
  if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${await resp.text()}`)
  const payload = await resp.json()
  fs.writeFileSync(mp3Path, Buffer.from(payload.audio_base64, 'base64'))

  const align = payload.alignment
  const starts = align.character_start_times_seconds
  const durationS = align.character_end_times_seconds.at(-1)
  const offsets = []
  let pos = 0
  for (const t of texts) {
    offsets.push(
      align.characters.length === fullText.length
        ? starts[Math.min(pos, starts.length - 1)]
        : (durationS * pos) / fullText.length
    )
    pos += t.length + 1
  }
  const cues = { hash, offsets, durationS }
  fs.writeFileSync(cuesPath, JSON.stringify(cues, null, 2))
  return { mp3Path, ...cues }
}

// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function recordDemo(browser, name, demo) {
  console.log(`recording ${name}…`)
  const narration = await narrationFor(name, demo.segments)

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: AUTH_STATE,
  })
  const page = await context.newPage()
  // Lossless frame capture (CDP screencast — recordVideo's adaptive encoder
  // makes the page shimmer). Frames straight to disk + epoch ts.
  const framesDir = path.join(OUT_DIR, `frames-${name}`)
  fs.rmSync(framesDir, { recursive: true, force: true })
  fs.mkdirSync(framesDir, { recursive: true })
  const frameMeta = []
  let frameN = 0
  const cdp = await context.newCDPSession(page)
  cdp.on('Page.screencastFrame', (ev) => {
    const file = path.join(framesDir, `f-${String(frameN++).padStart(5, '0')}.png`)
    fs.writeFileSync(file, Buffer.from(ev.data, 'base64'))
    frameMeta.push({ file, ts: ev.metadata.timestamp })
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => undefined)
  })
  await cdp.send('Page.startScreencast', {
    format: 'png',
    maxWidth: 1440,
    maxHeight: 900,
    everyNthFrame: 1,
  })

  await page.goto(`${BASE}${demo.start}`)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await sleep(800) // let the page settle before the voice starts

  const videoStart = Date.now()
  const audioStartEpochS = videoStart / 1000
  for (let k = 0; k < demo.segments.length; k++) {
    const seg = demo.segments[k]
    const fireAt = narration.offsets[k] * 1000 + (seg.delayMs ?? 0)
    const wait = videoStart + fireAt - Date.now()
    if (wait > 0) await sleep(wait)
    if (seg.do) {
      try {
        await seg.do(page)
      } catch (err) {
        console.warn(`  segment ${k + 1} action failed: ${String(err).slice(0, 120)}`)
      }
    }
  }
  const endAt = videoStart + narration.durationS * 1000 + 2000
  const tail = endAt - Date.now()
  if (tail > 0) await sleep(tail)

  await cdp.send('Page.stopScreencast').catch(() => undefined)
  const endEpochS = Date.now() / 1000
  await page.close()
  await context.close()
  if (frameMeta.length < 5) throw new Error(`only ${frameMeta.length} frames captured`)

  const audioDelayMs = Math.max(0, Math.round((audioStartEpochS - frameMeta[0].ts) * 1000))

  const lines = ['ffconcat version 1.0']
  for (let i = 0; i < frameMeta.length; i++) {
    const dur =
      i < frameMeta.length - 1
        ? frameMeta[i + 1].ts - frameMeta[i].ts
        : Math.max(0.04, endEpochS - frameMeta[i].ts)
    lines.push(`file '${frameMeta[i].file}'`)
    lines.push(`duration ${dur.toFixed(4)}`)
  }
  lines.push(`file '${frameMeta.at(-1).file}'`)
  const listFile = path.join(framesDir, 'list.txt')
  fs.writeFileSync(listFile, lines.join('\n'))

  const out = path.join(OUT_DIR, `demo-${name}.mp4`)
  execFileSync(
    'ffmpeg',
    [
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-i', narration.mp3Path,
      '-filter_complex', `[1:a]adelay=${audioDelayMs}|${audioDelayMs}[aout]`,
      '-map', '0:v', '-map', '[aout]',
      '-fps_mode', 'cfr', '-r', '30',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest',
      out,
    ],
    { stdio: 'pipe' }
  )
  fs.rmSync(framesDir, { recursive: true, force: true })
  console.log(`  wrote ${out} (${Math.round(fs.statSync(out).size / 1024 / 1024)}MB)`)
}

// --check: actions only, fast, throw on any failure (the demo suite as a smoke
// + a11y regression test — recording mode tolerates a missed action; check must not).
async function checkDemo(browser, name, demo) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: AUTH_STATE,
  })
  const page = await context.newPage()
  await page.goto(`${BASE}${demo.start}`)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  const failures = []
  for (let k = 0; k < demo.segments.length; k++) {
    const seg = demo.segments[k]
    if (!seg.do) continue
    try {
      await seg.do(page)
      await sleep(300)
    } catch (err) {
      failures.push(`segment ${k + 1} ("${seg.say.slice(0, 50)}…"): ${String(err).slice(0, 200)}`)
    }
  }
  await context.close()
  if (failures.length) {
    console.error(`✗ ${name}\n  ${failures.join('\n  ')}`)
    return false
  }
  console.log(`✓ ${name} — all ${demo.segments.length} segments actionable`)
  return true
}

const args = process.argv.slice(2)
const checkMode = args.includes('--check')
const pick = args.find((a) => !a.startsWith('--'))
const names = pick ? [pick] : Object.keys(DEMOS)
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
let ok = true
for (const name of names) {
  if (!DEMOS[name]) throw new Error(`unknown demo: ${name}`)
  if (checkMode) ok = (await checkDemo(browser, name, DEMOS[name])) && ok
  else await recordDemo(browser, name, DEMOS[name])
}
await browser.close()
if (!ok) process.exit(1)
