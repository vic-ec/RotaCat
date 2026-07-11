import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

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
  const { isAdmin } = useAuth()

  const [rosterMonth, setRosterMonth] = useState(null)
  const [entries, setEntries] = useState([])    // all roster_entries for this month
  const [profiles, setProfiles] = useState([])   // all schedulable doctors
  const [shiftTypes, setShiftTypes] = useState({}) // keyed by id -> code
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week'
  const [currentWeek, setCurrentWeek] = useState(0) // 0-indexed week
  const [publishing, setPublishing] = useState(false)
  const [publicHolidays, setPublicHolidays] = useState({}) // keyed by "YYYY-MM-DD" -> name

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState(null) // {date, shiftCode, entryId}
  const [dropdownSearch, setDropdownSearch] = useState('')

  // Drag state
  const [dragSource, setDragSource] = useState(null) // {entryId, profileId, date, shiftCode}

  useEffect(() => {
    loadAll()
  }, [id])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [rosterRes, entriesRes, profilesRes, shiftTypesRes, phRes] = await Promise.all([
        supabase.from('roster_months').select('*').eq('id', id).single(),
        supabase.from('roster_entries').select('*').eq('roster_month_id', id).order('date').order('position', { nullsFirst: true }),
        supabase.from('profiles').select('id, name, surname, category, color_code, contract_type').eq('is_approved', true).neq('category', 'Consultant'),
        supabase.from('shift_types').select('id, code').eq('is_active', true),
        supabase.from('public_holidays').select('date, name'),
      ])

      if (rosterRes.error) throw new Error(rosterRes.error.message)
      setRosterMonth(rosterRes.data)
      // Normalise date strings — Supabase may return "2026-08-01T00:00:00"
      // or "2026-08-01" depending on column type. Slice to "YYYY-MM-DD" to
      // guarantee consistent keys throughout the component.
      setEntries((entriesRes.data || []).map(e => ({
        ...e,
        date: e.date?.slice(0, 10),
      })))
      setProfiles(profilesRes.data || [])

      const stMap = {}
      for (const st of (shiftTypesRes.data || [])) stMap[st.id] = st.code
      setShiftTypes(stMap)

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
    setOpenDropdown({ date, shiftCode, entryId: existingEntry?.id || null })
    setDropdownSearch('')
  }

  async function assignDoctor(profileId, date, shiftCode, entryId) {
    setOpenDropdown(null)

    // Find the shift_type_id
    const stId = Object.entries(shiftTypes).find(([, code]) => code === shiftCode)?.[0]
    if (!stId) return

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
    await loadAll()
  }

  async function removeEntry(entryId) {
    setOpenDropdown(null)
    await supabase.from('roster_entries').delete().eq('id', entryId)
    await loadAll()
  }

  // Drag and drop
  function handleDragStart(entry, shiftCode) {
    setDragSource({ entryId: entry.id, profileId: entry.profile_id, date: entry.date, shiftCode })
  }

  async function handleDrop(targetDate, targetShiftCode) {
    if (!dragSource) return
    const stId = Object.entries(shiftTypes).find(([, code]) => code === targetShiftCode)?.[0]
    if (!stId) return

    // Move: update the entry's date and shift
    await supabase.from('roster_entries').update({
      date: targetDate,
      shift_type_id: stId,
      is_manual_override: true,
    }).eq('id', dragSource.entryId)

    setDragSource(null)
    await loadAll()
  }

  async function handlePublish() {
    setPublishing(true)
    await supabase.from('roster_months').update({
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', id)
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
            className="mb-2 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
          >
            <ChevronLeftIcon className="h-4 w-4" /> Rosters
          </button>
          <h1 className="font-display text-2xl text-ink">
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
                viewMode === 'month' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'week' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'
              }`}
            >
              Week
            </button>
          </div>

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
        <table className="w-full min-w-[700px] border-collapse text-xs">
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
                  <td className={`w-20 border-r border-slate-line px-2 py-1.5 font-medium ${
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
                          {day.phName && <span className="block text-[9px] text-flagAmber truncate">{day.phName}</span>}
                        </>
                      )
                    })()}
                  </td>

                  {/* Consultant column */}
                  <td className="w-24 border-r border-slate-line align-top p-0">
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
                        onRefresh={loadAll}
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
                            />
                          ))}
                          {/* Add slot if admin */}
                          {isAdmin && (
                            <button
                              onClick={() => handleCellClick(day.dateStr, code, null)}
                              className="flex w-full items-center justify-center rounded py-0.5 text-[10px] text-ink-muted opacity-0 hover:bg-canvas-sunken hover:opacity-100 transition-opacity group-hover:opacity-100"
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
          profiles={profiles}
          search={dropdownSearch}
          onSearchChange={setDropdownSearch}
          onSelect={profileId => assignDoctor(profileId, openDropdown.date, openDropdown.shiftCode, openDropdown.entryId)}
          onRemove={openDropdown.entryId ? () => removeEntry(openDropdown.entryId) : null}
          onClose={() => setOpenDropdown(null)}
          date={openDropdown.date}
          shiftCode={openDropdown.shiftCode}
        />
      )}
    </div>
  )
}

