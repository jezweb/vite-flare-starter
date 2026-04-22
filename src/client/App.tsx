import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ScrollToTop } from './components/shared/ScrollToTop'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { createErrorHandler } from './lib/error-reporting'
import { ProtectedRoute } from './components/shared/ProtectedRoute'
import { PublicOnlyRoute } from './components/shared/PublicOnlyRoute'
import { ThemeURLHandler } from './components/ThemeURLHandler'
import { Loader2 } from 'lucide-react'

// Critical-path imports (always in the main bundle)
import { LandingPage } from './pages/LandingPage'
import { DashboardLayout } from './layouts/DashboardLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'

// Auth pages — small, fast-loading, keep in main bundle
import { SignInPage } from './modules/auth/SignInPage'
import { SignUpPage } from './modules/auth/SignUpPage'

// Lazy-loaded pages — each gets its own chunk, loaded on first visit
const ForgotPasswordPage = lazy(() => import('./modules/auth/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('./modules/auth/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
const VerifyEmailPage = lazy(() => import('./modules/auth/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })))
const SettingsPage = lazy(() => import('./modules/settings/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const AdminPage = lazy(() => import('./modules/admin/pages/AdminPage').then(m => ({ default: m.AdminPage })))
const ChatPage = lazy(() => import('./modules/chat/pages/ChatPage').then(m => ({ default: m.ChatPage })))
const ExtractPage = lazy(() => import('./modules/chat/pages/ExtractPage').then(m => ({ default: m.ExtractPage })))
const ProjectPage = lazy(() => import('./modules/projects/pages/ProjectPage').then(m => ({ default: m.ProjectPage })))
const ActivityPage = lazy(() => import('./modules/activity/pages/ActivityPage').then(m => ({ default: m.ActivityPage })))
const FilesPage = lazy(() => import('./modules/files/pages/FilesPage').then(m => ({ default: m.FilesPage })))
const SkillsPage = lazy(() => import('./modules/skills/pages/SkillsPage').then(m => ({ default: m.SkillsPage })))
const NotificationsPage = lazy(() => import('./modules/notifications/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const ConnectorsPage = lazy(() => import('./modules/connectors/pages/ConnectorsPage').then(m => ({ default: m.ConnectorsPage })))
const ComponentsPage = lazy(() => import('./pages/ComponentsPage').then(m => ({ default: m.ComponentsPage })))
const StyleGuidePage = lazy(() => import('./pages/StyleGuidePage').then(m => ({ default: m.StyleGuidePage })))

function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary onError={createErrorHandler()}>
      <TooltipProvider delayDuration={200}>
      <BrowserRouter>
        <ScrollToTop />
        <ThemeURLHandler />
        <Suspense fallback={<PageSpinner />}>
        <Routes>
          {/* Public marketing pages with header/footer */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<LandingPage />} />
          </Route>

          {/* Auth routes (standalone, no layout) — bounce already-signed-in
              users back to the dashboard so /sign-in and /sign-up never show
              a confusing form to a returning user. */}
          <Route
            path="/sign-in"
            element={
              <PublicOnlyRoute>
                <SignInPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/sign-up"
            element={
              <PublicOnlyRoute>
                <SignUpPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* Protected dashboard routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard index page */}
            <Route index element={<DashboardPage />} />

            {/* Settings module - profile, password, theme, etc. */}
            <Route path="settings" element={<SettingsPage />} />

            {/* Admin panel - users, features, tokens */}
            <Route path="admin" element={<AdminPage />} />

            {/* AI Chat — single route with optional conversationId so
                transitioning from /chat to /chat/:id (post-first-send)
                doesn't remount ChatPage and wipe in-flight streaming
                state. Two separate routes was the C1 regression cause:
                navigate(replace:true) between Route entries unmounts. */}
            <Route path="chat/:conversationId?" element={<ChatPage />} />
            <Route path="projects/:id" element={<ProjectPage />} />
            <Route path="extract" element={<ExtractPage />} />

            {/* Activity log */}
            <Route path="activity" element={<ActivityPage />} />

            {/* Files */}
            <Route path="files" element={<FilesPage />} />

            {/* Skills — agentskills.io registry UI */}
            <Route path="skills" element={<SkillsPage />} />

            {/* Notifications full history (bell dropdown shows top 10) */}
            <Route path="notifications" element={<NotificationsPage />} />

            {/* MCP Connectors — per-user OAuth + bearer connections */}
            <Route path="connectors" element={<ConnectorsPage />} />

            {/* Profile redirects to Settings (Profile tab is default) */}
            <Route path="profile" element={<Navigate to="/dashboard/settings" replace />} />

            {/* Component showcase for development reference */}
            <Route path="components" element={<ComponentsPage />} />

            {/* Style guide for development */}
            <Route path="style-guide" element={<StyleGuidePage />} />

            {/* Dashboard catch-all — keeps authed users inside the shell.
                Silently redirecting to "/" looked like a crash to users who
                followed a stale bookmark. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Public catch-all — same page, unauthed shell. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  )
}

export default App
