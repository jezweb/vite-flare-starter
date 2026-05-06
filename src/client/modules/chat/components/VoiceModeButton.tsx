/**
 * VoiceModeButton — push-to-talk + auto-TTS button rendered next to the
 * existing VoiceDictationButton. Two states:
 *
 *   - voiceMode OFF: clicking enables voice mode (auto-plays TTS for
 *     every assistant reply) AND primes the audio element inside the
 *     user gesture so iOS Safari allows subsequent autoplay.
 *   - voiceMode ON: hold to record (stop on release), single-tap toggles
 *     mode back off.
 *
 * Voice mode is purely client-side — no DO needed. Calls /api/voice/transcribe
 * and /api/voice/tts. See useVoiceChat for the state machine + fetch wiring.
 *
 * Defences (added 2026-05-07 from brains-trust review):
 *   - `justHandledPointerRef`: prevents the synthetic click after a
 *     hold-release from firing handleToggleEnabled() and disabling voice
 *     mode after every utterance.
 *   - `capturedPointerIdRef`: ignores second-finger pointers on iPad so
 *     multi-touch doesn't break recording.
 *   - `unlockAudio()` is called on toggle-on so the auto-TTS effect can
 *     play without iOS NotAllowedError.
 *   - `recordingUnsupported` from the hook drives a "voice mode requires
 *     Chrome/Firefox" tooltip on iOS Safari rather than crashing.
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

// Below this threshold we treat a press as a tap (toggle mode off) rather
// than a hold (record + transcribe). 250ms matches the Web Touch Spec.
const TAP_THRESHOLD_MS = 250

interface VoiceModeButtonProps {
  enabled: boolean
  setEnabled: (v: boolean) => void
  state: VoiceState
  isRecording: boolean
  isSpeaking: boolean
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  cancelRecording: () => void
  stopSpeaking: () => void
  /** Prime the audio element inside the click gesture (iOS unlock). */
  unlockAudio: () => void
  /** True when MediaRecorder can't produce webm-opus (e.g. iOS Safari). */
  recordingUnsupported: boolean
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
  cancelRecording,
  stopSpeaking,
  unlockAudio,
  recordingUnsupported,
  error,
  disabled,
}: VoiceModeButtonProps) {
  const holdRef = useRef(false)
  const pressStartRef = useRef<number | null>(null)
  const capturedPointerIdRef = useRef<number | null>(null)
  /**
   * Latched true in pointerup so the synthetic `click` that fires next
   * (browsers fire click after pointerdown→pointerup) doesn't run the
   * "tap to toggle mode" path. Cleared on the next microtask.
   */
  const justHandledPointerRef = useRef(false)

  // Defensive: if we lose focus mid-press, stop recording.
  useEffect(() => {
    if (!isRecording) return
    const stop = () => {
      if (holdRef.current) {
        holdRef.current = false
        pressStartRef.current = null
        capturedPointerIdRef.current = null
        void stopRecording()
      }
    }
    window.addEventListener('blur', stop)
    return () => window.removeEventListener('blur', stop)
  }, [isRecording, stopRecording])

  const handleToggleEnabled = () => {
    if (enabled) {
      // Cancel any in-flight recording (transcribe + mic stream) so a
      // late-resolving permission prompt or transcribe call can't surface
      // after the user has disabled voice mode.
      cancelRecording()
      stopSpeaking()
      setEnabled(false)
    } else {
      // Prime audio inside the gesture before enabling — iOS otherwise
      // refuses to autoplay TTS replies.
      unlockAudio()
      setEnabled(true)
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!enabled || disabled || recordingUnsupported) return
    // Multi-touch guard — only the first pointer drives the recording.
    if (capturedPointerIdRef.current !== null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    capturedPointerIdRef.current = e.pointerId
    holdRef.current = true
    pressStartRef.current = performance.now()
    void startRecording()
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!enabled) return
    // Ignore release of a pointer that wasn't the captured one.
    if (capturedPointerIdRef.current !== e.pointerId) return
    if (!holdRef.current) return
    e.preventDefault()
    holdRef.current = false
    capturedPointerIdRef.current = null
    const heldMs = pressStartRef.current
      ? performance.now() - pressStartRef.current
      : Number.POSITIVE_INFINITY
    pressStartRef.current = null

    // Suppress the synthetic click that the browser will fire next.
    // setTimeout(..., 0) waits for the click task to drain — microtask
    // is too eager and clears before the click handler runs in some
    // engines.
    justHandledPointerRef.current = true
    setTimeout(() => {
      justHandledPointerRef.current = false
    }, 0)

    if (heldMs < TAP_THRESHOLD_MS) {
      // Tap — drop the recording without uploading and toggle mode off.
      cancelRecording()
      stopSpeaking()
      setEnabled(false)
      return
    }
    void stopRecording()
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (capturedPointerIdRef.current !== e.pointerId) return
    holdRef.current = false
    capturedPointerIdRef.current = null
    pressStartRef.current = null
    cancelRecording()
  }

  const showSpinner = state === 'transcribing'
  const Icon = recordingUnsupported && enabled
    ? MicOff
    : !enabled
    ? MicOff
    : showSpinner
    ? Loader2
    : isSpeaking
    ? Volume2
    : Mic

  const ariaLabel = recordingUnsupported
    ? 'Voice mode unsupported on this browser'
    : !enabled
    ? 'Enable voice mode'
    : isRecording
    ? 'Release to send'
    : isSpeaking
    ? 'Stop speaking'
    : 'Hold to record · click to disable voice mode'

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
            recordingUnsupported && 'opacity-60',
          )}
          disabled={disabled || (recordingUnsupported && !enabled)}
          aria-label={ariaLabel}
          onClick={(e) => {
            // Skip if a pointerup just handled this same press — otherwise
            // every successful hold-release also toggles mode off.
            if (justHandledPointerRef.current) {
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
          onPointerCancel={onPointerCancel}
        >
          <Icon className={cn('size-4', showSpinner && 'animate-spin')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {recordingUnsupported ? (
          <>
            <strong>Voice mode unsupported</strong>
            <br />
            Needs a browser with WebM/Opus MediaRecorder (Chrome, Firefox, or desktop Safari). iOS Safari support coming soon.
          </>
        ) : !enabled ? (
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
