import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'

import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import PendingApprovalPage from './pages/PendingApprovalPage'
import DashboardPage from './pages/DashboardPage'
import StaffListPage from './pages/StaffListPage'
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
            <Route
              path="roster"
              element={<PlaceholderPage title="Roster" description="The interactive roster grid will be built in Phase 3, once the scheduling engine is connected." />}
            />
            <Route path="staff" element={<StaffListPage />} />
            <Route
              path="leave"
              element={<PlaceholderPage title="Leave requests" description="Leave submission and approval workflow coming in a later phase." />}
            />
            <Route
              path="swaps"
              element={<PlaceholderPage title="Shift swaps" description="Swap request workflow coming in a later phase." />}
            />
            <Route
              path="settings"
              element={<PlaceholderPage title="Rules & settings" description="No-code constraint editor coming in a later phase." />}
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
