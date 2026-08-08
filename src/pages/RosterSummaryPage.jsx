import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchRosterSummary } from '../lib/rosterSummary'
import { monthsForYear } from '../lib/leaveYearGrid'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'
import { contrastTextColor } from '../lib/color'
import PageHeader from '../components/PageHeader'
import Tag from '../components/Tag'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

// Display order/labels for the category filter chips — a fixed order reads
// better than however profiles happen to sort, and only categories actually
// present among this month's rows render as chips at all.
const CATEGORY_ORDER = ['MO', 'Registrar', 'COSMO', 'COSMOPsych', 'EC_Intern', 'OT_Intern', 'EC_COSMO_Intern', 'OT_COSMO_Intern', 'Intern', 'Consultant', 'Locum']
const CATEGORY_LABEL = {
  MO: 'MO', Registrar: 'Registrar', COSMO: 'COSMO', COSMOPsych: 'COSMO Psych',
  EC_Intern: 'EC Intern', OT_Intern: 'OT Intern', EC_COSMO_Intern: 'EC COSMO Intern',
  OT_COSMO_Intern: 'OT COSMO Intern', Intern: 'Intern', Consultant: 'Consultant', Locum: 'Locum',
}

const WEEKDAY_COLUMNS = [{ code: 'WD_08', label: '08h00' }, { code: 'WD_12', label: '12h00' }, { code: 'WD_15', label: '15h00' }, { code: 'WD_22', label: '22h00' }]
const WEEKEND_COLUMNS = [{ code: 'WE_08', label: '08h00' }, { code: 'WE_13', label: '13h00' }, { code: 'WE_20', label: '20h00' }]
// PH falling on a weekday uses the 4-slot PHW_* code set; PH falling on a
// weekend uses the 3-slot PH_* set — same weekday/weekend shift-count split
// as the ordinary Weekday/Weekend sections above, just for PH days.
const PH_WEEKDAY_COLUMNS = [{ code: 'PHW_08', label: '08h00' }, { code: 'PHW_12', label: '12h00' }, { code: 'PHW_15', label: '15h00' }, { code: 'PHW_22', label: '22h00' }]
const PH_WEEKEND_COLUMNS = [{ code: 'PH_08', label: '08h00' }, { code: 'PH_13', label: '13h00' }, { code: 'PH_20', label: '20h00' }]

function hoursBand(row) {
  if (row.totalHours < row.minHours) return 'under'
  if (row.totalHours > row.maxHours) return 'over'
  return null
}

