import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ScrollToTop } from './components/shared/ScrollToTop'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { createErrorHandler } from './lib/error-reporting'
import { ProtectedRoute } from './components/shared/ProtectedRoute'
import { PublicOnlyRoute } from './components/shared/PublicOnlyRoute'
import { ThemeURLHandler } from './components/ThemeURLHandler'
import { Loader2, Mic, Camera } from 'lucide-react'
import { features } from '@/shared/config/features'
import { EmptyState } from './components/EmptyState'

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
const ProjectsIndexPage = lazy(() => import('./modules/projects/pages/ProjectsIndexPage').then(m => ({ default: m.ProjectsIndexPage })))
const SpacesIndexPage = lazy(() => import('./modules/spaces/pages/SpacesIndexPage').then(m => ({ default: m.SpacesIndexPage })))
const SpacePage = lazy(() => import('./modules/spaces/pages/SpacePage').then(m => ({ default: m.SpacePage })))
const ArtifactsPage = lazy(() => import('./modules/chat/pages/ArtifactsPage').then(m => ({ default: m.ArtifactsPage })))
const ActivityPage = lazy(() => import('./modules/activity/pages/ActivityPage').then(m => ({ default: m.ActivityPage })))
const FilesPage = lazy(() => import('./modules/files/pages/FilesPage').then(m => ({ default: m.FilesPage })))
const SkillsPage = lazy(() => import('./modules/skills/pages/SkillsPage').then(m => ({ default: m.SkillsPage })))
const NotificationsPage = lazy(() => import('./modules/notifications/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const ApprovalsPage = lazy(() => import('./modules/approvals/pages/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })))
const InboxPage = lazy(() => import('./modules/inbox/pages/InboxPage').then(m => ({ default: m.InboxPage })))
const RoutinesPage = lazy(() => import('./modules/routines/pages/RoutinesPage').then(m => ({ default: m.RoutinesPage })))
const NewRoutinePage = lazy(() => import('./modules/routines/pages/NewRoutinePage').then(m => ({ default: m.NewRoutinePage })))
const RoutineDetailPage = lazy(() => import('./modules/routines/pages/RoutineDetailPage').then(m => ({ default: m.RoutineDetailPage })))
const OrganizationPage = lazy(() => import('./modules/organizations/pages/OrganizationPage').then(m => ({ default: m.OrganizationPage })))
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage').then(m => ({ default: m.AcceptInvitationPage })))
const ConnectorsPage = lazy(() => import('./modules/connectors/pages/ConnectorsPage').then(m => ({ default: m.ConnectorsPage })))
const VoiceInputExamplePage = lazy(() => import('./modules/voice/pages/VoiceInputExamplePage').then(m => ({ default: m.VoiceInputExamplePage })))
const VideoInputExamplePage = lazy(() => import('./modules/video/pages/VideoInputExamplePage').then(m => ({ default: m.VideoInputExamplePage })))
const ComponentsPage = lazy(() => import('./pages/ComponentsPage').then(m => ({ default: m.ComponentsPage })))
const StyleGuidePage = lazy(() => import('./pages/StyleGuidePage').then(m => ({ default: m.StyleGuidePage })))

function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Renders the page when the feature is enabled; otherwise renders a
 * gentle "this feature is opt-in" empty state. Stops bookmarked links
 * to disabled features from looking like a 404.
 */
function FeatureGatedPage({
  enabled,
  icon,
  title,
  description,
  envVar,
  children,
}: {
  enabled: boolean
  icon: typeof Mic
  title: string
  description: string
  envVar: string
  children: React.ReactNode
}) {
  if (enabled) return <>{children}</>
  return (
    <div className="container mx-auto py-12">
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        tips={[`Set ${envVar}=true in your .dev.vars (or production env) and reload.`]}
      />
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
          {/* Accept-invitation — handles both signed-in (accept now) and
              signed-out (stash + bounce to sign-in) cases. */}
          <Route path="/accept-invitation/:invitationId" element={<AcceptInvitationPage />} />

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
            <Route path="projects" element={<ProjectsIndexPage />} />
            <Route path="projects/:id" element={<ProjectPage />} />
            {features.spaces && (
              <>
                <Route path="spaces" element={<SpacesIndexPage />} />
                <Route path="spaces/:id" element={<SpacePage />} />
              </>
            )}
            <Route path="artifacts" element={<ArtifactsPage />} />
            <Route path="extract" element={<ExtractPage />} />

            {/* Activity log */}
            <Route path="activity" element={<ActivityPage />} />

            {/* Files */}
            <Route path="files" element={<FilesPage />} />

            {/* Skills — agentskills.io registry UI */}
            <Route path="skills" element={<SkillsPage />} />

            {/* Notifications full history (bell dropdown shows top 10) */}
            <Route path="notifications" element={<NotificationsPage />} />

            {/* Approval queue — autonomous-agent action review */}
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="routines" element={<RoutinesPage />} />
            <Route path="routines/new" element={<NewRoutinePage />} />
            <Route path="routines/:routineId" element={<RoutineDetailPage />} />
            <Route path="organization" element={<OrganizationPage />} />

            {/* MCP Connectors — per-user OAuth + bearer connections */}
            <Route path="connectors" element={<ConnectorsPage />} />

            {/* Voice agent reference — @cloudflare/voice + agents SDK.
                Gated behind `voiceAgent` feature flag (default OFF). When
                disabled, the route still resolves but renders a friendly
                "opt-in" page so bookmarks don't 404. */}
            <Route
              path="voice-example"
              element={
                <FeatureGatedPage
                  enabled={features.voiceAgent}
                  icon={Mic}
                  title="Voice agent is opt-in"
                  description="The voice example streams microphone audio to a Durable Object for live transcription. It ships disabled by default — turn it on with a feature flag."
                  envVar="VITE_FEATURE_VOICE_AGENT"
                >
                  <VoiceInputExamplePage />
                </FeatureGatedPage>
              }
            />

            {/* Video agent reference — sampled frames → WS → Durable Object
                → Workers AI vision model. Same opt-in pattern as voice. */}
            <Route
              path="video-example"
              element={
                <FeatureGatedPage
                  enabled={features.videoAgent}
                  icon={Camera}
                  title="Video agent is opt-in"
                  description="The video example samples webcam frames and sends them to a vision model for live captions. It ships disabled by default — turn it on with a feature flag."
                  envVar="VITE_FEATURE_VIDEO_AGENT"
                >
                  <VideoInputExamplePage />
                </FeatureGatedPage>
              }
            />

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
