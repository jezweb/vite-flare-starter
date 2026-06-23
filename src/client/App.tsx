import { lazy, Suspense, useEffect } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ScrollToTop } from './components/shared/ScrollToTop'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { createErrorHandler } from './lib/error-reporting'
import { ProtectedRoute } from './components/shared/ProtectedRoute'
import { PublicOnlyRoute } from './components/shared/PublicOnlyRoute'
import { ThemeURLHandler } from './components/ThemeURLHandler'
import { BuilderModeProvider } from './lib/builder-mode'
import { Mic, Camera, Kanban } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
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
const ForgotPasswordPage = lazy(() =>
  import('./modules/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
)
const ResetPasswordPage = lazy(() =>
  import('./modules/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
)
const VerifyEmailPage = lazy(() =>
  import('./modules/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage }))
)
const SettingsPage = lazy(() =>
  import('./modules/settings/pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
)
const AdminPage = lazy(() =>
  import('./modules/admin/pages/AdminPage').then((m) => ({ default: m.AdminPage }))
)
const AccessLogPage = lazy(() =>
  import('./modules/admin/pages/AccessLogPage').then((m) => ({ default: m.AccessLogPage }))
)
const ChatPage = lazy(() =>
  import('./modules/chat/pages/ChatPage').then((m) => ({ default: m.ChatPage }))
)
const ExtractPage = lazy(() =>
  import('./modules/chat/pages/ExtractPage').then((m) => ({ default: m.ExtractPage }))
)
const ProjectPage = lazy(() =>
  import('./modules/projects/pages/ProjectPage').then((m) => ({ default: m.ProjectPage }))
)
const ProjectsIndexPage = lazy(() =>
  import('./modules/projects/pages/ProjectsIndexPage').then((m) => ({
    default: m.ProjectsIndexPage,
  }))
)
const SpacesIndexPage = lazy(() =>
  import('./modules/spaces/pages/SpacesIndexPage').then((m) => ({ default: m.SpacesIndexPage }))
)
const SpacePage = lazy(() =>
  import('./modules/spaces/pages/SpacePage').then((m) => ({ default: m.SpacePage }))
)
const ArtifactsPage = lazy(() =>
  import('./modules/chat/pages/ArtifactsPage').then((m) => ({ default: m.ArtifactsPage }))
)
const ActivityPage = lazy(() =>
  import('./modules/activity/pages/ActivityPage').then((m) => ({ default: m.ActivityPage }))
)
const FilesPage = lazy(() =>
  import('./modules/files/pages/FilesPage').then((m) => ({ default: m.FilesPage }))
)
const SkillsPage = lazy(() =>
  import('./modules/skills/pages/SkillsPage').then((m) => ({ default: m.SkillsPage }))
)
const SkillDetailPage = lazy(() =>
  import('./modules/skills/pages/SkillDetailPage').then((m) => ({ default: m.SkillDetailPage }))
)
const KnowledgePage = lazy(() =>
  import('./modules/knowledge/pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage }))
)
const KnowledgeDetailPage = lazy(() =>
  import('./modules/knowledge/pages/KnowledgeDetailPage').then((m) => ({
    default: m.KnowledgeDetailPage,
  }))
)
const NotificationsPage = lazy(() =>
  import('./modules/notifications/pages/NotificationsPage').then((m) => ({
    default: m.NotificationsPage,
  }))
)
const ApprovalsPage = lazy(() =>
  import('./modules/approvals/pages/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage }))
)
const InboxPage = lazy(() =>
  import('./modules/inbox/pages/InboxPage').then((m) => ({ default: m.InboxPage }))
)
const QuestionsPage = lazy(() =>
  import('./modules/walkabout/pages/QuestionsPage').then((m) => ({ default: m.QuestionsPage }))
)
const JobsPage = lazy(() =>
  import('./modules/jobs/pages/JobsPage').then((m) => ({ default: m.JobsPage }))
)
const JobDetailPage = lazy(() =>
  import('./modules/jobs/pages/JobDetailPage').then((m) => ({ default: m.JobDetailPage }))
)
const FindingsPage = lazy(() =>
  import('./modules/findings/pages/FindingsPage').then((m) => ({ default: m.FindingsPage }))
)
const RoutinesPage = lazy(() =>
  import('./modules/routines/pages/RoutinesPage').then((m) => ({ default: m.RoutinesPage }))
)
const NewRoutinePage = lazy(() =>
  import('./modules/routines/pages/NewRoutinePage').then((m) => ({ default: m.NewRoutinePage }))
)
const RoutineDetailPage = lazy(() =>
  import('./modules/routines/pages/RoutineDetailPage').then((m) => ({
    default: m.RoutineDetailPage,
  }))
)
const OrganizationPage = lazy(() =>
  import('./modules/organizations/pages/OrganizationPage').then((m) => ({
    default: m.OrganizationPage,
  }))
)
const AcceptInvitationPage = lazy(() =>
  import('./pages/AcceptInvitationPage').then((m) => ({ default: m.AcceptInvitationPage }))
)
const ConnectorsPage = lazy(() =>
  import('./modules/connectors/pages/ConnectorsPage').then((m) => ({ default: m.ConnectorsPage }))
)
const VoiceInputExamplePage = lazy(() =>
  import('./modules/voice/pages/VoiceInputExamplePage').then((m) => ({
    default: m.VoiceInputExamplePage,
  }))
)
const VideoInputExamplePage = lazy(() =>
  import('./modules/video/pages/VideoInputExamplePage').then((m) => ({
    default: m.VideoInputExamplePage,
  }))
)
const KanbanDemoPage = lazy(() =>
  import('./modules/kanban-demo/pages/KanbanDemoPage').then((m) => ({ default: m.KanbanDemoPage }))
)
const AgentObservabilityPage = lazy(() =>
  import('./modules/agent-observability/pages/AgentObservabilityPage').then((m) => ({
    default: m.AgentObservabilityPage,
  }))
)
const AdminAgentPage = lazy(() =>
  import('./modules/admin-agent/pages/AdminAgentPage').then((m) => ({ default: m.AdminAgentPage }))
)
const AgentsPage = lazy(() =>
  import('./modules/agents/pages/AgentsPage').then((m) => ({ default: m.AgentsPage }))
)
const ComponentsPage = lazy(() =>
  import('./pages/ComponentsPage').then((m) => ({ default: m.ComponentsPage }))
)
const StyleGuidePage = lazy(() =>
  import('./pages/StyleGuidePage').then((m) => ({ default: m.StyleGuidePage }))
)
const HelpPage = lazy(() =>
  import('./modules/help/pages/HelpPage').then((m) => ({ default: m.HelpPage }))
)

function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner size="lg" className="text-muted-foreground" />
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

/**
 * Mints a fresh conversationId UUID and redirects to /dashboard/chat/{id}.
 * Lives at /dashboard/chat. Keeps the conversationId in router state instead
 * of React state — without this, useAgentChat's `use(initialMessagesPromise)`
 * suspends ChatPage, which remounts on resolve and re-allocates a new id,
 * suspending again in an infinite loop (see chat migration plan v2.1, 1C
 * commit). Preserves `?projectId=` so a "New chat in this project" link
 * stamps the right project on the first turn.
 */
function NewChatRedirect() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const id = crypto.randomUUID()
    const projectId = searchParams.get('projectId')
    const suffix = projectId ? `?projectId=${projectId}` : ''
    navigate(`/dashboard/chat/${id}${suffix}`, { replace: true })
  }, [navigate, searchParams])
  return <PageSpinner />
}

function App() {
  return (
    <ErrorBoundary onError={createErrorHandler()}>
      <BuilderModeProvider>
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
                  <Route path="admin/access-log" element={<AccessLogPage />} />

                  {/* AI Chat — split into a redirect at /chat and the real page
                at /chat/:conversationId. The redirect mints a UUID upfront
                so the DO instance name is in the URL (router state) rather
                than React state. Without this, useAgentChat's `use(initialMessagesPromise)`
                suspends ChatPage, which remounts on resolve, generating a
                NEW UUID, suspending again — infinite loop.
                Streaming state lives in the DO now, so the route swap from
                /chat → /chat/:id is safe (the SDK reconnects to the same
                DO instance addressed by URL). */}
                  <Route path="chat" element={<NewChatRedirect />} />
                  <Route path="chat/:conversationId" element={<ChatPage />} />
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
                  <Route path="skills/:slug" element={<SkillDetailPage />} />

                  {/* Knowledge — long-form indexed reference docs */}
                  <Route path="knowledge" element={<KnowledgePage />} />
                  <Route path="knowledge/:id" element={<KnowledgeDetailPage />} />

                  {/* Notifications full history (bell dropdown shows top 10) */}
                  <Route path="notifications" element={<NotificationsPage />} />

                  {/* Approval queue — autonomous-agent action review */}
                  <Route path="approvals" element={<ApprovalsPage />} />
                  <Route path="agent-observability" element={<AgentObservabilityPage />} />
                  <Route path="admin-chat" element={<AdminAgentPage />} />
                  <Route path="agents" element={<AgentsPage />} />
                  <Route path="inbox" element={<InboxPage />} />
                  <Route path="questions" element={<QuestionsPage />} />
                  <Route path="jobs" element={<JobsPage />} />
                  <Route path="jobs/:id" element={<JobDetailPage />} />
                  <Route path="findings" element={<FindingsPage />} />
                  <Route path="routines" element={<RoutinesPage />} />
                  <Route path="routines/new" element={<NewRoutinePage />} />
                  <Route path="routines/:routineId" element={<RoutineDetailPage />} />
                  <Route path="organization" element={<OrganizationPage />} />

                  {/* Per-user OAuth + bearer connections. URL canonical at
                `/connections` so it matches the sidebar label. Internal
                code still uses `connector` as the noun (one connector =
                one provider; one connection = one user's instance of
                that provider). The visible URL just sticks with the
                user-facing word. */}
                  <Route path="connections" element={<ConnectorsPage />} />
                  {/* Legacy alias — `/connectors` was the old canonical path.
                Redirect for any in-flight bookmarks. Safe to remove once
                we're confident no traffic still lands there. */}
                  <Route
                    path="connectors"
                    element={<Navigate to="/dashboard/connections" replace />}
                  />

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

                  {/* Kanban demo — exercises the <KanbanBoard> primitive against
                the generic entities API. Default OFF (the primitive
                itself ships always — this flag just controls the demo
                surface). */}
                  <Route
                    path="kanban-demo"
                    element={
                      <FeatureGatedPage
                        enabled={features.kanbanDemo}
                        icon={Kanban}
                        title="Kanban demo is opt-in"
                        description="The Kanban demo wires the <KanbanBoard> primitive to the entities API as a working reference. The primitive itself is always available for any module to import; this page is just the demo surface."
                        envVar="VITE_FEATURE_KANBAN_DEMO"
                      >
                        <KanbanDemoPage />
                      </FeatureGatedPage>
                    }
                  />

                  {/* Profile redirects to Settings (Profile tab is default) */}
                  <Route path="profile" element={<Navigate to="/dashboard/settings" replace />} />

                  {/* In-app glossary — gh #47 */}
                  <Route path="help" element={<HelpPage />} />

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
      </BuilderModeProvider>
    </ErrorBoundary>
  )
}

export default App
