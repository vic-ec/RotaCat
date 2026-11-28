import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { todayStr } from '../lib/dateRange'
import { ANNUAL_LEAVE_ALLOWANCE } from '../lib/leaveRequests'
import { categoryLabel } from '../lib/categoryLabels'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import {
  leaveTotals, breakSummary, lieuBalance, shiftCounts, onCallDates, leaveRecord, buildYearDays, approvedLeaveRanges,
} from '../lib/myYear'
import { fetchMyYear, isProfileId } from '../lib/myYearData'
import { useBack, rememberPageLabel } from '../lib/backNav'
import { ALL_LEAVE_PATH, MY_LEAVE_PATH } from '../lib/myYearLinks'
import { fetchLateArrivalsForProfile, fetchMyLateArrivals } from '../lib/lateArrivals'
import LateArrivalModal from '../components/LateArrivalModal'
import PageTabs from '../components/PageTabs'
import DateStepper from '../components/DateStepper'
import ProfileAvatar from '../components/ProfileAvatar'
import Tag from '../components/Tag'
import Modal from '../components/Modal'
import LeaveRequestForm from '../components/LeaveRequestForm'
import MyYearOverview from '../components/myYear/MyYearOverview'
import MyYearLeave from '../components/myYear/MyYearLeave'
import MyYearShifts from '../components/myYear/MyYearShifts'
import MyYearAttendance from '../components/myYear/MyYearAttendance'

// "My year": one person's leave, shifts, public holidays, days in lieu and
// attendance for a calendar year, read entirely from existing leave and
// roster data. `/my-year` is the signed-in doctor's own; `/my-year/:id` is
// an admin looking at someone else's — the same page, so a doctor sees
// what an admin sees about them.
export default function MyYearPage() {
  const { profileId: routeId } = useParams()
  const { profile: me, isAdmin, canSubmitLeave } = useAuth()
  const location = useLocation()

  // Someone else's year is admin only; an admin's own id is just /my-year.
  if (routeId && (!isAdmin || routeId === me?.id || !isProfileId(routeId))) {
    return <Navigate to={`/my-year${location.search}`} replace />
  }
  // The page is for people who can submit leave: not locums, not clerks.
  if (!routeId && !canSubmitLeave) return <Navigate to="/" replace />
  if (!me?.id) return null

  return <MyYear key={routeId || me.id} profileId={routeId || me.id} own={!routeId} />
}

const TAB_KEYS = ['overview', 'leave', 'shifts', 'attendance']

