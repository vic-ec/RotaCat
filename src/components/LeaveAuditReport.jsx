import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { reviewStatusLabel } from '../lib/statusLabels'
import { LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN } from '../lib/leaveYearGrid'
import { resolveLeaveCapacityColumn, fetchInternRotationsForDoctorIds, groupRotationsByDoctorId } from '../lib/internRotations'
import { buildAuditRows, AUDIT_LEAVE_COLUMNS } from '../lib/leaveAudit'
import { buildDoctorDisplayNames } from '../lib/doctorNames'
import { useSelectedRow } from '../lib/useSelectedRow'
import { useSwatch } from '../lib/useSwatch'
import {
  DOCTOR_SORT_OPTIONS, DOCTOR_SORT_COMPARATORS, DEFAULT_DOCTOR_SORT,
  CONTRACT_TYPE_ORDER, CONTRACT_TYPE_LABEL,
} from '../lib/doctorSort'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary, naturalLeavePeriodLabel } from '../lib/leaveRequests'
import DateFieldButton from './DateFieldButton'
import FilterPanel from './FilterPanel'
import { QuickSelectButton } from './Toolbar'
import ClearableInput from './ClearableInput'
import FloatingActionMenu from './FloatingActionMenu'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}
const CATEGORY_OPTIONS = [
  ...LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label })),
  { value: LEAVE_OTHER_COLUMN.key, label: LEAVE_OTHER_COLUMN.label },
]
const COLUMN_LABEL_BY_KEY = Object.fromEntries(CATEGORY_OPTIONS.map(o => [o.value, o.label]))
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function yearStartStr() {
  return `${new Date().getFullYear()}-01-01`
}

// The column headers are abbreviated to fit fifteen even columns ("Family
// resp.", "Mat / pat", "Conf."), so each one can say its full name. `title`
// covers a desktop hover for free; the button and popover are for touch,
// where a title never fires at all — the same reasoning as DetailInfoButton,
// and the same anchored-popover mechanics as the timestamp cells below.
function ColumnHeaderButton({ short, label }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), panelRef, [triggerRef])

  function toggle() {
    if (open) { setOpen(false); return }
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const width = 170
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, width) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="w-full text-center uppercase tracking-wide transition-colors hover:text-ink"
      >
        {short}
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          style={{ ...positionStyle, width }}
          className="fixed z-50 rounded-lg border border-edge bg-canvas-raised px-3 py-2 text-sm font-medium normal-case tracking-normal text-ink shadow-raised"
        >
          {label}
        </div>,
        document.body
      )}
    </>
  )
}

// Approved days, with any pending requests as a "+N" beside them. It spells
// out "pending" on the title rather than in the cell: fourteen columns of
// numbers only fit if a column is the width of its figures, and "+1 pending"
// is five times that.
function BucketCell({ bucket }) {
  return (
    <div className="whitespace-nowrap text-center">
      <span className="font-semibold text-ink">{bucket.approved}</span>
      {bucket.pending > 0 && (
        <span className="ml-0.5 text-[10px] text-ink-muted" title={`${bucket.pending} pending`}>
          +{bucket.pending}
        </span>
      )}
    </div>
  )
}

