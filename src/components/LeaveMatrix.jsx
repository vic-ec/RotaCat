import { useEffect, useMemo, useRef, useState } from 'react'
import SectionBar from './SectionBar'
import LeaveTypeIcon from './LeaveTypeIcon'
import LegendSheet from './LegendSheet'
import ExpandAllButton from './ExpandAllButton'
import { allSectionsCollapsed } from '../lib/collapsibleSections'
import { Search, X, List } from 'lucide-react'
import Modal from './Modal'
import DateStepper from './DateStepper'
import ClearableInput from './ClearableInput'
import Tag from './Tag'
import FilterPanel from './FilterPanel'
import SectionLabel from './SectionLabel'
import LeaveBlockDetail from './LeaveBlockDetail'
import { todayStr, MONTH_ABBR, formatWeekdayDate } from '../lib/dateRange'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useFillToViewport } from '../lib/useFillToViewport'
import { columnForLeaveCategory, LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN } from '../lib/leaveYearGrid'
import {
  LEAVE_GROUP_OPTIONS, LEAVE_TYPE_LABELS, leaveTypeGroupKey, leaveGroupInk,
  blockPixelSpan, buildDoctorLeaveRows, leaveActiveOn, formatDMY,
} from '../lib/leaveMatrix'
import { leaveTypeCode, leaveTypeLabelWithCode } from '../lib/leaveRequests'
import { REVIEW_STATUS_LABELS } from '../lib/statusLabels'

// Literal pixel widths, not 1fr/minmax — the header and every track row share
// the exact same `gridTemplateColumns` string so month columns stay
// pixel-aligned across independently-rendered rows (same trick as
// InternRotationsMatrix.jsx, which this mirrors).
// The month columns stretch to fill the width the grid is given (the same
// width the Table view takes); this is only the floor, below which the grid
// scrolls sideways instead of squeezing a month past day-precision.
// 44px still gives a day better than a pixel; with the 150px Doctor
// column that is 678px in all, which fits beside the side panel on a
// laptop without a sideways scroll.
const MIN_MONTH_COL_WIDTH = 44 // px
const LABEL_COL_WIDTH = 150 // px
const TRACK_HEIGHT = 38 // px — the Table view's row height, near enough
const BAR_HEIGHT = 22 // px
// A bar narrower than this cannot hold a code legibly (IOD is the widest).
const CODE_MIN_BAR_WIDTH = 24 // px

// Category groups reuse the same MO / Registrar / EC Intern / OT Intern /
// Consultant buckets the rest of the leave feature groups by; a doctor whose
// category doesn't resolve to a capacity column (or has none) falls into the
// trailing "Consultant/Other" bucket rather than vanishing.
const CATEGORY_GROUPS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

function groupKeyForDoctor(doctor) {
  return columnForLeaveCategory(doctor.category, doctor.contract_type) ?? LEAVE_OTHER_COLUMN.key
}

function fullName(doctor) {
  return `${doctor.name || ''} ${doctor.surname || ''}`.trim() || doctor.surname || 'Unknown'
}

function GroupSwatch({ groupKey }) {
  return <LeaveTypeIcon groupKey={groupKey} size="sm" />
}