// One "Go to…" menu rather than a row of link buttons.
function GoToMenu({ links }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), menuRef, [triggerRef])
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="btn-secondary h-[30px] whitespace-nowrap px-3 py-0 text-sm"
      >
        Go to
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Go to"
          className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-edge bg-canvas-raised py-1 shadow-raised"
        >
          {links.map(link => (
            <Link
              key={link.label}
              to={link.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center px-3 text-sm font-medium text-ink hover:bg-canvas-sunken md:min-h-[36px]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function MyYear({ profileId, own }) {
  const { isAdmin } = useAuth()
  const back = useBack()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  // The Overview's selected day opens on today (a past or future year, on nothing).
  const [selectedDate, setSelectedDate] = useState(() => todayStr())
  const [formOpen, setFormOpen] = useState(false)
  // Late arrivals for the displayed year. Admins read the records
  // themselves (and can edit them); everyone else gets their own through
  // get_my_late_arrivals, which returns nothing when staff visibility is off.
  const [lateRecords, setLateRecords] = useState([])
  const [lateVersion, setLateVersion] = useState(0)
  // null | { record } to edit | {} to log a new one
  const [lateForm, setLateForm] = useState(null)

  const today = todayStr()
  const currentYear = Number(today.slice(0, 4))
  const requestedYear = Number(searchParams.get('year'))
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : currentYear

  useEffect(() => {
    let cancelled = false
    fetchMyYear(profileId)
      .then(result => { if (!cancelled) { setData(result); setError('') } })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load this page.') })
    return () => { cancelled = true }
  }, [profileId, version])

  useEffect(() => {
    let cancelled = false
    const read = isAdmin ? fetchLateArrivalsForProfile(profileId, year) : (own ? fetchMyLateArrivals(year) : Promise.resolve([]))
    read.then(rows => { if (!cancelled) setLateRecords(rows) }).catch(() => { if (!cancelled) setLateRecords([]) })
    return () => { cancelled = true }
  }, [isAdmin, own, profileId, year, lateVersion])

  function setParam(key, value) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set(key, String(value))
      return next
    }, { replace: key === 'year' })
  }

  const showAttendance = isAdmin || Boolean(data?.settings.attendanceVisibleToStaff)
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'leave', label: 'Leave' },
    { key: 'shifts', label: 'Shifts' },
    ...(showAttendance ? [{ key: 'attendance', label: 'Attendance' }] : []),
  ]
  const requestedTab = searchParams.get('tab')
  const tab = TAB_KEYS.includes(requestedTab) && tabs.some(t => t.key === requestedTab) ? requestedTab : 'overview'

  const view = useMemo(() => {
    if (!data?.profile) return null
    const { requests, entries, holidays, settings } = data
    const leaveRanges = approvedLeaveRanges(requests)
    const lieu = lieuBalance(entries, holidays, requests, { profileId, countNightBefore: settings.lieuCountNightBefore })
    return {
      totals: leaveTotals(requests, year, today, ANNUAL_LEAVE_ALLOWANCE),
      breaks: breakSummary(requests, year, today),
      lieu,
      holidayRows: lieu.rows.filter(r => r.date.startsWith(`${year}-`)),
      shifts: shiftCounts(entries, { profileId, year, leaveRanges }),
      onCall: onCallDates(entries, profileId, year),
      record: leaveRecord(requests, year),
      days: buildYearDays(year, { requests, holidays, entries, profileId, lateDates: new Set(lateRecords.map(r => r.entry_date)) }),
    }
  }, [data, year, today, profileId, lateRecords])

  if (error) return <div className="mx-auto max-w-7xl"><p className="card px-4 py-3 text-sm text-ink-muted">{error}</p></div>
  if (!data) return <div className="mx-auto max-w-7xl"><p className="text-sm text-ink-muted">Loading…</p></div>

  const person = data.profile
  if (!person || person.role !== 'doctor') {
    return (
      <div className="mx-auto max-w-7xl">
        <p className="card px-4 py-3 text-sm text-ink-muted">There is no year page for this person.</p>
        <Link to={ALL_LEAVE_PATH} className="btn-secondary mt-3 inline-flex">Back to All Leave</Link>
      </div>
    )
  }

  const firstName = person.name || person.surname || 'This doctor'
  const title = own ? 'My year' : `${firstName}’s year`
  rememberPageLabel(own ? '/my-year' : `/my-year/${profileId}`, title)
  const month = year === currentYear ? Number(today.slice(5, 7)) : 12
  const hoursSummaryTo = `/roster?view=summary&year=${year}&month=${month}`
  const goTo = [
    { label: 'Account', to: own ? '/account' : `/account/${profileId}` },
    { label: 'Annual planner', to: `/leave?tab=planners&sub=annual&ayear=${year}` },
    { label: 'Special planner', to: `/leave?tab=planners&sub=special&syear=${year}` },
    { label: 'Roster', to: '/roster' },
    { label: 'Hours Summary', to: hoursSummaryTo },
  ]

  // At most one filled button on screen: Request leave on your own
  // Overview, Capture leave when an admin is on someone else's Overview or
  // Leave tab, Log late arrival on their Attendance.
  const action = own && tab === 'overview'
    ? { label: 'Request leave', short: 'Request', onClick: () => setFormOpen(true) }
    : !own && isAdmin && (tab === 'overview' || tab === 'leave') ? { label: 'Capture leave', short: 'Capture', onClick: () => setFormOpen(true) }
    : !own && isAdmin && tab === 'attendance' ? { label: 'Log late arrival', short: 'Log late', onClick: () => setLateForm({}) } : null

  // The action is its + alone under 420px (its name on hover or tap), a
  // short label to 640px, then its full name; every control is 30px tall.
  const actionButton = action && (
    <button type="button" onClick={action.onClick} aria-label={action.label} title={action.label} className="btn-primary h-[30px] w-[30px] flex-shrink-0 justify-center whitespace-nowrap p-0 text-sm min-[420px]:w-auto min-[420px]:px-3">
      <Plus className="h-4 w-4" aria-hidden="true" />
      <span className="hidden min-[420px]:inline sm:hidden">{action.short}</span>
      <span className="hidden sm:inline">{action.label}</span>
    </button>
  )
  const yearControls = (
    <>
      <DateStepper unit="year" year={year} onChange={y => { setParam('year', y); setSelectedDate(y === currentYear ? today : null) }} nowrap />
      <GoToMenu links={goTo} />
    </>
  )

  return (
    <div className="mx-auto max-w-7xl">
      {/* The app's standard back (AppLayout) when the page was opened by a
          link; this fixed one only when it wasn't (a bookmark, a reload of
          a fresh tab). */}
      {back ? null : own ? (
        <Link to={MY_LEAVE_PATH} className="mb-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-accent md:hidden">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />My leave
        </Link>
      ) : (
        <Link to={ALL_LEAVE_PATH} className="mb-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-accent hover:text-accent-dark md:min-h-0">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />All Leave
        </Link>
      )}

      <div className="mb-4 flex min-w-0 items-center gap-3">
        {!own && <ProfileAvatar profile={person} size={40} />}
        <h1 className="min-w-0 truncate font-display text-xl font-bold text-ink md:text-2xl">{title}</h1>
        {!own && person.category && <Tag>{categoryLabel(person.category)}</Tag>}
      </div>

      <PageTabs tabs={tabs} active={tab} onChange={key => setParam('tab', key)} ariaLabel={title} />

      {/* Under the tabs, from the panel's left edge: the page's one action
          first, then the year and Go to straight after it. The Leave tab
          puts them in its own row with search and Filter. */}
      {tab !== 'leave' && (
        <div className={`mt-3 flex flex-nowrap items-center gap-2 ${tab === 'attendance' ? 'mx-auto md:max-w-2xl' : ''}`} data-testid="my-year-controls">
          {actionButton}
          {yearControls}
        </div>
      )}

      {/* The Staff list's spacing: 12px under the tabs. */}
      <div className="mt-3">
        {tab === 'overview' && (
          <MyYearOverview
            year={year}
            totals={view.totals}
            days={view.days}
            breaks={view.breaks}
            lieu={view.lieu}
            holidaysWorked={view.holidayRows.length}
            data={data}
            profileId={profileId}
            isAdmin={isAdmin}
            own={own}
            showLate={showAttendance}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        )}
        {/* Leave: the Overview's width (its table needs it). Attendance:
            the Roster and Planners lists' width. */}
        {tab === 'leave' && <div><MyYearLeave rows={view.record} data={data} profileId={profileId} today={today} isAdmin={isAdmin} own={own} leading={actionButton} controls={yearControls} /></div>}
        {tab === 'shifts' && (
          <MyYearShifts
            year={year}
            shifts={view.shifts}
            onCall={view.onCall}
            lieu={view.lieu}
            holidayRows={view.holidayRows}
            data={data}
            hoursSummaryTo={hoursSummaryTo}
          />
        )}
        {tab === 'attendance' && (
          <div className="mx-auto md:max-w-2xl">
          <MyYearAttendance
            records={lateRecords}
            admin={isAdmin}
            monthIds={data.monthIds}
            profileId={profileId}
            onEdit={record => setLateForm({ record })}
          />
          </div>
        )}
      </div>

      {formOpen && (
        <Modal title={own ? 'Request leave' : `Capture leave for ${firstName}`} onClose={() => setFormOpen(false)} centered>
          {own
            ? <LeaveRequestForm onCancel={() => setFormOpen(false)} onSubmitted={() => { setVersion(v => v + 1); setFormOpen(false) }} />
            : <LeaveRequestForm onCancel={() => setFormOpen(false)} captureOnly initialSubjectId={profileId} initialLeaveType="sick" onSubmitted={() => setVersion(v => v + 1)} />}
        </Modal>
      )}

      {lateForm && (
        <LateArrivalModal
          record={lateForm.record || null}
          profileId={lateForm.record ? null : profileId}
          personName={`${person.name || ''} ${person.surname || ''}`.trim()}
          year={year}
          onClose={() => setLateForm(null)}
          onSaved={() => setLateVersion(v => v + 1)}
        />
      )}
    </div>
  )
}
