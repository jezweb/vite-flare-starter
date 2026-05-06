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
 * to trigger auto-playback.
 *
 * Notable defences (added 2026-05-07 after brains-trust review):
 *   - iOS Safari audio unlock: when voice mode is enabled, an audio
 *     element is primed inside the user gesture so subsequent .src swaps
 *     can play() without NotAllowedError.
 *   - mimeType: detect actual support; bail with a clear error if neither
 *     webm-opus nor webm is supported (iOS Safari MediaRecorder ships
 *     with mp4/aac only — Nova 3 needs webm so we surface a helpful
 *     "voice mode unsupported on this browser" rather than crashing).
 *   - getUserMedia race: a session counter prevents a stale stream from
 *     starting recording after the user cancelled.
 *   - Reply-id is burned only after successful play() so a transient
 *     fetch failure doesn't permanently lose the reply.
 *   - Both fetches use AbortController with a timeout.
 *   - TTS fetch is aborted on stopSpeaking / startRecording / unmount /
 *     disable, so a late-arriving reply can't play over a fresh recording.
 *   - Object URL is revoked on every termination path (success, error,
 *     abort, stop, unmount).
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
   * Most-recent assistant reply text + a stable id, with a `complete` flag
   * so the hook never plays partial mid-stream text. Pass `null` to
   * disable auto-playback for this turn.
   */
  replyToSpeak: { id: string; text: string; complete: boolean } | null
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
  /** Stop recording without transcribing — used for tap-to-toggle. */
  cancelRecording: () => void
  /** Stop any TTS playback in progress; aborts in-flight TTS fetch. */
  stopSpeaking: () => void
  /**
   * Prime the audio element inside a user gesture so iOS Safari allows
   * subsequent autoplay. Call from the click handler that enables voice
   * mode. Idempotent — safe to call repeatedly.
   */
  unlockAudio: () => void
  /** True while recording — useful for PTT button styling. */
  isRecording: boolean
  /** True while a TTS audio element is actively playing. */
  isSpeaking: boolean
  /** True when the browser's MediaRecorder cannot produce webm-opus (e.g. iOS Safari). */
  recordingUnsupported: boolean
}

const TRANSCRIBE_URL = '/api/voice/transcribe'
const TTS_URL = '/api/voice/tts'
/** Both fetches abort after this many ms — surfaces stuck-on-network UX bugs. */
const FETCH_TIMEOUT_MS = 25_000

/** 100ms of silence MP3 — used to "unlock" the iOS audio element. */
const SILENT_MP3_DATA_URL =
  'data:audio/mpeg;base64,/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'

function pickMimeType(): { mime: string | null; supported: boolean } {
  if (typeof MediaRecorder === 'undefined') {
    return { mime: null, supported: false }
  }
  const candidates = ['audio/webm;codecs=opus', 'audio/webm']
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return { mime: c, supported: true }
  }
  // Nova 3 requires webm-opus per workers-ai-gotchas.md. iOS Safari
  // MediaRecorder only emits mp4/aac, so we bail rather than crash.
  return { mime: null, supported: false }
}