// One leave bar. Approved = solid family colour; pending = a light tint with a
// dashed outline in the same colour, so status still reads out of context (not
// only from which track it sits in).
function LeaveBar({ request, year, selected, onSelect, monthColWidth }) {
  const span = blockPixelSpan(request.date_from, request.date_to, year, monthColWidth)
  if (!span) return null
  // The legend's own treatment (LeaveTypeIcon's box): the family's ink
  // colour as a light tint with a border in the same colour, so a bar and
  // its legend swatch are the same colour on both themes. Pending keeps
  // the dashed outline and a lighter tint.
  const ink = leaveGroupInk(leaveTypeGroupKey(request.leave_type))
  const color = ink
  const pending = request.status === 'pending'
  return (
    <button
      type="button"
      data-request-id={request.id}
      onClick={() => onSelect(request)}
      title={`${leaveTypeLabelWithCode(request.leave_type)}: ${formatDMY(request.date_from)} – ${formatDMY(request.date_to)}`}
      className="absolute top-1/2 flex -translate-y-1/2 items-center justify-center overflow-hidden rounded-sm transition-shadow"
      style={{
        left: span.left,
        width: span.width,
        height: BAR_HEIGHT,
        backgroundColor: `color-mix(in srgb, ${ink} ${pending ? 8 : 22}%, transparent)`,
        border: pending ? `1.5px dashed ${ink}` : `1px solid color-mix(in srgb, ${ink} 55%, transparent)`,
        boxShadow: selected ? '0 0 0 1px #FFFFFF, 0 0 0 3px #0F172A' : 'none',
      }}
    >
      {/* The type's short code, when the bar is wide enough to hold it —
          the colour says which family, the code says which type. */}
      {/* …and its icon in front, when there is room for both. */}
      {span.width >= CODE_MIN_BAR_WIDTH + 16 && (
        <LeaveTypeIcon leaveType={request.leave_type} variant="bare" size="sm" color={color} className="pointer-events-none" />
      )}
      {span.width >= CODE_MIN_BAR_WIDTH && (
        <span
          aria-hidden="true"
          className="pointer-events-none select-none px-0.5 font-semibold leading-none"
          style={{ fontSize: 10, color }}
        >
          {leaveTypeCode(request.leave_type)}
        </span>
      )}
    </button>
  )
}

function TodayLine({ year, monthColWidth }) {
  const today = todayStr()
  if (Number(today.slice(0, 4)) !== year) return null
  const span = blockPixelSpan(today, today, year, monthColWidth)
  if (!span) return null
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-[1] w-px bg-accent/50"
      style={{ left: span.left }}
    />
  )
}

