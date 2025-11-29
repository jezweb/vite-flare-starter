import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * ScrollToTop component
 * Scrolls to top of page on route change, except when navigating to hash links
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    // If there's a hash (e.g., #contact), scroll to that element
    if (hash) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.querySelector(hash)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' })
        }
      }, 0)
      return
    }
    // Otherwise scroll to top
    window.scrollTo(0, 0)
  }, [pathname, hash])

  return null
}
