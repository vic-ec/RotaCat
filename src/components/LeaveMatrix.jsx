import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import Modal from './Modal'
import Tag from './Tag'
import DoctorChip from './DoctorChip'
import SectionLabel from './SectionLabel'
import LeaveRequestSummary from './LeaveRequestSummary'
import { todayStr, MONTH_ABBR } from '../lib/dateRange'
import { useIsDesktop } from '../lib/useIsDesktop'
import { labelForLeaveCategory, columnForLeaveCategory, LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN } from '../lib/leaveYearGrid'
import {
  LEAVE_GROUP_OPTIONS, LEAVE_GROUP_COLOR, LEAVE_TYPE_LABELS, leaveTypeGroupKey,
  blockPixelSpan, buildDoctorLeaveRows, leaveActiveOn,
  formatDMY, formatDateTime, totalCalendarDays, totalLeaveDays,
} from '../lib/leaveMatrix'

// Literal pixel widths, not 1fr/minmax — the header and every track row share
// the exact same `gridTemplateColumns` string so month columns stay
// pixel-aligned across independently-rendered rows (same trick as
// InternRotationsMatrix.jsx, which this mirrors).
const MONTH_COL_WIDTH = 64 // px — a touch wider than the intern matrix's 56 for day-precision legibility
const LABEL_COL_WIDTH = 168 // px
const TRACK_HEIGHT = 30 // px
const BAR_HEIGHT = 18 // px

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
  return <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: LEAVE_GROUP_COLOR[groupKey] }} />
}

// One leave bar. Approved = solid family colour; pending = a light tint with a
// dashed outline in the same colour, so status still reads out of context (not
// only from which track it sits in).
function LeaveBar({ request, year, selected, onSelect }) {
  const span = blockPixelSpan(request.date_from, request.date_to, year, MONTH_COL_WIDTH)
  if (!span) return null
  const color = LEAVE_GROUP_COLOR[leaveTypeGroupKey(request.leave_type)]
  const pending = request.status === 'pending'
  return (
    <button
      type="button"
      onClick={() => onSelect(request)}
      title={`${LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type}: ${formatDMY(request.date_from)} – ${formatDMY(request.date_to)}`}
      className="absolute top-1/2 -translate-y-1/2 rounded-sm transition-shadow"
      style={{
        left: span.left,
        width: span.width,
        height: BAR_HEIGHT,
        backgroundColor: pending ? `${color}26` : color, // 26 = ~15% alpha
        border: pending ? `1.5px dashed ${color}` : 'none',
        boxShadow: selected ? '0 0 0 1px #FFFFFF, 0 0 0 3px #0F172A' : 'none',
      }}
    />
  )
}