// A doctor's timeline — one track row per non-empty status (approved above
// pending). The name button lives in the first track's sticky cell; the
// second track's cell just carries the muted status label.
function DoctorRows({ row, year, selected, onSelectDoctor, onSelectBlock, gridTemplateColumns, monthColWidth, striped }) {
  const tracks = []
  if (row.approved.length) tracks.push({ status: 'approved', label: 'Approved', items: row.approved })
  if (row.pending.length) tracks.push({ status: 'pending', label: REVIEW_STATUS_LABELS.pending, items: row.pending })
  const doctorSelected = selected?.kind === 'doctor' && selected.doctorId === row.doctor.id

  return (
    <div data-doctor-id={row.doctor.id} className="border-b border-slate-line last:border-0">
      {tracks.map((track, i) => (
        <div key={track.status} className={`grid ${i > 0 ? 'border-t border-dashed border-slate-line' : ''}`} style={{ gridTemplateColumns }}>
          <div
            className={`sticky left-0 z-10 flex flex-col justify-center border-r border-slate-line px-3 py-1 ${
              doctorSelected ? 'bg-accent-tint' : 'bg-canvas-cool'
            }`}
          >
            {i === 0 ? (
              <button
                type="button"
                onClick={() => onSelectDoctor(row.doctor)}
                title={fullName(row.doctor)}
                className={`truncate text-left text-sm font-medium transition-colors hover:text-accent ${
                  doctorSelected ? 'text-accent' : 'text-ink'
                }`}
              >
                {fullName(row.doctor)}
              </button>
            ) : (
              <span className="h-0" aria-hidden="true" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{track.label}</span>
          </div>
          {/* Faint month lines, so a bar reads against its month without
              tracing up to the header; alternate doctors are a touch
              lighter so neighbouring rows don't run together. */}
          <div
            className={`relative col-span-12 ${striped ? 'bg-ink/[0.025]' : ''}`}
            style={{
              height: TRACK_HEIGHT,
              backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent ${monthColWidth - 1}px, rgb(var(--color-slate-line) / 0.6) ${monthColWidth - 1}px, rgb(var(--color-slate-line) / 0.6) ${monthColWidth}px)`,
            }}
          >
            <TodayLine year={year} monthColWidth={monthColWidth} />
            {track.items.map(request => (
              <LeaveBar
                key={request.id}
                request={request}
                year={year}
                monthColWidth={monthColWidth}
                selected={selected?.kind === 'block' && selected.request.id === request.id}
                onSelect={onSelectBlock}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// The compact "who's on leave today" default panel state.
// Who is on leave today, by group. Each name is a plain link (no chip):
// it opens that person's leave in the Leave details card underneath.
function OnLeaveNow({ activeByGroup, onOpen, selectedId = null }) {
  const today = todayStr()
  const groups = LEAVE_GROUP_OPTIONS.filter(o => activeByGroup.has(o.key))
  return (
    <>
      <p className="text-section-label uppercase text-ink-muted">On leave now</p>
      <p className="mt-1 font-display text-lg font-semibold text-ink">{formatWeekdayDate(today)}</p>
      {groups.length === 0 ? (
        <p className="mt-3 text-xs text-ink-muted">No one is on leave today.</p>
      ) : (
        groups.map(o => (
          <div key={o.key} className="mt-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <GroupSwatch groupKey={o.key} /> {o.label}
            </p>
            <ul className="mt-1.5 space-y-1">
              {activeByGroup.get(o.key).map(doctor => (
                <li key={doctor.id}>
                  <button
                    type="button"
                    onClick={() => onOpen?.(doctor, o.key)}
                    data-testid="on-leave-now-name"
                    className={`flex items-center gap-2 text-left text-sm underline decoration-slate-line underline-offset-2 hover:text-accent hover:decoration-accent ${selectedId === doctor.id ? 'font-semibold text-accent decoration-accent' : 'text-ink'}`}
                  >
                    <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: doctor.color_code || 'rgb(var(--color-ink-muted))' }} />
                    {fullName(doctor)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </>
  )
}

// A single leave request rendered as a clickable mini-row (used in the
// per-doctor block list).
function BlockListItem({ request, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(request)}
      className="flex w-full items-center gap-2 rounded border border-slate-line px-2 py-1.5 text-left transition-colors hover:bg-canvas-sunken"
    >
      <LeaveTypeIcon leaveType={request.leave_type} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-ink">{LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type}</span>
        <span className="block truncate text-[11px] text-ink-muted">{formatDMY(request.date_from)} – {formatDMY(request.date_to)}</span>
      </span>
      <Tag variant="status" tone={request.status === 'approved' ? 'success' : 'warning'}>
        {request.status === 'approved' ? 'Approved' : REVIEW_STATUS_LABELS.pending}
      </Tag>
    </button>
  )
}

// The selected-doctor panel state: their approved + pending blocks as a list.
function DoctorDetail({ row, onSelectBlock, onClose }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-ink" title={fullName(row.doctor)}>{fullName(row.doctor)}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="btn-close h-6 w-6 text-ink-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">Tap a leave block for full details.</p>
      {row.approved.length > 0 && (
        <div className="mt-3">
          <SectionLabel>Approved</SectionLabel>
          <div className="mt-1.5 space-y-1.5">
            {row.approved.map(r => <BlockListItem key={r.id} request={r} onSelect={onSelectBlock} />)}
          </div>
        </div>
      )}
      {row.pending.length > 0 && (
        <div className="mt-3">
          <SectionLabel>{REVIEW_STATUS_LABELS.pending}</SectionLabel>
          <div className="mt-1.5 space-y-1.5">
            {row.pending.map(r => <BlockListItem key={r.id} request={r} onSelect={onSelectBlock} />)}
          </div>
        </div>
      )}
    </>
  )
}

// Rows = doctors (grouped by category, collapsible), columns = the 12 months
// of one navigable year. Each doctor splits into an Approved and a Pending
// track (shown only when non-empty); leave shows as day-precision coloured
// bars. A sticky side panel answers "who's on leave now" by default and shows
// a clicked block's full specifics. Read-only — approvals stay in the
// approval queue. Mirrors InternRotationsMatrix.jsx's visual language.
// Width of an element, kept current as the window resizes. 0 until measured
// (and wherever ResizeObserver doesn't exist), which callers treat as "use
// the minimum".
function useElementWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

// `canCancelLeave` / `onLeaveCancelled` thread through to LeaveBlockDetail
// (admin "Cancel leave"); a successful cancel clears the selection, since
// the block it described is no longer on the matrix.
// `focus` ({ doctorId, year, requestId }, from a link such as My year's
// "Open in Team Leave") opens the matrix on that year with the request's
// bar selected and scrolled into view.
export default function LeaveMatrix({ requests, controls, leading = null, canCancelLeave = false, onLeaveCancelled, focus = null }) {
  const [gridRef, gridWidth] = useElementWidth()
  // The grid runs to the bottom of the window like the Table view and
  // Hours Summary, scrolling inside itself past that.
  const [fillRef, fillStyle] = useFillToViewport(32, { fit: true })
  const setGridNode = el => { gridRef.current = el; fillRef(el) }
  const [search, setSearch] = useState('')
  const isDesktop = useIsDesktop()
  const currentYear = Number(todayStr().slice(0, 4))
  const [year, setYear] = useState(() => (focus?.year && focus.year >= 2000 && focus.year <= 2100 ? focus.year : currentYear))
  const [collapsedGroups, setCollapsedGroups] = useState({})
  // selected: null | { kind: 'doctor', doctorId } | { kind: 'block', request }
  const [selected, setSelected] = useState(() => {
    const request = focus?.requestId && requests.find(r => r.id === focus.requestId)
    if (request) return { kind: 'block', request }
    return focus?.doctorId ? { kind: 'doctor', doctorId: focus.doctorId } : null
  })
  const focusKey = focus ? `${focus.doctorId || ''}|${focus.year || ''}|${focus.requestId || ''}` : ''
  const scrolledFor = useRef('')

  // Filter: Category (the doctor's leave column) and Leave type (group),
  // as Who's away has them.
  const [categoryFilter, setCategoryFilter] = useState(() => new Set())
  const [leaveTypeFilter, setLeaveTypeFilter] = useState(() => new Set())
  const filterGroups = [
    { key: 'category', label: 'Category', options: CATEGORY_GROUPS.map(c => ({ value: c.key, label: c.label })), selected: categoryFilter, onChange: setCategoryFilter },
    { key: 'leaveType', label: 'Leave type', options: LEAVE_GROUP_OPTIONS.map(o => ({ value: o.key, label: o.label })), selected: leaveTypeFilter, onChange: setLeaveTypeFilter },
  ]
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const shown = leaveTypeFilter.size ? requests.filter(r => leaveTypeFilter.has(leaveTypeGroupKey(r.leave_type))) : requests
    let all = buildDoctorLeaveRows(shown, year)
    if (categoryFilter.size) all = all.filter(r => categoryFilter.has(groupKeyForDoctor(r.doctor)))
    if (!q) return all
    return all.filter(r => `${r.doctor.surname || ''} ${r.doctor.name || ''} ${r.doctor.surname || ''}`.toLowerCase().includes(q))
  }, [requests, year, search, categoryFilter, leaveTypeFilter])
  const activeByGroup = useMemo(() => leaveActiveOn(requests, todayStr()), [requests])
  const rowsByDoctorId = useMemo(() => new Map(rows.map(r => [r.doctor.id, r])), [rows])

  const groups = useMemo(() => CATEGORY_GROUPS
    .map(g => ({ key: g.key, label: g.label, items: rows.filter(r => groupKeyForDoctor(r.doctor) === g.key) }))
    .filter(g => g.items.length > 0), [rows])

  function toggleGroupCollapsed(key) {
    setCollapsedGroups(g => ({ ...g, [key]: !g[key] }))
  }

  const monthColWidth = Math.max(MIN_MONTH_COL_WIDTH, Math.floor((gridWidth - LABEL_COL_WIDTH) / 12))
  const gridTemplateColumns = `${LABEL_COL_WIDTH}px repeat(12, ${monthColWidth}px)`
  const currentMonthIndex = Number(todayStr().slice(5, 7)) - 1

  const selectedDoctorRow = selected?.kind === 'doctor' ? rowsByDoctorId.get(selected.doctorId) : null
  // A name under "On leave now": the leave of that group covering today.
  function openOnLeaveNow(doctor, groupKey) {
    const today = todayStr()
    const request = requests.find(r => r.profile_id === doctor.id && r.status === 'approved'
      && r.date_from <= today && r.date_to >= today && leaveTypeGroupKey(r.leave_type) === groupKey)
    if (request) setSelected({ kind: 'block', request })
  }

  // Bring the focused bar (or, failing that, the doctor's row) into view;
  // again once the grid has measured its width, since the bars move then.
  useEffect(() => {
    const key = `${focusKey}|${gridWidth > 0}`
    if (!focusKey || scrolledFor.current === key) return
    const grid = gridRef.current
    if (!grid) return
    const target = (focus.requestId && grid.querySelector(`[data-request-id="${focus.requestId}"]`))
      || (focus.doctorId && grid.querySelector(`[data-doctor-id="${focus.doctorId}"]`))
    if (!target) return
    scrolledFor.current = key
    target.scrollIntoView?.({ block: 'center', inline: 'center' })
  }, [focusKey, focus, gridWidth, gridRef, rows])

  // Panel body reflects the current selection; reused by the desktop sticky
  // panel and the mobile modal.
  const panelBody = selected?.kind === 'block' ? (
    <LeaveBlockDetail
      request={selected.request}
      onClose={() => setSelected(null)}
      showClose={isDesktop}
      canCancel={canCancelLeave}
      onCancelled={row => { setSelected(null); onLeaveCancelled?.(row) }}
    />
  ) : selectedDoctorRow ? (
    <DoctorDetail row={selectedDoctorRow} onSelectBlock={r => setSelected({ kind: 'block', request: r })} onClose={() => setSelected(null)} />
  ) : null

  const modalTitle = selected?.kind === 'block'
    ? 'Leave details'
    : selectedDoctorRow ? fullName(selectedDoctorRow.doctor) : ''

  return (
    <div>
      {/* One toolbar row across the full width, the same shape as the Table
          view's (and the Roster's): search on the left, then the year, with
          the caller's Matrix/Table switch last — so the switch sits in the
          same spot in both views. The colour key gets the line below. */}
      <div className="flex items-center gap-2">
        {leading}
        {/* The app's standard 320px search (Toolbar's own width), not a
            stretched one; the year, the legend and the view switch keep
            the right. */}
        <div className="w-80 flex-shrink-0">
          <ClearableInput
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by surname or first name…"
            className="input-field"
            clearLabel="Clear search"
            icon={<Search className="h-4 w-4" />}
          />
        </div>
        <FilterPanel groups={filterGroups} />
        <div className="flex flex-shrink-0 items-center gap-2">
          {/* The colour key behind one icon, as the Rotations tables keep
              theirs, rather than a line of swatches of its own. */}
          <LegendSheet
            title="Legend"
            trigger={onClick => (
              <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-utility h-[30px] w-[30px] p-0"><List className="h-4 w-4" /></button>
            )}
          >
            <div className="flex flex-col gap-2 text-sm text-ink">
              {LEAVE_GROUP_OPTIONS.map(o => (
                <span key={o.key} className="flex items-center gap-2">
                  <GroupSwatch groupKey={o.key} /> {o.label}
                </span>
              ))}
              <span className="flex items-center gap-2">
                <span className="h-4 w-6 flex-shrink-0 rounded-sm border-[1.5px] border-dashed border-ink-muted" />
                {REVIEW_STATUS_LABELS.pending}
              </span>
            </div>
          </LegendSheet>
          {controls && <div className="h-5 w-px bg-slate-line" aria-hidden="true" />}
          {controls}
        </div>
      </div>
      <div className="mb-3" />

      {/* Grid and panel start on the same line, below the toolbar. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div ref={setGridNode} style={fillStyle} className="card overflow-auto p-0">
          {/* Month header */}
          <div className="sticky top-0 z-20 grid border-b border-slate-line bg-canvas-cool text-[11px] font-semibold uppercase tracking-wide text-ink-muted" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-10 bg-canvas-cool px-3 py-2">Doctor</div>
            {MONTH_ABBR.map((label, i) => (
              <div key={label} className={`px-1 py-2 text-center ${i === currentMonthIndex && year === currentYear ? 'text-accent' : ''}`}>
                {label}
              </div>
            ))}
          </div>

          {groups.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-muted">
              {search ? 'No doctors match this search.' : `No approved or pending leave in ${year}.`}
            </p>
          ) : (
            groups.map(group => (
              <div key={group.key} data-section={group.key} className="w-max min-w-full">
                <SectionBar label={group.label} count={group.items.length} collapsed={collapsedGroups[group.key]} onToggle={() => toggleGroupCollapsed(group.key)} surround="card" className="m-1" />
                {!collapsedGroups[group.key] && group.items.map((row, rowIndex) => (
                  <DoctorRows
                    key={row.doctor.id}
                    row={row}
                    year={year}
                    selected={selected}
                    onSelectDoctor={doctor => setSelected({ kind: 'doctor', doctorId: doctor.id })}
                    onSelectBlock={request => setSelected({ kind: 'block', request })}
                    gridTemplateColumns={gridTemplateColumns}
                    monthColWidth={monthColWidth}
                    striped={rowIndex % 2 === 1}
                  />
                ))}
              </div>
            ))
          )}
        </div>
        {allSectionsCollapsed(groups, collapsedGroups) && (
          <ExpandAllButton onExpandAll={() => setCollapsedGroups({})} />
        )}
      </div>

      {/* Desktop sticky side panel: the year (as the Annual and Special
          planners keep their month), who is on leave now, and under it the
          selected leave's (or doctor's) details. */}
      <aside className="hidden lg:sticky lg:top-4 lg:block lg:w-72 lg:flex-shrink-0">
        <div className="max-h-[calc(100dvh-2rem)] space-y-3 overflow-y-auto">
          <div className="card p-4">
            <p className="text-section-label uppercase text-ink-muted">Team leave · year</p>
            <div className="mt-1.5" data-testid="matrix-year">
              <DateStepper unit="year" year={year} onChange={setYear} showToday={false} centered />
            </div>
            <div className="mt-4"><OnLeaveNow activeByGroup={activeByGroup} onOpen={openOnLeaveNow} selectedId={selected?.kind === 'block' ? selected.request.profile_id : null} /></div>
          </div>
          {panelBody && <div className="card p-4" data-testid="matrix-detail">{panelBody}</div>}
        </div>
      </aside>

      {/* Mobile: "on leave now" always visible as a stacked card */}
      {!selected && (
        <div className="lg:hidden">
          <div className="card p-3"><OnLeaveNow activeByGroup={activeByGroup} onOpen={openOnLeaveNow} /></div>
        </div>
      )}

      {/* Mobile: a selection opens a bottom-sheet modal (desktop uses the sticky panel) */}
      {!isDesktop && selected && (
        <Modal title={modalTitle} onClose={() => setSelected(null)}>{panelBody}</Modal>
      )}
      </div>
    </div>
  )
}
