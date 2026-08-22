import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import AccountSlideOverPanel from './components/AccountSlideOverPanel'
import PendingApprovalSlideOverPanel from './components/PendingApprovalSlideOverPanel'

import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SetPasswordPage from './pages/SetPasswordPage'
import PendingApprovalPage from './pages/PendingApprovalPage'
import DashboardPage from './pages/DashboardPage'
import StaffListPage from './pages/StaffListPage'
import RosterDashboardPage from './pages/RosterDashboardPage'
import GenerationConfigPage from './pages/GenerationConfigPage'
import BlankRosterConfigPage from './pages/BlankRosterConfigPage'
import RosterGridPage from './pages/RosterGridPage'
import AccountSettingsPage from './pages/AccountSettingsPage'
import PendingApprovalReviewPage from './pages/PendingApprovalReviewPage'
import LeavePlannerPage from './pages/LeavePlannerPage'
import WeekendPlannerPage from './pages/WeekendPlannerPage'
import PlaceholderPage from './pages/PlaceholderPage'

// Standalone (outside the ProtectedRoute shell) because that shell is
// exactly what redirects here — routing it inside would loop. The page
// itself sends anyone whose must_change_password is already false back to
// the app, so this only has to establish that somebody is signed in.
function SetPasswordRoute() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return <SetPasswordPage />
}

function PendingRoute() {
  const { session, isApproved, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (isApproved) return <Navigate to="/" replace />
  return <PendingApprovalPage />
}

// The Staff list's desktop row click navigates to /account/:id with
// `state: { backgroundLocation }` set to wherever it was — a standard React
// Router pattern for a route-driven overlay: the main <Routes> below keeps
// rendering the background page (Staff list stays mounted, untouched)
// while a second <Routes> renders just the /account/:id match as a slide-
// over panel on top of it. A direct visit to /account/:id (no background
// state — e.g. a bookmark, or any other navigate() call that doesn't set
// it) falls through to the normal full-page route inside AppLayout instead.
function AppRoutes() {
  const location = useLocation()
  const backgroundLocation = location.state?.backgroundLocation

  return (
    <>
      <Routes location={backgroundLocation || location}>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/set-password" element={<SetPasswordRoute />} />
        <Route path="/pending" element={<PendingRoute />} />

        {/* Protected app shell */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />

          {/* Phase 4: Roster screens */}
          <Route path="roster" element={<RosterDashboardPage />} />
          <Route path="roster/generate" element={<GenerationConfigPage />} />
          <Route path="roster/build" element={<BlankRosterConfigPage />} />
          <Route path="roster/:id" element={<RosterGridPage />} />
          {/* Hours Summary now lives inside RosterDashboardPage as a tab
              (?view=summary) rather than its own route — this redirects
              anyone with the old standalone URL bookmarked/cached. */}
          <Route path="roster-summary" element={<Navigate to="/roster?view=summary" replace />} />

          <Route path="staff" element={<StaffListPage />} />
          <Route path="staff/pending/:id" element={<PendingApprovalReviewPage />} />
          <Route path="account" element={<AccountSettingsPage />} />
          <Route path="account/:id" element={<AccountSettingsPage />} />
          <Route path="leave" element={<LeavePlannerPage />} />
          <Route path="weekend" element={<WeekendPlannerPage />} />
          <Route
            path="swaps"
            element={<PlaceholderPage title="Shift swaps" description="Swap request workflow coming in a later phase." maxWidthClassName="md:max-w-2xl" />}
          />
          <Route
            path="shifts"
            element={<PlaceholderPage title="Open shifts" description="Locum shift marketplace coming in a later phase." />}
          />
          <Route
            path="settings"
            element={<PlaceholderPage title="Settings" description="No-code constraint editor coming in a later phase." />}
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {backgroundLocation && (
        <Routes>
          <Route
            path="/account/:id"
            element={
              <ProtectedRoute>
                <AccountSlideOverPanel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff/pending/:id"
            element={
              <ProtectedRoute>
                <PendingApprovalSlideOverPanel />
              </ProtectedRoute>
            }
          />
        </Routes>
      )}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
