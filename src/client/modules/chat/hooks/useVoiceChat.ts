/**
 * useVoiceChat — push-to-talk voice IO around the existing chat agent.
 *
 * Three responsibilities:
 *   1. Record mic audio via MediaRecorder (webm-opus — Nova 3's required
 *      input format per ~/.claude/rules/workers-ai-gotchas.md)
 *   2. POST the recording to /api/voice/transcribe → text
 *   3. Auto-play TTS for new assistant replies via /api/voice/tts
 *
 * State machine:
 *   idle → listening → transcribing → (caller sends) → ... → speaking → idle
 *
 * The hook is decoupled from the chat hook — pass `onTextSubmit` to feed
 * the transcript into the existing chat send path, and pass `replyToSpeak`
 * to trigger auto-playback. This keeps voice mode opt-in without
 * restructuring the chat component.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'speaking'
  | 'error'

export type TtsProvider = 'aura2' | 'elevenlabs'

export interface UseVoiceChatOpts {
  /** Called with the transcribed text once transcription completes. */
  onTextSubmit: (text: string) => void
  /**
   * Most-recent assistant reply text + a stable id. When `id` changes and
   * voice mode is enabled, the hook will play TTS for `text` automatically.
   * Pass `null` to disable auto-playback.
   */
  replyToSpeak: { id: string; text: string } | null
  /** When false, no recording or TTS occurs. */
  enabled: boolean
  speaker?: string
  provider?: TtsProvider
}

export interface UseVoiceChatResult {
  state: VoiceState
  /** Last error message, cleared on next successful action. */
  error: string | null
  /** Begin recording. Resolves when the recorder is actually started. */
  startRecording: () => Promise<void>
  /** Stop recording + trigger transcription. */
  stopRecording: () => Promise<void>
  /**
   * Stop recording WITHOUT transcribing. Used by the PTT button when a
   * press is detected as a tap (too short to be a real utterance) — we
   * still need to release the mic stream + cancel the recorder, but we
   * skip the network round-trip.
   */
  cancelRecording: () => void
  /** Stop any TTS playback in progress. */
  stopSpeaking: () => void
  /** True while recording — useful for PTT button styling. */
  isRecording: boolean
  /** True while a TTS audio element is actively playing. */
  isSpeaking: boolean
}

const TRANSCRIBE_URL = '/api/voice/transcribe'
const TTS_URL = '/api/voice/tts'

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  // Nova 3 requires webm-opus. Browsers vary on what they advertise.
  const candidates = ['audio/webm;codecs=opus', 'audio/webm']
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return 'audio/webm'
}

export function useVoiceChat(opts: UseVoiceChatOpts): UseVoiceChatResult {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastSpokenIdRef = useRef<string | null>(null)

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    recorderRef.current = null
  }, [])

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setState((prev) => (prev === 'speaking' ? 'idle' : prev))
  }, [])

  /** Stop recording immediately, drop any captured audio, skip network. */
  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      try {
        recorder.stop()
      } catch {
        /* ignore — recorder may already be stopped */
      }
    }
    chunksRef.current = []
    cleanupStream()
    setState('idle')
  }, [cleanupStream])

  const startRecording = useCallback(async () => {
    if (!opts.enabled) return
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Mic access not supported in this browser')
      setState('error')
      return
    }
    try {
      stopSpeaking()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start()
      setState('listening')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('error')
      cleanupStream()
    }
  }, [opts.enabled, stopSpeaking, cleanupStream])

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanupStream()
      setState('idle')
      return
    }
    setState('transcribing')

    const stopped: Promise<void> = new Promise((resolve) => {
      recorder.onstop = () => resolve()
    })
    recorder.stop()
    await stopped
    const mimeType = recorder.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    cleanupStream()

    if (blob.size === 0) {
      setState('idle')
      return
    }

    try {
      const form = new FormData()
      form.append('audio', blob, `recording.${mimeType.includes('webm') ? 'webm' : 'ogg'}`)
      const resp = await fetch(TRANSCRIBE_URL, {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`Transcribe failed (${resp.status}): ${errText.slice(0, 200)}`)
      }
      const data = (await resp.json()) as { text?: string; error?: string }
      const text = (data.text ?? '').trim()
      if (!text) {
        // Empty transcript — caller can show a "didn't catch that" hint.
        setState('idle')
        return
      }
      opts.onTextSubmit(text)
      setState('idle')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('error')
    }
  }, [opts, cleanupStream])

  // Auto-play TTS for new assistant replies when voice mode is on.
  useEffect(() => {
    if (!opts.enabled) return
    const reply = opts.replyToSpeak
    if (!reply || !reply.text.trim()) return
    if (lastSpokenIdRef.current === reply.id) return
    lastSpokenIdRef.current = reply.id

    let cancelled = false
    void (async () => {
      try {
        setState('speaking')
        const resp = await fetch(TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            text: reply.text.slice(0, 5000),
            ...(opts.speaker ? { speaker: opts.speaker } : {}),
            ...(opts.provider ? { provider: opts.provider } : {}),
          }),
        })
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '')
          throw new Error(`TTS failed (${resp.status}): ${errText.slice(0, 200)}`)
        }
        const blob = await resp.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => {
          URL.revokeObjectURL(url)
          if (audioRef.current === audio) audioRef.current = null
          setState((prev) => (prev === 'speaking' ? 'idle' : prev))
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          setState('idle')
        }
        await audio.play()
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [opts.enabled, opts.replyToSpeak, opts.speaker, opts.provider])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cleanupStream()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [cleanupStream])

  return {
    state,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    stopSpeaking,
    isRecording: state === 'listening',
    isSpeaking: state === 'speaking',
  }
}
