/**
 * VideoInputExample — minimal React page demonstrating the pattern of
 * streaming sampled video frames to a Durable Object agent for vision
 * captioning.
 *
 * Pattern:
 *   1. Client opens a WebSocket to the `VideoInputExample` DO via `useAgent`
 *      (from the `agents/react` package — same hook the voice example uses
 *      internally).
 *   2. `getUserMedia` → `<video>` → `<canvas>` sampled at ~1 frame / N seconds.
 *   3. Each frame is encoded as a JPEG data URL and sent as a JSON message:
 *      `{ type: "frame", image: "data:image/jpeg;base64,..." }`.
 *   4. The DO runs the frame through a Workers AI vision model and
 *      broadcasts `{ type: "caption", text: "..." }` back.
 *
 * Gated behind the `videoAgent` feature flag (default OFF).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAgent } from 'agents/react'
import { Camera, Square } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSession } from '@/client/lib/auth'

interface Caption {
  text: string
  ts: number
  durationMs?: number
}

const SAMPLE_INTERVAL_MS = 3000
const JPEG_QUALITY = 0.8
const FRAME_MAX_WIDTH = 640

export function VideoInputExamplePage() {
  // Instance name namespaced with the user id (`<userId>:<sessionId>`) so the
  // /agents/* access gate can verify ownership — see the voice example.
  const { data: session } = useSession()
  const userId = session?.user?.id
  const [rawSessionId] = useState(() => crypto.randomUUID())
  const sessionId = userId ? `${userId}:${rawSessionId}` : rawSessionId
  const [isActive, setIsActive] = useState(false)
  const [captions, setCaptions] = useState<Caption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pendingFrame, setPendingFrame] = useState(false)
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sampleTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const agent = useAgent({
    agent: 'VideoInputExample',
    name: sessionId,
    onMessage: (ev) => {
      try {
        const msg = JSON.parse(ev.data) as
          | { type: 'caption'; text: string; ts: number; durationMs?: number }
          | { type: 'error'; message: string }
          | { type: 'welcome' }
          | { type: 'pong' }
        if (msg.type === 'caption') {
          setPendingFrame(false)
          setCaptions((prev) => [
            ...prev.slice(-19),
            { text: msg.text, ts: msg.ts, durationMs: msg.durationMs },
          ])
        } else if (msg.type === 'error') {
          setPendingFrame(false)
          setError(msg.message)
        }
      } catch {
        /* non-JSON message — ignore */
      }
    },
  })

  const combinedCaption = useMemo(() => {
    return captions.length > 0 ? captions[captions.length - 1]!.text : null
  }, [captions])

  const sampleAndSend = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    setPendingFrame(true)
    setLastFrameAt(Date.now())
    agent.send(JSON.stringify({ type: 'frame', image: dataUrl }))
  }

  const handleStart = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setIsActive(true)
      // Grab the first frame almost immediately, then sample on interval.
      setTimeout(() => void sampleAndSend(), 500)
      sampleTimer.current = setInterval(() => void sampleAndSend(), SAMPLE_INTERVAL_MS)
    } catch (err) {
      // Translate DOMException error names into actionable guidance so
      // the user knows whether to fix permissions, plug in a camera, or
      // try again.
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError(
            "Camera access denied. Grant permission in your browser's site settings, then click Start again."
          )
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera found. Connect a camera or use a device with one.')
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setError(
            'Camera is in use by another application. Close other apps that might be using it.'
          )
        } else if (err.name === 'OverconstrainedError') {
          setError('No camera matching the requested settings. Try a different device.')
        } else {
          setError(err.message || String(err))
        }
      } else {
        setError(String(err))
      }
    }
  }

  const handleStop = () => {
    if (sampleTimer.current) {
      clearInterval(sampleTimer.current)
      sampleTimer.current = null
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setIsActive(false)
    setPendingFrame(false)
  }

  useEffect(() => {
    return () => handleStop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Video Input Example</h1>
        <p className="mt-1 text-muted-foreground">
          Sampled-frames-over-WebSocket reference scaffold. No Cloudflare Realtime SDK required —
          just <code className="px-1 py-0.5 rounded bg-muted font-mono text-sm">getUserMedia</code>,{' '}
          <code className="px-1 py-0.5 rounded bg-muted font-mono text-sm">&lt;canvas&gt;</code>,
          and the <code className="px-1 py-0.5 rounded bg-muted font-mono text-sm">agents</code> SDK
          WebSocket. Session id <code className="font-mono text-xs">{rawSessionId.slice(0, 8)}</code>.
        </p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? (pendingFrame ? 'analysing…' : 'watching') : 'idle'}
            </Badge>
            {lastFrameAt && (
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                last frame {Math.round((Date.now() - lastFrameAt) / 1000)}s ago
              </span>
            )}
          </div>

          <div className="rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              muted
              playsInline
              aria-label="Camera preview"
            />
            {!isActive && <div className="absolute text-sm text-muted-foreground">Camera off</div>}
          </div>

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex items-center gap-3">
            {!isActive ? (
              <Button onClick={handleStart} className="gap-2">
                <Camera className="h-4 w-4" />
                Start camera
              </Button>
            ) : (
              <Button onClick={handleStop} variant="destructive" className="gap-2">
                <Square className="h-4 w-4 fill-current" />
                Stop
              </Button>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              Sampling every {SAMPLE_INTERVAL_MS / 1000}s · JPEG · max {FRAME_MAX_WIDTH}px wide
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Latest caption
          </p>
          {combinedCaption ? (
            <p className="text-lg leading-relaxed">{combinedCaption}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isActive ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  Waiting for the first frame…
                </span>
              ) : (
                'Tap Start to begin.'
              )}
            </p>
          )}
          {captions.length > 1 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                History ({captions.length} captions)
              </summary>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {[...captions].reverse().map((c, i) => (
                  <li key={`${c.ts}-${i}`} className="border-l-2 border-border pl-3">
                    <span className="text-foreground">{c.text}</span>
                    {c.durationMs != null && (
                      <span className="ml-2 font-mono text-[11px]">· {c.durationMs}ms</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="py-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">How this works</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Browser grabs a <code className="font-mono text-xs">MediaStream</code> via{' '}
              <code className="font-mono text-xs">getUserMedia</code> and opens a WS to{' '}
              <code className="font-mono text-xs">
                /agents/video-input-example/&#123;sessionId&#125;
              </code>
            </li>
            <li>
              Every {SAMPLE_INTERVAL_MS / 1000} seconds, a frame is drawn onto a canvas and encoded
              as a JPEG data URL (~{FRAME_MAX_WIDTH}px wide for bandwidth)
            </li>
            <li>
              The DO's <code className="font-mono text-xs">onMessage</code> handler runs the frame
              through a vision model (default: Workers AI Gemma 3 27B) and broadcasts the caption
            </li>
            <li>
              This scaffold uses <strong>sampled frames</strong>, not full-motion video. For 30fps
              continuous vision (gaze, object tracking) you'd use Cloudflare Realtime SFU + raw
              WebRTC tracks — swap the transport, keep the DO's agent logic.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
