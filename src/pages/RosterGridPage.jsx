import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { contrastTextColor } from '../lib/color'
import { patternBackgroundStyle } from '../lib/avatarPatterns'
import DoctorDropdown from '../components/DoctorDropdown'
import RosterVacancyManager from '../components/RosterVacancyManager'
import { syncWeekendPatternsFromEntries } from '../lib/weekendPatternSync'
import { monthBounds } from '../lib/dateRange'
import { computeWeekendPlannerDrift } from '../lib/weekendPlanner'
import { logRosterEntryChange } from '../lib/changeLog'
import RosterChangeLogModal from '../components/RosterChangeLogModal'
import WeekendDriftDetailsModal from '../components/WeekendDriftDetailsModal'
import { findSameDayConflict } from '../lib/rosterVacancy'

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

// Shift display headers matching the PDF layout
const WEEKDAY_SHIFTS = [
  { code: 'WD_08', label: '08h00' },
  { code: 'WD_12', label: '12h00' },
  { code: 'WD_15', label: '15h00' },
  { code: 'WD_22', label: '22h00' },
]
const WEEKEND_SHIFTS = [
  { code: 'WE_08', label: '08h00' },
  { code: 'WE_13', label: '13h00' },
  { code: 'WE_20', label: '20h00' },
]
const PH_WEEKDAY_SHIFTS = [
  { code: 'PHW_08', label: '08h00' },
  { code: 'PHW_12', label: '12h00' },
  { code: 'PHW_15', label: '15h00' },
  { code: 'PHW_22', label: '22h00' },
]
const PH_WEEKEND_SHIFTS = [
  { code: 'PH_08', label: '08h00' },
  { code: 'PH_13', label: '13h00' },
  { code: 'PH_20', label: '20h00' },
]

function getShiftsForDay(dayType) {
  if (dayType === 'weekday') return WEEKDAY_SHIFTS
  if (dayType === 'weekend') return WEEKEND_SHIFTS
  if (dayType === 'PH_weekday') return PH_WEEKDAY_SHIFTS
  return PH_WEEKEND_SHIFTS
}

