/**
 * ChatFirstRunTour — annotated overlay for first-time visitors to
 * `/dashboard/chat`. See gh #46.
 *
 * Anchors `<Popover>` to real DOM elements via `data-tour="..."`
 * attributes. Non-modal — user can dismiss any time. State persists
 * via `user.preferences.tours.chat = 'seen'` AND a localStorage flag
 * (`chat-tour-seen`) — the local flag wins immediately on dismiss so
 * the tour cannot reappear in the gap before the server PATCH lands
 * (audit P1-001).
 *
 * Render conditionally: ONLY on plain `/dashboard/chat` (not
 * `/dashboard/chat/:id`); ONLY when neither persistence layer reports
 * the tour as seen.
 */
import { useEffect, useMemo, useState } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { usePreferences, useUpdatePreferences } from '@/client/modules/settings/hooks/useSettings'

const LOCAL_TOUR_SEEN_KEY = 'chat-tour-seen'

function readLocalTourSeen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(LOCAL_TOUR_SEEN_KEY) === 'true'
  } catch {
    return false
  }
}

function writeLocalTourSeen(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_TOUR_SEEN_KEY, 'true')
  } catch {
    /* private browsing — server-side persistence is the fallback */
  }
}

interface TourStep {
  id: string
  /** matches `data-tour="..."` on a real DOM element */
  selector: string
  title: string
  body: string
  /** Where to position the popover relative to the anchor */
  side?: 'top' | 'bottom' | 'left' | 'right'
}

const STEPS: TourStep[] = [
  {
    id: 'model-picker',
    selector: '[data-tour="chat-model-picker"]',
    title: 'Pick the AI you want',
    body: 'Different models suit different tasks. The free options work out of the box. Premium models (Claude, GPT, Gemini) need an API key — your admin sets that up.',
    side: 'top',
  },
  {
    id: 'slash',
    selector: '[data-tour="chat-input"]',
    title: 'Type / for shortcuts',
    body: 'Type a slash to bring up reusable prompts (we call them skills). Try /morning-brief or /research. You can edit any of them or add your own.',
    side: 'top',
  },
  {
    id: 'attach',
    selector: '[data-tour="chat-attach"]',
    title: 'Add files, images, or screenshots',
    body: 'Click the paperclip, paste an image, or grab a screenshot from the menu. Anything you attach becomes context for the next reply.',
    side: 'top',
  },
]

export function ChatFirstRunTour() {
  const { data: prefs, isLoading } = usePreferences()
  const update = useUpdatePreferences()
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)
  // Read once at mount — a re-read after dismiss isn't useful since
  // we set this synchronously inside `close()` and also bail via
  // setOpen(false). New mounts pick up the persisted state.
  const [localSeen, setLocalSeen] = useState<boolean>(() => readLocalTourSeen())

  const seen = localSeen || prefs?.tours?.chat === 'seen'

  useEffect(() => {
    if (isLoading) return
    if (seen) return
    // Wait one tick so the anchored DOM elements have mounted before
    // we open the popover (mounts inside ChatPage, which renders us).
    const t = setTimeout(() => setOpen(true), 200)
    return () => clearTimeout(t)
  }, [isLoading, seen])

  const current = STEPS[step]
  const anchor = useAnchor(current?.selector)

  if (isLoading || seen || !current || !anchor || !open) return null

  const isLast = step === STEPS.length - 1

  function close(markSeen: boolean) {
    setOpen(false)
    if (markSeen) {
      // Persist locally first — synchronous, immune to network races.
      writeLocalTourSeen()
      setLocalSeen(true)
      // Best-effort server persistence so the dismissal travels with
      // the user across devices. Failure is non-blocking — the local
      // flag has already prevented re-display on this device.
      if (prefs) {
        update.mutate({ ...prefs, tours: { ...prefs.tours, chat: 'seen' } })
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={(v) => !v && close(true)}>
      <PopoverAnchor virtualRef={{ current: anchor }} />
      <PopoverContent
        side={current.side ?? 'top'}
        align="center"
        sideOffset={12}
        className="w-80"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>
              Step {step + 1} of {STEPS.length}
            </span>
            <button
              type="button"
              onClick={() => close(true)}
              className="text-muted-foreground/70 hover:text-foreground"
            >
              Skip tour
            </button>
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold">{current.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{current.body}</p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            {step > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={() => close(true)}>
                Got it
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Re-resolve the anchor element each render so we pick up newly-mounted
 * targets (e.g. ModelSelector mounts after the page settles).
 */
function useAnchor(selector?: string): HTMLElement | null {
  const tick = useReanchorTick()
  return useMemo(() => {
    if (!selector || typeof document === 'undefined') return null
    return document.querySelector<HTMLElement>(selector) ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, tick])
}

/** Bumps every 100ms for the first 1s after mount so anchors resolve. */
function useReanchorTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let count = 0
    const interval = setInterval(() => {
      setTick((t) => t + 1)
      count += 1
      if (count >= 10) clearInterval(interval)
    }, 100)
    return () => clearInterval(interval)
  }, [])
  return tick
}
