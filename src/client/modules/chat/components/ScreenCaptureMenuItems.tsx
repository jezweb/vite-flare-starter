/**
 * Screen capture menu items — replaces PromptInputActionAddScreenshot.
 *
 * The stock ai-elements screenshot action calls `getDisplayMedia`, grabs a
 * single frame on the next tick, and closes the stream — there's no shutter
 * button, no preview, no way to retake. Users uniformly find it confusing.
 *
 * This component adds:
 *  - "Take screenshot" → 3-second countdown card with a live preview thumbnail,
 *    "Capture now" / "Retake" / "Cancel" buttons. Matches what most people
 *    mean by "take a screenshot".
 *  - "Capture steps" → records video (max 45s) with optional mic audio, then
 *    samples up to 16 frames and composites them into a single grid PNG.
 *    Frame grid attaches as an image; mic audio (if enabled) is transcribed
 *    via Deepgram (`/api/audio/transcribe`) and appended to the prompt text.
 *    Works with every vision model — no need for native video support.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Monitor, Video, X, Circle, Square, RefreshCw } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

/** Generate a safe, sortable filename for a screen-capture artifact. */
function timestampName(prefix: string, ext: string): string {
  const ts = new Date().toISOString().replaceAll(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return `${prefix}-${ts}.${ext}`
}

/** Feature-detect getDisplayMedia. Returns false on Safari <11, older Firefox, etc. */
function canCaptureScreen(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
}

/** Close every track on a MediaStream — call in `finally` blocks. */
function stopStream(stream: MediaStream | null) {
  if (!stream) return
  for (const track of stream.getTracks()) track.stop()
}

// ────────────────────────────────────────────────────────────────────────────
// Screenshot with countdown + preview
// ────────────────────────────────────────────────────────────────────────────

type ScreenshotState =
  | { kind: 'idle' }
  | { kind: 'preview'; stream: MediaStream; countdown: number }

export function PromptInputActionAddScreenshotCountdown({
  label = 'Take screenshot',
}: {
  label?: string
}) {
  const attachments = usePromptInputAttachments()
  const [state, setState] = useState<ScreenshotState>({ kind: 'idle' })
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const startPicker = useCallback(async (event?: Event) => {
    event?.preventDefault()
    if (!canCaptureScreen()) return
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    } catch (err) {
      // User cancelled the source picker — bail silently.
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'AbortError')
      )
        return
      throw err
    }
    setState({ kind: 'preview', stream, countdown: 3 })
  }, [])

  // Attach the live stream to the hidden preview <video> as soon as it exists.
  useEffect(() => {
    if (state.kind !== 'preview' || !videoRef.current) return
    const v = videoRef.current
    v.srcObject = state.stream
    v.muted = true
    v.playsInline = true
    void v.play().catch(() => {})
    return () => {
      v.pause()
      v.srcObject = null
    }
  }, [state])

  const capture = useCallback(() => {
    if (state.kind !== 'preview') return
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      // Source failed to yield a frame; bail cleanly.
      stopStream(state.stream)
      setState({ kind: 'idle' })
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      stopStream(state.stream)
      setState({ kind: 'idle' })
      return
    }
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], timestampName('screenshot', 'png'), {
          type: 'image/png',
          lastModified: Date.now(),
        })
        attachments.add([file])
      }
      stopStream(state.stream)
      setState({ kind: 'idle' })
    }, 'image/png')
  }, [state, attachments])

  const cancel = useCallback(() => {
    if (state.kind !== 'preview') return
    stopStream(state.stream)
    setState({ kind: 'idle' })
  }, [state])

  const retake = useCallback(() => {
    cancel()
    void startPicker()
  }, [cancel, startPicker])

  // Run the 3-2-1 countdown. Ticks once per second; when it hits 0, capture.
  useEffect(() => {
    if (state.kind !== 'preview') return
    if (state.countdown <= 0) {
      capture()
      return
    }
    const t = setTimeout(() => {
      setState((s) => (s.kind === 'preview' ? { ...s, countdown: s.countdown - 1 } : s))
    }, 1000)
    return () => clearTimeout(t)
  }, [state, capture])

  return (
    <>
      <DropdownMenuItem onSelect={startPicker}>
        <Monitor className="mr-2 size-4" />
        {label}
      </DropdownMenuItem>
      {state.kind === 'preview' &&
        createPortal(
          <ScreenCapturePreviewCard
            title="Screenshot"
            subtitle={`Capturing in ${state.countdown}s…`}
            videoRef={videoRef}
            primary={{
              label: 'Capture now',
              onClick: capture,
              icon: <Circle className="size-3.5 fill-current" />,
            }}
            secondary={[
              { label: 'Retake', onClick: retake, icon: <RefreshCw className="size-3.5" /> },
              { label: 'Cancel', onClick: cancel, icon: <X className="size-3.5" /> },
            ]}
          />,
          document.body
        )}
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Capture steps (record → frame-grid PNG + optional audio transcription)
// ────────────────────────────────────────────────────────────────────────────

const MAX_DURATION_MS = 45_000
const MAX_FRAMES = 16 // 4×4 grid

type CaptureStepsState =
  | { kind: 'idle' }
  | { kind: 'config' } // show mic toggle dialog
  | {
      kind: 'recording'
      stream: MediaStream
      recorder: MediaRecorder
      chunks: Blob[]
      startedAt: number
      elapsedMs: number
      withAudio: boolean
    }
  | { kind: 'processing' }

/** Build a 4-column grid PNG from a list of frames with timestamp captions. */
async function compositeFrames(
  frames: { dataUrl: string; timestampMs: number }[]
): Promise<Blob | null> {
  if (frames.length === 0) return null
  // Load each frame into an <img> so we can draw it at known dimensions.
  const imgs = await Promise.all(
    frames.map(
      (f) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('frame load failed'))
          img.src = f.dataUrl
        })
    )
  )
  // Each cell is 480x270 (16:9). Four columns, variable rows.
  const CELL_W = 480
  const CELL_H = 270
  const CAP_H = 28 // timestamp caption row
  const COLS = 4
  const ROWS = Math.ceil(frames.length / COLS)
  const canvas = document.createElement('canvas')
  canvas.width = CELL_W * COLS
  canvas.height = (CELL_H + CAP_H) * ROWS
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#0b0c0f'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  imgs.forEach((img, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const x = col * CELL_W
    const y = row * (CELL_H + CAP_H)
    // Fit image into the cell preserving aspect ratio.
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const scale = Math.min(CELL_W / iw, CELL_H / ih)
    const dw = Math.floor(iw * scale)
    const dh = Math.floor(ih * scale)
    const dx = x + Math.floor((CELL_W - dw) / 2)
    const dy = y + Math.floor((CELL_H - dh) / 2)
    ctx.drawImage(img, dx, dy, dw, dh)
    // Caption bar under the cell.
    ctx.fillStyle = '#111418'
    ctx.fillRect(x, y + CELL_H, CELL_W, CAP_H)
    ctx.fillStyle = '#e4e6eb'
    ctx.font = '500 14px system-ui, sans-serif'
    const seconds = (frames[i]!.timestampMs / 1000).toFixed(1)
    ctx.fillText(`Frame ${i + 1}  ·  ${seconds}s`, x + 12, y + CELL_H + 19)
  })

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.92))
}