export default function RosterGridPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, user } = useAuth()

  const [rosterMonth, setRosterMonth] = useState(null)
  const [entries, setEntries] = useState([])    // all roster_entries for this month
  const [profiles, setProfiles] = useState([])   // all schedulable doctors
  const [consultantProfiles, setConsultantProfiles] = useState([]) // Consultant-category profiles, for the Consultant column dropdown
  const [shiftTypes, setShiftTypes] = useState({}) // keyed by id -> code
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week'
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

  // Drag state
  const [dragSource, setDragSource] = useState(null) // {entryId, profileId, date, shiftCode}

  // Review log (audit trail of manual edits to this roster)
  const [showChangeLog, setShowChangeLog] = useState(false)

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is redefined every render; including it would refetch in a loop
  }, [id])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [rosterRes, entriesRes, profilesRes, consultantProfilesRes, shiftTypesRes, phRes] = await Promise.all([
        supabase.from('roster_months').select('*').eq('id', id).single(),
        supabase.from('roster_entries').select('*').eq('roster_month_id', id).order('date').order('position', { nullsFirst: true }),
        supabase.from('profiles').select('id, name, surname, category, color_code, pattern_type, contract_type').eq('is_approved', true).neq('category', 'Consultant'),
        supabase.from('profiles').select('id, name, surname, color_code, pattern_type').eq('is_approved', true).eq('category', 'Consultant'),
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
        const { data: plannerData } = await supabase
          .from('weekend_planner_entries')
          .select('weekend_saturday, profile_id')
          .gte('weekend_saturday', start)
          .lte('weekend_saturday', end)
        const newDrift = computeWeekendPlannerDrift(normalisedEntries, plannerData || [], stMap)
        setPlannerDrift(newDrift)
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
        .select('weekend_saturday, profile_id')
        .gte('weekend_saturday', start)
        .lte('weekend_saturday', end)
      const newDrift = computeWeekendPlannerDrift(normalisedEntries, plannerData || [], shiftTypes)
      setPlannerDrift(newDrift)
      setDismissedDrift(isDriftMuted(id, newDrift))
    }
  }

  // Build calendar days for this month
  const calendarDays = rosterMonth ? buildCalendarDays(rosterMonth.year, rosterMonth.month, publicHolidays) : []
  const weeks = buildWeeks(calendarDays)
  const visibleDays = viewMode === 'week' ? (weeks[currentWeek] || []) : calendarDays

  // Group entries by date + shift code for fast lookup
  const entryMap = buildEntryMap(entries, shiftTypes)

  // Profiles lookup by id
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))

  async function handleCellClick(date, shiftCode, existingEntry) {
    if (!isAdmin) return
    // Occupied slot on a published roster: route through the removal/
    // reassignment workflow instead of the plain assign-or-remove dropdown —
    // an empty slot, a locum placeholder, or anything on a draft roster
    // stays freely editable via the dropdown as before.
    if (existingEntry?.profile_id && rosterMonth.status === 'published') {
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

  async function assignDoctor(profileId, date, shiftCode, entryId) {
    setOpenDropdown(null)

    // Find the shift_type_id
    const stId = Object.entries(shiftTypes).find(([, code]) => code === shiftCode)?.[0]
    if (!stId) return

    const priorEntry = entryId ? entries.find(e => e.id === entryId) : null

    if (entryId) {
      // Update existing entry
      await supabase.from('roster_entries').update({
        profile_id: profileId,
        is_locum: false,
        locum_name: null,
        is_manual_override: true,
        is_flagged: false,
        flag_type: null,
        flag_reason: null,
      }).eq('id', entryId)
    } else {
      // Insert new entry
      await supabase.from('roster_entries').insert({
        roster_month_id: id,
        date: date,
        shift_type_id: stId,
        profile_id: profileId,
        is_manual_override: true,
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
      profileIdAfter: profileId,
      changedBy: user.id,
    })
    await refreshEntries()
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
    setPublishing(true)
    await supabase.from('roster_months').update({
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', id)
    await syncWeekendPatternsFromEntries(entries, shiftTypes)
    await loadAll()
    setPublishing(false)
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

  const totalLocums = entries.filter(e => e.is_locum).length
  const totalFlags = entries.filter(e => e.is_flagged).length

  return (
    <div className="mx-auto max-w-full">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => navigate('/roster')}
            className="sticky top-14 md:top-0 z-[5] mb-2 flex items-center gap-1.5 rounded bg-canvas px-2 py-1.5 -ml-2 text-sm text-ink-muted hover:text-ink"
          >
            <ChevronLeftIcon className="h-4 w-4" /> Rosters
          </button>
          <h1 className="font-display text-2xl font-bold text-ink">
            {MONTH_NAMES[rosterMonth.month]} {rosterMonth.year}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              rosterMonth.status === 'published'
                ? 'bg-success-bg text-success'
                : 'bg-flagAmber-bg text-flagAmber'
            }`}>
              {rosterMonth.status.charAt(0).toUpperCase() + rosterMonth.status.slice(1)}
            </span>
            {totalFlags > 0 && (
              <span className="text-xs text-flagRed">{totalFlags} flagged slot{totalFlags !== 1 ? 's' : ''}</span>
            )}
            {totalLocums > 0 && (
              <span className="text-xs text-flagAmber">{totalLocums} locum placeholder{totalLocums !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-line bg-canvas-raised overflow-hidden">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'month' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'week' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
              }`}
            >
              Week
            </button>
          </div>

          {/* Review log */}
          {isAdmin && (
            <button onClick={() => setShowChangeLog(true)} className="btn-secondary text-sm">
              Review log
            </button>
          )}

          {/* Publish */}
          {isAdmin && rosterMonth.status === 'draft' && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="btn-primary text-sm"
            >
              {publishing ? 'Publishing…' : 'Publish roster'}
            </button>
          )}
        </div>
      </div>

      {/* Weekend Planner drift warning (§2.6) — the planner changed after
          this draft was generated. Kept to a single collapsed line with the
          full per-weekend breakdown behind the Details popup, rather than
          dumping the whole list into the banner itself. Dismiss is
          local-only (not persisted), so it re-surfaces on next visit unless
          "don't show this message again" was also checked. */}
      {plannerDrift.length > 0 && !dismissedDrift && (
        <div className="mb-4 rounded-lg border border-flagAmber bg-flagAmber-bg p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-flagAmber">
              The Weekend Planner has changed since this draft was generated
            </p>
            <button
              onClick={() => setShowDriftDetails(true)}
              className="rounded-full border border-flagAmber px-3 py-1 text-xs font-medium text-flagAmber hover:bg-flagAmber/10"
            >
              (i) Details
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setDismissedDrift(true)}
              className="rounded-full border border-flagAmber px-3 py-1 text-xs font-medium text-flagAmber hover:bg-flagAmber/10"
            >
              Dismiss
            </button>
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-flagAmber">
              <input
                type="checkbox"
                checked={isDriftMuted(id, plannerDrift)}
                onChange={e => {
                  if (e.target.checked) {
                    sessionStorage.setItem(driftStorageKey(id), JSON.stringify(plannerDrift))
                    setDismissedDrift(true)
                  } else {
                    sessionStorage.removeItem(driftStorageKey(id))
                  }
                }}
              />
              Don&apos;t show this message again
            </label>
            {isAdmin && (
              <button
                onClick={() => navigate('/roster/generate')}
                className="btn-secondary text-sm"
              >
                Regenerate roster
              </button>
            )}
          </div>
        </div>
      )}

      {showDriftDetails && (
        <WeekendDriftDetailsModal
          drift={plannerDrift}
          profileMap={profileMap}
          onClose={() => setShowDriftDetails(false)}
        />
      )}

      {/* Week navigation (week view only) */}
      {viewMode === 'week' && (
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => setCurrentWeek(w => Math.max(0, w - 1))}
            disabled={currentWeek === 0}
            className="btn-secondary px-2 py-1 text-sm disabled:opacity-40"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-ink">
            Week {currentWeek + 1} of {weeks.length}
          </span>
          <button
            onClick={() => setCurrentWeek(w => Math.min(weeks.length - 1, w + 1))}
            disabled={currentWeek === weeks.length - 1}
            className="btn-secondary px-2 py-1 text-sm disabled:opacity-40"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Grid — horizontally scrollable */}
      <div className="overflow-x-auto rounded-lg border border-slate-line">
        <table className="w-full min-w-[700px] table-fixed border-collapse text-xs">
          {/* Fixed date width; Consultant + up to 4 shift columns share the rest equally */}
          <colgroup>
            <col className="w-16" />
            <col />
            <col />
            <col />
            <col />
            <col />
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
              const headerBg = isWeekend ? 'bg-gray-300' : 'bg-canvas-sunken'

              return (
                <tr
                  key={day.dateStr}
                  className={`border-b border-slate-line ${
                    isWeekend ? 'bg-gray-300' : 'bg-canvas-raised'
                  } ${isToday ? 'outline outline-1 outline-accent' : ''}`}
                >
                  {/* Date label */}
                  <td className={`border-r border-slate-line px-2 py-1.5 font-medium ${
                    isWeekend ? 'text-accent-dark' : 'text-ink'
                  }`}>
                    {(() => {
                      // Parse date parts directly to avoid UTC timezone shift
                      const [y, m, d] = day.dateStr.split('-').map(Number)
                      const localDate = new Date(y, m - 1, d)
                      return (
                        <>
                          <span className="block text-[10px] text-ink-muted">{DAY_NAMES[localDate.getDay()]}</span>
                          <span>{d}</span>
                          {day.phName && <span className="block break-words text-[9px] text-flagAmber">{day.phName}</span>}
                        </>
                      )
                    })()}
                  </td>

                  {/* Consultant column */}
                  <td className="border-r border-slate-line align-top p-0">
                    {showHeader && (
                      <div className={`border-b border-slate-line px-1.5 py-1 text-center font-semibold text-ink-muted ${headerBg}`}>
                        Consultant
                      </div>
                    )}
                    <div className="px-1.5 py-1">
                      <ConsultantCell
                        date={day.dateStr}
                        rosterMonthId={id}
                        existing={entryMap[`${day.dateStr}|CONSULTANT`]?.[0]}
                        consultantProfiles={consultantProfiles}
                        isAdmin={isAdmin}
                        onRefresh={refreshEntries}
                      />
                    </div>
                  </td>

                  {/* Shift columns */}
                  {shifts.map(({ code, label }, colIdx) => {
                    const cellEntries = entryMap[`${day.dateStr}|${code}`] || []
                    const hasShortfall = cellEntries.some(e => e.is_flagged)
                    const hasLocum = cellEntries.some(e => e.is_locum)

                    return (
                      <td
                        key={code}
                        className={`border-r border-slate-line align-top p-0 ${
                          colIdx === shifts.length - 1 ? 'border-r-0' : ''
                        } ${hasShortfall ? 'bg-flagRed-bg' : hasLocum ? 'bg-flagAmber-bg' : ''}`}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(day.dateStr, code)}
                      >
                        {/* Column header when day type starts */}
                        {showHeader && (
                          <div className={`border-b border-slate-line px-1.5 py-1 text-center font-semibold text-ink-muted ${headerBg}`}>
                            {label}
                          </div>
                        )}
                        <div className="min-h-[36px] p-1 space-y-0.5">
                          {cellEntries.map(entry => (
                            <DoctorChip
                              key={entry.id}
                              entry={entry}
                              profile={profileMap[entry.profile_id]}
                              onClick={() => isAdmin && handleCellClick(day.dateStr, code, entry)}
                              onDragStart={() => handleDragStart(entry, code)}
                              isAdmin={isAdmin}
                              canDrag={rosterMonth.status !== 'published'}
                            />
                          ))}
                          {/* Add slot if admin */}
                          {isAdmin && (
                            <button
                              onClick={() => handleCellClick(day.dateStr, code, null)}
                              className="flex w-full items-center justify-center rounded border border-dashed border-slate-line py-0.5 text-[10px] text-ink-muted hover:bg-canvas-sunken hover:text-ink"
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
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Dropdown */}
      {openDropdown && (
        <DoctorDropdown
          profiles={profiles.filter(p => !findSameDayConflict({
            entries, date: openDropdown.date, profileId: p.id, excludeEntryId: openDropdown.entryId,
          }))}
          search={dropdownSearch}
          onSearchChange={setDropdownSearch}
          onSelect={profileId => assignDoctor(profileId, openDropdown.date, openDropdown.shiftCode, openDropdown.entryId)}
          onRemove={openDropdown.entryId ? () => removeEntry(openDropdown.entryId) : null}
          onClose={() => setOpenDropdown(null)}
          date={openDropdown.date}
          shiftCode={openDropdown.shiftCode}
        />
      )}

      {/* Published-roster removal/reassignment workflow (§2.5) */}
      {activeVacancy && (
        <RosterVacancyManager
          key={activeVacancy.entryId}
          vacancy={activeVacancy}
          entries={entries}
          shiftTypes={shiftTypes}
          profiles={profiles}
          rosterMonthId={id}
          onDone={() => { setActiveVacancy(null); refreshEntries() }}
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
function DoctorChip({ entry, profile, onClick, onDragStart, isAdmin, canDrag = true }) {
  if (entry.is_locum) {
    return (
      <div
        onClick={isAdmin ? onClick : undefined}
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium text-flagAmber ${
          isAdmin ? 'cursor-pointer hover:opacity-80' : ''
        }`}
        style={{ backgroundColor: '#FBF1E3', border: '1px dashed #B8762E' }}
      >
        {entry.locum_name || '[ ]'}
      </div>
    )
  }

  if (!profile) return null

  const bgColor = profile.color_code || '#4A90D9'
  const patternStyle = profile.pattern_type ? patternBackgroundStyle(profile.pattern_type, bgColor, 8) : null
  const draggableNow = isAdmin && canDrag

  return (
    <div
      draggable={draggableNow}
      onDragStart={draggableNow ? onDragStart : undefined}
      onClick={isAdmin ? onClick : undefined}
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        isAdmin ? 'cursor-pointer hover:opacity-85' : ''
      } ${entry.is_manual_override ? 'ring-1 ring-flagBlue ring-offset-1' : ''}`}
      style={{ backgroundColor: bgColor, color: contrastTextColor(bgColor), ...patternStyle }}
      title={`${profile.name} ${profile.surname}${entry.is_manual_override ? ' (manually set)' : ''}`}
    >
      {profile.surname}{entry.display_tag ? ` ${entry.display_tag}` : ''}
    </div>
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
function ConsultantCell({ date, rosterMonthId, existing, consultantProfiles, isAdmin, onRefresh }) {
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
  const bgColor = consultant?.color_code || '#4A90D9'
  const patternStyle = consultant?.pattern_type ? patternBackgroundStyle(consultant.pattern_type, bgColor, 8) : null

  return (
    <>
      <div onClick={isAdmin ? () => setOpen(true) : undefined} className={isAdmin ? 'cursor-pointer' : ''}>
        {consultant ? (
          <div
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isAdmin ? 'hover:opacity-85' : ''}`}
            style={{ backgroundColor: bgColor, color: contrastTextColor(bgColor), ...patternStyle }}
            title={`${consultant.name} ${consultant.surname}`}
          >
            {consultant.surname}
          </div>
        ) : existing?.consultant_name ? (
          <div className={`min-h-[20px] rounded px-1 py-0.5 text-[10px] text-ink-muted ${isAdmin ? 'hover:bg-canvas-sunken' : ''}`}>
            {existing.consultant_name}
          </div>
        ) : isAdmin ? (
          <div className="flex w-full items-center justify-center rounded border border-dashed border-slate-line py-0.5 text-[10px] text-ink-muted hover:bg-canvas-sunken hover:text-ink">
            +
          </div>
        ) : (
          <div className="min-h-[20px] px-1 py-0.5 text-[10px] text-ink-muted">—</div>
        )}
      </div>

      {isAdmin && open && (
        <DoctorDropdown
          profiles={consultantProfiles}
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

function ChevronLeftIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}
function ChevronRightIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
