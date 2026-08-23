import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useScrollReveal } from '../lib/useScrollReveal'
import PageTabs from '../components/PageTabs'
import LeaveDashboard from '../components/LeaveDashboard'
import LeaveApprovalQueue from '../components/LeaveApprovalQueue'
import MyRequestHistory from '../components/MyRequestHistory'
import LeaveListView from '../components/LeaveListView'
import AnnualLeavePlanner from '../components/AnnualLeavePlanner'
import SpecialLeavePlanner from '../components/SpecialLeavePlanner'
import WeekendPlanner from '../components/WeekendPlanner'
import LeaveAuditReport from '../components/LeaveAuditReport'
import InternRotationsPlanner from '../components/InternRotationsPlanner'
import LeaveRulesPage from '../components/LeaveRulesPage'
import { endOfRotationFlag } from '../lib/internRotations'

// Top-level "Leave" tabs, each a self-contained destination rather than
// variants of one generic view — mirrors a mobile UX review's recommended
// structure: My leave (personal, doctor-only) | Team leave (its own nested
// tab group: Current & Upcoming Leave, the week/month/people awareness
// view, plus All Leave, the admin-only cumulative history) | Planners (a
// nested tab group of reference/admin views) | Requests (approval queue for
// admins, submission history for doctors) | Rules (the full written policy,
// in-app instead of only linking out).
//
// An admin's most actionable landing is the Requests queue whenever
// there's something in it; with nothing pending, Team leave (who's
// currently off) is more useful than an empty queue.
function defaultTopTab({ isAdmin, canSubmitLeave, isClerk, hasPendingRequests }) {
  if (isAdmin) return hasPendingRequests ? 'requests' : 'team'
  // A clerk's Planner nav link IS this page — land them straight on the
  // Planners tab group (Annual) rather than Team leave, which is now just
  // a secondary tab for them, not the entry point.
  if (isClerk) return 'planners'
  if (canSubmitLeave) return 'my-leave'
  return 'team'
}

// Planners' own default sub-tab (Requests now lives at the top level, not
// nested here) — a doctor/clerk/locum-excluded-already viewer lands on
// Annual if they can see it, otherwise Weekends (the one planner every
// non-locum role can always see).
function defaultPlannerTab({ canViewYearPlanners }) {
  if (canViewYearPlanners) return 'annual'
  return 'weekends'
}

// Named for the back link on the Requests tab (see backToPlanner below —
// rendered as just "← <label>", no "Back to" prefix) — deliberately its own
// small map rather than reusing plannerTabs' own labels ("Weekends"), since
// "Weekends" reads oddly next to "Annual planner"/"Special planner".
const PLANNER_BACK_LABELS = { annual: 'Annual planner', special: 'Special planner', weekends: 'Weekend planner' }

// Team leave's own two sub-tabs — Current & Upcoming (the week/month/people
// awareness view) is always the default; All Leave (the cumulative
// audit-style history, admin-only) is opt-in via the URL only for admins.