/** Replay a recorded webm blob and sample frames at fixed intervals. */
async function sampleFrames(
  blob: Blob,
  maxFrames: number
): Promise<{ frames: { dataUrl: string; timestampMs: number }[]; durationMs: number }> {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('video decode failed'))
    })
    // Some browsers report Infinity for webm duration until you seek past the end.
    // Nudge it if needed.
    if (!isFinite(video.duration)) {
      video.currentTime = 1e10
      await new Promise<void>((resolve) => {
        video.ontimeupdate = () => {
          video.ontimeupdate = null
          resolve()
        }
      })
    }
    const durationMs = Math.max(1000, Math.floor((video.duration || 5) * 1000))
    const frameCount = Math.min(maxFrames, Math.max(2, Math.floor(durationMs / 3000) + 1))
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 360
    const ctx = canvas.getContext('2d')!
    const frames: { dataUrl: string; timestampMs: number }[] = []
    for (let i = 0; i < frameCount; i++) {
      // Even spacing: t = i * (duration / (count - 1)) so we get both the
      // opening and closing frames at the extremes.
      const t = (i / Math.max(1, frameCount - 1)) * (durationMs / 1000)
      await new Promise<void>((resolve) => {
        video.onseeked = () => {
          video.onseeked = null
          resolve()
        }
        video.currentTime = t
      })
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), timestampMs: t * 1000 })
    }
    return { frames, durationMs }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Extract just the audio track from a mixed webm blob via OfflineAudioContext.
 * Returns a raw WAV blob because Deepgram accepts WAV and it avoids another
 * encode step. Returns null if no audio track is present.
 */
