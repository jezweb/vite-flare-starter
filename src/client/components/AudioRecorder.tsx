/**
 * AudioRecorder — reusable voice input component.
 *
 * Captures audio via MediaRecorder, shows live duration, returns a Blob
 * on stop. Works with any upload flow or the Deepgram STT chat tool.
 *
 * ## Modes
 *
 * **Single-blob (default)** — chunks are accumulated internally and
 * `onRecordingComplete` fires at stop with the full merged blob. Best
 * for short voice notes that get uploaded in one shot.
 *
 * **Streaming chunks** — pass `onChunk` and callers receive each chunk
 * as it arrives. `onRecordingComplete` still fires at stop with the full
 * merged blob, so consumers can stream for live transcription AND get
 * the full recording for archive in one call. Best for long sessions
 * (field tech narration, meeting capture, dictation).
 *
 * @example Basic — voice note
 * <AudioRecorder
 *   onRecordingComplete={(blob) => uploadAudio(blob)}
 *   maxDuration={120}
 * />
 *
 * @example Streaming — 60s chunks for live transcription
 * <AudioRecorder
 *   onChunk={(chunk, i, t) => streamToTranscription(chunk, i, t)}
 *   onRecordingComplete={(blob) => archiveToR2(blob)}
 *   chunkDurationMs={60_000}
 *   maxDuration={4 * 3600}
 *   keepAwake
 * />
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface AudioRecorderProps {
  /** Called with the full merged Blob when recording stops. Always fires. */
  onRecordingComplete: (blob: Blob, durationMs: number) => void
  /**
   * If set, fires for each non-empty chunk as it arrives during recording.
   * Purely additive — existing callers that only need the final blob can
   * ignore this prop. When set, defaults `chunkDurationMs` to 60_000.
   */
  onChunk?: (chunk: Blob, chunkIndex: number, startedAtMs: number) => void
  /**
   * MediaRecorder timeslice in ms. Controls how often `ondataavailable`
   * fires internally, which also sets the chunk cadence for `onChunk`.
   * - Default 250 when `onChunk` is NOT provided (smooth stop, minimal delay)
   * - Default 60_000 when `onChunk` IS provided (streaming cadence)
   */
  chunkDurationMs?: number
  /** Maximum recording duration in seconds (default: 120). */
  maxDuration?: number
  /** Audio MIME type (default: audio/webm). */
  mimeType?: string
  /** Additional className for the container. */
  className?: string
  /** Compact mode — just the mic button, no duration display. */
  compact?: boolean
  /**
   * Hold the Screen Wake Lock while recording so the screen doesn't
   * dim/suspend mid-session. Feature-detected — fails silently on
   * browsers without `navigator.wakeLock` (notably iOS < 16.4).
   */
  keepAwake?: boolean
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/**
 * Minimal type for the Screen Wake Lock API. Wider browser typings tend
 * to ship it under `navigator.wakeLock` but TS lib targets vary; we keep
 * a local shape so the component works against older tsconfigs.
 */
interface WakeLockSentinel {
  release: () => Promise<void>
}
interface WakeLockNavigator {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinel>
  }
}

export function AudioRecorder({
  onRecordingComplete,
  onChunk,
  chunkDurationMs,
  maxDuration = 120,
  mimeType = 'audio/webm',
  className,
  compact = false,
  keepAwake = false,
}: AudioRecorderProps) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'stopping'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const chunkIndex = useRef(0)
  const startTime = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // Keep the latest onChunk in a ref so the MediaRecorder callback always
  // sees the freshest value without us having to tear down + rebuild the
  // recorder each render.
  const onChunkRef = useRef(onChunk)
  useEffect(() => {
    onChunkRef.current = onChunk
  }, [onChunk])

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release()
      } catch {
        // best-effort release — ignore if already released by the browser
      }
      wakeLockRef.current = null
    }
  }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorder.current?.stream) {
      for (const track of mediaRecorder.current.stream.getTracks()) {
        track.stop()
      }
    }
    mediaRecorder.current = null
    chunks.current = []
    chunkIndex.current = 0
    void releaseWakeLock()
  }, [releaseWakeLock])

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup])

  const startRecording = useCallback(async () => {
    setState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'audio/webm',
      })

      chunks.current = []
      chunkIndex.current = 0
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return
        chunks.current.push(e.data)
        const handler = onChunkRef.current
        if (handler) {
          const startedAt = Date.now() - startTime.current - e.data.size * 0
          // startedAt is monotonic offset from recording start. We can't
          // easily know the chunk's exact start — MediaRecorder emits at
          // timeslice boundaries — so we report the wall-clock-relative
          // offset at emit time. Consumers treat consecutive chunks as
          // contiguous, using (emitTime - previousEmitTime) for duration.
          handler(e.data, chunkIndex.current, startedAt)
          chunkIndex.current += 1
        }
      }

      recorder.onstop = () => {
        const duration = Date.now() - startTime.current
        const blob = new Blob(chunks.current, { type: recorder.mimeType })
        cleanup()
        setState('idle')
        setElapsed(0)
        onRecordingComplete(blob, duration)
      }

      mediaRecorder.current = recorder
      startTime.current = Date.now()
      // Timeslice picks: 250ms when no onChunk (smooth stop), 60s when
      // streaming. Callers can override with chunkDurationMs either way.
      const timeslice = chunkDurationMs ?? (onChunkRef.current ? 60_000 : 250)
      recorder.start(timeslice)
      setState('recording')

      // Best-effort Screen Wake Lock to survive iOS suspension on long sessions
      if (keepAwake) {
        const nav = navigator as unknown as WakeLockNavigator
        if (nav.wakeLock?.request) {
          nav.wakeLock
            .request('screen')
            .then((lock) => {
              wakeLockRef.current = lock
            })
            .catch(() => {
              // silently ignore — WAL policy varies by browser + OS
            })
        }
      }

      // Live timer
      timerRef.current = setInterval(() => {
        const now = Date.now() - startTime.current
        setElapsed(now)
        if (now >= maxDuration * 1000) {
          recorder.stop()
        }
      }, 200)
    } catch {
      setState('idle')
      cleanup()
    }
  }, [mimeType, maxDuration, chunkDurationMs, keepAwake, onRecordingComplete, cleanup])

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current?.state === 'recording') {
      setState('stopping')
      mediaRecorder.current.stop()
    }
  }, [])

  const isRecording = state === 'recording'

  if (compact) {
    return (
      <Button
        type="button"
        variant={isRecording ? 'destructive' : 'ghost'}
        size="icon-sm"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={state === 'requesting' || state === 'stopping'}
        className={className}
        title={isRecording ? 'Stop recording' : 'Record audio'}
        aria-label={isRecording ? 'Stop recording' : 'Record audio'}
      >
        {state === 'requesting' ? (
          <Spinner size="md" />
        ) : isRecording ? (
          <Square className="size-3" />
        ) : (
          <Mic className="size-4" />
        )}
      </Button>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        variant={isRecording ? 'destructive' : 'outline'}
        size="sm"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={state === 'requesting' || state === 'stopping'}
        className="gap-2"
      >
        {state === 'requesting' ? (
          <Spinner size="md" />
        ) : isRecording ? (
          <Square className="size-3" />
        ) : (
          <Mic className="size-4" />
        )}
        {isRecording ? 'Stop' : 'Record'}
      </Button>

      {isRecording && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-destructive animate-pulse" />
          <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span>
          <span className="text-xs">/ {formatDuration(maxDuration * 1000)}</span>
        </div>
      )}
    </div>
  )
}
