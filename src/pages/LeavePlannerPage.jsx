import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LeaveDashboard from '../components/LeaveDashboard'
import LeaveRequestForm from '../components/LeaveRequestForm'
import LeaveApprovalQueue from '../components/LeaveApprovalQueue'
import LeaveListView from '../components/LeaveListView'
import AnnualLeavePlanner from '../components/AnnualLeavePlanner'
import SpecialLeavePlanner from '../components/SpecialLeavePlanner'

export default function LeavePlannerPage() {
  const { canSubmitLeave, isAdmin, isLocum } = useAuth()
  // "Leave" (the dashboard) is everyone's landing tab now — a compact
  // allowance/upcoming/team-today summary in place of dropping straight
  // into a request form or a big grid, per the mobile-first review this
  // replaced. The other tabs are still one tap away underneath it.
  const [tab, setTab] = useState('dashboard')

  // Locums can't submit or see leave at all (leave_select RLS returns
  // nothing for them) — redirect rather than render restricted content
  // behind a resolved route.
  if (isLocum) return <Navigate to="/" replace />

  // Annual/Special Leave planners are year-round views — the clerk leave_select
  // RLS clause only ever returns leave active *today*, so a full-year grid
  // would render almost entirely empty for them. Scoped to admin/doctor,
  // same audience as the queue/submit tabs, rather than showing a
  // misleadingly-blank planner.
  const canViewYearPlanners = isAdmin || canSubmitLeave
  const tabs = [
    { key: 'dashboard', label: 'Leave' },
    ...(isAdmin ? [{ key: 'queue', label: 'Approval queue' }] : []),
    ...(canSubmitLeave ? [{ key: 'submit', label: 'My leave' }] : []),
    { key: 'team', label: 'Team leave' },
    ...(canViewYearPlanners ? [{ key: 'annual', label: 'Annual leave' }, { key: 'special', label: 'Special leave' }] : []),
  ]

  // The year-grid planner tabs need real width for 3 side-by-side month
  // tables per quarter — the request/list tabs stay narrow and readable at
  // max-w-2xl, so only widen the shell when one of the grid tabs is active.
  const isYearGridTab = tab === 'annual' || tab === 'special'

  return (
    <div className={`mx-auto ${isYearGridTab ? 'max-w-6xl' : 'max-w-2xl'}`}>
      <h1 className="font-display text-2xl font-bold text-ink">Leave</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {isAdmin ? 'Your allowance, upcoming leave, and the team at a glance.' : canSubmitLeave ? 'Your allowance and upcoming leave at a glance.' : 'The team at a glance.'}
      </p>

      {tabs.length > 1 && (
        <div className="mt-4 flex flex-wrap rounded-lg border border-slate-line bg-canvas-raised overflow-hidden w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {tab === 'dashboard' && <LeaveDashboard onNavigate={setTab} />}
        {tab === 'queue' && isAdmin && <LeaveApprovalQueue />}
        {tab === 'submit' && canSubmitLeave && <LeaveRequestForm />}
        {tab === 'team' && <LeaveListView />}
        {tab === 'annual' && canViewYearPlanners && <AnnualLeavePlanner />}
        {tab === 'special' && canViewYearPlanners && <SpecialLeavePlanner />}
      </div>
    </div>
  )
}