export default function RosterSummaryPage() {
  const { isLocum } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const year = Number(searchParams.get('year')) || new Date().getFullYear()
  const month = Number(searchParams.get('month')) || new Date().getMonth() + 1
  const monthLabel = monthsForYear(year)[month - 1].label

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  // Which hours column reads as the emphasised one — a display preference
  // only, never a row filter (Bottomley/Baerends-style split-hours doctors
  // always show both columns regardless of this toggle).
  const [hoursMode, setHoursMode] = useState('contracted')
  const [leaveOpen, setLeaveOpen] = useState(false)

  useEffect(() => { load() }, [year, month]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; including it would refetch in a loop

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchRosterSummary({ month, year })
      setRows(data)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // Locums never see this page at all — everyone else (doctor, admin, and
  // clerk in its existing read-only capacity) can.
  if (isLocum) return <Navigate to="/" replace />

  function setYearMonth(newYear, newMonth) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('year', String(newYear))
      next.set('month', String(newMonth))
      return next
    }, { replace: true })
  }
  function goPrevMonth() { month === 1 ? setYearMonth(year - 1, 12) : setYearMonth(year, month - 1) }
  function goNextMonth() { month === 12 ? setYearMonth(year + 1, 1) : setYearMonth(year, month + 1) }
  function goToday() { const now = new Date(); setYearMonth(now.getFullYear(), now.getMonth() + 1) }

  function toggleCategory(category) {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const availableCategories = CATEGORY_ORDER.filter(c => rows.some(r => r.category === c))
  const filteredRows = selectedCategories.size === 0 ? rows : rows.filter(r => selectedCategories.has(r.category))

  return (
    <div className="mx-auto max-w-full">
      <PageHeader title="Roster Summary" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={goPrevMonth} className="btn-secondary h-[30px] w-[30px] p-0 text-sm" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <span className="font-display text-base font-semibold text-ink">{monthLabel} {year}</span>
          <button type="button" onClick={goNextMonth} className="btn-secondary h-[30px] w-[30px] p-0 text-sm" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={goToday} className="btn-secondary h-[30px] px-2 text-xs">Today</button>
          {/* No live subscription to roster_entries — see RosterSummaryPage's
              own note on this. This is the manual escape hatch: re-pull this
              month's numbers without navigating away and back. */}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn-secondary flex h-[30px] items-center gap-1.5 px-2 text-xs disabled:opacity-60"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Contracted/Locum emphasis toggle — a display preference, not a filter (see hoursMode). */}
        <div className="flex rounded-lg border border-slate-line bg-canvas-raised overflow-hidden">
          <button
            onClick={() => setHoursMode('contracted')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${hoursMode === 'contracted' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'}`}
          >
            Contracted
          </button>
          <button
            onClick={() => setHoursMode('locum')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${hoursMode === 'locum' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'}`}
          >
            Locum
          </button>
        </div>
      </div>

      {/* Category filter chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {availableCategories.map(category => {
          const active = selectedCategories.has(category)
          return (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? 'bg-accent text-white' : 'bg-canvas-sunken text-ink-light hover:text-ink'
              }`}
            >
              {CATEGORY_LABEL[category] || category}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setLeaveOpen(o => !o)}
        aria-expanded={leaveOpen}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink-light hover:text-ink"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${leaveOpen ? 'rotate-180' : ''}`} />
        {leaveOpen ? 'Hide leave breakdown' : 'Show leave breakdown'}
      </button>

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}

      {!loading && !error && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-line">
          <table className="w-full min-w-[1400px] border-collapse text-xs">
            <thead>
              <tr className="bg-canvas-sunken text-[10px] uppercase tracking-wide text-ink-muted">
                <th className="border-b border-r border-slate-line px-2 py-1.5 text-left" rowSpan={2}>Doctor</th>
                <th className="border-b border-r border-slate-line px-2 py-1.5 text-center" colSpan={3}>Totals</th>
                <th className="border-b border-r border-slate-line px-2 py-1.5 text-center" colSpan={WEEKDAY_COLUMNS.length}>Weekday</th>
                <th className="border-b border-r border-slate-line px-2 py-1.5 text-center" colSpan={WEEKEND_COLUMNS.length}>Weekend</th>
                <th className="border-b border-r border-slate-line px-2 py-1.5 text-center" colSpan={PH_WEEKDAY_COLUMNS.length}>PH (Weekday)</th>
                <th className="border-b border-r border-slate-line px-2 py-1.5 text-center" colSpan={PH_WEEKEND_COLUMNS.length}>PH (Weekend)</th>
                <th className={`border-b px-2 py-1.5 text-center ${leaveOpen ? 'border-r border-slate-line' : ''}`} colSpan={2}>PH Lieu</th>
                {leaveOpen && (
                  <th className="border-b border-slate-line px-2 py-1.5 text-center" colSpan={1 + Object.keys(LEAVE_TYPE_LABELS).length}>Leave</th>
                )}
              </tr>
              <tr className="bg-canvas-sunken text-[10px] text-ink-muted">
                <th className="border-b border-r border-slate-line px-2 py-1 font-medium">Target</th>
                <th className="border-b border-r border-slate-line px-2 py-1 font-medium">Worked</th>
                <th className="border-b border-r border-slate-line px-2 py-1 font-medium">Locum</th>
                {WEEKDAY_COLUMNS.map(c => <th key={c.code} className="border-b border-r border-slate-line px-2 py-1 font-medium">{c.label}</th>)}
                {WEEKEND_COLUMNS.map(c => <th key={c.code} className="border-b border-r border-slate-line px-2 py-1 font-medium">{c.label}</th>)}
                {PH_WEEKDAY_COLUMNS.map(c => <th key={c.code} className="border-b border-r border-slate-line px-2 py-1 font-medium">{c.label}</th>)}
                {PH_WEEKEND_COLUMNS.map(c => <th key={c.code} className="border-b border-r border-slate-line px-2 py-1 font-medium">{c.label}</th>)}
                <th className="border-b border-r border-slate-line px-2 py-1 font-medium">Lieu Owed</th>
                <th className={`border-b px-2 py-1 font-medium ${leaveOpen ? 'border-r border-slate-line' : ''}`}>Lieu Taken</th>
                {leaveOpen && (
                  <>
                    <th className="border-b border-r border-slate-line px-2 py-1 font-medium">Days</th>
                    <th className="border-b border-slate-line px-2 py-1 text-left font-medium">Breakdown</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => {
                const band = hoursBand(row)
                const textColor = row.colorCode ? contrastTextColor(row.colorCode) : undefined
                return (
                  <tr key={row.profileId} className="border-b border-slate-line last:border-0 hover:bg-canvas-sunken/50">
                    <td className="border-r border-slate-line px-2 py-1.5 align-top">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: row.colorCode || '#4A90D9', color: textColor }}
                        >
                          {row.name} {row.surname}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-ink-muted">{CATEGORY_LABEL[row.category] || row.category}</p>
                    </td>
                    <td className="border-r border-slate-line px-2 py-1.5 text-center text-ink-light">{row.minHours}–{row.maxHours}</td>
                    <td className={`border-r border-slate-line px-2 py-1.5 text-center font-medium ${
                      band === 'over' ? 'bg-flagRed-bg text-flagRed' : band === 'under' ? 'bg-flagAmber-bg text-flagAmber' : 'text-ink'
                    } ${hoursMode === 'contracted' ? 'font-semibold' : ''}`}>
                      {row.totalHours}
                    </td>
                    <td className={`border-r border-slate-line px-2 py-1.5 text-center ${hoursMode === 'locum' ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                      {row.locumHours > 0 ? row.locumHours : '—'}
                    </td>
                    {WEEKDAY_COLUMNS.map(c => (
                      <td key={c.code} className="border-r border-slate-line px-2 py-1.5 text-center text-ink-light">{row.shiftsByCode[c.code] || 0}</td>
                    ))}
                    {WEEKEND_COLUMNS.map(c => (
                      <td key={c.code} className="border-r border-slate-line px-2 py-1.5 text-center text-ink-light">{row.shiftsByCode[c.code] || 0}</td>
                    ))}
                    {PH_WEEKDAY_COLUMNS.map(c => (
                      <td key={c.code} className="border-r border-slate-line px-2 py-1.5 text-center text-ink-light">{row.shiftsByCode[c.code] || 0}</td>
                    ))}
                    {PH_WEEKEND_COLUMNS.map(c => (
                      <td key={c.code} className="border-r border-slate-line px-2 py-1.5 text-center text-ink-light">{row.shiftsByCode[c.code] || 0}</td>
                    ))}
                    <td className="border-r border-slate-line px-2 py-1.5 text-center text-ink-light">{row.phLieuOwed || '—'}</td>
                    <td className={`px-2 py-1.5 text-center text-ink-light ${leaveOpen ? 'border-r border-slate-line' : ''}`}>{row.phLieuTaken || '—'}</td>
                    {leaveOpen && (
                      <>
                        <td className="border-r border-slate-line px-2 py-1.5 text-center text-ink-light">{row.leaveDays || '—'}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(row.leaveByType).map(([type, days]) => (
                              <Tag key={type} className="text-[10px]">{LEAVE_TYPE_LABELS[type] || type}: {days}</Tag>
                            ))}
                            {Object.keys(row.leaveByType).length === 0 && <span className="text-ink-muted">—</span>}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={99} className="p-6 text-center text-sm text-ink-muted">No doctors match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
