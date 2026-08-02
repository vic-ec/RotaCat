import { Navigate, useSearchParams } from 'react-router-dom'
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
function defaultTopTab({ isAdmin, canSubmitLeave, isClerk }) {
  if (isAdmin) return 'planners'
  // A clerk's Planner nav link IS this page — land them straight on the
  // Planners tab group (Annual) rather than Team leave, which is now just
  // a secondary tab for them, not the entry point.
  if (isClerk) return 'planners'
  if (canSubmitLeave) return 'my-leave'
  return 'team'
}

// Planners' own default sub-tab: an admin's most actionable landing is the
// Requests queue; a doctor/clerk/locum-excluded-already viewer without
// queue access lands on Annual if they can see it, otherwise Weekends (the
// one planner every non-locum role can always see).
function defaultPlannerTab({ isAdmin, canViewYearPlanners }) {
  if (isAdmin) return 'requests'
  if (canViewYearPlanners) return 'annual'
  return 'weekends'
}

export default function LeavePlannerPage() {
  const { canSubmitLeave, isAdmin, isLocum, isClerk } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  // Clerks get read-only "all" visibility into Annual/Special too — same
  // grid every other year-planner viewer sees, they just can't submit.
  const canViewYearPlanners = isAdmin || canSubmitLeave || isClerk

  // Locums can't submit or see leave at all (leave_select RLS returns
  // nothing for them) — redirect rather than render restricted content
  // behind a resolved route.
  if (isLocum) return <Navigate to="/" replace />

  // Team leave is redundant for a plain doctor — they already get the same
  // "who's off" picture (plus more, since it's year-at-a-glance) from the
  // Annual/Special planners' All view. Clerks keep it since it's their only
  // leave visibility at all (leave_select RLS scopes clerks to
  // approved-and-today-only, so they can't use the planners' All view the
  // way a doctor can); admins keep it too, unaffected either way.
  const showTeamLeaveTab = isAdmin || !canSubmitLeave
  const tabs = [
    ...(canSubmitLeave ? [{ key: 'my-leave', label: 'My leave' }] : []),
    ...(showTeamLeaveTab ? [{ key: 'team', label: 'Team leave' }] : []),
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

  // Tab selection lives in the URL (?tab=...&sub=...), not plain component
  // state — a backgrounded mobile browser/PWA can get killed and reloaded
  // by the OS at any time (iOS Safari especially), which remounts this page
  // from scratch. Plain useState loses the user's place and falls back to
  // the role-based default every time; the URL survives a reload since the
  // browser just re-requests the same address. Falls back to the
  // role-appropriate default when the param is missing or no longer valid
  // for this role (e.g. a stale link to a tab that's since been removed).
  const requestedTab = searchParams.get('tab')
  const tab = tabs.some(t => t.key === requestedTab) ? requestedTab : defaultTopTab({ isAdmin, canSubmitLeave, isClerk })
  const requestedPlannerTab = searchParams.get('sub')
  const plannerTab = plannerTabs.some(t => t.key === requestedPlannerTab) ? requestedPlannerTab : defaultPlannerTab({ isAdmin, canViewYearPlanners })

  function setTab(nextTab) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', nextTab)
      return next
    }, { replace: true })
  }
  function setPlannerTab(nextSub) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'planners')
      next.set('sub', nextSub)
      return next
    }, { replace: true })
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap rounded-lg border border-slate-line bg-canvas-raised overflow-hidden w-fit">
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
        {tab === 'my-leave' && canSubmitLeave && <div className="md:max-w-2xl"><LeaveDashboard /></div>}
        {tab === 'team' && <LeaveListView />}
        {tab === 'rules' && <div className="md:max-w-2xl"><LeaveRulesPage /></div>}
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
