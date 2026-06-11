/**
 * Walkabout tour — a floating guide card that walks the REAL app page by page
 * with voice narration and a spotlight that scrolls to each section as the
 * narration reaches it. No library: ~200 portable lines driven by tour/steps.ts
 * and the generated tour/cues.gen.ts. First sign-in offers it once; the Guide
 * footer (Assist.tsx) and a menu entry can always restart it.
 *
 * shadcn-native: this is the FieldProof template remapped to semantic tokens
 * (bg-card / text-primary / text-primary-foreground / bg-muted) so it drops
 * into any vite-flare-starter fork with no restyle. The deep reference is
 * ~/Documents/.jez/knowledge/guided-voice-tour-pattern.md.
 *
 * Audio: browsers block autoplay, so narration starts from the user's explicit
 * Start (a gesture) and then auto-plays as steps advance. The speaker toggle
 * mutes/unmutes for the rest of the tour.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Compass, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { TOUR_STEPS, markTour, tourSeen } from '../tour/steps'
import { TOUR_CUES, type TourCue } from '../tour/cues.gen'

/**
 * A step's page is "current" when the location is that page OR a child of it.
 * Prefix-match (not exact) matters for two real cases in this starter:
 *   - self-redirecting index routes — `/dashboard/chat` mounts then redirects
 *     to `/dashboard/chat/{uuid}`; exact-match would never register "arrived"
 *     and the wander guard would mis-pause (or, with the wrong effect deps,
 *     hard-hang). See the gotcha in the knowledge doc.
 *   - drilling into a detail inside the same section (a list → one row) should
 *     not count as wandering away from the step.
 */
function onStepPage(pathname: string, stepPath: string): boolean {
  return pathname === stepPath || pathname.startsWith(`${stepPath}/`)
}

export function useTour() {
  const [active, setActive] = useState(false)
  const [offer, setOffer] = useState(false)
  const [initialStep, setInitialStep] = useState(0)

  useEffect(() => {
    // Deep link: ?tour=N starts the tour at step N — a support tool ("click
    // this link and listen"). Autoplay will be gesture-blocked on a fresh
    // load; the card opens paused and play() is one tap away.
    const n = Number(new URLSearchParams(window.location.search).get('tour'))
    if (Number.isInteger(n) && n >= 1 && n <= TOUR_STEPS.length) {
      setInitialStep(n - 1)
      setActive(true)
      return
    }
    if (!tourSeen()) setOffer(true)
  }, [])

  const start = useCallback(() => {
    setOffer(false)
    setInitialStep(0)
    setActive(true)
  }, [])
  const dismissOffer = useCallback(() => {
    markTour('dismissed')
    setOffer(false)
  }, [])
  const finish = useCallback((state: 'done' | 'dismissed') => {
    markTour(state)
    setActive(false)
  }, [])

  return { active, offer, start, dismissOffer, finish, initialStep }
}

export function TourOffer({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[1100] max-w-xs rounded-lg border bg-card p-4 text-card-foreground shadow-xl">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Compass className="h-5 w-5 text-primary" />
        </span>
        <div>
          <p className="font-semibold leading-tight">First time here?</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Take the two-minute guided tour — it walks every page with a quick voice explainer.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onStart}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Start the tour
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
        >
          Not now
        </button>
      </div>
    </div>
  )
}

/** Breathing room between a step's narration ending and auto-advancing. */
const AUTO_ADVANCE_DELAY_MS = 1400

/** Move the spotlight slightly BEFORE the voice reaches its subject. */
const CUE_LOOKAHEAD_S = 0.3

/** Cue list for a step: generated timings, else the static highlight, else none. */
function cuesForStep(step: (typeof TOUR_STEPS)[number]): TourCue[] {
  const key = step.audio.match(/(step-\d+)\.mp3$/)?.[1]
  const generated = key ? TOUR_CUES[key] : undefined
  if (generated && generated.length > 0) return generated
  return step.highlight ? [{ selector: step.highlight, at: 0 }] : []
}

