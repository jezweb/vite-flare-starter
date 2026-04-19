import { useEffect } from 'react'
import { appConfig } from '@/shared/config/app'

/**
 * Sets `document.title` to `<page> · <app name>` while the component is mounted,
 * and restores the app name on unmount. Pass a falsy title to show only the
 * app name (useful for index/dashboard pages).
 */
export function useDocumentTitle(pageTitle?: string | null) {
  useEffect(() => {
    const appName = appConfig.name
    document.title = pageTitle ? `${pageTitle} · ${appName}` : appName
    return () => {
      document.title = appName
    }
  }, [pageTitle])
}