export default function LeavePlannerPage() {
  const { canSubmitLeave, isAdmin, isLocum, isClerk } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  // Hide-on-scroll-down/reveal-on-scroll-up for the Planners sub-nav below
  // (mobile only — see its md:hidden gating) — called unconditionally here,
  // ahead of the locum early-return, per the rules of hooks.
  const subnavVisible = useScrollReveal()
  // Same count AppLayout's own Planners nav badge fetches (see NavBadge
  // there), independently — this page and the app shell don't share state,
  // so each fetches its own copy rather than introducing shared context
  // just for one badge. Fetched once on mount; called unconditionally
  // ahead of the locum early-return, per the rules of hooks.
  const [pendingRequestsBadge, setPendingRequestsBadge] = useState(0)
  useEffect(() => {
    if (!isAdmin) { setPendingRequestsBadge(0); return }
    let cancelled = false
    supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => {
      if (!cancelled) setPendingRequestsBadge(count || 0)
    })
    return () => { cancelled = true }
  }, [isAdmin])
  // Same "needs admin attention, persistent until resolved" badge pattern
  // as pendingRequestsBadge above, for the Rotations sub-tab — counts
  // Intern/Registrar doctors whose last rotation block ended with nothing
  // lined up next (see EndOfRotationQueue, the queue this badge mirrors).
  // Independent fetch, not shared state with InternRotationsPlanner (same
  // reasoning as pendingRequestsBadge — this page and that component
  // don't share state).
  // is_active: true is required, not optional — EndOfRotationQueue only
  // ever receives InternRotationsPlanner's activeInterns (it's rendered
  // under the Active tab, passed activeInterns as its doctors prop), so an
  // already-inactive doctor can never appear there no matter which tab is
  // open. Without this filter here, a doctor deactivated by some other
  // path (never routed through this queue's own "Schedule deactivation",
  // so scheduled_inactive_date was never set) could still trip
  // endOfRotationFlag and light up this badge with nothing anywhere in the
  // UI to resolve it.
  const [endOfRotationBadge, setEndOfRotationBadge] = useState(0)
  useEffect(() => {
    if (!isAdmin) { setEndOfRotationBadge(0); return }
    let cancelled = false
    supabase.from('profiles').select('id, category, scheduled_inactive_date').in('category', ['Intern', 'Registrar']).eq('is_active', true)
      .then(async ({ data: doctors }) => {
        if (cancelled || !doctors || doctors.length === 0) { if (!cancelled) setEndOfRotationBadge(0); return }
        const { data: rotations } = await supabase.from('intern_rotations')
          .select('doctor_id, rotation_type, subtype, start_date, end_date')
          .in('doctor_id', doctors.map(d => d.id))
        if (cancelled) return
        const rotationsByDoctorId = new Map()
        for (const r of (rotations || [])) {
          if (!rotationsByDoctorId.has(r.doctor_id)) rotationsByDoctorId.set(r.doctor_id, [])
          rotationsByDoctorId.get(r.doctor_id).push(r)
        }
        const count = doctors.filter(d => endOfRotationFlag({
          category: d.category, scheduledInactiveDate: d.scheduled_inactive_date,
          rotations: rotationsByDoctorId.get(d.id) || [],
        })).length
        setEndOfRotationBadge(count)
      })
    return () => { cancelled = true }
  }, [isAdmin])
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
  // Requests: admins get the approval queue, doctors get their own full
  // history. Neither applies to a clerk, so the tab (and its content) just
  // doesn't exist for them — not rendered as an empty/disabled option. Now
  // a top-level tab (was previously nested inside Planners) so it's
  // reachable in one tap instead of two, and so its own pending-count
  // badge is visible without opening Planners first.
  const showRequestsTab = isAdmin || canSubmitLeave
  const tabs = [
    ...(canSubmitLeave ? [{ key: 'my-leave', label: 'My leave' }] : []),
    ...(showTeamLeaveTab ? [{ key: 'team', label: 'Team Leave' }] : []),
    { key: 'planners', label: 'Planners' },
    ...(showRequestsTab ? [{ key: 'requests', label: 'Requests', badge: pendingRequestsBadge, badgeColor: 'red' }] : []),
    { key: 'rules', label: 'Rules' },
  ]

  const plannerTabs = [
    ...(canViewYearPlanners ? [{ key: 'annual', label: 'Annual' }, { key: 'special', label: 'Special' }] : []),
    { key: 'weekends', label: 'Weekends' },
    // Admin-only rotation-block management — covers Intern/Registrar/COSMO
    // (see InternRotationsPlanner's Matrix view). Labelled "Rotations" now
    // that Registrars share this page too; key stays 'interns' to avoid
    // touching the underlying table/component/lib naming for a label-only
    // rename.
    ...(isAdmin ? [{ key: 'interns', label: 'Rotations', badge: endOfRotationBadge, badgeColor: 'red' }] : []),
  ]

  // Team leave's own sub-tabs: the week/month/people awareness view, plus
  // (admin-only) the cumulative HR history — formerly Planners' "Audit" tab,
  // relabelled "All Leave" and moved here since it's a Team Leave view, not
  // a planner, and unlike the doctor-facing "My leave" tracker (always the
  // current calendar year) it's filterable to any date range so leave taken
  // never becomes invisible after a year rolls over. Same component, same
  // layout/FAB/date pickers — only which tab reaches it has changed.
  const teamTabs = [
    { key: 'current', label: 'Current & Upcoming Leave' },
    ...(isAdmin ? [{ key: 'all', label: 'All Leave' }] : []),
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
  const tab = tabs.some(t => t.key === requestedTab) ? requestedTab : defaultTopTab({ isAdmin, canSubmitLeave, isClerk, hasPendingRequests: pendingRequestsBadge > 0 })
  const requestedPlannerTab = searchParams.get('sub')
  const plannerTab = plannerTabs.some(t => t.key === requestedPlannerTab) ? requestedPlannerTab : defaultPlannerTab({ canViewYearPlanners })
  // Same `sub` param Planners uses — never read together, since `tab` picks
  // exactly one of the two sub-nav'd sections at a time.
  const requestedTeamTab = searchParams.get('sub')
  const teamTab = teamTabs.some(t => t.key === requestedTeamTab) ? requestedTeamTab : 'current'

  function setTab(nextTab) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', nextTab)
      // Only a "View requests" link (from inside a planner) sets `from` —
      // picking a top-level tab via this nav is never that, so any stale
      // `from` left over from an earlier visit gets cleared here rather
      // than resurfacing a back link that doesn't apply to this visit.
      next.delete('from')
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
  function setTeamTab(nextSub) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'team')
      next.set('sub', nextSub)
      return next
    }, { replace: true })
  }

  // Back-to-planner link on the Requests tab: only shown when the visitor
  // arrived via a planner's own "View requests" link (`?from=<sub-tab
  // key>`), not when they picked Requests directly from the top nav — see
  // setTab, which strips `from` on every plain top-level tab change.
  const fromPlannerTab = searchParams.get('from')
  const fromPlannerLabel = PLANNER_BACK_LABELS[fromPlannerTab]
  function backToPlanner() {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'planners')
      next.set('sub', fromPlannerTab)
      next.delete('from')
      return next
    }, { replace: true })
  }

  // A one-shot deep link from the Requests queue's "View Calendar" action
  // (LeaveApprovalQueue.jsx): `?sub=annual&month=YYYY-MM&highlight=YYYY-MM-DD`
  // seeds AnnualLeavePlanner's initial month-workspace state. Stripping the
  // two params back out of the URL afterwards (so switching planner
  // sub-tabs and back doesn't re-open the same stale highlight) is that
  // component's job, not this one's: it has to happen in the same
  // `setSearchParams` call that writes ayear/aview/amonth, or the second
  // writer's stale `prev` wipes the first writer's params. See the effect
  // in AnnualLeavePlanner.jsx.
  const deepLinkMonth = searchParams.get('month')
  const deepLinkHighlight = searchParams.get('highlight')

  return (
    <div className="mx-auto max-w-7xl">
      {/* Module nav: switches which Leave destination is showing. Underlined
          selection, not a filled segmented control, so it reads as primary
          navigation rather than a same-level option group with the Planners
          sub-tabs below. Scrolls horizontally only if it doesn't fit.
          Shared `PageTabs` template — see src/components/PageTabs.jsx. */}
      <PageTabs tabs={tabs} active={tab} onChange={setTab} ariaLabel="Leave" />

      {tab === 'planners' && plannerTabs.length > 1 && (
        <div
          className={`mt-4 sticky top-0 z-10 bg-canvas transition-[transform,opacity] duration-200 md:static md:translate-y-0 md:opacity-100 ${
            subnavVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
          }`}
        >
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Planners</h2>
          <PageTabs tabs={plannerTabs} active={plannerTab} onChange={setPlannerTab} ariaLabel="Planners" size="sub" />
        </div>
      )}

      {tab === 'team' && teamTabs.length > 1 && (
        <div
          className={`mt-4 sticky top-0 z-10 bg-canvas transition-[transform,opacity] duration-200 md:static md:translate-y-0 md:opacity-100 ${
            subnavVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
          }`}
        >
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Team Leave</h2>
          <PageTabs tabs={teamTabs} active={teamTab} onChange={setTeamTab} ariaLabel="Team Leave" size="sub" />
        </div>
      )}

      <div className="mt-6">
        {tab === 'my-leave' && canSubmitLeave && <div className="mx-auto md:max-w-2xl"><LeaveDashboard /></div>}
        {tab === 'team' && (
          <>
            {teamTab === 'current' && <LeaveListView />}
            {teamTab === 'all' && isAdmin && <LeaveAuditReport />}
          </>
        )}
        {tab === 'requests' && (
          isAdmin ? (
            <div className="mx-auto md:max-w-2xl">
              <LeaveApprovalQueue onBack={fromPlannerLabel && backToPlanner} backLabel={fromPlannerLabel} />
            </div>
          ) : canSubmitLeave ? <MyRequestHistory onBack={fromPlannerLabel && backToPlanner} backLabel={fromPlannerLabel} /> : null
        )}
        {tab === 'rules' && <div className="mx-auto md:max-w-2xl"><LeaveRulesPage /></div>}
        {tab === 'planners' && (
          <>
            {plannerTab === 'annual' && canViewYearPlanners && (
              <AnnualLeavePlanner
                deepLinkMonth={deepLinkMonth}
                deepLinkHighlightDate={deepLinkHighlight}
              />
            )}
            {plannerTab === 'special' && canViewYearPlanners && <SpecialLeavePlanner />}
            {plannerTab === 'weekends' && <WeekendPlanner />}
            {plannerTab === 'interns' && isAdmin && <InternRotationsPlanner />}
          </>
        )}
      </div>
    </div>
  )
}
