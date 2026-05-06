/**
 * VoiceModeButton — push-to-talk + auto-TTS button rendered next to the
 * existing VoiceDictationButton. Two states:
 *
 *   - voiceMode OFF: clicking enables voice mode (auto-plays TTS for
 *     every assistant reply) and starts a recording on the same press.
 *   - voiceMode ON: hold to record (stop on release), single-tap toggles
 *     mode back off.
 *
 * Voice mode is purely client-side — no DO needed. Calls /api/voice/transcribe
 * and /api/voice/tts. See useVoiceChat for the state machine + fetch wiring.
 */
import { useEffect, useRef } from 'react'
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { VoiceState } from '../hooks/useVoiceChat'

interface VoiceModeButtonProps {
  enabled: boolean
  setEnabled: (v: boolean) => void
  state: VoiceState
  isRecording: boolean
  isSpeaking: boolean
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  stopSpeaking: () => void
  error: string | null
  disabled?: boolean
}

export function VoiceModeButton({
  enabled,
  setEnabled,
  state,
  isRecording,
  isSpeaking,
  startRecording,
  stopRecording,
  stopSpeaking,
  error,
  disabled,
}: VoiceModeButtonProps) {
  const holdRef = useRef(false)

  // Defensive: if we lose focus mid-press, stop recording.
  useEffect(() => {
    if (!isRecording) return
    const stop = () => {
      if (holdRef.current) {
        holdRef.current = false
        void stopRecording()
      }
    }
    window.addEventListener('blur', stop)
    return () => window.removeEventListener('blur', stop)
  }, [isRecording, stopRecording])

  const handleToggleEnabled = () => {
    if (enabled) {
      // Toggle OFF — also stop any in-flight playback.
      stopSpeaking()
      setEnabled(false)
    } else {
      setEnabled(true)
    }
  }

  // Press-and-hold for recording.
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!enabled || disabled) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    holdRef.current = true
    void startRecording()
  }
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!enabled || !holdRef.current) return
    e.preventDefault()
    holdRef.current = false
    void stopRecording()
  }

  const showSpinner = state === 'transcribing'
  const Icon = !enabled
    ? MicOff
    : showSpinner
    ? Loader2
    : isSpeaking
    ? Volume2
    : Mic

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={enabled ? (isRecording ? 'destructive' : 'default') : 'outline'}
          size="icon"
          className={cn(
            'shrink-0 transition-colors',
            isRecording && 'animate-pulse',
            isSpeaking && 'border-primary/40 bg-primary/10 text-primary',
          )}
          disabled={disabled}
          aria-label={
            !enabled
              ? 'Enable voice mode'
              : isRecording
              ? 'Release to send'
              : isSpeaking
              ? 'Stop speaking'
              : 'Hold to record · click to disable voice mode'
          }
          onClick={(e) => {
            // Suppress click that fires from pointerdown+pointerup on the
            // same press — we already handled it via pointer events. Only
            // bare clicks (no pointer hold) toggle enabled state.
            if (holdRef.current) {
              e.preventDefault()
              return
            }
            if (isSpeaking) {
              stopSpeaking()
              return
            }
            handleToggleEnabled()
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <Icon className={cn('size-4', showSpinner && 'animate-spin')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {!enabled ? (
          <>
            <strong>Voice mode</strong>
            <br />
            Click to enable. Replies will play aloud and you can hold the
            button to speak.
          </>
        ) : isRecording ? (
          'Release to send'
        ) : isSpeaking ? (
          'Click to stop · or hold to record'
        ) : error ? (
          <>
            <strong className="text-destructive">Voice error</strong>
            <br />
            {error}
          </>
        ) : (
          <>
            <strong>Voice mode active</strong>
            <br />
            Hold to speak · click to disable
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
