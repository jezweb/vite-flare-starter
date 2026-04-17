/**
 * AudioRecorder — reusable voice input component.
 *
 * Captures audio via MediaRecorder, shows live duration, returns a Blob
 * on stop. Works with any upload flow or the Deepgram STT chat tool.
 *
 * @example
 * <AudioRecorder
 *   onRecordingComplete={(blob) => uploadAudio(blob)}
 *   maxDuration={120}
 * />
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AudioRecorderProps {
  /** Called with the audio Blob when recording stops. */
  onRecordingComplete: (blob: Blob, durationMs: number) => void
  /** Maximum recording duration in seconds (default: 120). */
  maxDuration?: number
  /** Audio MIME type (default: audio/webm). */
  mimeType?: string
  /** Additional className for the container. */
  className?: string
  /** Compact mode — just the mic button, no duration display. */
  compact?: boolean
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function AudioRecorder({
  onRecordingComplete,
  maxDuration = 120,
  mimeType = 'audio/webm',
  className,
  compact = false,
}: AudioRecorderProps) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'stopping'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startTime = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
  }, [])

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
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
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
      recorder.start(250) // collect data every 250ms
      setState('recording')

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
  }, [mimeType, maxDuration, onRecordingComplete, cleanup])

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
          <Loader2 className="size-4 animate-spin" />
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
          <Loader2 className="size-4 animate-spin" />
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
