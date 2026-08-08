import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, RefreshCw, Search, ArrowUpDown, CircleX } from 'lucide-react'
import { fetchRosterSummary } from '../lib/rosterSummary'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'
import { contrastTextColor } from '../lib/color'
import DateStepper from '../components/DateStepper'
import ClearableInput from '../components/ClearableInput'
import FilterPanel from '../components/FilterPanel'
import { QuickSelectButton } from '../components/Toolbar'
import Tag from '../components/Tag'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

// Category display order/labels — feeds the Filter popover's Category
// group (only categories actually present among this month's rows show up
// as options) and each row's own category label text.
// Consultant deliberately excluded — see rosterSummary.js's fetch-level note.
const CATEGORY_ORDER = ['MO', 'Registrar', 'COSMO', 'COSMOPsych', 'EC_Intern', 'OT_Intern', 'EC_COSMO_Intern', 'OT_COSMO_Intern', 'Intern', 'Locum']
const CATEGORY_LABEL = {
  MO: 'MO', Registrar: 'Registrar', COSMO: 'COSMO', COSMOPsych: 'COSMO Psych',
  EC_Intern: 'EC Intern', OT_Intern: 'OT Intern', EC_COSMO_Intern: 'EC COSMO Intern',
  OT_COSMO_Intern: 'OT COSMO Intern', Intern: 'Intern', Locum: 'Locum',
}

const WEEKDAY_COLUMNS = [{ code: 'WD_08', label: '08h00' }, { code: 'WD_12', label: '12h00' }, { code: 'WD_15', label: '15h00' }, { code: 'WD_22', label: '22h00' }]
const WEEKEND_COLUMNS = [{ code: 'WE_08', label: '08h00' }, { code: 'WE_13', label: '13h00' }, { code: 'WE_20', label: '20h00' }]
// PH falling on a weekday uses the 4-slot PHW_* code set; PH falling on a
// weekend uses the 3-slot PH_* set — same weekday/weekend shift-count split
// as the ordinary Weekday/Weekend sections above, just for PH days.
const PH_WEEKDAY_COLUMNS = [{ code: 'PHW_08', label: '08h00' }, { code: 'PHW_12', label: '12h00' }, { code: 'PHW_15', label: '15h00' }, { code: 'PHW_22', label: '22h00' }]
const PH_WEEKEND_COLUMNS = [{ code: 'PH_08', label: '08h00' }, { code: 'PH_13', label: '13h00' }, { code: 'PH_20', label: '20h00' }]

const CONTRACT_TYPE_ORDER = ['full', 'five_eighths', 'Junior_Doctor_Overtime']
const CONTRACT_TYPE_LABEL = { full: 'Full-time', five_eighths: '⅝', Junior_Doctor_Overtime: 'OT' }

// Sort's fixed category priority: MO, then Registrar, then every Intern-type
// category (EC before OT within that group) — everything else (COSMO,
// COSMOPsych, Locum) sorts after, in whatever order the rows already came
// in (stable sort). Returns [primaryRank, secondaryRank]; 'desc' just
// reverses the comparator's sign rather than needing its own rank table.
function categorySortRank(category) {
  if (category === 'MO') return [0, 0]
  if (category === 'Registrar') return [1, 0]
  if (category === 'EC_Intern' || category === 'EC_COSMO_Intern') return [2, 0]
  if (category === 'OT_Intern' || category === 'OT_COSMO_Intern') return [2, 1]
  if (category === 'Intern') return [2, 2]
  return [3, 0]
}
function compareByCategoryPriority(a, b) {
  const [ap, as] = categorySortRank(a.category)
  const [bp, bs] = categorySortRank(b.category)
  return ap !== bp ? ap - bp : as - bs
}
function compareByName(a, b) {
  const an = `${a.surname} ${a.name}`.toLowerCase()
  const bn = `${b.surname} ${b.name}`.toLowerCase()
  return an < bn ? -1 : an > bn ? 1 : 0
}
const SORT_COMPARATORS = {
  'category-asc': compareByCategoryPriority,
  'category-desc': (a, b) => compareByCategoryPriority(b, a),
  'name-asc': compareByName,
  'name-desc': (a, b) => compareByName(b, a),
}

