import { Fragment, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardClock, ScrollText, BookUp, Undo, Rows3, Columns3, Type, EllipsisVertical, Pencil, CircleCheck, Trash2, ClipboardList, TriangleAlert, ArrowLeft, RefreshCw, CalendarRange } from 'lucide-react'
import FloatingActionMenu from '../components/FloatingActionMenu'
import DateStepper, { StepperShell } from '../components/DateStepper'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import DoctorDropdown from '../components/DoctorDropdown'
import RosterVacancyManager from '../components/RosterVacancyManager'
import { syncWeekendPatternsFromEntries } from '../lib/weekendPatternSync'
import { monthBounds, addDays } from '../lib/dateRange'
import { computeWeekendPlannerDrift, weekendPlannerChangedSince } from '../lib/weekendPlanner'
import { logRosterEntryChange } from '../lib/changeLog'
import RosterChangeLogModal from '../components/RosterChangeLogModal'
import GenerationReportModal from '../components/GenerationReportModal'
import { readGenerationReport, reportMatchesDraft } from '../lib/generationReport'
import PublicHolidayBadge from '../components/PublicHolidayBadge'
import WeekendDriftDetailsModal from '../components/WeekendDriftDetailsModal'
import { findSameDayConflict } from '../lib/rosterVacancy'
import { workedNightShiftPreviousDay, isOnApprovedLeave } from '../lib/rosterAssignmentEligibility'
import { fetchApprovedLeaveByProfile } from '../lib/approvedLeave'
import { entryAbsence, absenceSummary } from '../lib/rosterVacancy'
import { coverPatch, coverProfileId, fetchLocumProfiles, fetchOpenLocumContacts, locumDisplayName, OPEN_LOCUM_LABEL } from '../lib/locumCover'
import NewLocumModal from '../components/NewLocumModal'
import RosterAbsenceNote from '../components/RosterAbsenceNote'
import { buildDoctorDisplayNames } from '../lib/doctorNames'
import Toolbar, { ToolbarFacet } from '../components/Toolbar'
import RosterJumpButton from '../components/RosterJumpButton'
import Modal from '../components/Modal'
import ViewToggle from '../components/ViewToggle'
import PageActionsMenu from '../components/PageActionsMenu'
import RosterLanesView, { LanesLegend } from '../components/RosterLanesView'
import { ROSTER_TEXT_SIZES, rosterTextSize, rosterTextScale, readRosterTextSize, storeRosterTextSize } from '../lib/rosterTextSize'
import { labelForLeaveCategory } from '../lib/leaveYearGrid'
import { shiftColumns, labelForShiftCode } from '../lib/shiftLabels'
import { useSwatch } from '../lib/useSwatch'
import { useIsDesktop } from '../lib/useIsDesktop'

// Two ways to read the same month. Rows is the day-by-day grid the roster
// has always been; Lanes turns it ninety degrees, a row per doctor. Both
// are the same data and the same filters — only the axis changes.
const ROSTER_LAYOUTS = [
  { key: 'rows', label: 'Rows', icon: Rows3, title: 'Rows' },
  { key: 'lanes', label: 'Lanes', icon: Columns3, title: 'Lanes' },
]

// How much of the month is on screen: "Month"/"Week" in full from lg (the
// desktop), one letter each below it, not a calendar glyph — two calendars
// differing only in how many rows they draw are indistinguishable at 14px,
// and at that size M and W are the two most different letters in the
// alphabet. The letter keeps the toolbar on one line on a phone; `title`
// gives the word on a tap.
const ROSTER_RANGES = [
  { key: 'month', label: 'Month', shortLabel: 'M', title: 'Month' },
  { key: 'week', label: 'Week', shortLabel: 'W', title: 'Week' },
]

// A ⅝-contract doctor the Weekend Planner doesn't name at all this month is
// rostered on weekends by their own alternating cadence, so the planner has
// nothing to compare them with. One it names on any weekend follows the
// planner like everyone else (RotaCatScheduler, _uses_weekend_planner) and
// IS compared. See computeWeekendPlannerDrift.
function outsidePlannerIds(profiles, plannerEntries) {
  const named = new Set((plannerEntries || []).map(e => e.profile_id))
  return new Set((profiles || []).filter(p => p.contract_type === 'five_eighths' && !named.has(p.id)).map(p => p.id))
}