// ── DoctorChip ────────────────────────────────────────────────────────
function DoctorChip({ entry, profile, onClick, onDragStart, isAdmin }) {
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

  return (
    <div
      draggable={isAdmin}
      onDragStart={isAdmin ? onDragStart : undefined}
      onClick={isAdmin ? onClick : undefined}
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${
        isAdmin ? 'cursor-pointer hover:opacity-85' : ''
      } ${entry.is_manual_override ? 'ring-1 ring-flagBlue ring-offset-1' : ''}`}
      style={{ backgroundColor: profile.color_code || '#4A90D9' }}
      title={`${profile.name} ${profile.surname}${entry.is_manual_override ? ' (manually set)' : ''}`}
    >
      {profile.surname}{entry.display_tag ? ` ${entry.display_tag}` : ''}
    </div>
  )
}

// ── ConsultantCell ────────────────────────────────────────────────────
function ConsultantCell({ date, rosterMonthId, existing, onRefresh }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(existing?.consultant_name || '')
  const inputRef = useRef()

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function save() {
    setEditing(false)
    if (existing) {
      await supabase.from('roster_entries').update({ consultant_name: value }).eq('id', existing.id)
    } else if (value.trim()) {
      const { data: stData } = await supabase.from('shift_types').select('id').eq('code', 'WD_08').single()
      if (stData) {
        await supabase.from('roster_entries').insert({
          roster_month_id: rosterMonthId,
          date,
          shift_type_id: stData.id,
          consultant_name: value,
          position: 0,
        })
      }
    }
    onRefresh()
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => e.key === 'Enter' && save()}
        className="w-full rounded border border-accent px-1 py-0.5 text-[10px] outline-none"
        placeholder="Consultant"
      />
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="min-h-[20px] cursor-pointer rounded px-1 py-0.5 text-[10px] text-ink-muted hover:bg-canvas-sunken"
    >
      {existing?.consultant_name || <span className="opacity-40">+</span>}
    </div>
  )
}

// ── DoctorDropdown ────────────────────────────────────────────────────
function DoctorDropdown({ profiles, search, onSearchChange, onSelect, onRemove, onClose, date, shiftCode }) {
  const filtered = profiles.filter(p =>
    `${p.name} ${p.surname}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-xs p-0 shadow-raised overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-slate-line px-3 py-2.5">
          <p className="text-xs font-medium text-ink-muted mb-1.5">
            Assign doctor — {shiftCode} on {date}
          </p>
          <input
            autoFocus
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search by name…"
            className="input-field text-sm py-1.5"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-3 py-3 text-sm text-ink-muted">No doctors found.</p>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-canvas-sunken"
            >
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: p.color_code }}
              />
              <span className="font-medium text-ink">{p.surname}</span>
              <span className="text-xs text-ink-muted capitalize">{p.category}</span>
            </button>
          ))}
        </div>
        {onRemove && (
          <div className="border-t border-slate-line px-3 py-2">
            <button
              onClick={onRemove}
              className="w-full rounded py-1.5 text-sm text-flagRed hover:bg-flagRed-bg"
            >
              Remove from this slot
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

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
    const code = entry.consultant_name ? 'CONSULTANT' : (shiftTypes[entry.shift_type_id] || 'UNKNOWN')
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