async function extractWavFromRecording(blob: Blob): Promise<Blob | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer()
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const tmp = new AC()
    const audioBuffer = await tmp.decodeAudioData(arrayBuffer.slice(0))
    tmp.close()
    if (audioBuffer.duration < 0.3) return null // too short to bother
    return audioBufferToWav(audioBuffer)
  } catch {
    return null
  }
}

/** Serialise an AudioBuffer to a 16-bit mono WAV Blob. */
function audioBufferToWav(ab: AudioBuffer): Blob {
  const sampleRate = ab.sampleRate
  const numSamples = ab.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)
  // Mix down to mono by averaging channels.
  const channels: Float32Array[] = []
  for (let c = 0; c < ab.numberOfChannels; c++) channels.push(ab.getChannelData(c))
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    let sum = 0
    for (let c = 0; c < channels.length; c++) sum += channels[c]![i]!
    const s = sum / channels.length
    const v = Math.max(-1, Math.min(1, s))
    view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

async function transcribeAudio(blob: Blob): Promise<string | null> {
  try {
    const form = new FormData()
    form.append('audio', blob, 'narration.wav')
    const res = await fetch('/api/audio/transcribe', {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { text?: string }
    return (data.text ?? '').trim() || null
  } catch {
    return null
  }
}

export function PromptInputActionAddScreenCapture({ label = 'Capture steps' }: { label?: string }) {
  const attachments = usePromptInputAttachments()
  const [state, setState] = useState<CaptureStepsState>({ kind: 'idle' })
  const [withAudio, setWithAudio] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const startConfig = useCallback((event: Event) => {
    event.preventDefault()
    if (!canCaptureScreen()) return
    setState({ kind: 'config' })
  }, [])

  const beginRecording = useCallback(async () => {
    let displayStream: MediaStream | null = null
    let micStream: MediaStream | null = null
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        // Request tab audio — user must tick "Share tab audio" in the picker
        // for this to actually arrive, otherwise the track is absent.
        audio: withAudio,
      })
      if (withAudio && navigator.mediaDevices.getUserMedia) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        } catch {
          // User denied mic — continue with display-only audio.
        }
      }
      // Combine: display video + any available audio tracks.
      const combined = new MediaStream()
      for (const t of displayStream.getVideoTracks()) combined.addTrack(t)
      for (const t of displayStream.getAudioTracks()) combined.addTrack(t)
      if (micStream) for (const t of micStream.getAudioTracks()) combined.addTrack(t)

      // Prefer VP9; fall back if not supported.
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm;codecs=vp8,opus'
      const recorder = new MediaRecorder(combined, { mimeType: mime })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.start(1000)

      setState({
        kind: 'recording',
        stream: combined,
        recorder,
        chunks,
        startedAt: Date.now(),
        elapsedMs: 0,
        withAudio,
      })
    } catch (err) {
      stopStream(displayStream)
      stopStream(micStream)
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'AbortError')
      ) {
        setState({ kind: 'idle' })
        return
      }
      throw err
    }
  }, [withAudio])

  const finishRecording = useCallback(async () => {
    if (state.kind !== 'recording') return
    const { recorder, chunks, stream, withAudio: recordedWithAudio } = state
    // Stop & drain.
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })
    recorder.stop()
    await stopped
    stopStream(stream)
    setState({ kind: 'processing' })

    const webmBlob = new Blob(chunks, { type: recorder.mimeType })
    try {
      const { frames, durationMs } = await sampleFrames(webmBlob, MAX_FRAMES)
      const gridBlob = await compositeFrames(frames)
      if (gridBlob) {
        const file = new File([gridBlob], timestampName('capture-steps', 'png'), {
          type: 'image/png',
          lastModified: Date.now(),
        })
        attachments.add([file])
      }

      if (recordedWithAudio) {
        const wav = await extractWavFromRecording(webmBlob)
        if (wav) {
          const transcript = await transcribeAudio(wav)
          if (transcript) {
            // Drop the transcript into the textarea so the user sees what was
            // heard and can edit before sending. Matches the "noise is part of
            // the signal" rule — the user-visible text is honest about what we
            // captured.
            const ta = document.querySelector('textarea')
            if (ta) {
              const setter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
              )?.set
              const prefix = `[Screen capture (${(durationMs / 1000).toFixed(1)}s) narration]\n${transcript}\n\n`
              setter?.call(ta, prefix + ta.value)
              ta.dispatchEvent(new Event('input', { bubbles: true }))
            }
          }
        }
      }
    } catch (err) {
      console.error('capture-steps processing failed', err)
    } finally {
      setState({ kind: 'idle' })
    }
  }, [state, attachments])

  const cancelRecording = useCallback(() => {
    if (state.kind !== 'recording') return
    try {
      state.recorder.stop()
    } catch {}
    stopStream(state.stream)
    setState({ kind: 'idle' })
  }, [state])

  // Poll elapsed time while recording so we can show a counter + auto-stop.
  useEffect(() => {
    if (state.kind !== 'recording') return
    const id = setInterval(() => {
      setState((s) => {
        if (s.kind !== 'recording') return s
        const elapsed = Date.now() - s.startedAt
        if (elapsed >= MAX_DURATION_MS) {
          // Auto-stop at the cap. finishRecording reads current state via the
          // closure, so we schedule it as a task.
          queueMicrotask(() => finishRecording())
          return s
        }
        return { ...s, elapsedMs: elapsed }
      })
    }, 200)
    return () => clearInterval(id)
  }, [state.kind, finishRecording])

  // Bind preview video when recording starts.
  useEffect(() => {
    if (state.kind !== 'recording' || !videoRef.current) return
    const v = videoRef.current
    v.srcObject = state.stream
    v.muted = true
    v.playsInline = true
    void v.play().catch(() => {})
    return () => {
      v.pause()
      v.srcObject = null
    }
  }, [state])

  return (
    <>
      <DropdownMenuItem onSelect={startConfig}>
        <Video className="mr-2 size-4" />
        {label}
      </DropdownMenuItem>

      {state.kind === 'config' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4"
            onClick={() => setState({ kind: 'idle' })}
          >
            <div
              className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-medium mb-2">Capture steps</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Records up to {MAX_DURATION_MS / 1000}s of your screen, then makes a single image of
                the key frames you can send to any vision model.
              </p>
              <label className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm">Record narration</div>
                  <div className="text-[11px] text-muted-foreground">
                    Your voice is transcribed and added to the prompt
                  </div>
                </div>
                <Switch checked={withAudio} onCheckedChange={setWithAudio} />
              </label>
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="ghost" size="sm" onClick={() => setState({ kind: 'idle' })}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    void beginRecording()
                  }}
                >
                  <Circle className="size-3.5 mr-1 fill-red-500 text-red-500" />
                  Start recording
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {state.kind === 'recording' &&
        createPortal(
          <ScreenCapturePreviewCard
            title="Recording"
            subtitle={`${(state.elapsedMs / 1000).toFixed(1)}s / ${MAX_DURATION_MS / 1000}s`}
            videoRef={videoRef}
            accent="record"
            primary={{
              label: 'Stop',
              onClick: () => {
                void finishRecording()
              },
              icon: <Square className="size-3.5 fill-current" />,
            }}
            secondary={[
              { label: 'Cancel', onClick: cancelRecording, icon: <X className="size-3.5" /> },
            ]}
          />,
          document.body
        )}

      {state.kind === 'processing' &&
        createPortal(
          <div className="fixed bottom-24 right-4 z-50 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
            Processing capture…
          </div>,
          document.body
        )}
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Shared floating preview card
// ────────────────────────────────────────────────────────────────────────────

