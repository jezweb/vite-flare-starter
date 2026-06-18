#!/usr/bin/env node
/**
 * Slice palette-optimised GIFs from the demo MP4s for the README + website.
 *
 * Reads clip specs from assets/gif-clips.json:
 *   [{ name, src, start, dur, width?, fps? }]
 *     name  — output basename (assets/gifs/<name>.gif)
 *     src   — source mp4 (relative to repo root, e.g. assets/videos/module-chat.mp4)
 *     start — start offset in seconds
 *     dur   — clip duration in seconds
 *     width — output px (default 800; GIFs balloon fast, keep ≤ 900)
 *     fps   — frames/sec (default 15; 12-15 is the sweet spot for size)
 *
 * Two-pass ffmpeg (palettegen → paletteuse) for clean colour at small size.
 * Re-runnable: change the JSON, re-run, fresh GIFs.
 *
 * Usage: node .jez/scripts/make-gifs.mjs [name]   (omit name = all clips)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const CLIPS_JSON = path.join(ROOT, 'assets/gif-clips.json')
const OUT_DIR = path.join(ROOT, 'assets/gifs')
fs.mkdirSync(OUT_DIR, { recursive: true })

if (!fs.existsSync(CLIPS_JSON)) {
  console.error(`No clip specs at ${CLIPS_JSON}. Create it: [{name,src,start,dur,width?,fps?}]`)
  process.exit(1)
}
const clips = JSON.parse(fs.readFileSync(CLIPS_JSON, 'utf8'))
const pick = process.argv[2]
const selected = pick ? clips.filter((c) => c.name === pick) : clips
if (!selected.length) {
  console.error(pick ? `No clip named "${pick}"` : 'No clips in assets/gif-clips.json')
  process.exit(1)
}

function makeGif({ name, src, start, dur, width = 800, fps = 15 }) {
  const srcPath = path.isAbsolute(src) ? src : path.join(ROOT, src)
  if (!fs.existsSync(srcPath)) {
    console.warn(`  SKIP ${name}: source missing (${src})`)
    return null
  }
  const out = path.join(OUT_DIR, `${name}.gif`)
  const palette = path.join(os.tmpdir(), `wb-palette-${name}.png`)
  const vf = `fps=${fps},scale=${width}:-1:flags=lanczos`
  // pass 1: palette
  execFileSync('ffmpeg', ['-y', '-ss', String(start), '-t', String(dur), '-i', srcPath,
    '-vf', `${vf},palettegen=stats_mode=diff`, palette], { stdio: 'pipe' })
  // pass 2: apply palette
  execFileSync('ffmpeg', ['-y', '-ss', String(start), '-t', String(dur), '-i', srcPath, '-i', palette,
    '-lavfi', `${vf} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3`,
    '-loop', '0', out], { stdio: 'pipe' })
  fs.rmSync(palette, { force: true })
  const kb = Math.round(fs.statSync(out).size / 1024)
  console.log(`  ${name}.gif  ${width}px ${fps}fps ${dur}s  ${kb}KB${kb > 2048 ? '  ⚠ >2MB — trim dur/width/fps' : ''}`)
  return { name, out, kb }
}

console.log(`slicing ${selected.length} gif(s)…`)
const made = selected.map(makeGif).filter(Boolean)
console.log(`done — ${made.length} gif(s) in assets/gifs/`)