// A shift nobody holds yet: one the scheduler flagged, or a locum
// placeholder with no name and no account behind it ("[ ]"). The second
// matters because a roster that didn't come from the scheduler carries no
// flags at all — its empty placeholders were being counted, and drawn, as
// if they were filled locum shifts.
function isUnfilled(entry) {
  if (entry.is_flagged) return true
  if (!entry.is_locum || entry.profile_id) return false
  return !entry.locum_name || /^\[\s*\]$/.test(entry.locum_name.trim())
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// "Don't show again until this changes" for the weekend-planner drift
// warning — persisted in sessionStorage against a snapshot of the drift
// itself (not just a bare on/off flag), so muting self-invalidates the
// moment the planner changes again instead of needing to be re-armed.
function driftStorageKey(rosterMonthId) {
  return `rotacat:weekendDriftMuted:${rosterMonthId}`
}
function isDriftMuted(rosterMonthId, drift) {
  return drift.length > 0 && sessionStorage.getItem(driftStorageKey(rosterMonthId)) === JSON.stringify(drift)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Shift display headers. The label is the shift's own name ("WD 08h-18h")
// rather than a bare start time — see src/lib/shiftLabels.js.
const WEEKDAY_SHIFTS = shiftColumns(['WD_08', 'WD_12', 'WD_15', 'WD_22'])
const WEEKEND_SHIFTS = shiftColumns(['WE_08', 'WE_13', 'WE_20'])
const PH_WEEKDAY_SHIFTS = shiftColumns(['PHW_08', 'PHW_12', 'PHW_15', 'PHW_22'])
const PH_WEEKEND_SHIFTS = shiftColumns(['PH_08', 'PH_13', 'PH_20'])

function getShiftsForDay(dayType) {
  if (dayType === 'weekday') return WEEKDAY_SHIFTS
  if (dayType === 'weekend') return WEEKEND_SHIFTS
  if (dayType === 'PH_weekday') return PH_WEEKDAY_SHIFTS
  return PH_WEEKEND_SHIFTS
}

export default function RosterGridPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, isLocum, user } = useAuth()

  const [rosterMonth, setRosterMonth] = useState(null)
  const [entries, setEntries] = useState([])    // all roster_entries for this month
  const [profiles, setProfiles] = useState([])   // all schedulable doctors
  const [consultantProfiles, setConsultantProfiles] = useState([]) // Consultant-category profiles, for the Consultant column dropdown
  const [shiftTypes, setShiftTypes] = useState({}) // keyed by id -> code
  const [leaveByProfile, setLeaveByProfile] = useState({}) // profile_id -> [[dateFrom, dateTo, leaveType|null, id|null], ...] approved leave
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week'
  const [layout, setLayout] = useState('rows')       // 'rows' | 'lanes'
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState(new Set())
  // "Show only" in the Filter: 'flagged' and/or 'locum'. Rows view dims
  // every cell holding neither; Lanes has no slots to show, so ticking one
  // switches to Rows.
  const [showOnly, setShowOnly] = useState(new Set())
  // Where the toolbar's jump buttons last landed: { kind, index }. The
  // entry being jumped to waits in pendingJumpId until the grid (Rows,
  // and the right week) has rendered it; glowEntryId lights it briefly.
  const [jump, setJump] = useState(null)
  const [pendingJumpId, setPendingJumpId] = useState(null)
  const [glowEntryId, setGlowEntryId] = useState(null)
  const [pendingJumpDate, setPendingJumpDate] = useState(null) // a day to scroll to, with no entry to light
  const [currentWeek, setCurrentWeek] = useState(0) // 0-indexed week
  const [publishing, setPublishing] = useState(false)
  const [publicHolidays, setPublicHolidays] = useState({}) // keyed by "YYYY-MM-DD" -> name

  // Draft-reopen check (§2.6): has the Weekend Planner changed since this
  // draft was generated? See computeWeekendPlannerDrift. Only computed for
  // a draft roster. dismissedDrift itself resets on every id change (never
  // persisted); "don't show again" is a separate opt-in (see
  // driftMutedInSession) that persists in sessionStorage keyed to the
  // drift's own content, so it self-invalidates the moment the planner
  // changes again rather than needing to be manually re-armed.
  const [plannerDrift, setPlannerDrift] = useState([])
  // Whether the planner was actually edited after this draft was generated
  // — decides which of two messages a drift gets (see the banner).
  const [plannerChangedSince, setPlannerChangedSince] = useState(false)
  const [dismissedDrift, setDismissedDrift] = useState(false)
  const [showDriftDetails, setShowDriftDetails] = useState(false)

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState(null) // {date, shiftCode, entryId}
  const [dropdownSearch, setDropdownSearch] = useState('')

  // Published-roster removal/reassignment workflow (§2.5) — set instead of
  // opening the plain dropdown whenever an occupied slot on a PUBLISHED
  // roster is clicked. RosterVacancyManager owns the recursive swap-conflict
  // chain from here; onDone() just closes it and reloads.
  const [activeVacancy, setActiveVacancy] = useState(null)
  // Locums the roster can assign: those with an account, and those added
  // from here with only a name and mobile (locum contacts — admin-only).
  const [locumProfiles, setLocumProfiles] = useState([])
  const [locumContacts, setLocumContacts] = useState([])
  const [newLocumFor, setNewLocumFor] = useState(null) // the slot a "New locum" is being added to

  // Drag state
  const [dragSource, setDragSource] = useState(null) // {entryId, profileId, date, shiftCode}

  // Review log (audit trail of manual edits to this roster)
  const [showChangeLog, setShowChangeLog] = useState(false)
  // The engine's report on the run that made this draft — opened straight
  // after a generation (?report=1, set by the Generate page) and again from
  // the ⋮ menu. Only offered while it still describes the draft on screen.
  const [showGenerationReport, setShowGenerationReport] = useState(false)

  // Publish confirmation — publishing is a visible, hard-to-miss state
  // change for every doctor on the roster, so it gets an explicit "are you
  // sure" rather than firing straight off the button click.
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  // The edit gate: cells are read-only until an admin presses Edit, the
  // same gate the Weekend planner's month view has. Every cell change still
  // writes immediately once editing — the gate only stops a stray click on
  // a dense grid from reassigning someone. `?mode=edit` (the dashboard's
  // Edit action) opens the page already editing; `?publish=1` (its Publish
  // action) opens the publish confirmation straight away.
  const [searchParams, setSearchParams] = useSearchParams()
  const [editing, setEditing] = useState(searchParams.get('mode') === 'edit')
  // Roster text size (S/M/L), per device. The grids are the densest thing in
  // the app and 12px cell text does not suit every pair of eyes.
  const [textSize, setTextSize] = useState(readRosterTextSize)
  // Shown under the title when the month switch lands on a month with no
  // roster this viewer can open; cleared by the next successful switch.
  const [noRosterNote, setNoRosterNote] = useState('')
  const [showPlannerNotice, setShowPlannerNotice] = useState(false)
  // Set by Week view's stepper when it rolls back into the previous month:
  // that roster should open on its last week, which isn't known until it
  // has loaded.
  const openOnLastWeek = useRef(false)

  // The title's month switch. Looks the month's roster up (RLS decides
  // which ones this viewer may see — a doctor only gets published ones)
  // and opens it in place; a month without one says so and stays put.
  async function goToRosterMonth(year, month, week = 'first') {
    const { data } = await supabase.from('roster_months').select('id').eq('year', year).eq('month', month)
    const target = (data || [])[0]
    if (!target) {
      setNoRosterNote(`No roster for ${MONTH_NAMES[month]} ${year} yet.`)
      return
    }
    setNoRosterNote('')
    setJump(null)
    setCurrentWeek(0)
    openOnLastWeek.current = week === 'last'
    navigate(`/roster/${target.id}${editing ? '?mode=edit' : ''}`)
  }

  // Scroll a jumped-to entry into the middle of the screen once it is on
  // it — after a switch to Rows or to another week has rendered — and let
  // it glow for a moment so the eye lands on it.
  useEffect(() => {
    if (!pendingJumpId) return undefined
    const el = document.querySelector(`[data-entry-id="${pendingJumpId}"]`)
    if (!el) return undefined
    el.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' })
    setGlowEntryId(pendingJumpId)
    setPendingJumpId(null)
    const t = setTimeout(() => setGlowEntryId(null), 2200)
    return () => clearTimeout(t)
  }, [pendingJumpId, layout, currentWeek, viewMode])

  useEffect(() => {
    if (!pendingJumpDate) return
    const el = document.querySelector(`[data-testid="day-row"][data-date="${pendingJumpDate}"]`)
    if (!el) return
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    setPendingJumpDate(null)
  }, [pendingJumpDate, layout, currentWeek, viewMode])
  useEffect(() => { storeRosterTextSize(textSize) }, [textSize])
  const { base: rosterBase } = rosterTextSize(textSize)
  const rosterScale = rosterTextScale(textSize)
  // Below md the Consultant column folds into the date rail (see the grid),
  // so the column plan changes with the breakpoint, not just the CSS.
  const wideGrid = useIsDesktop(768)

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is redefined every render; including it would refetch in a loop
  }, [id])

  // Dashboard's Publish action: land here with the confirmation open, then
  // drop the flag from the URL so a reload doesn't ask again.
  useEffect(() => {
    if (!rosterMonth || !isAdmin || searchParams.get('publish') !== '1') return
    if (rosterMonth.status === 'draft') setShowPublishConfirm(true)
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('publish'); return next }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the roster has loaded
  }, [rosterMonth?.id])

  // Straight from the Generate page: open the engine's report on arrival,
  // then drop the flag so a reload doesn't reopen it.
  useEffect(() => {
    if (!rosterMonth || !isAdmin || searchParams.get('report') !== '1') return
    setShowGenerationReport(true)
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('report'); return next }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the roster has loaded
  }, [rosterMonth?.id])

  // Linked from a leave capture ("Go to roster"): ?date=YYYY-MM-DD, plus
  // &doctor=<profile id> for whose shift it is. Lands on that day in Rows,
  // on the right week, with the doctor's shift lit up — or just the day if
  // they hold no shift there any more. Dropped from the URL afterwards so a
  // reload doesn't jump again.
  useEffect(() => {
    const date = searchParams.get('date')
    if (!rosterMonth || loading || !date) return
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const doctor = searchParams.get('doctor')
      const target = doctor ? entries.find(e => e.date === date && e.profile_id === doctor) : null
      if (layout !== 'rows') setLayout('rows')
      if (viewMode === 'week') {
        const week = weeks.findIndex(w => w.some(d => d.dateStr === date))
        if (week >= 0) setCurrentWeek(week)
      }
      if (target) setPendingJumpId(target.id)
      else setPendingJumpDate(date)
    }
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('date'); next.delete('doctor'); return next }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the roster has loaded
  }, [rosterMonth?.id, loading])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [rosterRes, entriesRes, profilesRes, consultantProfilesRes, shiftTypesRes, phRes] = await Promise.all([
        supabase.from('roster_months').select('*').eq('id', id).single(),
        supabase.from('roster_entries').select('*').eq('roster_month_id', id).order('date').order('position', { nullsFirst: true }),
        // Schedulable roster assignees (§1.2): all doctor categories except
        // Consultant (its own column below), excluding locums/clerks
        // (role != 'doctor'). No `is_active` filter here — a published
        // roster is a historical record, and a doctor deactivated after
        // being rostered must keep showing their real name on every past
        // month they were ever assigned to (HR audit-trail requirement).
        // `is_active` is still fetched so the *assignable* subset (who can
        // be newly rostered going forward) can be derived separately — see
        // assignableProfiles below.
        supabase.from('profiles').select('id, name, surname, category, color_code, pattern_type, contract_type, is_active')
          .eq('is_approved', true).eq('role', 'doctor').neq('category', 'Consultant'),
        // category is needed by the Lanes view's section header — without it
        // consultants grouped under a generic "Other".
        supabase.from('profiles').select('id, name, surname, category, color_code, pattern_type').eq('is_approved', true).eq('category', 'Consultant'),
        supabase.from('shift_types').select('id, code').eq('is_active', true),
        supabase.from('public_holidays').select('date, name'),
      ])

      if (rosterRes.error) throw new Error(rosterRes.error.message)
      setRosterMonth(rosterRes.data)
      // Normalise date strings — Supabase may return "2026-08-01T00:00:00"
      // or "2026-08-01" depending on column type. Slice to "YYYY-MM-DD" to
      // guarantee consistent keys throughout the component.
      const normalisedEntries = (entriesRes.data || []).map(e => ({
        ...e,
        date: e.date?.slice(0, 10),
      }))
      setEntries(normalisedEntries)
      setProfiles(profilesRes.data || [])
      setConsultantProfiles(consultantProfilesRes.data || [])

      const stMap = {}
      for (const st of (shiftTypesRes.data || [])) stMap[st.id] = st.code
      setShiftTypes(stMap)

      // Draft-reopen check (§2.6): only meaningful for a still-editable
      // draft — a published roster is the historical record, not
      // something to compare forward against the planner's current state.
      if (rosterRes.data.status === 'draft') {
        const { start, end } = monthBounds(rosterRes.data.year, rosterRes.data.month)
        // From the day before the 1st: a month that starts on a Sunday
        // shares that weekend with the month before, and the planner files
        // it under the Saturday.
        const { data: plannerData } = await supabase
          .from('weekend_planner_entries')
          .select('weekend_saturday, profile_id, created_at, updated_at')
          .gte('weekend_saturday', addDays(start, -1))
          .lte('weekend_saturday', end)
        const newDrift = computeWeekendPlannerDrift(normalisedEntries, plannerData || [], stMap, outsidePlannerIds(profilesRes.data, plannerData), { monthStart: start, monthEnd: end })
        setPlannerDrift(newDrift)
        setPlannerChangedSince(weekendPlannerChangedSince(normalisedEntries, plannerData || []))
        setDismissedDrift(isDriftMuted(id, newDrift))
      } else {
        setPlannerDrift([])
        setDismissedDrift(false)
      }

      // Build PH lookup keyed by "YYYY-MM-DD"
      const phMap = {}
      for (const ph of (phRes.data || [])) {
        phMap[ph.date?.slice(0, 10)] = ph.name
      }
      setPublicHolidays(phMap)

      // Approved leave overlapping this month (§1.2) — a doctor on leave
      // for a given date shouldn't appear in that date's assignment
      // dropdowns, and one who still holds a shift over it is struck
      // through on the grid. Fetched separately since it needs the month
      // bounds from rosterRes, which only resolves once the Promise.all
      // above lands.
      const { start: monthStart, end: monthEnd } = monthBounds(rosterRes.data.year, rosterRes.data.month)
      setLeaveByProfile(await fetchApprovedLeaveByProfile(monthStart, monthEnd))
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // Re-fetches just this month's entries (and, for a draft, the planner
  // drift derived from them) after a single-cell edit — unlike loadAll,
  // this never toggles `loading`, so the grid stays mounted and the
  // update lands as a quiet re-render instead of a full-page reload.
  async function refreshEntries() {
    const { data } = await supabase
      .from('roster_entries')
      .select('*')
      .eq('roster_month_id', id)
      .order('date').order('position', { nullsFirst: true })
    const normalisedEntries = (data || []).map(e => ({ ...e, date: e.date?.slice(0, 10) }))
    setEntries(normalisedEntries)

    if (rosterMonth?.status === 'draft') {
      const { start, end } = monthBounds(rosterMonth.year, rosterMonth.month)
      const { data: plannerData } = await supabase
        .from('weekend_planner_entries')
        .select('weekend_saturday, profile_id, created_at, updated_at')
        .gte('weekend_saturday', addDays(start, -1))
        .lte('weekend_saturday', end)
      const newDrift = computeWeekendPlannerDrift(normalisedEntries, plannerData || [], shiftTypes, outsidePlannerIds(profiles, plannerData), { monthStart: start, monthEnd: end })
      setPlannerDrift(newDrift)
      setPlannerChangedSince(weekendPlannerChangedSince(normalisedEntries, plannerData || []))
      setDismissedDrift(isDriftMuted(id, newDrift))
    }
  }

  // Build calendar days for this month
  const calendarDays = rosterMonth ? buildCalendarDays(rosterMonth.year, rosterMonth.month, publicHolidays) : []
  const weeks = buildWeeks(calendarDays)
  const visibleDays = viewMode === 'week' ? (weeks[currentWeek] || []) : calendarDays
  const weekCount = weeks.length
  useEffect(() => {
    if (!openOnLastWeek.current || weekCount === 0) return
    openOnLastWeek.current = false
    setCurrentWeek(weekCount - 1)
  }, [rosterMonth?.id, weekCount])

  // Group entries by date + shift code for fast lookup
  const entryMap = buildEntryMap(entries, shiftTypes)

  // Profiles lookup by id — `profiles` covers every schedulable doctor
  // regardless of is_active, so this resolves names for historical entries
  // too. assignableProfiles is the active-only subset actually offered for
  // NEW assignment (the cell dropdown, the vacancy-reassignment manager) —
  // a deactivated doctor can't be newly rostered, but their history stays
  // intact and fully named.
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
  // From the roster itself (shared between admins); the device-local copy
  // only stands in when that save failed.
  const savedReport = isAdmin && rosterMonth?.status === 'draft'
    ? (rosterMonth.generation_report || readGenerationReport(id))
    : null
  const generationReport = savedReport && reportMatchesDraft(savedReport, entries) ? savedReport : null
  const assignableProfiles = profiles.filter(p => p.is_active)

  // Same-surname disambiguation ("J. Nolan" vs "P. Nolan") for every
  // surname-only label on this page — built from the combined shift +
  // Consultant pools so a collision between the two still resolves, even
  // though they're assigned via separate columns/dropdowns.
  const displayNames = buildDoctorDisplayNames([...profiles, ...consultantProfiles])

  // One filter drives both layouts: Lanes drops the rows that don't match,
  // Rows keeps every chip but dims the ones that don't — hiding a name from
  // a day's staffing would misreport the day, where dimming just answers
  // "where am I".
  const categoryOptions = [...new Set(
    [...profiles, ...consultantProfiles].map(p => p.category).filter(Boolean)
  )].sort().map(c => ({ value: c, label: labelForLeaveCategory(c) || c }))

  // Search and Category dim the chips that don't match; "Show only" dims
  // whole cells. Either counts as the Filter being in use.
  const chipFilterActive = Boolean(search.trim()) || filterCategory.size > 0
  const filtersActive = chipFilterActive || showOnly.size > 0

  function matchesFilter(profile) {
    if (!profile) return false
    if (filterCategory.size > 0 && !filterCategory.has(profile.category)) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    const shown = displayNames?.get(profile.id) ?? profile.surname ?? ''
    return `${profile.name ?? ''} ${profile.surname ?? ''} ${shown}`.toLowerCase().includes(q)
  }

  const lanesProfiles = [...profiles, ...consultantProfiles]
    .filter(p => p.is_active !== false)
    .filter(matchesFilter)

  function clearFilters() {
    setSearch('')
    setFilterCategory(new Set())
    setShowOnly(new Set())
  }

  const canEdit = isAdmin && editing

  async function refreshLocums() {
    const [accounts, open] = await Promise.all([fetchLocumProfiles(), fetchOpenLocumContacts()])
    setLocumProfiles(accounts)
    setLocumContacts(open)
  }
  // Only an admin can assign anyone, and the contact list is theirs
  // alone to read.
  useEffect(() => {
    if (isAdmin) refreshLocums()
  }, [isAdmin])

  // Re-read after the vacancy dialog files or links leave, so the strike-
  // through and its popup are right without a full reload.
  async function refreshLeave() {
    if (!rosterMonth) return
    const { start, end } = monthBounds(rosterMonth.year, rosterMonth.month)
    setLeaveByProfile(await fetchApprovedLeaveByProfile(start, end))
  }

  // Everything the struck-through name's popup says, for one entry — or
  // null when the entry shows nothing unusual.
  const nameById = id => {
    const p = profileMap[id] || consultantProfiles.find(c => c.id === id)
    return p ? `${p.name} ${p.surname}` : null
  }
  function absenceFor(entry) {
    const absence = entryAbsence(entry, leaveByProfile)
    if (!absence) return null
    const doctor = profileMap[absence.profileId]
    return {
      ...absence,
      shortName: doctor ? (displayNames?.get(doctor.id) ?? doctor.surname) : 'Doctor',
      summary: absenceSummary({
        absence,
        leaveByProfile,
        doctorName: nameById(absence.profileId),
        coverName: absence.kind === 'vacated' ? (entry.is_locum ? (locumDisplayName(entry.locum_name) ? `${locumDisplayName(entry.locum_name)} (locum)` : null) : nameById(entry.profile_id)) : null,
        byName: nameById(absence.byId),
        canSeeNote: isAdmin,
      }),
    }
  }

  async function handleCellClick(date, shiftCode, existingEntry) {
    if (!canEdit) return
    // Occupied slot on a published roster: route through the removal/
    // reassignment workflow instead of the plain assign-or-remove dropdown —
    // an empty slot, a locum placeholder, or anything on a draft roster
    // stays freely editable via the dropdown as before.
    // (A locum's slot is not a doctor coming off a shift: no leave to
    // capture, no reason to ask for.)
    if (existingEntry?.profile_id && !existingEntry.is_locum && rosterMonth.status === 'published') {
      setActiveVacancy({
        entryId: existingEntry.id,
        date,
        shiftCode,
        currentProfileId: existingEntry.profile_id,
      })
      return
    }
    setOpenDropdown({ date, shiftCode, entryId: existingEntry?.id || null })
    setDropdownSearch('')
  }

  // Puts a cover on a slot: a doctor, a locum with an account, or a locum
  // with none yet (see lib/locumCover.js). Updates the entry already in the
  // slot when there is one — so a shift a doctor was taken off keeps its
  // struck-through name beside whoever fills it — and inserts otherwise.
  async function assignCover(cover, date, shiftCode, entryId) {
    setOpenDropdown(null)
    setNewLocumFor(null)

    // Find the shift_type_id
    const stId = Object.entries(shiftTypes).find(([, code]) => code === shiftCode)?.[0]
    if (!stId) return

    const priorEntry = entryId ? entries.find(e => e.id === entryId) : null
    const patch = {
      ...coverPatch(cover),
      // A doctor taking over what was a locum's slot works it on contract
      // hours again; a locum's slot never counted.
      ...(cover.kind === 'doctor' && priorEntry?.is_locum ? { counts_toward_contract_hours: true } : {}),
    }

    if (entryId) {
      await supabase.from('roster_entries').update(patch).eq('id', entryId)
    } else {
      await supabase.from('roster_entries').insert({
        roster_month_id: id,
        date: date,
        shift_type_id: stId,
        ...patch,
        position: 99,
      })
    }
    await logRosterEntryChange({
      rosterMonthId: id,
      rosterEntryId: entryId || null,
      entryDate: date,
      shiftCode,
      action: 'assign',
      profileIdBefore: priorEntry?.profile_id ?? null,
      profileIdAfter: coverProfileId(cover),
      changedBy: user.id,
      locumName: cover.kind === 'contact' ? cover.name : null,
    })
    await refreshEntries()
    if (cover.kind === 'contact') refreshLocums()
  }

  async function removeEntry(entryId) {
    setOpenDropdown(null)
    const priorEntry = entries.find(e => e.id === entryId)
    await supabase.from('roster_entries').delete().eq('id', entryId)
    if (priorEntry) {
      await logRosterEntryChange({
        rosterMonthId: id,
        rosterEntryId: entryId,
        entryDate: priorEntry.date,
        shiftCode: shiftTypes[priorEntry.shift_type_id] || 'UNKNOWN',
        action: 'remove',
        profileIdBefore: priorEntry.profile_id,
        profileIdAfter: null,
        changedBy: user.id,
      })
    }
    await refreshEntries()
  }

  // Drag and drop
  function handleDragStart(entry, shiftCode) {
    setDragSource({ entryId: entry.id, profileId: entry.profile_id, date: entry.date, shiftCode })
  }

  async function handleDrop(targetDate, targetShiftCode) {
    if (!dragSource) return
    const stId = Object.entries(shiftTypes).find(([, code]) => code === targetShiftCode)?.[0]
    if (!stId) return

    // Refuse a move that would double-book this doctor elsewhere that same
    // day — dropping onto a date where they already have a different entry.
    if (findSameDayConflict({
      entries, date: targetDate, profileId: dragSource.profileId, excludeEntryId: dragSource.entryId,
    })) {
      setDragSource(null)
      return
    }

    // Move: update the entry's date and shift
    await supabase.from('roster_entries').update({
      date: targetDate,
      shift_type_id: stId,
      is_manual_override: true,
    }).eq('id', dragSource.entryId)

    await logRosterEntryChange({
      rosterMonthId: id,
      rosterEntryId: dragSource.entryId,
      entryDate: targetDate,
      shiftCode: targetShiftCode,
      action: 'move',
      profileIdBefore: dragSource.profileId,
      profileIdAfter: dragSource.profileId,
      dateBefore: dragSource.date,
      shiftCodeBefore: dragSource.shiftCode,
      changedBy: user.id,
    })

    setDragSource(null)
    await refreshEntries()
  }

  async function handlePublish() {
    setShowPublishConfirm(false)
    setPublishing(true)
    await supabase.from('roster_months').update({
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', id)
    await syncWeekendPatternsFromEntries(entries, shiftTypes)
    await loadAll()
    setPublishing(false)
  }

  // Reverts a published roster back to draft. Only undoes the roster_months
  // status itself — the weekend-planner pattern sync that publishing
  // triggers is a downstream side effect on a different table, and
  // unwinding it isn't part of what "undo the publish" was asked for here.
  async function handleUnpublish() {
    setPublishing(true)
    await supabase.from('roster_months').update({
      status: 'draft',
      published_at: null,
    }).eq('id', id)
    await loadAll()
    setPublishing(false)
  }

  // Delete (soft): the same deleted_at the dashboard's Delete uses, so the
  // roster lands in its Recently deleted list and can be restored from
  // there. Lives only in the ⋮ menu, behind a confirm.
  async function handleDelete() {
    if (!window.confirm(`Delete the ${MONTH_NAMES[rosterMonth.month]} ${rosterMonth.year} roster? It can be restored from the Rosters page for a while.`)) return
    const { error } = await supabase.from('roster_months').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Could not delete roster: ' + error.message); return }
    navigate('/roster')
  }

  function goToHoursSummary() {
    navigate(`/roster?view=summary&year=${rosterMonth.year}&month=${rosterMonth.month}`, {
      state: { fromRosterId: id, fromRosterLabel: `${MONTH_NAMES[rosterMonth.month]} ${rosterMonth.year}` },
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <p className="text-sm text-ink-muted">Loading roster…</p>
      </div>
    )
  }

  if (error || !rosterMonth) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card border-flagRed bg-flagRed-bg p-6 text-center">
          <p className="text-sm text-flagRed">{error || 'Roster not found.'}</p>
          <button onClick={() => navigate('/roster')} className="btn-secondary mt-4">
            Back to rosters
          </button>
        </div>
      </div>
    )
  }

  // A flagged entry is the scheduler's "[ ]" — a place it couldn't fill —
  // so it is counted once, as flagged, and not again as a locum
  // placeholder. Both lists run in roster order (date, then shift start),
  // which is the order the jump buttons step through them.
  const startOf = entry => Number((shiftTypes[entry.shift_type_id] || '').split('_')[1]) || 0
  const byRosterOrder = (a, b) => a.date.localeCompare(b.date) || startOf(a) - startOf(b)
  const flaggedEntries = entries.filter(isUnfilled).sort(byRosterOrder)
  const locumEntries = entries.filter(e => e.is_locum && !isUnfilled(e)).sort(byRosterOrder)
  const totalFlags = flaggedEntries.length
  const totalLocums = locumEntries.length

  function jumpTo(kind, direction) {
    const list = kind === 'flagged' ? flaggedEntries : locumEntries
    if (list.length === 0) return
    const current = jump?.kind === kind ? jump.index : -1
    const index = direction === 'prev'
      ? (current <= 0 ? list.length - 1 : current - 1)
      : (current + 1) % list.length
    const target = list[index]
    setJump({ kind, index })
    if (layout !== 'rows') setLayout('rows')
    if (viewMode === 'week') {
      const week = weeks.findIndex(w => w.some(d => d.dateStr === target.date))
      if (week >= 0) setCurrentWeek(week)
    }
    setPendingJumpId(target.id)
  }

  // The phone header's More actions sheet. Font size leads it — it is the
  // one entry that changes what you are looking at, and the one with no
  // desktop equivalent at this breakpoint — then the two places this page
  // links out to, then Undo Publish on its own behind a divider, since it
  // is the only entry that changes the roster itself.
  //
  // One row that opens its three sizes, not three rows: spelling them out
  // made the top half of the sheet a list of near-identical labels, none of
  // which is an action, and it buried the two that are.
  const unpublishItem = isAdmin && rosterMonth.status === 'published' ? {
    key: 'unpublish',
    icon: <Undo className="h-4 w-4" />,
    label: publishing ? 'Reverting…' : 'Undo Publish',
    danger: true,
    disabled: publishing,
    onClick: handleUnpublish,
  } : null

  const deleteItem = isAdmin ? {
    key: 'delete',
    icon: <Trash2 className="h-4 w-4" />,
    label: 'Delete roster',
    danger: true,
    onClick: handleDelete,
  } : null

  const generationReportItem = {
    key: 'generation-report',
    icon: <ClipboardList className="h-4 w-4" />,
    label: 'Generation report',
    onClick: () => setShowGenerationReport(true),
  }

  const rosterMenuItems = [
    {
      key: 'text-size',
      icon: <Type className="h-4 w-4" />,
      label: 'Font size',
      value: textSize,
      options: ROSTER_TEXT_SIZES.map(size => ({ key: size.key, label: size.name })),
      onSelect: setTextSize,
    },
    'divider',
    ...(isLocum ? [] : [{
      key: 'hours-summary',
      icon: <ClipboardClock className="h-4 w-4" />,
      label: 'Hours Summary',
      onClick: goToHoursSummary,
    }]),
    ...(isAdmin ? [{
      key: 'review-log',
      icon: <ScrollText className="h-4 w-4" />,
      label: 'Review log',
      onClick: () => setShowChangeLog(true),
    }] : []),
    ...(generationReport ? [generationReportItem] : []),
    ...(unpublishItem || deleteItem ? ['divider', ...[unpublishItem, deleteItem].filter(Boolean)] : []),
  ]

  // Wide desktop's kebab holds only what is risky to leave one click away;
  // between md and xl it also takes Hours and Log, which leave the row
  // there. (Font size stays on the row as "Aa" from md up.)
  const dangerItems = [unpublishItem, deleteItem].filter(Boolean)
  const desktopMenuItems = [
    ...(generationReport ? [generationReportItem] : []),
    ...(generationReport && dangerItems.length > 0 ? ['divider'] : []),
    ...dangerItems,
  ]
  const midMenuItems = rosterMenuItems.slice(2)
  // Below `desk` the ⋮ leads with the view switches the bar has no room for
  // there (Font size follows, from rosterMenuItems): how much of the month, and which way round it is drawn.
  const phoneMenuItems = [
    {
      key: 'range', icon: <CalendarRange className="h-4 w-4" />, label: 'Show',
      value: viewMode, options: [{ key: 'month', label: 'Whole month' }, { key: 'week', label: 'One week' }],
      onSelect: setViewMode,
    },
    {
      key: 'layout', icon: <Rows3 className="h-4 w-4" />, label: 'Layout',
      value: layout, options: ROSTER_LAYOUTS.map(o => ({ key: o.key, label: o.label })),
      onSelect: setLayout,
    },
    ...rosterMenuItems,
  ]

  const statusLabel = rosterMonth.status.charAt(0).toUpperCase() + rosterMonth.status.slice(1)
  const statusPillTone = rosterMonth.status === 'published'
    ? 'bg-success-bg text-success ring-1 ring-inset ring-success/45'
    : 'bg-flagAmber-bg text-flagAmber ring-1 ring-inset ring-flagAmber/45'

  // Week view's stepper. Inside the month it moves a week; off either end
  // it opens the neighbouring month's roster, at its first or last week.
  function stepWeek(delta) {
    const next = currentWeek + delta
    if (next >= 0 && next < weeks.length) { setCurrentWeek(next); return }
    const d = new Date(rosterMonth.year, rosterMonth.month - 1 + delta, 1)
    goToRosterMonth(d.getFullYear(), d.getMonth() + 1, delta < 0 ? 'last' : 'first')
  }

  // The planner notice, folded to a chip: amber, pulsing a few times when
  // it first appears so it isn't missed, and opening the full message.
  const plannerChip = plannerDrift.length > 0 && !dismissedDrift && (
    <button
      type="button"
      onClick={() => setShowPlannerNotice(true)}
      aria-label={plannerChangedSince ? 'Weekend Planner updated — view' : 'Draft differs from the Weekend Planner — view'}
      title={plannerChangedSince ? 'Weekend Planner updated' : 'Draft differs from the Weekend Planner'}
      className="inline-flex h-[30px] flex-shrink-0 animate-[pulse_1.2s_ease-in-out_3] items-center gap-1.5 rounded-lg border border-flagAmber/50 bg-flagAmber-bg px-2 text-xs font-semibold text-flagAmber-text"
    >
      <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
    </button>
  )

  const weekView = viewMode === 'week'
  const showOnlyOptions = [
    totalFlags > 0 && { value: 'flagged', label: `Flagged slots (${totalFlags})` },
    totalLocums > 0 && { value: 'locum', label: `Locum placeholders (${totalLocums})` },
  ].filter(Boolean)
  const filterGroups = [
    showOnlyOptions.length > 0 && {
      key: 'showOnly', label: 'Show only',
      options: showOnlyOptions,
      selected: showOnly,
      onChange: next => {
        setShowOnly(next)
        if (next.size > 0 && layout !== 'rows') setLayout('rows')
      },
    },
    categoryOptions.length > 0 && {
      key: 'category', label: 'Category',
      options: categoryOptions,
      selected: filterCategory, onChange: setFilterCategory,
    },
  ].filter(Boolean)

  const jumpButtons = (totalFlags > 0 || totalLocums > 0) && (
    <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
      {totalFlags > 0 && (
        <RosterJumpButton kind="flagged" count={totalFlags} position={jump?.kind === 'flagged' ? jump.index : null} onStep={dir => jumpTo('flagged', dir)} />
      )}
      {totalLocums > 0 && (
        <RosterJumpButton kind="locum" count={totalLocums} position={jump?.kind === 'locum' ? jump.index : null} onStep={dir => jumpTo('locum', dir)} />
      )}
    </div>
  )

  const kebabTrigger = (onClick, open) => (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label="More actions"
      title="More actions"
      className="btn-utility h-[30px] w-[30px] flex-shrink-0 p-0"
    >
      <EllipsisVertical className="h-4 w-4" />
    </button>
  )

  // Publish — always labelled, since it's the one action here with real
  // consequences. Opens a confirmation instead of publishing immediately.
  const showPublish = isAdmin && rosterMonth.status === 'draft'
  const publishButton = (
    <button
      onClick={() => setShowPublishConfirm(true)}
      disabled={publishing}
      className="btn-primary text-sm shadow-raised"
    >
      <BookUp className="h-4 w-4" />
      Publish
    </button>
  )

  return (
    <div className="mx-auto max-w-full">
      {/* Edit / Publish float at the bottom-right so they stay in reach
          however far the grid has been scrolled. On a phone they fold into
          the quick-actions ⊕ instead (Delete stays in the ⋮ menu). */}
      {isAdmin && (
          <div className="fixed bottom-6 right-6 z-30 hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => setEditing(e => !e)}
              aria-pressed={editing}
              className={`${editing ? 'btn-primary' : 'btn-secondary'} text-sm shadow-raised`}
            >
              {editing ? <><CircleCheck className="h-4 w-4" /> Done editing</> : <><Pencil className="h-4 w-4" /> Edit</>}
            </button>
            {showPublish && publishButton}
          </div>
      )}
      {/* Phone quick-actions ⊕: Find (search + Filter) for everyone, plus
          Edit and Publish for admins — the same place Rotations and Team
          Leave keep their search. */}
      <FloatingActionMenu
        search={{ value: search, onChange: setSearch, placeholder: 'Search by surname…' }}
        filter={{ groups: filterGroups, active: filtersActive, onClearAll: clearFilters, sheetTitle: 'Filters' }}
        actions={isAdmin ? [
          { key: 'edit', icon: editing ? CircleCheck : Pencil, label: editing ? 'Done editing' : 'Edit', active: editing, onClick: () => setEditing(e => !e) },
          showPublish && { key: 'publish', icon: BookUp, label: 'Publish', onClick: () => setShowPublishConfirm(true) },
        ] : undefined}
      />

      {/* Publish confirmation */}
      {showPublishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center scrim px-4" onClick={() => setShowPublishConfirm(false)}>
          <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-base font-bold text-ink">Are you sure you want to publish this roster?</h3>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowPublishConfirm(false)} className="btn-secondary text-sm">No</button>
              <button type="button" onClick={handlePublish} className="btn-primary text-sm">Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* Weekend Planner notice (§2.6) — the planner and this draft
          disagree. It used to be a block above the grid; it is now the
          amber chip in the bar (plannerChip), and this is what the chip
          opens. Two different facts, two different messages: only a
          planner edit made after generation is "updated"; otherwise the
          draft simply doesn't match the plan (the engine can't always
          honour it, and drafts get hand-edited). Regenerate is offered
          only when there is a newer plan to apply. */}
      {showPlannerNotice && plannerDrift.length > 0 && (
        <Modal
          title={plannerChangedSince ? 'Weekend Planner updated' : 'Draft differs from the Weekend Planner'}
          onClose={() => setShowPlannerNotice(false)}
          centered
          maxWidthClassName="md:max-w-md"
        >
          <p className="text-sm text-ink-light">
            {plannerChangedSince
              ? 'Changed since this draft was generated — regenerate to apply the latest plan.'
              : `${plannerDrift.length} weekend${plannerDrift.length === 1 ? '' : 's'} in this draft ${plannerDrift.length === 1 ? "doesn't" : "don't"} match the plan. The planner hasn't changed since this draft was generated.`}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isAdmin && plannerChangedSince && (
              <button onClick={() => navigate('/roster/generate')} className="btn-primary text-sm">
                Regenerate roster
              </button>
            )}
            <button
              onClick={() => { setShowPlannerNotice(false); setShowDriftDetails(true) }}
              className="btn-secondary text-sm"
            >
              {plannerChangedSince ? 'View changes' : 'View differences'}
            </button>
          </div>
        </Modal>
      )}

      {showDriftDetails && (
        <WeekendDriftDetailsModal
          drift={plannerDrift}
          plannerChanged={plannerChangedSince}
          profileMap={profileMap}
          driftMuted={isDriftMuted(id, plannerDrift)}
          onToggleMute={muted => {
            if (muted) {
              sessionStorage.setItem(driftStorageKey(id), JSON.stringify(plannerDrift))
              setDismissedDrift(true)
            } else {
              sessionStorage.removeItem(driftStorageKey(id))
            }
          }}
          onClose={() => setShowDriftDetails(false)}
        />
      )}

      {/* One floating bar holds the whole header — there is no title block
          above it. In order: ← back to Rosters, the month switch (which is
          also the page's heading, and in Week view steps weeks, rolling
          into the neighbouring month's roster at either end), the status
          pill and the planner chip · Find (search + Filter) · the flagged /
          locum jump chips · then, at the far right, Month/Week, Rows/Lanes,
          Aa, Hours, Log, ⋮.
          On a phone only ← · month · chips · ⋮ stay on the row: Month/Week
          and Rows/Lanes move into ⋮, Find into the ⊕, and the status shows
          as a dot on ⋮. Sticks to the top of the window (clear of an
          iPhone's notch) while the grid scrolls under it; z above the
          Lanes grid's own sticky header (z-30), below menus, sheets and
          modals (z-40+). */}
      <div className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-[35] -mx-3 mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-line bg-canvas-raised/95 px-2 py-1.5 shadow-raised backdrop-blur sm:gap-2 md:mx-0 md:top-3 md:flex-nowrap">
        <button
          type="button"
          onClick={() => navigate('/roster')}
          aria-label="Back to Rosters"
          title="Rosters"
          className="btn-utility h-[30px] w-[30px] flex-shrink-0 p-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <h1 className="min-w-0 flex-1 md:flex-none">
          {weekView ? (
            <StepperShell
              centered
              label={(
                <>
                  <span className="sm:hidden">Wk {currentWeek + 1}/{weeks.length} · {MONTH_NAMES[rosterMonth.month].slice(0, 3)}</span>
                  <span className="hidden sm:inline">Week {currentWeek + 1} of {weeks.length} · {MONTH_NAMES[rosterMonth.month]} {rosterMonth.year}</span>
                </>
              )}
              onPrev={() => stepWeek(-1)}
              onNext={() => stepWeek(1)}
              prevLabel="Previous week"
              nextLabel="Next week"
            />
          ) : (
            <DateStepper unit="month" year={rosterMonth.year} month={rosterMonth.month} onChange={goToRosterMonth} showToday={false} centered compactBelowSm="lg" />
          )}
        </h1>

        <span className={`hidden rounded-full px-2 py-0.5 text-xs font-medium lg:inline ${statusPillTone}`}>
          {statusLabel}
        </span>
        {/* Beside the status from md, where it belongs with "when and
            status"; on a phone it follows the jump chips (below). */}
        {plannerChip && <span className="hidden md:inline-flex">{plannerChip}</span>}

        <div className="hidden h-5 w-px flex-shrink-0 bg-slate-line md:block" aria-hidden="true" />

        {/* Find — on the row from md; in the ⊕ below it. */}
        <div className="hidden min-w-[150px] flex-1 md:block md:max-w-[340px] 2xl:min-w-[220px]">
          <div>
            <Toolbar
              className=""
              compact
              mobileMode="inline"
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search by surname…"
              filterGroups={filterGroups}
              active={filtersActive}
              onClearAll={clearFilters}
            />
          </div>
        </div>

        <div className="hidden h-5 w-px flex-shrink-0 bg-slate-line md:block" aria-hidden="true" />

        {jumpButtons}
        {plannerChip && <span className="inline-flex md:hidden">{plannerChip}</span>}

        <div className="flex flex-shrink-0 items-center gap-2 md:ml-auto">
          {/* The three view switches sit on the row only from `desk` (1440px), where
              there is width to spare; below it they live in ⋮, so the
              search box and Filter are never squeezed or pushed onto a
              second line. */}
          <div className="hidden desk:block">
            <ViewToggle view={viewMode} onChange={setViewMode} options={ROSTER_RANGES} tight />
          </div>
          <div className="hidden desk:block">
            <ViewToggle view={layout} onChange={setLayout} options={ROSTER_LAYOUTS} tight labelFrom="2xl" />
          </div>

          {/* Font size — "Aa" opening S/M/L, rather than four bare letters
              whose meaning wasn't obvious. */}
          <div className="hidden desk:block">
          <span title="Font size" className="inline-flex">
          <ToolbarFacet
            icon={<span className="text-sm font-semibold leading-none" aria-hidden="true">Aa</span>}
            label="Font size"
            compact
            value={textSize}
            onChange={setTextSize}
            options={ROSTER_TEXT_SIZES.map(size => ({ value: size.key, label: size.name }))}
          />
          </span>
          </div>

          {/* Hours Summary — every role except locum (matches Roster Hours
              Summary's own visibility rule). */}
          {!isLocum && (
            <button
              onClick={goToHoursSummary}
              aria-label="Hours Summary"
              title="Hours Summary"
              className="hidden btn-secondary text-sm 2xl:inline-flex"
            >
              <ClipboardClock className="h-4 w-4" />
              <span>Hours</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setShowChangeLog(true)}
              aria-label="Review log"
              title="Review log"
              className="hidden btn-secondary text-sm 2xl:inline-flex"
            >
              <ScrollText className="h-4 w-4" />
              <span>Log</span>
            </button>
          )}

          {/* ⋮ — always last, holding whatever isn't on the row at this
              width. On a phone it also wears the status as a dot (amber
              for a draft), since the pill has no room there. */}
          <div className="relative desk:hidden">
            <PageActionsMenu items={phoneMenuItems} trigger={kebabTrigger} />
            {rosterMonth.status === 'draft' && (
              <span title="Draft" aria-label="Draft" className="pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-canvas-raised bg-flagAmber lg:hidden" />
            )}
          </div>
          <div className="hidden desk:block 2xl:hidden"><PageActionsMenu items={midMenuItems} trigger={kebabTrigger} /></div>
          <div className="hidden 2xl:block"><PageActionsMenu items={desktopMenuItems} trigger={kebabTrigger} /></div>
        </div>
      </div>
      {noRosterNote && (
        <p role="status" className="-mt-1 mb-3 text-sm text-ink-muted">{noRosterNote}</p>
      )}

      {layout === 'lanes' ? (
        <>
          <RosterLanesView
            textSize={textSize}
            days={visibleDays}
            profiles={lanesProfiles}
            entries={entries}
            shiftTypes={shiftTypes}
            displayNames={displayNames}
            entryMap={entryMap}
            leaveByProfile={leaveByProfile}
            padToWeek={viewMode === 'week'}
          />
          <LanesLegend textSize={textSize} />
        </>
      ) : (
      /* Grid — horizontally scrollable. Each day is its own bordered
         block on the page background: `border-separate` with a spacer row
         between days (6px, 14px before a Monday) rather than a divider
         line, so adjacent flag fills can never merge into one slab. The
         cells carry the block's border themselves (top and bottom on every
         cell, left on the rail, right on the last shift cell), which is
         what lets a short weekend row close its frame after three columns
         without a filler cell. Kept as a table so drag-and-drop, the cell
         picker and the fixed column plan all stay as they were.
         Full-bleed below md: the rail plus three shift columns is 385px,
         which only fits a 390px phone without the page's side padding. */
      <div className="-mx-4 overflow-x-auto md:mx-0" style={{ fontSize: `${rosterBase}px` }}>
        <table
          className="w-full table-fixed border-separate border-spacing-0"
          style={{ minWidth: Math.round((wideGrid ? 580 : 495) * rosterScale) }}
        >
          {/* Date rail 44px, Consultant + up to 4 shift columns 107px each.
              Below md the Consultant column is gone and the rail widens to
              64px to carry the consultant under the date. */}
          <colgroup>
            <col style={{ width: Math.round((wideGrid ? 44 : 64) * rosterScale) }} />
            {wideGrid && <col style={{ width: Math.round(107 * rosterScale) }} />}
            <col style={{ width: Math.round(107 * rosterScale) }} />
            <col style={{ width: Math.round(107 * rosterScale) }} />
            <col style={{ width: Math.round(107 * rosterScale) }} />
            <col style={{ width: Math.round(107 * rosterScale) }} />
          </colgroup>
          <tbody>
            {visibleDays.map((day, dayIdx) => {
              const shifts = getShiftsForDay(day.dayType)
              const isWeekend = day.dayType === 'weekend' || day.dayType === 'PH' || day.dayType === 'PH_weekday'
              const todayStr = (() => {
                const n = new Date()
                return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
              })()
              const isToday = day.dateStr === todayStr
              // Show column header when day type changes (first row of a
              // new block of weekday/weekend/PH days)
              const prevDay = visibleDays[dayIdx - 1]
              const showHeader = !prevDay || prevDay.dayType !== day.dayType
              // Parse date parts directly to avoid UTC timezone shift
              const [y, m, d] = day.dateStr.split('-').map(Number)
              const localDate = new Date(y, m - 1, d)
              const isMonday = localDate.getDay() === 1
              // Three day types, three fills: weekdays on white, weekends
              // on the accent tint, public holidays (either kind) on
              // rose-light. The date rail and the shift-time header band
              // share one tone per type, a step darker than the row body
              // (neutral day-rail / accent-light / rose-night), so each
              // day has a left anchor and a header that read as chrome.
              const isPH = day.dayType === 'PH' || day.dayType === 'PH_weekday'
              const chromeBg = isPH
                ? 'bg-rose-night text-rose-dark'
                : isWeekend ? 'bg-accent-light text-accent-dark' : 'bg-day-rail text-ink'
              const rowBg = isPH ? 'bg-rose-light' : isWeekend ? 'bg-accent-tint' : 'bg-canvas-raised'
              const dateInk = isPH ? 'text-rose-dark' : isWeekend ? 'text-accent-dark' : 'text-ink'
              // The block's own 1px border, in the accent on today so the
              // outline wraps the whole day.
              const line = isToday ? 'border-accent' : 'border-slate-line'
              const cellFrame = `border-y ${line}`
              const headerBand = `whitespace-nowrap border-b ${line} px-1 py-1 text-center text-[0.917em] font-semibold ${chromeBg}`

              const consultantCell = (
                <ConsultantCell
                  date={day.dateStr}
                  rosterMonthId={id}
                  existing={entryMap[`${day.dateStr}|CONSULTANT`]?.[0]}
                  consultantProfiles={consultantProfiles}
                  displayNames={displayNames}
                  isAdmin={canEdit}
                  onRefresh={refreshEntries}
                />
              )

              return (
                <Fragment key={day.dateStr}>
                  {dayIdx > 0 && (
                    <tr aria-hidden="true" data-testid="day-gap" className={isMonday ? 'h-[14px]' : 'h-[6px]'}>
                      <td colSpan={wideGrid ? 6 : 5} className="p-0" />
                    </tr>
                  )}
                  <tr data-testid="day-row" data-date={day.dateStr} className={rowBg}>
                  {/* Date rail: pinned left on a phone with an opaque fill so
                      the shift columns scroll beneath it. */}
                  <td
                    className={`${cellFrame} border-l border-r rounded-l-md px-2 py-1.5 align-top font-medium ${chromeBg} ${dateInk} ${wideGrid ? '' : 'sticky left-0 z-10'}`}
                  >
                    <span className="block text-[0.834em] text-ink-muted">{DAY_NAMES[localDate.getDay()]}</span>
                    <span>{d}</span>
                    {day.phName && (
                      <span className="mt-0.5 block">
                        <PublicHolidayBadge name={day.phName} />
                      </span>
                    )}
                    {!wideGrid && (
                      <div data-testid="rail-consultant" className="mt-1 overflow-hidden text-[0.834em] text-ink-muted">
                        {consultantCell}
                      </div>
                    )}
                  </td>

                  {/* Consultant column (md and up) */}
                  {wideGrid && (
                    <td data-testid="consultant-cell" className={`${cellFrame} border-r align-top p-0`}>
                      {showHeader && <div className={headerBand}>Consultant</div>}
                      <div className="px-1.5 py-1">{consultantCell}</div>
                    </td>
                  )}

                  {/* Shift columns */}
                  {shifts.map(({ code, label }, colIdx) => {
                    const cellEntries = entryMap[`${day.dateStr}|${code}`] || []
                    const flags = cellEntries.filter(isUnfilled)
                    const hasShortfall = flags.length > 0
                    const shortBy = flags.filter(e => e.flag_type !== 'psych_coverage').length
                    const flagTab = shortBy > 0 ? `Short by ${shortBy}` : 'No psych cover'
                    const flagReason = [...new Set(flags.map(e => e.flag_reason).filter(Boolean))].join(' · ') || flagTab
                    const shown = showOnly.size === 0 || cellEntries.some(e =>
                      (showOnly.has('flagged') && isUnfilled(e)) || (showOnly.has('locum') && e.is_locum && !isUnfilled(e)))
                    const last = colIdx === shifts.length - 1

                    return (
                      <td
                        key={code}
                        className={`${cellFrame} align-top p-0 ${last ? 'border-r rounded-r-md' : ''}`}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(day.dateStr, code)}
                      >
                        {/* Column header when day type starts */}
                        {showHeader && <div className={headerBand}>{label}</div>}
                        {/* The flag fill sits on this inner block, inset
                            from the cell edges, so flagged cells on
                            consecutive days stay two separate marks and
                            the header above is never tinted. */}
                        {/* A flagged slot — one the scheduler couldn't fill —
                            gets a solid red frame and a tab saying why
                            (full reason on hover/tap). A cell with locum
                            placeholders takes no fill: its dashed amber
                            chips already say "locum", which leaves red the
                            only framed cell on the page. */}
                        <div
                          data-testid="shift-cell"
                          className={`m-[3px] min-h-[36px] rounded p-1 space-y-0.5 transition-opacity ${
                            hasShortfall ? 'bg-canvas-raised ring-2 ring-inset ring-flagRed' : ''
                          } ${shown ? '' : 'opacity-25'}`}
                        >
                          {hasShortfall && (
                            <span className="-mx-1 -mt-1 mb-1 flex">
                              <span
                                data-testid="flag-tab"
                                title={flagReason}
                                className="flex w-full items-center gap-1 rounded-t bg-flagRed px-1.5 py-0.5 text-[0.75em] font-bold text-on-fill"
                              >
                                <TriangleAlert className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                                {flagTab}
                              </span>
                            </span>
                          )}
                          {cellEntries.map(entry => (
                            <DoctorChip
                              key={entry.id}
                              entry={entry}
                              profile={profileMap[entry.profile_id]}
                              dimmed={chipFilterActive && !matchesFilter(profileMap[entry.profile_id])}
                              glow={glowEntryId === entry.id}
                              displayNames={displayNames}
                              absence={absenceFor(entry)}
                              onClick={() => canEdit && handleCellClick(day.dateStr, code, entry)}
                              onDragStart={() => handleDragStart(entry, code)}
                              isAdmin={canEdit}
                              canDrag={rosterMonth.status !== 'published'}
                            />
                          ))}
                          {/* Add slot while editing */}
                          {canEdit && (
                            <button
                              onClick={() => handleCellClick(day.dateStr, code, null)}
                              className="flex w-full items-center justify-center rounded border border-dashed border-accent/70 bg-canvas-raised/70 py-0.5 text-[0.834em] font-bold text-accent-dark hover:border-accent hover:bg-accent-light"
                              title="Add doctor"
                            >
                              +
                            </button>
                          )}
                        </div>
                      </td>
                    )
                  })}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Dropdown */}
      {openDropdown && (
        <DoctorDropdown
          displayNames={displayNames}
          profiles={assignableProfiles.filter(p =>
            // Already working a different shift this same day (§1.3)
            !findSameDayConflict({
              entries, date: openDropdown.date, profileId: p.id, excludeEntryId: openDropdown.entryId,
            })
            // Worked a night shift the day before — needs post-call rest (§1.4)
            && !workedNightShiftPreviousDay({
              entries, shiftTypes, date: openDropdown.date, profileId: p.id,
            })
            // On approved leave this date (§1.2)
            && !isOnApprovedLeave({ leaveByProfile, profileId: p.id, date: openDropdown.date }),
          )}
          search={dropdownSearch}
          onSearchChange={setDropdownSearch}
          onSelect={profileId => assignCover({ kind: 'doctor', id: profileId }, openDropdown.date, openDropdown.shiftCode, openDropdown.entryId)}
          // A locum already on another shift that day is left out, as a
          // doctor is.
          locums={locumProfiles.filter(l => l.is_active !== false && !findSameDayConflict({
            entries, date: openDropdown.date, profileId: l.id, excludeEntryId: openDropdown.entryId,
          }))}
          contacts={locumContacts}
          onSelectCover={cover => assignCover(cover, openDropdown.date, openDropdown.shiftCode, openDropdown.entryId)}
          onNewLocum={() => { setNewLocumFor(openDropdown); setOpenDropdown(null) }}
          onRemove={openDropdown.entryId ? () => removeEntry(openDropdown.entryId) : null}
          onClose={() => setOpenDropdown(null)}
          date={openDropdown.date}
          shiftCode={labelForShiftCode(openDropdown.shiftCode)}
        />
      )}

      {newLocumFor && (
        <NewLocumModal
          adminId={user.id}
          onDone={cover => assignCover(cover, newLocumFor.date, newLocumFor.shiftCode, newLocumFor.entryId)}
          onClose={() => setNewLocumFor(null)}
        />
      )}

      {/* Published-roster removal/reassignment workflow (§2.5) */}
      {activeVacancy && (
        <RosterVacancyManager
          key={activeVacancy.entryId}
          vacancy={activeVacancy}
          entries={entries}
          shiftTypes={shiftTypes}
          profiles={assignableProfiles}
          displayNames={displayNames}
          rosterMonthId={id}
          leaveByProfile={leaveByProfile}
          locums={locumProfiles}
          contacts={locumContacts}
          onDone={info => { setActiveVacancy(null); refreshEntries(); refreshLocums(); if (info?.leaveChanged) refreshLeave() }}
        />
      )}

      {showGenerationReport && generationReport && (
        <GenerationReportModal
          report={generationReport}
          monthLabel={`${MONTH_NAMES[rosterMonth.month]} ${rosterMonth.year}`}
          profileMap={profileMap}
          onClose={() => setShowGenerationReport(false)}
        />
      )}

      {showChangeLog && (
        <RosterChangeLogModal
          rosterMonthId={id}
          monthLabel={`${MONTH_NAMES[rosterMonth.month]} ${rosterMonth.year}`}
          onClose={() => setShowChangeLog(false)}
        />
      )}
    </div>
  )
}

// ── DoctorChip ─────────────────────────────────────────────────────────────
// One assignment. The surface stays plain and the doctor's own colour sits
// on the left rail instead of filling the whole chip: at 39 approved
// doctors a grid of full fills reads as a quilt, and the fill was the only
// thing separating one day from the next. A 3px rail still lets someone
// find themselves at a glance, which was the one job the fill did well.
//
// The shift is not named here — the column heading above says which shift
// this is, so a code in the cell would be the third statement of it and is
// most of the width back.
//
// `absence` (see absenceFor): a doctor who is not working this shift. Either
// the doctor taken off it — their name sits struck through above whoever
// covers it, or above an "Open" slot when nobody does yet — or the doctor
// still on it who has approved leave over its date, whose own name is the
// one struck through. Tapping a struck name says why; while editing it is
// plain text, since a tap there already means "edit this shift".
function DoctorChip({ entry, profile, displayNames, onClick, onDragStart, isAdmin, canDrag = true, dimmed = false, glow = false, absence = null }) {
  // Before the early returns below — a hook can't sit behind one.
  const swatch = useSwatch()
  // A jumped-to chip glows for a moment (see jumpTo) in its own colour.
  // The spotlight on a jumped-to chip: a ring in the ink colour (near-black
  // on the light theme, near-white at night) with a gap inside it, so it
  // stands clear of the red and amber the chips themselves are drawn in.
  // `relative z-10` lifts the chip above its neighbours — the ring is a
  // shadow outside the chip's box, and the chip stacked just below was
  // painting over its bottom edge.
  const glowRing = glow ? 'relative z-10 ring-2 ring-ink ring-offset-2 ring-offset-canvas-raised' : ''
  // The scheduler's "[ ]" for a place it couldn't fill reads as what it is.
  if (entry.is_locum && isUnfilled(entry)) {
    return (
      <div
        data-entry-id={entry.id}
        onClick={isAdmin ? onClick : undefined}
        className={`rounded border border-dashed border-flagRed bg-canvas-raised px-1.5 py-0.5 text-center text-[0.834em] font-semibold text-flagRed ${
          isAdmin ? 'cursor-pointer hover:opacity-80' : ''
        } ${glowRing}`}
      >
        Unfilled
      </div>
    )
  }

  const vacated = absence?.kind === 'vacated' ? absence : null
  const vacatedLine = vacated && (
    <div data-testid="vacated-doctor" className={`flex px-1.5 text-[0.834em] text-ink-muted ${dimmed ? 'opacity-30' : ''}`}>
      <RosterAbsenceNote name={vacated.shortName} summary={vacated.summary} interactive={!isAdmin} />
    </div>
  )

  // Vacated and not yet covered: the slot stays visible, and while editing
  // it is the thing to click to fill this same entry (so the struck name
  // stays with whoever ends up covering it).
  if (vacated?.open) {
    return (
      <>
        {vacatedLine}
        <div
          data-entry-id={entry.id}
          onClick={isAdmin ? onClick : undefined}
          className={`rounded border border-dashed border-flagAmber bg-flagAmber-bg px-1.5 py-0.5 text-[0.834em] font-medium text-flagAmber ${
            isAdmin ? 'cursor-pointer hover:opacity-80' : ''
          } ${dimmed ? 'opacity-30' : ''} ${glowRing}`}
        >
          {OPEN_LOCUM_LABEL}
        </div>
      </>
    )
  }

  if (entry.is_locum) {
    return (
      <>
      {vacatedLine}
      <div
        data-entry-id={entry.id}
        onClick={isAdmin ? onClick : undefined}
        className={`rounded border border-dashed border-flagAmber bg-flagAmber-bg px-1.5 py-0.5 text-[0.834em] font-medium text-flagAmber ${
          isAdmin ? 'cursor-pointer hover:opacity-80' : ''
        } ${dimmed ? 'opacity-30' : ''} ${glowRing}`}
      >
        {entry.locum_name || OPEN_LOCUM_LABEL}
      </div>
      </>
    )
  }

  if (!profile) return null

  const onLeave = absence?.kind === 'on_leave' ? absence : null
  const chipName = `${displayNames?.get(profile.id) ?? profile.surname}${entry.display_tag ? ` ${entry.display_tag}` : ''}`

  const railColor = profile.color_code || '#4A90D9'
  const draggableNow = isAdmin && canDrag

  return (
    <>
    {vacatedLine}
    <div
      data-entry-id={entry.id}
      draggable={draggableNow}
      onDragStart={draggableNow ? onDragStart : undefined}
      onClick={isAdmin ? onClick : undefined}
      className={`flex items-center rounded-sm border border-slate-line border-l-[3px] bg-canvas-raised px-1.5 py-0.5 text-[0.834em] font-medium ${onLeave ? 'text-ink-muted' : 'text-ink'} ${
        isAdmin ? 'cursor-pointer hover:bg-canvas-sunken' : ''
      } ${dimmed ? 'opacity-30' : ''} ${glowRing}`}
      style={{ borderLeftColor: swatch.stroke(railColor) }}
      title={`${profile.name} ${profile.surname}${entry.is_manual_override ? ' (manually set)' : ''}`}
    >
      {onLeave
        ? <RosterAbsenceNote name={chipName} summary={onLeave.summary} interactive={!isAdmin} />
        : <span className="truncate">{chipName}</span>}
    </div>
    </>
  )
}

// ── ConsultantCell ───────────────────────────────────────────────────────────
// Consultants pick from consultantProfiles via the same DoctorDropdown used
// for shift assignment, storing consultant_profile_id (colour-coded,
// disambiguated) rather than free text. consultant_name is only read here
// as a fallback for any pre-existing free-text rows -- clicking one still
// opens the dropdown, replacing it with a real profile on next save.
// isAdmin-gated like every other edit affordance in the grid (DoctorChip,
// the shift-cell "+" button) -- RLS already blocks the write for a
// non-admin, but the cell shouldn't offer a dropdown that just fails.
function ConsultantCell({ date, rosterMonthId, existing, consultantProfiles, displayNames, isAdmin, onRefresh }) {
  const swatch = useSwatch()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  async function assign(profileId) {
    setOpen(false)
    if (existing) {
      await supabase.from('roster_entries').update({ consultant_profile_id: profileId, consultant_name: null }).eq('id', existing.id)
    } else {
      const { data: stData } = await supabase.from('shift_types').select('id').eq('code', 'WD_08').single()
      if (stData) {
        await supabase.from('roster_entries').insert({
          roster_month_id: rosterMonthId,
          date,
          shift_type_id: stData.id,
          consultant_profile_id: profileId,
          position: 0,
        })
      }
    }
    onRefresh()
  }

  async function remove() {
    setOpen(false)
    if (existing) await supabase.from('roster_entries').delete().eq('id', existing.id)
    onRefresh()
  }

  const consultant = existing?.consultant_profile_id
    ? consultantProfiles.find(p => p.id === existing.consultant_profile_id)
    : null
  // Same slot treatment as DoctorChip — the consultant is one more name in
  // the row, so it should not be the one full-colour block left on it.
  const railColor = consultant?.color_code || '#4A90D9'

  return (
    <>
      <div onClick={isAdmin ? () => setOpen(true) : undefined} className={isAdmin ? 'cursor-pointer' : ''}>
        {consultant ? (
          <div
            className={`flex items-center rounded-sm border border-slate-line border-l-[3px] bg-canvas-raised px-1.5 py-0.5 text-[0.834em] font-medium text-ink ${isAdmin ? 'hover:bg-canvas-sunken' : ''}`}
            style={{ borderLeftColor: swatch.stroke(railColor) }}
            title={`${consultant.name} ${consultant.surname}`}
          >
            <span className="truncate">{displayNames?.get(consultant.id) ?? consultant.surname}</span>
          </div>
        ) : existing?.consultant_name ? (
          <div className={`min-h-[20px] rounded px-1 py-0.5 text-[0.834em] text-ink-muted ${isAdmin ? 'hover:bg-canvas-sunken' : ''}`}>
            {existing.consultant_name}
          </div>
        ) : isAdmin ? (
          <div className="flex w-full items-center justify-center rounded border border-dashed border-accent/70 bg-canvas-raised/70 py-0.5 text-[0.834em] font-bold text-accent-dark hover:border-accent hover:bg-accent-light">
            +
          </div>
        ) : (
          <div className="min-h-[20px] px-1 py-0.5 text-[0.834em] text-ink-muted">—</div>
        )}
      </div>

      {isAdmin && open && (
        <DoctorDropdown
          profiles={consultantProfiles}
          displayNames={displayNames}
          search={search}
          onSearchChange={setSearch}
          onSelect={assign}
          onRemove={existing ? remove : null}
          onClose={() => setOpen(false)}
          date={date}
          shiftCode="Consultant"
        />
      )}
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────

function buildCalendarDays(year, month, publicHolidays = {}) {
  const days = []
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    // Use LOCAL date constructor — avoids UTC timezone shift that causes
    // dates to be classified as the wrong weekday (e.g. Saturdays appearing
    // as Fridays in UTC+2 regions like South Africa).
    const date = new Date(year, month - 1, d)
    const weekday = date.getDay() // 0=Sun, 1=Mon … 6=Sat (local time)
    const isWeekendDay = weekday === 0 || weekday === 6  // Sun or Sat

    // Build "YYYY-MM-DD" without relying on toISOString() (which is UTC)
    const mm = String(month).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    const dateStr = `${year}-${mm}-${dd}`

    const phName = publicHolidays[dateStr] || null
    const isPH = Boolean(phName)

    let dayType
    if (isPH) {
      // v2.1: PH on a weekday (Mon-Fri) uses PHW_08/12/15/22 (4-slot)
      //       PH on a weekend (Sat/Sun) uses PH_08/13/20 (3-slot)
      dayType = isWeekendDay ? 'PH' : 'PH_weekday'
    } else {
      dayType = isWeekendDay ? 'weekend' : 'weekday'
    }

    days.push({ dateStr, dayType, phName })
  }
  return days
}

function buildWeeks(days) {
  // Split into weeks. A new week starts on Monday (weekday index 1).
  // We parse the day-of-week directly from the dateStr to avoid UTC issues.
  const weeks = []
  let week = []
  for (const day of days) {
    const [y, m, d] = day.dateStr.split('-').map(Number)
    const weekday = new Date(y, m - 1, d).getDay() // local time
    week.push(day)
    // End of week = Sunday (0), or last day of month
    if (weekday === 0 || day === days[days.length - 1]) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) weeks.push(week)
  return weeks.filter(w => w.length > 0)
}

function buildEntryMap(entries, shiftTypes) {
  const map = {}
  for (const entry of entries) {
    const code = (entry.consultant_name || entry.consultant_profile_id) ? 'CONSULTANT' : (shiftTypes[entry.shift_type_id] || 'UNKNOWN')
    const key = `${entry.date}|${code}`
    if (!map[key]) map[key] = []
    map[key].push(entry)
  }
  return map
}

