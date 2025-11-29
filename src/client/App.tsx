import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ScrollToTop } from './components/shared/ScrollToTop'
import { SignInPage } from './modules/auth/SignInPage'
import { SignUpPage } from './modules/auth/SignUpPage'
import { ProtectedRoute } from './components/shared/ProtectedRoute'
import { DashboardLayout } from './layouts/DashboardLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { DashboardPage } from './pages/DashboardPage'
import { LandingPage } from './pages/LandingPage'
import { SettingsPage } from './modules/settings/pages/SettingsPage'
import { StyleGuidePage } from './pages/StyleGuidePage'
import { ComponentsPage } from './pages/ComponentsPage'

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Public marketing pages with header/footer */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
        </Route>

        {/* Auth routes (standalone, no layout) */}
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />

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

          {/* Profile redirects to Settings (Profile tab is default) */}
          <Route path="profile" element={<Navigate to="/dashboard/settings" replace />} />

          {/* Component showcase for development reference */}
          <Route path="components" element={<ComponentsPage />} />

          {/* Style guide for development */}
          <Route path="style-guide" element={<StyleGuidePage />} />
        </Route>

        {/* Catch all - redirect to landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
