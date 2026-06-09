/**
 * AppShell — the single layout primitive every page layout composes from.
 *
 * Replaces three monolithic layout files (DashboardLayout / PublicLayout /
 * PublicAppLayout) with one structural primitive + thin compositions. Forks
 * get the layout shapes they need without forking a whole layout file:
 *
 *   - No sidebar (header + main):      <AppShell header={...}>…</AppShell>
 *   - Header + footer, no sidebar:     <AppShell header={...} footer={...}>…</AppShell>
 *   - Sidebar (dashboard):             <AppShell sidebar={<AppSidebar />} header={...}>…
 *   - Right-hand sidebar:              <AppShell sidebar={<AppSidebar side="right" />} …>
 *   - Narrow / full-width content:     contentMaxWidth="narrow" | "full"
 *   - Per-area shapes:                 compose a different <AppShell> per route group
 *
 * Two structural modes, chosen by whether `sidebar` is provided:
 *   - sidebar mode — shadcn SidebarProvider + responsive collapse + a fixed
 *     full-height shell with the main region scrolling internally (dashboard).
 *   - stacked mode — a plain min-h-screen flex column with natural page flow
 *     (public/marketing/portal pages).
 *
 * Sidebar SIDE (left/right) is owned by the sidebar element itself — shadcn's
 * <Sidebar> handles `side` natively — so pass `<AppSidebar side="right" />`.
 * AppShell only decides sidebar-vs-stacked.
 */
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export type AppShellContentWidth = 'narrow' | 'medium' | 'wide' | 'full'

const CONTENT_MAX_WIDTH: Record<AppShellContentWidth, string> = {
  narrow: 'max-w-2xl',
  medium: 'max-w-5xl',
  wide: 'max-w-6xl',
  full: '',
}

export interface AppShellProps {
  children: ReactNode
  /**
   * Sidebar element (e.g. `<AppSidebar />`). Presence switches AppShell into
   * sidebar mode. Pass `<AppSidebar side="right" />` for a right-hand rail.
   */
  sidebar?: ReactNode
  /** Top bar element (e.g. `<SiteHeader />`). */
  header?: ReactNode
  /** Footer element. Rendered below main in stacked mode; below main inside
   *  the inset in sidebar mode. */
  footer?: ReactNode
  /** Element rendered between header and main — e.g. a verification banner. */
  banner?: ReactNode
  /** Constrain + centre the main content column. Default 'full'. */
  contentMaxWidth?: AppShellContentWidth
  /** Wrap main content in standard padding (p-4 md:p-6). Default true. */
  contentPadding?: boolean
  /**
   * Non-visual elements mounted inside the shell but outside the content
   * flow — command palette, keyboard-shortcut handler, document-title sync,
   * timezone auto-detect, etc.
   */
  overlays?: ReactNode
  /** id for the <main> landmark + skip-link target. Default 'main-content'. */
  mainId?: string
}

/**
 * Auto-collapse the sidebar to icon-only mode below 1024px, expanded above.
 *
 * Why a controlled `open` prop (vs the cookie-driven default): shadcn's
 * `useIsMobile` boundary is 768px, so between 768-1024 the sidebar would stay
 * expanded and crowd the content. We want icon-mode on tablets without bumping
 * the global mobile breakpoint (which also drives chart tick density). Below
 * 768 the primitive already swaps in a Sheet, so this only matters at 768-1023.
 *
 * Once the user toggles the sidebar, we stop reacting to viewport changes for
 * the rest of the session — the explicit choice wins. A new load picks the
 * responsive default again.
 */
function useResponsiveSidebarOpen(): {
  open: boolean
  onOpenChange: (next: boolean) => void
} {
  const computeDefault = () => (typeof window === 'undefined' ? true : window.innerWidth >= 1024)
  const [open, setOpen] = useState<boolean>(computeDefault)
  const userOverrideRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(min-width: 1024px)')
    const sync = () => {
      if (userOverrideRef.current) return
      setOpen(mql.matches)
    }
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [])

  const onOpenChange = (next: boolean) => {
    userOverrideRef.current = true
    setOpen(next)
  }

  return { open, onOpenChange }
}

function SkipToContent({ targetId }: { targetId: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
    >
      Skip to main content
    </a>
  )
}

export function AppShell({
  children,
  sidebar,
  header,
  footer,
  banner,
  contentMaxWidth = 'full',
  contentPadding = true,
  overlays,
  mainId = 'main-content',
}: AppShellProps) {
  const maxW = CONTENT_MAX_WIDTH[contentMaxWidth]
  const innerClass = cn(contentPadding && 'p-4 md:p-6', maxW && `mx-auto w-full ${maxW}`)
  const content = innerClass ? <div className={innerClass}>{children}</div> : children

  // ── Sidebar mode — shadcn provider + fixed full-height shell, main scrolls.
  if (sidebar) {
    return (
      <SidebarShell
        sidebar={sidebar}
        header={header}
        footer={footer}
        banner={banner}
        overlays={overlays}
        mainId={mainId}
        content={content}
      />
    )
  }

  // ── Stacked mode — natural page flow, header / main / footer column.
  return (
    <div className="flex min-h-screen flex-col">
      <SkipToContent targetId={mainId} />
      {overlays}
      {header}
      {banner}
      <main id={mainId} tabIndex={-1} className="flex-1">
        {content}
      </main>
      {footer}
    </div>
  )
}

/**
 * Sidebar-mode shell. Split into its own component so the responsive-open hook
 * (which must run unconditionally) never sits behind the `if (sidebar)` branch
 * in AppShell — keeps hook order stable across renders.
 */
function SidebarShell({
  sidebar,
  header,
  footer,
  banner,
  overlays,
  mainId,
  content,
}: {
  sidebar: ReactNode
  header?: ReactNode
  footer?: ReactNode
  banner?: ReactNode
  overlays?: ReactNode
  mainId: string
  content: ReactNode
}) {
  const { open, onOpenChange } = useResponsiveSidebarOpen()
  return (
    <div className="h-svh overflow-hidden">
      <SidebarProvider
        open={open}
        onOpenChange={onOpenChange}
        className="h-full"
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)',
            '--header-height': 'calc(var(--spacing) * 14)',
          } as CSSProperties
        }
      >
        <SkipToContent targetId={mainId} />
        {sidebar}
        {overlays}
        <SidebarInset className="flex h-full min-w-0 flex-col">
          {header}
          {banner}
          <main id={mainId} tabIndex={-1} className="flex-1 min-h-0 overflow-y-auto">
            {content}
          </main>
          {footer}
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
