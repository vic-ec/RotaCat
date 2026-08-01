import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LeaveDashboard from '../components/LeaveDashboard'
import LeaveApprovalQueue from '../components/LeaveApprovalQueue'
import MyRequestHistory from '../components/MyRequestHistory'
import LeaveListView from '../components/LeaveListView'
import AnnualLeavePlanner from '../components/AnnualLeavePlanner'
import SpecialLeavePlanner from '../components/SpecialLeavePlanner'
import WeekendPlannerView from '../components/WeekendPlannerView'
import LeaveAuditReport from '../components/LeaveAuditReport'
import LeaveRulesPage from '../components/LeaveRulesPage'

// Top-level "Leave" tabs, each a self-contained destination rather than
// variants of one generic view — mirrors a mobile UX review's recommended
// structure: My leave (personal, doctor-only) | Team leave (who's off) |
// Planners (a nested tab group of reference/admin views) | Rules (the full
// written policy, in-app instead of only linking out).
function defaultTopTab({ isAdmin, canSubmitLeave }) {
  if (isAdmin) return 'planners'
  if (canSubmitLeave) return 'my-leave'
  return 'team'
}

// Planners' own default sub-tab: an admin's most actionable landing is the
// Requests queue; a doctor/locum-excluded-already viewer without queue
// access lands on Annual if they can see it, otherwise Weekends (the one
// planner every non-locum role can always see).
function defaultPlannerTab({ isAdmin, canViewYearPlanners }) {
  if (isAdmin) return 'requests'
  if (canViewYearPlanners) return 'annual'
  return 'weekends'
}

export default function LeavePlannerPage() {
  const { canSubmitLeave, isAdmin, isLocum } = useAuth()
  const [tab, setTab] = useState(() => defaultTopTab({ isAdmin, canSubmitLeave }))
  const canViewYearPlanners = isAdmin || canSubmitLeave
  const [plannerTab, setPlannerTab] = useState(() => defaultPlannerTab({ isAdmin, canViewYearPlanners }))

  // Locums can't submit or see leave at all (leave_select RLS returns
  // nothing for them) — redirect rather than render restricted content
  // behind a resolved route.
  if (isLocum) return <Navigate to="/" replace />

  const tabs = [
    ...(canSubmitLeave ? [{ key: 'my-leave', label: 'My leave' }] : []),
    { key: 'team', label: 'Team leave' },
    { key: 'planners', label: 'Planners' },
    { key: 'rules', label: 'Rules' },
  ]

  // Requests: admins get the approval queue, doctors get their own full
  // history. Neither applies to a clerk, so the tab (and its content) just
  // doesn't exist for them — not rendered as an empty/disabled option.
  const plannerTabs = [
    ...(canViewYearPlanners ? [{ key: 'annual', label: 'Annual' }, { key: 'special', label: 'Special' }] : []),
    { key: 'weekends', label: 'Weekends' },
    ...(isAdmin || canSubmitLeave ? [{ key: 'requests', label: 'Requests' }] : []),
    // Cumulative HR-audit view, admin-only — unlike the doctor-facing "My
    // leave" tracker (always the current calendar year), this is filterable
    // to any date range, so leave taken never becomes invisible after a
    // year rolls over.
    ...(isAdmin ? [{ key: 'audit', label: 'Audit' }] : []),
  ]

  // Annual/Special/Weekends all need real width for their grids — widen
  // the shell whenever Planners is active, regardless of which sub-tab.
  const isPlannersTab = tab === 'planners'

  return (
    <div className={`mx-auto ${isPlannersTab ? 'max-w-6xl' : 'max-w-2xl'}`}>
      <h1 className="font-display text-2xl font-bold text-ink">Leave</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {isAdmin ? 'Review requests, or check a planner.' : canSubmitLeave ? 'Your leave tracker, upcoming leave, and the planners.' : 'The team, and the planners.'}
      </p>

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

      {tab === 'planners' && plannerTabs.length > 1 && (
        <div className="mt-3 flex flex-wrap rounded-lg border border-slate-line bg-canvas-sunken/60 p-0.5 w-fit">
          {plannerTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setPlannerTab(t.key)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                plannerTab === t.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-raised active:bg-canvas-raised'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {tab === 'my-leave' && canSubmitLeave && <LeaveDashboard />}
        {tab === 'team' && <LeaveListView />}
        {tab === 'rules' && <LeaveRulesPage />}
        {tab === 'planners' && (
          <>
            {plannerTab === 'annual' && canViewYearPlanners && <AnnualLeavePlanner />}
            {plannerTab === 'special' && canViewYearPlanners && <SpecialLeavePlanner />}
            {plannerTab === 'weekends' && <WeekendPlannerView />}
            {plannerTab === 'requests' && (isAdmin ? <LeaveApprovalQueue /> : canSubmitLeave ? <MyRequestHistory /> : null)}
            {plannerTab === 'audit' && isAdmin && <LeaveAuditReport />}
          </>
        )}
      </div>
    </div>
  )
}