interface PreviewCardProps {
  title: string
  subtitle: string
  videoRef: React.RefObject<HTMLVideoElement | null>
  accent?: 'record' | 'default'
  primary: { label: string; onClick: () => void; icon: React.ReactNode }
  secondary: { label: string; onClick: () => void; icon: React.ReactNode }[]
}

function ScreenCapturePreviewCard({
  title,
  subtitle,
  videoRef,
  accent = 'default',
  primary,
  secondary,
}: PreviewCardProps) {
  return (
    <div className="fixed bottom-24 right-4 z-50 w-72 overflow-hidden rounded-lg border bg-background shadow-2xl">
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 text-xs',
          accent === 'record' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-muted'
        )}
      >
        <div className="flex items-center gap-1.5">
          {accent === 'record' && <span className="size-2 rounded-full bg-red-500 animate-pulse" />}
          <span className="font-medium">{title}</span>
        </div>
        <span className="tabular-nums">{subtitle}</span>
      </div>
      <video ref={videoRef} className="aspect-video w-full bg-black object-contain" />
      <div className="flex items-center gap-1 p-2">
        <Button size="sm" className="flex-1 gap-1.5" onClick={primary.onClick}>
          {primary.icon}
          {primary.label}
        </Button>
        {secondary.map((b) => (
          <Button key={b.label} variant="outline" size="sm" className="gap-1.5" onClick={b.onClick}>
            {b.icon}
            <span className="hidden sm:inline">{b.label}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