// Admin-only HR-audit view: cumulative leave per doctor over any admin-chosen
// date range (unlike the doctor-facing "My leave" tracker, which always
// resets to the current calendar year — leave_requests rows themselves are
// never deleted or reset, this just aggregates them differently). Filterable
// by category (the same MO/Registrar/EC COSMO+Intern/OT COSMO+Intern/
// Consultant grouping the Annual Leave planner uses), doctor, active/inactive
// status, and leave type — all behind one Filter button (FilterPanel, same
// multi-select grouped-facet pattern as the Staff list) rather than four
// permanently-visible selects, since most visits don't need them.
export default function LeaveAuditReport() {
  const swatch = useSwatch()
  const [dateFrom, setDateFrom] = useState(yearStartStr())
  const [dateTo, setDateTo] = useState(todayStr())
  // Each a Set of selected values — empty means "All" for that dimension
  // (see FilterPanel.jsx). Doctor is still effectively single-select in
  // practice: the drill-down below only activates when exactly one doctor
  // is selected, same as the old dedicated single-select control.
  const [sortMode, setSortMode] = useState(DEFAULT_DOCTOR_SORT)
  const [contractTypeFilter, setContractTypeFilter] = useState(new Set())
  // The row the admin last clicked stays lit while they scroll — see
  // useSelectedRow.
  const { rowProps } = useSelectedRow()
  const [categoryFilter, setCategoryFilter] = useState(new Set())
  const [doctorFilter, setDoctorFilter] = useState(new Set())
  const [statusFilter, setStatusFilter] = useState(new Set())
  const [leaveTypeFilter, setLeaveTypeFilter] = useState(new Set())
  // Substring match on the doctor's own name, same rule every other list
  // page's search uses — the Doctor filter group is an exact multi-select
  // pick, which is a different job once the list runs to a few dozen names.
  const [q, setQ] = useState('')
  const [profiles, setProfiles] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [rotationsByDoctorId, setRotationsByDoctorId] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; only dateFrom/dateTo should trigger a refetch

  async function load() {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return
    setLoading(true)
    setError('')
    const [profilesRes, requestsRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, category, contract_type, color_code, is_active').eq('role', 'doctor').eq('is_approved', true),
      supabase.from('leave_requests').select('*').lte('date_from', dateTo).gte('date_to', dateFrom),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (requestsRes.error) { setError(requestsRes.error.message); setLoading(false); return }
    setProfiles(profilesRes.data || [])
    setLeaveRequests(requestsRes.data || [])

    try {
      const rotations = await fetchInternRotationsForDoctorIds((profilesRes.data || []).map(p => p.id))
      setRotationsByDoctorId(groupRotationsByDoctorId(rotations))
    } catch {
      setRotationsByDoctorId(new Map()) // degrades to static category bucketing below
    }

    setLoading(false)
  }

  // This is an aggregate report (one row per doctor for the WHOLE queried
  // range, not per leave_requests row), so there's no single leave-request
  // date_from to resolve an Intern's rotation off — the queried range's own
  // start (dateFrom) is used as the best available proxy instead, same
  // "resolve once, don't split day-by-day" spirit as everywhere else. A
  // doctor who rotated mid-range will show under whichever pool covered the
  // start of the range, not a blended read across both.
  const columnByProfileId = useMemo(
    () => new Map(profiles.map(p => [
      p.id,
      resolveLeaveCapacityColumn({ category: p.category, profileId: p.id, date: dateFrom, rotationsByDoctorId }) ?? LEAVE_OTHER_COLUMN.key,
    ])),
    [profiles, dateFrom, rotationsByDoctorId]
  )

  const statusFilteredProfiles = useMemo(
    () => profiles.filter(p =>
      (statusFilter.size === 0 || statusFilter.has(p.is_active ? 'active' : 'inactive')) &&
      (contractTypeFilter.size === 0 || contractTypeFilter.has(p.contract_type))
    ),
    [profiles, statusFilter, contractTypeFilter]
  )

  const doctorOptions = useMemo(() => {
    const eligible = statusFilteredProfiles
      .filter(p => categoryFilter.size === 0 || categoryFilter.has(columnByProfileId.get(p.id)))
      .sort((a, b) => a.surname.localeCompare(b.surname))
    return eligible.map(p => ({ value: p.id, label: `${p.surname}, ${p.name}` }))
  }, [statusFilteredProfiles, categoryFilter, columnByProfileId])

  const typeFilteredRequests = leaveTypeFilter.size === 0
    ? leaveRequests
    : leaveRequests.filter(lr => leaveTypeFilter.has(lr.leave_type))

  const rows = useMemo(
    () => buildAuditRows(statusFilteredProfiles, typeFilteredRequests, dateFrom, dateTo),
    [statusFilteredProfiles, typeFilteredRequests, dateFrom, dateTo]
  )

  // Surname only, with a first initial for whoever shares one — the compact
  // form the roster grid and the planners already use, and what lets the
  // frozen Doctor column be as narrow as the name in it. Built off every
  // loaded doctor, not the filtered rows, so a name does not gain or lose
  // its initial as you filter.
  const displayNames = useMemo(() => buildDoctorDisplayNames(profiles), [profiles])

  const searchTerm = q.trim().toLowerCase()
  const filteredRows = rows
    .filter(r => {
      if (categoryFilter.size > 0 && !categoryFilter.has(columnByProfileId.get(r.profileId))) return false
      if (doctorFilter.size > 0 && !doctorFilter.has(r.profileId)) return false
      if (searchTerm && !`${r.surname} ${r.name}`.toLowerCase().includes(searchTerm)) return false
      return true
    })
    // buildAuditRows returns them by surname; this is the admin's own
    // choice on top, from the same four options Hours Summary offers.
    .sort(DOCTOR_SORT_COMPARATORS[sortMode])

  // Drill-down only makes sense for exactly one doctor — a multi-doctor
  // selection just narrows the table above, same as every other dimension.
  const selectedDoctorId = doctorFilter.size === 1 ? [...doctorFilter][0] : null
  const drillDownRequests = selectedDoctorId
    ? typeFilteredRequests.filter(lr => lr.profile_id === selectedDoctorId).sort((a, b) => b.date_from.localeCompare(a.date_from))
    : []

  // A doctor selection from a previous category/status no longer
  // necessarily applies once either changes — clear it rather than
  // silently keeping a stale, now-irrelevant doctor selected.
  function handleCategoryChange(next) { setCategoryFilter(next); setDoctorFilter(new Set()) }
  function handleStatusChange(next) { setStatusFilter(next); setDoctorFilter(new Set()) }

  function clearFilters() {
    setCategoryFilter(new Set())
    setDoctorFilter(new Set())
    setStatusFilter(new Set())
    setLeaveTypeFilter(new Set())
    setContractTypeFilter(new Set())
    setQ('')
  }

  // Same shape and the same four options as Hours Summary's own Sort — see
  // src/lib/doctorSort.js, which both tables read it from.
  const sortFacet = {
    key: 'sort', icon: <ArrowUpDown className="h-4 w-4" />, label: 'Sort',
    value: sortMode, onChange: setSortMode,
    options: DOCTOR_SORT_OPTIONS,
    isActive: sortMode !== DEFAULT_DOCTOR_SORT,
  }
  // The FAB's sheet keys its facets off `key`; rendered standalone on the
  // desktop row there is nothing to key, and React warns about a `key`
  // arriving through a spread.
  const sortFacetProps = { ...sortFacet, key: undefined }

  const filterGroups = [
    { key: 'category', label: 'Category', options: CATEGORY_OPTIONS, selected: categoryFilter, onChange: handleCategoryChange },
    { key: 'doctor', label: 'Doctor', options: doctorOptions, selected: doctorFilter, onChange: setDoctorFilter, alwaysSearchable: true },
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, selected: statusFilter, onChange: handleStatusChange },
    // Contract type, as Hours Summary has it — the other axis an admin
    // reading either of these tables narrows by.
    { key: 'contractType', label: 'Contract type', options: CONTRACT_TYPE_ORDER.map(c => ({ value: c, label: CONTRACT_TYPE_LABEL[c] })), selected: contractTypeFilter, onChange: setContractTypeFilter },
    { key: 'leaveType', label: 'Leave type', options: LEAVE_TYPE_OPTIONS, selected: leaveTypeFilter, onChange: setLeaveTypeFilter },
  ]

  const activeFilterCount = categoryFilter.size + doctorFilter.size + statusFilter.size + leaveTypeFilter.size + contractTypeFilter.size

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Cumulative leave for HR auditing — pick any date range; this never resets, unlike the per-doctor tracker on My leave.
      </p>

      {/* The From/To range stays on the row at every width — it's what the
          report is *of*, not a way of narrowing it, same reasoning that
          keeps Weekend's month nav out of its FAB. Search and Filter are
          the narrowing controls, so below `md` they move into the FAB. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DateFieldButton label="From" value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} />
        <DateFieldButton label="To" value={dateTo} onChange={setDateTo} min={dateFrom || undefined} />
        <div className="hidden items-center gap-2 md:flex">
          <div className="w-64">
            <ClearableInput
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by surname or first name…"
              className="input-field"
              clearLabel="Clear search"
            />
          </div>
          <QuickSelectButton {...sortFacetProps} />
          <FilterPanel groups={filterGroups} />
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className="text-sm font-medium text-accent hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <FloatingActionMenu
        search={{ value: q, onChange: setQ, placeholder: 'Search by surname or first name…' }}
        sort={{ facets: [sortFacet], active: sortMode !== DEFAULT_DOCTOR_SORT }}
        filter={{
          groups: filterGroups,
          active: activeFilterCount > 0 || Boolean(q),
          onClearAll: clearFilters,
          sheetTitle: 'Filters',
        }}
      />

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}
      {!loading && !error && (!dateFrom || !dateTo) && <p className="mt-6 text-sm text-ink-muted">Pick a From and a To date to run the report.</p>}
      {!loading && !error && dateFrom && dateTo && dateFrom > dateTo && <p className="mt-6 text-sm text-flagRed">&ldquo;From&rdquo; must be on or before &ldquo;To&rdquo;.</p>}

      {/* Both bounds, in order. The fetch already declines to run without
          them (see load); this stops the table standing there showing the
          last range's numbers under a date field that has since been
          cleared. */}
      {!loading && !error && dateFrom && dateTo && dateFrom <= dateTo && (
        <>
          {/* Same frame as Team Leave's own table and Hours Summary's grid —
              see RosterSummaryPage.jsx for the full rationale. In short:
              max-h + overflow-auto so this div is the real scroll container
              the sticky header can stick against, and `border-separate`
              with zero spacing rather than `border-collapse`, since a
              collapsed border is shared between neighbouring cells and
              owned by the table — the sticky Doctor column paints on its
              own layer, so its half of each shared line lands a device
              pixel off from the rest of the grid. Six columns of day counts
              are the same problem as eleven: the numbers say nothing
              without the name they belong to, and on a phone this table is
              wider than the screen. */}
          <div className="mt-4 max-h-[70vh] overflow-auto rounded-lg border border-slate-line">
            {/* table-fixed, unlike every other grid in this app, because
                this is the one that has to hold fifteen columns at the SAME
                width. Auto layout cannot: a specified width there is a floor
                rather than a setting, so a column grows to whatever its own
                header word needs (Workshop 70, IOD 27) and whatever slack
                the table has lands on the widest column — the Doctor column
                reached 555px on a wide desktop. Fixed layout honours the
                colgroup exactly and hands the leftover to the one column
                that has no width of its own, the spacer. */}
            <table className="w-full min-w-[1230px] table-fixed border-separate border-spacing-0 text-xs">
              {/* 112 is the name column measured at its longest (a 103px
                  pill) plus a little room; a surname past that truncates,
                  with the full name on the cell's title. 74 is what the
                  longest header word ("WORKSHOP") needs at Hours Summary's
                  own 10px, which is the size these headers are held at so
                  the two tables read as one. */}
              <colgroup>
                <col className="w-[112px]" />
                {AUDIT_LEAVE_COLUMNS.map(column => <col key={column.key} className="w-[74px]" />)}
                <col className="w-[74px]" />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10">
                {/* bg-canvas-sunken on every th, not on the tr: a sticky cell
                    can't reliably inherit its row's background while it is
                    being repositioned, which shows as a seam through the
                    header during a scroll. Doctor is additionally sticky
                    left-0, and z-20 keeps that corner cell above both the
                    rest of the header and the sticky column beneath it. */}
                {/* No Category column: it moved under the name, where Hours
                    Summary already keeps it. One less column on a table that
                    has to scroll on a phone, and the category reads as a
                    property of the doctor rather than a fourth number.

                    Every leave type gets its own column, all at the one
                    width set by the colgroup above, and every figure under
                    them is centred — a column of right-hand digits reads as
                    a column, where left-aligned ones read as fifteen
                    unrelated lists. */}
                <tr className="text-[10px] uppercase tracking-wide text-ink-muted">
                  <th className="sticky left-0 z-20 border-b border-r border-slate-line bg-canvas-sunken px-2 py-1.5 text-left">Doctor</th>
                  {AUDIT_LEAVE_COLUMNS.map(column => (
                    <th key={column.key} className="border-b border-slate-line bg-canvas-sunken px-1 py-1.5 align-bottom font-medium">
                      <ColumnHeaderButton short={column.short} label={column.label} />
                    </th>
                  ))}
                  <th className="border-b border-slate-line bg-canvas-sunken px-1 py-1.5 text-center align-bottom font-medium">Total days</th>
                  {/* Spacer. An auto-layout table stretched past its own
                      content hands the slack out across its columns, and with
                      only five of them the Doctor column took the biggest
                      share: 103px of name became 160px on a phone and 352px
                      on a desktop, where Hours Summary's stayed at 119 — its
                      twenty columns leave far less of the slack for any one
                      of them. A cell at width:100% takes all of it instead,
                      so every real column here sits at its content width. */}
                  <th className="border-b border-slate-line bg-canvas-sunken" />
                </tr>
              </thead>
              {/* Row lines are `slate-hairline` on the cells themselves, not a
                  border on the <tr> — a row-level border paints lighter than a
                  cell-level one at phone pixel ratios. The last row drops its
                  own so it doesn't double up against the container's frame. */}
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={AUDIT_LEAVE_COLUMNS.length + 3} className="px-2 py-4 text-center text-ink-muted">No doctors match these filters.</td></tr>
                ) : filteredRows.map(row => {
                  const { isSelected, ...selection } = rowProps(row.profileId)
                  return (
                  <tr key={row.profileId} {...selection}>
                    {/* Sticky, so the name stays put while the day counts
                        scroll past it — with its own explicit background for
                        the same reason the header cells carry theirs, and an
                        OPAQUE one in every state including hover. A frozen
                        column covers whatever scrolls under it by painting
                        over it, so a translucent hover turned this cell into
                        a window: the Annual column showed through the names.
                        On a touch screen the row you last touched keeps
                        :hover, so it stayed that way after the finger left. The
                        name pill is whitespace-nowrap and this table has no
                        table-fixed, so the pill is what sets the column's
                        width: a surname and a little padding, no more. */}
                    <td
                      title={`${row.name} ${row.surname}`}
                      className={`sticky left-0 z-[1] border-b border-b-slate-hairline border-r border-r-slate-line px-2 py-1.5 align-top ${
                        isSelected ? 'bg-accent-tint' : 'bg-canvas hover:bg-canvas-cool'
                      }`}
                    >
                      <span
                        className="inline-block max-w-full truncate whitespace-nowrap rounded px-1.5 py-0.5 align-bottom text-[10px] font-medium"
                        style={swatch.fill(row.colorCode || '#4A90D9', { text: true })}
                      >
                        {displayNames.get(row.profileId) ?? row.surname}
                      </span>
                      <p className="mt-0.5 truncate text-[10px] text-ink-muted">{COLUMN_LABEL_BY_KEY[columnByProfileId.get(row.profileId)]}</p>
                    </td>
                    {AUDIT_LEAVE_COLUMNS.map(column => (
                      <td key={column.key} className="border-b border-slate-hairline px-1 py-1.5">
                        <BucketCell bucket={row.byColumn[column.key]} />
                      </td>
                    ))}
                    <td className="border-b border-slate-hairline px-1 py-1.5 text-center font-semibold text-ink">{row.totalApprovedDays}</td>
                    <td className="border-b border-slate-hairline" />
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {selectedDoctorId && (
            <div className="mt-4 card p-4">
              <h3 className="text-sm font-semibold text-ink">Individual requests in range</h3>
              {drillDownRequests.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">No leave requests in this range.</p>
              ) : (
                <div className="mt-2 divide-y divide-slate-line">
                  {drillDownRequests.map(lr => (
                    <div key={lr.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div>
                        <p className="text-ink">{LEAVE_TYPE_LABELS[lr.leave_type]} — {naturalLeavePeriodLabel(lr.date_from, lr.date_to)}</p>
                        {annualDaysSummary(lr) && <p className="text-xs text-ink-muted">{annualDaysSummary(lr)}</p>}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
                        {reviewStatusLabel(lr.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
