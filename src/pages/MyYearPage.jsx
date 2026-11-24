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
import { ALL_LEAVE_PATH, MY_LEAVE_PATH } from '../lib/myYearLinks'
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
        className="btn-secondary min-h-[44px] whitespace-nowrap text-sm md:min-h-0"
      >
        Go to…
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [selectedDate, setSelectedDate] = useState(null)
  const [formOpen, setFormOpen] = useState(false)

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
      // Late arrivals are not read yet; the dots follow with that work.
      days: buildYearDays(year, { requests, holidays, entries, profileId }),
    }
  }, [data, year, today, profileId])

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
  // Overview, Capture leave when an admin is on someone else's Leave tab.
  const action = own && tab === 'overview'
    ? { label: 'Request leave' }
    : !own && isAdmin && tab === 'leave' ? { label: 'Capture leave' } : null

  return (
    <div className="mx-auto max-w-7xl">
      {own ? (
        <Link to={MY_LEAVE_PATH} className="mb-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-accent md:hidden">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />My leave
        </Link>
      ) : (
        <Link to={ALL_LEAVE_PATH} className="mb-2 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-accent hover:text-accent-dark md:min-h-0">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />All Leave
        </Link>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {!own && <ProfileAvatar profile={person} size={40} />}
          <h1 className="min-w-0 truncate font-display text-xl font-bold text-ink md:text-2xl">{title}</h1>
          {!own && person.category && <Tag>{categoryLabel(person.category)}</Tag>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateStepper unit="year" year={year} onChange={y => { setParam('year', y); setSelectedDate(null) }} nowrap />
          <GoToMenu links={goTo} />
          {action && (
            <button type="button" onClick={() => setFormOpen(true)} className="btn-primary min-h-[44px] whitespace-nowrap text-sm md:min-h-0">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {action.label}
            </button>
          )}
        </div>
      </div>

      <PageTabs tabs={tabs} active={tab} onChange={key => setParam('tab', key)} ariaLabel={title} />

      <div className="mt-6">
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
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        )}
        {tab === 'leave' && <MyYearLeave rows={view.record} data={data} profileId={profileId} today={today} />}
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
        {tab === 'attendance' && <MyYearAttendance />}
      </div>

      {formOpen && (
        <Modal title={own ? 'Request leave' : `Capture leave for ${firstName}`} onClose={() => setFormOpen(false)} centered>
          {own
            ? <LeaveRequestForm onSubmitted={() => { setVersion(v => v + 1); setFormOpen(false) }} />
            : <LeaveRequestForm captureOnly initialSubjectId={profileId} initialLeaveType="sick" onSubmitted={() => setVersion(v => v + 1)} />}
        </Modal>
      )}
    </div>
  )
}
