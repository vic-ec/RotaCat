import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'

import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import PendingApprovalPage from './pages/PendingApprovalPage'
import DashboardPage from './pages/DashboardPage'
import StaffListPage from './pages/StaffListPage'
import RosterDashboardPage from './pages/RosterDashboardPage'
import GenerationConfigPage from './pages/GenerationConfigPage'
import RosterGridPage from './pages/RosterGridPage'
import AccountSettingsPage from './pages/AccountSettingsPage'
import PlaceholderPage from './pages/PlaceholderPage'

function PendingRoute() {
  const { session, isApproved, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (isApproved) return <Navigate to="/" replace />
  return <PendingApprovalPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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
            <Route path="roster/:id" element={<RosterGridPage />} />

            <Route path="staff" element={<StaffListPage />} />
            <Route path="account" element={<AccountSettingsPage />} />
            <Route path="account/:id" element={<AccountSettingsPage />} />
            <Route
              path="leave"
              element={<PlaceholderPage title="Leave Requests" description="Leave submission and approval workflow coming in a later phase." />}
            />
            <Route
              path="swaps"
              element={<PlaceholderPage title="Shift swaps" description="Swap request workflow coming in a later phase." />}
            />
            <Route
              path="settings"
              element={<PlaceholderPage title="Settings" description="No-code constraint editor coming in a later phase." />}
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
