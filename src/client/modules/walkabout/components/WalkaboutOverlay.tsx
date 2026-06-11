/**
 * WalkaboutOverlay — the single mount point for the guided tour (and, from
 * Phase 2, the ask-the-app Guide FAB). Dropped into the dashboard's invisible
 * overlays slot (DashboardLayout → AppShell `overlays`). Renders nothing unless
 * the `walkabout` feature flag is on.
 *
 * Restart from anywhere — a menu item, a How-it-works button, the Guide FAB —
 * by dispatching the window event: `window.dispatchEvent(new Event(START_TOUR_EVENT))`
 * (or call the exported `startWalkabout()` helper). No context provider needed,
 * so any component in the tree can restart the tour without prop-drilling.
 */
import { useEffect } from 'react'
import { features } from '@/shared/config/features'
import { Tour, TourOffer, useTour } from './Tour'
import { AssistWidget } from './Assist'

export const START_TOUR_EVENT = 'walkabout:start-tour'

/** Restart the guided tour from anywhere in the app. */
export function startWalkabout() {
  window.dispatchEvent(new Event(START_TOUR_EVENT))
}

export function WalkaboutOverlay() {
  // Hooks must run unconditionally — gate on the flag AFTER calling them.
  const tour = useTour()

  useEffect(() => {
    const onStart = () => tour.start()
    window.addEventListener(START_TOUR_EVENT, onStart)
    return () => window.removeEventListener(START_TOUR_EVENT, onStart)
  }, [tour])

  if (!features.walkabout) return null

  return (
    <>
      {tour.offer && <TourOffer onStart={tour.start} onDismiss={tour.dismissOffer} />}
      {tour.active && <Tour onClose={tour.finish} initialStep={tour.initialStep} />}
      {/* The Guide FAB hides while the tour or its offer owns the corner —
          one corner, one entry point. */}
      <AssistWidget onStartTour={tour.start} hidden={tour.active || tour.offer} />
    </>
  )
}