export function Tour({
  onClose,
  initialStep = 0,
}: {
  onClose: (state: 'done' | 'dismissed') => void
  initialStep?: number
}) {
  const [i, setI] = useState(initialStep)
  const [muted, setMuted] = useState(false)
  const [paused, setPaused] = useState(false)
  /** Which element the spotlight is on — driven by the narration's clock. */
  const [activeSelector, setActiveSelector] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** True once the router has actually landed on this step's page — needed to
      tell the tour's own navigation apart from the user wandering off. */
  const arrivedRef = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  // biome-ignore lint/style/noNonNullAssertion: i is always a valid index (clamped by setI / keyboard)
  const step = TOUR_STEPS[i]!

  // Navigate + narrate ONCE per step change. Deps are [i] only: `navigate`
  // changes identity on every location change, so including it replays the
  // audio (and yanks the user back) whenever they click around mid-tour —
  // exploring the page during a step must not re-trigger the step. On a
  // self-redirecting index route (/dashboard/chat → /chat/{id}), listing
  // `navigate` would also hard-HANG (the step nav and the index redirect
  // ping-pong). Leave the deps as [i].
  //
  // Auto-advance: when the narration finishes naturally, move on after a
  // breath — the tour demos itself hands-free. Pause stops the audio, so
  // `onended` never fires and the tour holds. The last step always waits
  // for an explicit Finish.
  //
  // DO NOT add navigate/step/muted to the deps below — it replays the audio on
  // every in-step click and HARD-HANGS on self-redirecting index routes
  // (/dashboard/chat). The deps are [i] by design; see the knowledge-doc gotcha.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are [i] only by design — see above
  useEffect(() => {
    arrivedRef.current = false
    navigate(step.path)
    const cues = cuesForStep(step)
    const audio = new Audio(step.audio)
    audioRef.current = audio
    audio.muted = muted
    audio.onended = () => {
      advanceTimerRef.current = setTimeout(() => {
        setI((cur) => (cur < TOUR_STEPS.length - 1 ? cur + 1 : cur))
      }, AUTO_ADVANCE_DELAY_MS)
    }
    // The spotlight follows the narration's own clock: the latest cue at or
    // before currentTime wins. Pausing pauses the spotlight for free, and if
    // playback is blocked entirely we still light the first cue.
    audio.ontimeupdate = () => {
      const t = audio.currentTime + CUE_LOOKAHEAD_S
      let sel: string | null = null
      for (const c of cues) if (c.at <= t) sel = c.selector
      if (sel) setActiveSelector(sel) // setState same-value is a no-op render
    }
    setPaused(false)
    setActiveSelector(cues[0]?.selector ?? null)
    // If the browser blocks autoplay (e.g. a ?tour=N deep link with no
    // gesture yet), show the card paused — play is one tap away.
    void audio.play().catch(() => setPaused(true))
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
      audio.onended = null
      audio.ontimeupdate = null
      audio.pause()
      audioRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the step index may re-trigger
  }, [i])

  // Spotlight: scroll to + halo whichever element the narration is currently
  // describing (retry briefly — lazy pages and queries land at their own
  // pace; later cues hit instantly because the page is already rendered).
  useEffect(() => {
    if (!activeSelector) return
    let cancelled = false
    let lit: Element | null = null
    let tries = 0
    const attempt = () => {
      if (cancelled) return
      const el = document.querySelector(activeSelector)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('tour-spotlight')
        lit = el
      } else if (tries++ < 10) {
        setTimeout(attempt, 400)
      }
    }
    const t = setTimeout(attempt, 50) // near-instant; the retry loop covers slow pages
    return () => {
      cancelled = true
      clearTimeout(t)
      lit?.classList.remove('tour-spotlight')
    }
  }, [activeSelector])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

  // Pause-on-wander: the user clicking away mid-step is welcome — but the
  // guide shouldn't keep talking about a page they've left. Once we've
  // ARRIVED on the step's page (arrivedRef — the tour's own navigation must
  // not look like wandering), any OTHER page holds the tour; play resumes
  // where it left off, back on the step's page. Prefix-match so a step's own
  // redirect / a detail drill-down still counts as "on the page".
  // biome-ignore lint/correctness/useExhaustiveDependencies: `i` is an intentional re-run trigger (see note below), not read in the body
  useEffect(() => {
    if (onStepPage(location.pathname, step.path)) {
      arrivedRef.current = true
      return
    }
    if (!arrivedRef.current || paused) return
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
    audioRef.current?.pause()
    setPaused(true)
    // `i` must be a dep too: if two consecutive steps share a path (a fork that
    // puts steps on one route), without it this effect never re-runs to re-mark
    // arrival after the narrate effect reset arrivedRef — wander-pause goes
    // silently dead on the second step (Zoomtrail's tabs lesson, router version).
  }, [i, location.pathname, step.path, paused])

  const wandered = !onStepPage(location.pathname, step.path)
  const last = i === TOUR_STEPS.length - 1

  const resume = useCallback(() => {
    if (wandered) navigate(step.path)
    const audio = audioRef.current
    if (audio) void audio.play().catch(() => undefined)
    setPaused(false)
  }, [wandered, navigate, step.path])

  // Keyboard: ←/→ step, Esc closes. Skipped while typing in a field.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (ev.key === 'ArrowRight') setI((cur) => Math.min(cur + 1, TOUR_STEPS.length - 1))
      else if (ev.key === 'ArrowLeft') setI((cur) => Math.max(cur - 1, 0))
      else if (ev.key === 'Escape') onClose('dismissed')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed bottom-5 right-5 z-[1100] w-[330px] max-w-[calc(100vw-2.5rem)] rounded-lg border border-t-4 !border-t-primary bg-card p-4 text-card-foreground shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
          Tour · {i + 1} of {TOUR_STEPS.length}
        </p>
        <div className="-mr-1 -mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (paused) {
                resume() // brings the user back to the step's page if they wandered
              } else {
                // Hold here: stop narration AND cancel any pending advance.
                if (advanceTimerRef.current) {
                  clearTimeout(advanceTimerRef.current)
                  advanceTimerRef.current = null
                }
                audioRef.current?.pause()
                setPaused(true)
              }
            }}
            aria-label={paused ? 'Resume the tour' : 'Pause the tour'}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute narration' : 'Mute narration'}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => onClose('dismissed')}
            aria-label="Close tour"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <h3 className="mt-1 font-semibold">{step.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
      {paused && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
          <Play className="h-3 w-3 shrink-0" />
          {wandered
            ? 'Paused while you explore — play picks up where it left off.'
            : 'Paused — play to continue.'}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1">
          {TOUR_STEPS.map((s, d) => (
            <span
              key={s.path}
              className={`h-1.5 w-1.5 rounded-full ${d === i ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {i > 0 && (
            <button
              type="button"
              onClick={() => setI(i - 1)}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? onClose('done') : setI(i + 1))}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {last ? 'Finish' : 'Next'} {!last && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