function hoursBand(row) {
  if (row.totalHours < row.minHours) return 'under'
  if (row.totalHours > row.maxHours) return 'over'
  return null
}

export default function RosterSummaryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const year = Number(searchParams.get('year')) || new Date().getFullYear()
  const month = Number(searchParams.get('month')) || new Date().getMonth() + 1

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  const [selectedContractTypes, setSelectedContractTypes] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  // 'category-asc' (MO → Registrar → Intern) is the default/neutral order.
  const [sortMode, setSortMode] = useState('category-asc')
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

  function setYearMonth(newYear, newMonth) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('year', String(newYear))
      next.set('month', String(newMonth))
      return next
    }, { replace: true })
  }
  const availableCategories = CATEGORY_ORDER.filter(c => rows.some(r => r.category === c))
  const query = searchQuery.trim().toLowerCase()
  const filteredRows = rows
    .filter(r =>
      (!query || `${r.name} ${r.surname}`.toLowerCase().includes(query)) &&
      (selectedCategories.size === 0 || selectedCategories.has(r.category)) &&
      (selectedContractTypes.size === 0 || selectedContractTypes.has(r.contractType))
    )
    .sort(SORT_COMPARATORS[sortMode])

  return (
    <div className="mx-auto max-w-full">
      {/* Month/year stepper (with built-in Today) + Refresh + search + sort
          + filter, all on one row — horizontal scroll as a fallback rather
          than wrapping, so it fits on desktop without scrolling and still
          works (via scroll) on a narrow phone. Refresh drops to icon-only
          below md to leave more room. No page title here — which tab is
          active (the highlighted "Hours Summary" tab above) already says
          what this is. */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto">
        <div className="flex-shrink-0">
          <DateStepper unit="month" year={year} month={month} onChange={setYearMonth} />
        </div>

        {/* No live subscription to roster_entries — see RosterSummaryPage's
            own note on this. This is the manual escape hatch: re-pull this
            month's numbers without navigating away and back. */}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="btn-secondary flex h-[30px] flex-shrink-0 items-center gap-1.5 px-2 text-xs disabled:opacity-60"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">Refresh</span>
        </button>

        <div className="w-80 flex-shrink-0">
          <ClearableInput
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name…"
            className="input-field"
            clearLabel="Clear search"
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <QuickSelectButton
          icon={<ArrowUpDown className="h-4 w-4" />}
          label="Sort"
          value={sortMode}
          onChange={setSortMode}
          options={[
            { value: 'category-asc', label: 'MO → Registrar → Intern' },
            { value: 'category-desc', label: 'Intern → Registrar → MO' },
            { value: 'name-asc', label: 'Name (A–Z)' },
            { value: 'name-desc', label: 'Name (Z–A)' },
          ]}
          isActive={sortMode !== 'category-asc'}
        />
        {/* Category and Contract type as independent multi-select facets
            (replacing the old always-visible category chip row); name
            search above covers what would otherwise be a "name" facet
            here. Swaps its icon to CircleX once a filter is active, same
            bg-accent active styling the trigger already uses. */}
        <FilterPanel
          activeIcon={<CircleX className="h-4 w-4" />}
          groups={[
            {
              key: 'category', label: 'Category',
              options: availableCategories.map(c => ({ value: c, label: CATEGORY_LABEL[c] || c })),
              selected: selectedCategories, onChange: setSelectedCategories,
            },
            {
              key: 'contractType', label: 'Contract type',
              options: CONTRACT_TYPE_ORDER.map(c => ({ value: c, label: CONTRACT_TYPE_LABEL[c] })),
              selected: selectedContractTypes, onChange: setSelectedContractTypes,
            },
          ]}
        />
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
                    <td className={`border-r border-slate-line px-2 py-1.5 text-center font-semibold ${
                      band === 'over' ? 'bg-flagRed-bg text-flagRed' : band === 'under' ? 'bg-flagAmber-bg text-flagAmber' : 'text-ink'
                    }`}>
                      {row.totalHours}
                    </td>
                    <td className="border-r border-slate-line px-2 py-1.5 text-center text-ink-muted">
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
