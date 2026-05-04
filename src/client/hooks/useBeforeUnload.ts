/**
 * useBeforeUnload — fires the browser's "Leave site?" prompt on
 * page unload (close tab, hard reload, navigate away from app) when
 * `enabled` is true.
 *
 * Note: this only handles BROWSER-level navigation (close, refresh,
 * external link). React Router in-app navigation does NOT fire the
 * `beforeunload` event — for that, callers should pair this with a
 * sessionStorage-backed draft so in-app sidebar clicks restore state.
 *
 * Modern browsers ignore the message argument and show their own
 * generic prompt; we still set `event.returnValue` for older browsers.
 */
import { useEffect } from 'react'

export function useBeforeUnload(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Required for some older browsers — modern Chrome/Safari/Firefox
      // ignore the string and show their own copy.
      event.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled])
}
