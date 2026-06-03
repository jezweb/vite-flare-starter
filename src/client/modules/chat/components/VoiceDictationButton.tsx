/**
 * VoiceDictationButton — streaming speech-to-text into the chat input.
 *
 * Replaces the old "record audio → upload → ask AI to transcribe" pattern.
 * Modern dictation UX: press mic, speak, watch words appear in the input
 * field as you talk, edit as needed, hit send.
 *
 * Uses `@cloudflare/voice` + `useVoiceInput` hook to stream audio over a
 * WebSocket to the `VoiceInputExample` Durable Object. The DO runs
 * Deepgram Nova 3 via Workers AI and emits interim + final transcripts.
 *
 * DO instance name = `userId` — one shared transcription session per user
 * rather than per-conversation. Cheap to connect/disconnect; no need to
 * re-instantiate when switching conversations.
 *
 * How it wires into the chat input:
 * - `PromptInputTextarea` is uncontrolled (ref-driven). We write directly
 *   to `textareaRef.current.value` and dispatch an `input` event so
 *   react-hook-form / slash-command observers stay in sync.
 * - Existing text the user typed before pressing mic is preserved — we
 *   append the transcript with a single-space separator.
 * - Interim transcript updates live (fast feedback loop — key to
 *   self-steering while speaking).
 * - On stop, interim collapses into final. Value stays in the textarea
 *   so the user can edit and then send.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Mic, Square } from 'lucide-react'
import { useVoiceInput } from '@cloudflare/voice/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VoiceDictationButtonProps {
  /**
   * Ref to the chat input textarea. The button writes transcripts directly
   * into this element and dispatches input events.
   */
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /**
   * Stable identifier for the Durable Object instance — typically the
   * authenticated user id. Falls back to `'anonymous'` if unavailable,
   * but callers should always pass a real id so sessions are isolated.
   */
  userId: string | undefined
  /**
   * Hide the button entirely. Useful for embedding scenarios where
   * dictation shouldn't be offered.
   */
  hidden?: boolean
  /** Called when listening starts — lets the parent show "Listening…" UI. */
  onStart?: () => void
  /** Called when listening stops — success or user-initiated. */
  onStop?: () => void
}

export function VoiceDictationButton({
  textareaRef,
  userId,
  hidden,
  onStart,
  onStop,
}: VoiceDictationButtonProps) {
  const { transcript, interimTranscript, audioLevel, error, start, stop, clear } = useVoiceInput({
    agent: 'VoiceInputExample',
    name: userId ?? 'anonymous',
  })

  const [isActive, setIsActive] = useState(false)
  // Snapshot the textarea value at the moment dictation starts, so we can
  // append to it cleanly instead of replacing. Cleared on stop.
  const baseTextRef = useRef<string>('')

  // Write transcript + interim back to the textarea live. Keeps the
  // user's pre-mic text + appends spoken text. The final transcript
  // accumulates across turn-detections, so this just concatenates.
  useEffect(() => {
    if (!isActive) return
    const el = textareaRef.current
    if (!el) return

    const spoken = [transcript, interimTranscript].filter(Boolean).join(' ').trim()
    const base = baseTextRef.current
    const nextValue = base ? (spoken ? `${base.trimEnd()} ${spoken}` : base) : spoken

    if (el.value !== nextValue) {
      el.value = nextValue
      // Fire 'input' so listeners in the PromptInput (slash-command observer,
      // react-hook-form, react textarea state) re-read the new value.
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, [transcript, interimTranscript, isActive, textareaRef])

  const handleStart = async () => {
    const el = textareaRef.current
    baseTextRef.current = el?.value ?? ''
    clear() // wipe any stale transcript from a previous session
    try {
      await start()
      setIsActive(true)
      onStart?.()
      // Focus the textarea so the user sees the caret moving as words appear.
      el?.focus()
    } catch {
      // error surfaces via the `error` field
    }
  }

  const handleStop = () => {
    stop()
    setIsActive(false)
    baseTextRef.current = ''
    onStop?.()
  }

  // Stop listening if the component unmounts mid-dictation.
  useEffect(() => {
    return () => {
      if (isActive) stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (hidden) return null

  const title = error
    ? `Dictation error: ${error}`
    : isActive
      ? 'Stop dictation'
      : 'Start voice dictation'

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={isActive ? handleStop : handleStart}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={cn('h-9 w-9 p-0 relative', isActive && 'text-red-600 dark:text-red-400')}
    >
      {isActive ? (
        <>
          <Square className="size-4 fill-current" />
          {/* Audio level indicator — subtle pulse ring that scales
              with mic input. Gives immediate "we're hearing you"
              feedback distinct from the icon. */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-red-500/40 transition-transform duration-75"
            style={{ transform: `scale(${1 + Math.min(audioLevel, 1) * 0.4})` }}
          />
        </>
      ) : (
        <Mic className="size-4" />
      )}
    </Button>
  )
}
