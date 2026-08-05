import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useScrollReveal } from '../lib/useScrollReveal'
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
  // Hide-on-scroll-down/reveal-on-scroll-up for the Planners sub-nav below
  // (mobile only — see its md:hidden gating) — called unconditionally here,
  // ahead of the locum early-return, per the rules of hooks.
  const subnavVisible = useScrollReveal()
  // Clerks get read-only "all" visibility into Annual/Special too — same
  // grid every other year-planner viewer sees, they just can't submit.
  const canViewYearPlanners = isAdmin || canSubmitLeave || isClerk

  // Locums can't submit or see leave at all (leave_select RLS returns
  // nothing for them) — redirect rather than render restricted content
  // behind a resolved route.
  if (isLocum) return <Navigate to="/" replace />

  // Team leave is redundant for a plain doctor — they already get the same
  // "who's off" picture (plus more, since it's year-at-a-glance) from the
  // Annual/Special planners' All view. Clerks get that same All-view
  // visibility into Annual/Special/Weekends now too, so Team leave is
  // redundant for them as well and stays hidden; admins keep it, unaffected.
  const showTeamLeaveTab = isAdmin || (!canSubmitLeave && !isClerk)
  const tabs = [
    ...(canSubmitLeave ? [{ key: 'my-leave', label: 'My leave' }] : []),
    // "Team", not "Team leave" — the "Leave" module context is already
    // established by the page itself, so the tab label doesn't need to repeat it.
    ...(showTeamLeaveTab ? [{ key: 'team', label: 'Team' }] : []),
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

  // A one-shot deep link from the Requests queue's "View Calendar" action
  // (LeaveApprovalQueue.jsx): `?sub=annual&month=YYYY-MM&highlight=YYYY-MM-DD`
  // seeds AnnualLeavePlanner's initial month-workspace state, then gets
  // stripped back out of the URL via clearDeepLink once it's been consumed
  // — otherwise switching away from Annual and back (without touching
  // "View Calendar" again) would keep re-opening the same stale highlight.
  const deepLinkMonth = searchParams.get('month')
  const deepLinkHighlight = searchParams.get('highlight')
  function clearDeepLink() {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('month')
      next.delete('highlight')
      return next
    }, { replace: true })
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Module nav: switches which Leave destination is showing. Underlined
          selection, not a filled segmented control, so it reads as primary
          navigation rather than a same-level option group with the Planners
          sub-tabs below. Scrolls horizontally only if it doesn't fit. */}
      <nav className="flex gap-6 overflow-x-auto border-b border-slate-line" aria-label="Leave">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-accent text-ink' : 'border-transparent text-ink-light hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'planners' && plannerTabs.length > 1 && (
        <div
          className={`mt-4 sticky top-0 z-10 bg-canvas transition-[transform,opacity] duration-200 md:static md:translate-y-0 md:opacity-100 ${
            subnavVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
          }`}
        >
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Planners</h2>
          <nav className="flex gap-5 overflow-x-auto border-b border-slate-line" aria-label="Planners">
            {plannerTabs.map(t => (
              <button
                key={t.key}
                onClick={() => setPlannerTab(t.key)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-1.5 text-xs font-medium transition-colors ${
                  plannerTab === t.key ? 'border-accent text-ink' : 'border-transparent text-ink-light hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="mt-6">
        {tab === 'my-leave' && canSubmitLeave && <div className="mx-auto md:max-w-2xl"><LeaveDashboard /></div>}
        {tab === 'team' && <LeaveListView />}
        {tab === 'rules' && <div className="mx-auto md:max-w-2xl"><LeaveRulesPage /></div>}
        {tab === 'planners' && (
          <>
            {plannerTab === 'annual' && canViewYearPlanners && (
              <AnnualLeavePlanner
                deepLinkMonth={deepLinkMonth}
                deepLinkHighlightDate={deepLinkHighlight}
                onDeepLinkConsumed={clearDeepLink}
              />
            )}
            {plannerTab === 'special' && canViewYearPlanners && <SpecialLeavePlanner />}
            {plannerTab === 'weekends' && <WeekendPlannerView />}
            {plannerTab === 'requests' && (
              isAdmin ? (
                <div className="mx-auto md:max-w-2xl">
                  <LeaveApprovalQueue onBack={() => setPlannerTab('annual')} />
                </div>
              ) : canSubmitLeave ? <MyRequestHistory /> : null
            )}
            {plannerTab === 'audit' && isAdmin && <LeaveAuditReport />}
          </>
        )}
      </div>
    </div>
  )
}