export function useVoiceChat(opts: UseVoiceChatOpts): UseVoiceChatResult {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  /** Single reusable audio element — primed inside a user gesture for iOS. */
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const lastSpokenIdRef = useRef<string | null>(null)
  /** Bumped on every cancel; startRecording aborts if it's stale on resume. */
  const sessionRef = useRef(0)
  /** Mirror of opts.enabled for use inside async continuations / aborts. */
  const enabledRef = useRef(opts.enabled)
  enabledRef.current = opts.enabled
  /** Abort controllers per-fetch so we can cancel from outside. */
  const transcribeAbortRef = useRef<AbortController | null>(null)
  const ttsAbortRef = useRef<AbortController | null>(null)
  /** Cached check so the UI can show an "unsupported" hint without trying. */
  const supportRef = useRef<{ mime: string | null; supported: boolean } | null>(null)

  if (supportRef.current === null && typeof window !== 'undefined') {
    supportRef.current = pickMimeType()
  }

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    recorderRef.current = null
  }, [])

  const revokeUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort()
      ttsAbortRef.current = null
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      } catch {
        /* ignore — element may be in a weird state */
      }
    }
    revokeUrl()
    setState((prev) => (prev === 'speaking' ? 'idle' : prev))
  }, [revokeUrl])

  /**
   * Prime an <audio> element inside a user gesture so iOS Safari treats
   * subsequent .src swaps as authorised. Without this, the auto-TTS
   * effect's play() rejects with NotAllowedError on iOS.
   */
  const unlockAudio = useCallback(() => {
    if (audioRef.current) return // already primed
    if (typeof window === 'undefined') return
    const a = new Audio()
    a.preload = 'auto'
    // playsInline + the lowercase HTML attribute are both needed on iOS
    // Safari 15-16 — without them, .play() rejects even from inside a
    // user gesture. Caught by DeepSeek v4 Flash brains-trust, missed by
    // the higher-cost reviewers — Flash earned its keep.
    // playsInline isn't on every TS lib; set both the property (cast) and
    // the lowercase HTML attribute for max iOS compatibility.
    ;(a as unknown as { playsInline?: boolean }).playsInline = true
    a.setAttribute('playsinline', '')
    // Set + play silent mp3 inside the gesture to satisfy iOS autoplay policy.
    a.src = SILENT_MP3_DATA_URL
    const playPromise = a.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Some browsers reject the silent prime — that's fine, we still
        // hold a reference for later .src updates.
      })
    }
    audioRef.current = a
  }, [])

  /** Stop recording immediately, drop captured audio, skip network. */
  const cancelRecording = useCallback(() => {
    sessionRef.current += 1 // invalidate any pending startRecording
    if (transcribeAbortRef.current) {
      transcribeAbortRef.current.abort()
      transcribeAbortRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.ondataavailable = null
      try {
        recorder.stop()
      } catch {
        /* ignore */
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
    if (!supportRef.current?.supported) {
      setError(
        'Voice recording requires a browser that supports WebM/Opus (Chrome, Firefox, or desktop Safari). iOS Safari is not yet supported.',
      )
      setState('error')
      return
    }
    const session = ++sessionRef.current

    try {
      // Abort any in-flight TTS so it can't play over the new recording.
      stopSpeaking()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // If the user cancelled while the permission prompt was open, bail.
      if (sessionRef.current !== session || !enabledRef.current) {
        for (const track of stream.getTracks()) track.stop()
        return
      }

      streamRef.current = stream
      const mime = supportRef.current.mime!
      const localChunks: Blob[] = []
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      recorderRef.current = recorder
      // Each recording owns its own chunks array (closure-captured) so a
      // late ondataavailable from a stopped recorder can't pollute the next.
      chunksRef.current = localChunks
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) localChunks.push(e.data)
      }
      // 1s timeslice — Safari sometimes drops the final chunk if we wait
      // for stop() to flush; periodic emits make us robust.
      recorder.start(1000)
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
    // No active recorder — still bump the session counter so any
    // pending getUserMedia (permission prompt still open from a
    // long-held press) doesn't resume into a hot recording.
    if (!recorder || recorder.state === 'inactive') {
      sessionRef.current += 1
      cleanupStream()
      setState('idle')
      return
    }
    setState('transcribing')
    const session = sessionRef.current

    // Promise resolves on `onstop`; falls back to a short timer in case
    // recorder.stop() throws and onstop never fires.
    const stopped: Promise<void> = new Promise((resolve) => {
      recorder.onstop = () => resolve()
      setTimeout(resolve, 5_000)
    })
    try {
      recorder.stop()
    } catch {
      // Already stopped or in a bad state; let the timeout above flush.
    }
    await stopped
    const mimeType = recorder.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    cleanupStream()

    if (blob.size === 0) {
      setState('idle')
      return
    }

    // Cancel any earlier transcribe still pending (rare).
    if (transcribeAbortRef.current) transcribeAbortRef.current.abort()
    const abort = new AbortController()
    transcribeAbortRef.current = abort
    const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS)

    try {
      const form = new FormData()
      form.append(
        'audio',
        blob,
        `recording.${mimeType.includes('webm') ? 'webm' : 'ogg'}`,
      )
      const resp = await fetch(TRANSCRIBE_URL, {
        method: 'POST',
        body: form,
        signal: abort.signal,
      })
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`Transcribe failed (${resp.status}): ${errText.slice(0, 200)}`)
      }
      const data = (await resp.json()) as { text?: string; error?: string }
      const text = (data.text ?? '').trim()
      // Discard the result if voice mode was disabled or another
      // recording started while we were waiting for the network.
      if (sessionRef.current !== session || !enabledRef.current) {
        setState('idle')
        return
      }
      if (!text) {
        // Empty transcript — surface a one-time hint so the user knows
        // the gesture was registered but the audio was silent.
        setError("Didn't catch that — try again.")
        setState('idle')
        return
      }
      opts.onTextSubmit(text)
      setState('idle')
    } catch (err) {
      if (abort.signal.aborted) {
        setState('idle')
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setState('error')
    } finally {
      clearTimeout(timer)
      if (transcribeAbortRef.current === abort) transcribeAbortRef.current = null
    }
  }, [opts, cleanupStream])

  // Auto-play TTS for new assistant replies when voice mode is on.
  useEffect(() => {
    if (!opts.enabled) return
    const reply = opts.replyToSpeak
    if (!reply || !reply.complete || !reply.text.trim()) return
    if (lastSpokenIdRef.current === reply.id) return

    // Cancel any previous TTS in-flight for an older reply.
    if (ttsAbortRef.current) ttsAbortRef.current.abort()
    const abort = new AbortController()
    ttsAbortRef.current = abort
    const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS)

    let assignedUrl: string | null = null

    void (async () => {
      try {
        setState('speaking')
        const resp = await fetch(TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({
            text: reply.text.slice(0, 5000),
            ...(opts.speaker ? { speaker: opts.speaker } : {}),
            ...(opts.provider ? { provider: opts.provider } : {}),
          }),
        })
        if (abort.signal.aborted) return
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '')
          throw new Error(`TTS failed (${resp.status}): ${errText.slice(0, 200)}`)
        }
        const blob = await resp.blob()
        if (abort.signal.aborted) return

        const url = URL.createObjectURL(blob)
        assignedUrl = url

        // Reuse the unlocked audio element when present; create one
        // otherwise (will work on Chrome/Firefox; fail on iOS without
        // a prior unlockAudio() call).
        const audio = audioRef.current ?? new Audio()
        audioRef.current = audio
        audio.onended = () => {
          revokeUrl()
          setState((prev) => (prev === 'speaking' ? 'idle' : prev))
        }
        audio.onerror = () => {
          revokeUrl()
          setError('Audio playback failed')
          setState('idle')
        }

        // Replace previous URL (if any) BEFORE assigning the new one
        // so we don't leak the old blob.
        revokeUrl()
        audioUrlRef.current = url
        audio.src = url

        await audio.play()

        // Only mark this reply spoken after play() resolves — a transient
        // fetch failure or autoplay block must NOT burn the reply id, or
        // it'll never play even after the user fixes the issue.
        lastSpokenIdRef.current = reply.id
      } catch (err) {
        if (abort.signal.aborted) return
        // play() rejection (Safari autoplay block, decode error) lands here.
        if (assignedUrl) {
          URL.revokeObjectURL(assignedUrl)
          if (audioUrlRef.current === assignedUrl) audioUrlRef.current = null
        }
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setState('idle')
      } finally {
        clearTimeout(timer)
        if (ttsAbortRef.current === abort) ttsAbortRef.current = null
      }
    })()

    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [opts.enabled, opts.replyToSpeak, opts.speaker, opts.provider, revokeUrl])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      sessionRef.current += 1
      if (transcribeAbortRef.current) transcribeAbortRef.current.abort()
      if (ttsAbortRef.current) ttsAbortRef.current.abort()
      cleanupStream()
      if (audioRef.current) {
        try {
          audioRef.current.pause()
          audioRef.current.removeAttribute('src')
        } catch {
          /* ignore */
        }
        audioRef.current = null
      }
      revokeUrl()
    }
  }, [cleanupStream, revokeUrl])

  return {
    state,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    stopSpeaking,
    unlockAudio,
    isRecording: state === 'listening',
    isSpeaking: state === 'speaking',
    recordingUnsupported: !(supportRef.current?.supported ?? true),
  }
}