function TodayLine({ year }) {
  const today = todayStr()
  if (Number(today.slice(0, 4)) !== year) return null
  const span = blockPixelSpan(today, today, year, MONTH_COL_WIDTH)
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
function DoctorRows({ row, year, selected, onSelectDoctor, onSelectBlock, gridTemplateColumns }) {
  const tracks = []
  if (row.approved.length) tracks.push({ status: 'approved', label: 'Approved', items: row.approved })
  if (row.pending.length) tracks.push({ status: 'pending', label: 'Pending', items: row.pending })
  const doctorSelected = selected?.kind === 'doctor' && selected.doctorId === row.doctor.id

  return (
    <div className="border-b border-slate-line last:border-0">
      {tracks.map((track, i) => (
        <div key={track.status} className="grid" style={{ gridTemplateColumns }}>
          <div
            className={`sticky left-0 z-10 flex flex-col justify-center border-r border-slate-line px-2 py-1 ${
              doctorSelected ? 'bg-accent-tint' : 'bg-canvas-raised'
            }`}
          >
            {i === 0 ? (
              <button
                type="button"
                onClick={() => onSelectDoctor(row.doctor)}
                title={fullName(row.doctor)}
                className={`truncate text-left text-xs font-medium transition-colors hover:text-accent ${
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
          <div className="relative col-span-12" style={{ height: TRACK_HEIGHT }}>
            <TodayLine year={year} />
            {track.items.map(request => (
              <LeaveBar
                key={request.id}
                request={request}
                year={year}
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
function OnLeaveNow({ activeByGroup }) {
  const today = todayStr()
  const groups = LEAVE_GROUP_OPTIONS.filter(o => activeByGroup.has(o.key))
  return (
    <>
      <p className="text-sm font-semibold text-ink">On leave now</p>
      <p className="text-xs text-ink-muted">{formatDMY(today)}</p>
      {groups.length === 0 ? (
        <p className="mt-3 text-xs text-ink-muted">No one is on leave today.</p>
      ) : (
        groups.map(o => (
          <div key={o.key} className="mt-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <GroupSwatch groupKey={o.key} /> {o.label}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {activeByGroup.get(o.key).map(doctor => (
                <DoctorChip key={doctor.id} profile={doctor} />
              ))}
            </div>
          </div>
        ))
      )}
    </>
  )
}

// A single leave request rendered as a clickable mini-row (used in the
// per-doctor block list).
function BlockListItem({ request, onSelect }) {
  const groupKey = leaveTypeGroupKey(request.leave_type)
  return (
    <button
      type="button"
      onClick={() => onSelect(request)}
      className="flex w-full items-center gap-2 rounded border border-slate-line px-2 py-1.5 text-left transition-colors hover:bg-canvas-sunken"
    >
      <GroupSwatch groupKey={groupKey} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-ink">{LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type}</span>
        <span className="block truncate text-[11px] text-ink-muted">{formatDMY(request.date_from)} – {formatDMY(request.date_to)}</span>
      </span>
      <Tag variant="status" tone={request.status === 'approved' ? 'success' : 'warning'}>
        {request.status === 'approved' ? 'Approved' : 'Pending'}
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
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-ink-muted hover:bg-canvas-sunken hover:text-ink"
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
          <SectionLabel>Pending</SectionLabel>
          <div className="mt-1.5 space-y-1.5">
            {row.pending.map(r => <BlockListItem key={r.id} request={r} onSelect={onSelectBlock} />)}
          </div>
        </div>
      )}
    </>
  )
}

function DetailLine({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="flex-shrink-0 text-xs text-ink-muted">{label}</span>
      <span className="min-w-0 text-right text-xs font-medium text-ink">{children}</span>
    </div>
  )
}

// The selected-block panel state: one request's full specifics.
function BlockDetail({ request, onClose, showClose }) {
  const doctor = request.profiles || {}
  const categoryLabel = doctor.category ? labelForLeaveCategory(doctor.category, doctor.contract_type) : null
  const annualLeaveDays = request.leave_type === 'annual' && request.annual_leave_days != null ? request.annual_leave_days : null
  const reviewerName = request.reviewer ? `${request.reviewer.name || ''} ${request.reviewer.surname || ''}`.trim() : null
  const calDays = totalCalendarDays(request)
  const leaveDays = totalLeaveDays(request)

  return (
    <>
      {showClose && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-ink-muted hover:bg-canvas-sunken hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <LeaveRequestSummary
        request={request}
        fullName={`${doctor.name || ''} ${doctor.surname || ''}`.trim() || 'Unknown'}
        categoryLabel={categoryLabel}
        totalDays={calDays}
        annualLeaveDays={annualLeaveDays}
      />

      <div className="mt-4 border-t border-slate-line pt-3">
        <div className="mb-1 flex items-center gap-1.5">
          <GroupSwatch groupKey={leaveTypeGroupKey(request.leave_type)} />
          <span className="text-sm font-medium text-ink">{LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type}</span>
          <Tag variant="status" tone={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning'} className="ml-auto">
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </Tag>
        </div>

        <DetailLine label="Exact dates">{formatDMY(request.date_from)} – {formatDMY(request.date_to)}</DetailLine>
        <DetailLine label="Calendar days">{calDays}</DetailLine>
        <DetailLine label="Leave days">{leaveDays}</DetailLine>
        <DetailLine label="Submitted">{formatDateTime(request.created_at) || '—'}</DetailLine>

        {request.status === 'approved' && (
          <>
            <DetailLine label="Approved by">{reviewerName || 'an admin'}</DetailLine>
            <DetailLine label="Approved on">{formatDateTime(request.reviewed_at) || '—'}</DetailLine>
          </>
        )}
        {request.status === 'rejected' && (
          <>
            <DetailLine label="Rejected by">{reviewerName || 'an admin'}</DetailLine>
            <DetailLine label="Rejected on">{formatDateTime(request.reviewed_at) || '—'}</DetailLine>
            {request.admin_notes && (
              <div className="mt-2 rounded border border-slate-line bg-canvas-cool px-2 py-1.5">
                <SectionLabel>Reason</SectionLabel>
                <p className="mt-0.5 text-xs text-ink">{request.admin_notes}</p>
              </div>
            )}
          </>
        )}

        {request.notes && (
          <div className="mt-2 rounded border border-slate-line bg-canvas-cool px-2 py-1.5">
            <SectionLabel>Note from requester</SectionLabel>
            <p className="mt-0.5 text-xs italic text-ink-light">&ldquo;{request.notes}&rdquo;</p>
          </div>
        )}
      </div>
    </>
  )
}

// Rows = doctors (grouped by category, collapsible), columns = the 12 months
// of one navigable year. Each doctor splits into an Approved and a Pending
// track (shown only when non-empty); leave shows as day-precision coloured
// bars. A sticky side panel answers "who's on leave now" by default and shows
// a clicked block's full specifics. Read-only — approvals stay in the
// approval queue. Mirrors InternRotationsMatrix.jsx's visual language.
export default function LeaveMatrix({ requests }) {
  const isDesktop = useIsDesktop()
  const currentYear = Number(todayStr().slice(0, 4))
  const [year, setYear] = useState(currentYear)
  const [collapsedGroups, setCollapsedGroups] = useState({})
  // selected: null | { kind: 'doctor', doctorId } | { kind: 'block', request }
  const [selected, setSelected] = useState(null)

  const rows = useMemo(() => buildDoctorLeaveRows(requests, year), [requests, year])
  const activeByGroup = useMemo(() => leaveActiveOn(requests, todayStr()), [requests])
  const rowsByDoctorId = useMemo(() => new Map(rows.map(r => [r.doctor.id, r])), [rows])

  const groups = useMemo(() => CATEGORY_GROUPS
    .map(g => ({ key: g.key, label: g.label, items: rows.filter(r => groupKeyForDoctor(r.doctor) === g.key) }))
    .filter(g => g.items.length > 0), [rows])

  function toggleGroupCollapsed(key) {
    setCollapsedGroups(g => ({ ...g, [key]: !g[key] }))
  }

  const gridTemplateColumns = `${LABEL_COL_WIDTH}px repeat(12, ${MONTH_COL_WIDTH}px)`
  const currentMonthIndex = Number(todayStr().slice(5, 7)) - 1

  const selectedDoctorRow = selected?.kind === 'doctor' ? rowsByDoctorId.get(selected.doctorId) : null

  // Panel body reflects the current selection; reused by the desktop sticky
  // panel and the mobile modal.
  const panelBody = selected?.kind === 'block' ? (
    <BlockDetail request={selected.request} onClose={() => setSelected(null)} showClose={isDesktop} />
  ) : selectedDoctorRow ? (
    <DoctorDetail row={selectedDoctorRow} onSelectBlock={r => setSelected({ kind: 'block', request: r })} onClose={() => setSelected(null)} />
  ) : (
    <OnLeaveNow activeByGroup={activeByGroup} />
  )

  const modalTitle = selected?.kind === 'block'
    ? 'Leave details'
    : selectedDoctorRow ? fullName(selectedDoctorRow.doctor) : ''

  return (
    <div className="mt-4 flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        {/* Year nav + legend */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setYear(y => y - 1)}
              aria-label="Previous year"
              className="flex h-[30px] w-[30px] items-center justify-center rounded border border-slate-line text-ink-light hover:bg-canvas-sunken"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[3.5rem] text-center text-sm font-semibold text-ink">{year}</span>
            <button
              type="button"
              onClick={() => setYear(y => y + 1)}
              aria-label="Next year"
              className="flex h-[30px] w-[30px] items-center justify-center rounded border border-slate-line text-ink-light hover:bg-canvas-sunken"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {LEAVE_GROUP_OPTIONS.map(o => (
              <span key={o.key} className="flex items-center gap-1.5">
                <GroupSwatch groupKey={o.key} /> {o.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-4 flex-shrink-0 rounded-sm border-[1.5px] border-dashed border-ink-muted" />
              Pending
            </span>
          </div>
        </div>

        <div className="card overflow-x-auto p-0">
          {/* Month header */}
          <div className="grid border-b border-slate-line bg-canvas-cool text-[11px] font-semibold uppercase tracking-wide text-ink-muted" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-10 bg-canvas-cool px-2 py-1.5">Doctor</div>
            {MONTH_ABBR.map((label, i) => (
              <div key={label} className={`px-1 py-1.5 text-center ${i === currentMonthIndex && year === currentYear ? 'text-accent' : ''}`}>
                {label}
              </div>
            ))}
          </div>

          {groups.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-muted">No approved or pending leave in {year}.</p>
          ) : (
            groups.map(group => (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroupCollapsed(group.key)}
                  className="flex w-full items-center justify-between bg-canvas-sunken px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted transition-colors hover:bg-slate-line"
                >
                  <span>{group.label} <span className="ml-1 normal-case font-normal">{group.items.length}</span></span>
                  <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${collapsedGroups[group.key] ? '' : 'rotate-180'}`} />
                </button>
                {!collapsedGroups[group.key] && group.items.map(row => (
                  <DoctorRows
                    key={row.doctor.id}
                    row={row}
                    year={year}
                    selected={selected}
                    onSelectDoctor={doctor => setSelected({ kind: 'doctor', doctorId: doctor.id })}
                    onSelectBlock={request => setSelected({ kind: 'block', request })}
                    gridTemplateColumns={gridTemplateColumns}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Desktop sticky side panel */}
      <aside className="hidden lg:sticky lg:top-4 lg:block lg:h-fit lg:w-72 lg:flex-shrink-0">
        <div className="card p-3">{panelBody}</div>
      </aside>

      {/* Mobile: "on leave now" always visible as a stacked card */}
      {!selected && (
        <div className="lg:hidden">
          <div className="card p-3"><OnLeaveNow activeByGroup={activeByGroup} /></div>
        </div>
      )}

      {/* Mobile: a selection opens a bottom-sheet modal (desktop uses the sticky panel) */}
      {!isDesktop && selected && (
        <Modal title={modalTitle} onClose={() => setSelected(null)}>{panelBody}</Modal>
      )}
    </div>
  )
}
