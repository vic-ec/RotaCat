import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { CalendarX2, ChevronRight, X } from 'lucide-react'
import RowActionIcon from './RowActionIcon'
import { CANCELLABLE_STATUSES } from '../lib/leaveCancellation'
import { MONTH_ABBR, formatShortDateRange, todayStr } from '../lib/dateRange'
import { LEAVE_TYPE_LABELS, leaveTypeCode, leaveTypeLabelWithCode } from '../lib/leaveRequests'
import { leaveGroupInk, leaveTypeGroupKey, LEAVE_GROUP_OPTIONS } from '../lib/leaveMatrix'
import { sinceLastBreakText } from '../lib/leaveAuditByMonth'
import LeaveTypeIcon from './LeaveTypeIcon'
import { myYearPath } from '../lib/myYearLinks'
import { fullDoctorName, DOCTOR_NAME_COL_PX } from '../lib/doctorNames'
import { CONTRACT_TYPE_LABEL } from '../lib/doctorSort'

const OT_SUBTYPE_SHORT = { LRCHC: 'Day Hosp', DPM_BCH: 'TB Hosp', PSYCH: 'Psych' }
import { useSwatch } from '../lib/useSwatch'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { ActionSheet } from './ActionSheet'
import SectionBar from './SectionBar'
import LeaveCodeBox from './myYear/LeaveCodeBox'
import { plural } from '../lib/text'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const COLUMN_COUNT = 1 + 12 + 6 + 1
const MONTH_COL_PX = 64

// One month's slice of each leave a doctor has in it, as bars at their
// exact days (the timeline the Matrix used to draw), approved on the upper
// lane, pending dashed on a thin lane under it. A leave crossing into the
// next month continues in the next cell, so it reads as one bar.
function monthSlices(requests, year, month) {
  const mm = String(month + 1).padStart(2, '0')
  const dim = new Date(year, month + 1, 0).getDate()
  const start = `${year}-${mm}-01`
  const end = `${year}-${mm}-${String(dim).padStart(2, '0')}`
  const out = []
  for (const r of requests || []) {
    if (r.date_to < start || r.date_from > end) continue
    const a = r.date_from < start ? 1 : Number(r.date_from.slice(8, 10))
    const b = r.date_to > end ? dim : Number(r.date_to.slice(8, 10))
    out.push({ request: r, left: ((a - 1) / dim) * 100, width: ((b - a + 1) / dim) * 100, first: r.date_from >= start })
  }
  return out
}

function MonthBars({ requests, year, month, onOpen }) {
  const today = todayStr()
  const mm = String(month + 1).padStart(2, '0')
  const dim = new Date(year, month + 1, 0).getDate()
  const todayHere = today.startsWith(`${year}-${mm}-`)
  return (
    <div className="pointer-events-none absolute inset-0">
      {todayHere && (
        <span aria-hidden="true" className="absolute bottom-0 top-0 z-[1] w-px bg-accent/60" style={{ left: `${((Number(today.slice(8, 10)) - 0.5) / dim) * 100}%` }} />
      )}
      {monthSlices(requests, year, month).map(({ request, left, width, first }) => {
        const ink = leaveGroupInk(leaveTypeGroupKey(request.leave_type))
        const pending = request.status === 'pending'
        const showCode = first && (width / 100) * MONTH_COL_PX >= 22
        return (
          <button
            key={request.id}
            type="button"
            data-request-id={request.id}
            data-testid="leave-bar"
            onClick={e => { e.stopPropagation(); onOpen(request, e.currentTarget.getBoundingClientRect()) }}
            title={`${leaveTypeLabelWithCode(request.leave_type)}${pending ? ' (pending)' : ''}: ${formatShortDateRange(request.date_from, request.date_to)}`}
            aria-label={`${LEAVE_TYPE_LABELS[request.leave_type] || 'Leave'}${pending ? ', pending' : ''}, ${formatShortDateRange(request.date_from, request.date_to)}`}
            className={`pointer-events-auto absolute z-[2] flex items-center justify-center overflow-hidden rounded-sm text-[9px] font-bold leading-none ${pending ? 'top-[25px] h-[8px]' : 'top-[6px] h-[17px]'}`}
            style={{
              left: `${left}%`,
              width: `max(3px, ${width}%)`,
              backgroundColor: `color-mix(in srgb, ${ink} ${pending ? 8 : 14}%, transparent)`,
              border: pending ? `1px dashed ${ink}` : `1px solid color-mix(in srgb, ${ink} 45%, transparent)`,
              color: ink,
            }}
          >
            {showCode && !pending && leaveTypeCode(request.leave_type)}
          </button>
        )
      })}
    </div>
  )
}

// One month for one doctor: each leave entry, the annual / sick / other
// subtotal, and the way to the roster and to their year.
// `pinned` false is the hover preview: the links are greyed (moving the
// pointer to them would close it) and a hint says to click the month.
// `onClose` puts an × in the corner (the desktop popover once pinned; the
// phone sheet has its own).
function MonthBreakdown({ row, month, year, rosterTo, pinned = true, onClose = null, onCancelLeave = null }) {
  const linkClass = 'flex min-h-[44px] items-center font-medium md:min-h-0'
  const live = `${linkClass} text-accent hover:text-accent-dark`
  const greyed = `${linkClass} cursor-default text-ink-muted`
  const entries = row.entries[month]
  const split = { annual: 0, sick: 0, other: 0 }
  for (const e of entries) split[e.bucket] += e.days
  return (
    <div data-testid="month-breakdown" className="relative text-sm">
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className="btn-close absolute -right-1 -top-1 h-6 w-6 text-ink-muted">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <p className="font-display text-base font-semibold text-ink">{MONTH_NAMES[month]} {year}</p>
      <p className="text-xs text-ink-muted">{row.name} {row.surname}</p>
      {entries.length === 0 ? (
        <p className="mt-3 text-ink-muted">No leave this month.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map(({ request, days }) => (
            <li key={request.id} className="flex items-start gap-2">
              <LeaveCodeBox leaveType={request.leave_type} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type}</span>
                <span className="block text-xs text-ink-muted">{formatShortDateRange(request.date_from, request.date_to)}</span>
              </span>
              <span className="flex-shrink-0 font-semibold text-ink">{plural(days, 'day')}</span>
              {pinned && onCancelLeave && CANCELLABLE_STATUSES.includes(request.status) && (
                // Pulled up so the icon sits level with the first line of
                // text (the button's 36px tap box is taller than that line).
                <span className="-my-2 -mr-2 flex-shrink-0 self-start">
                <RowActionIcon
                  icon={<CalendarX2 className="h-4 w-4" />}
                  title="Cancel leave"
                  label={`Cancel ${LEAVE_TYPE_LABELS[request.leave_type] || 'leave'}, ${formatShortDateRange(request.date_from, request.date_to)}`}
                  onClick={() => onCancelLeave(request)}
                  tone="danger"
                />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-slate-line pt-2 text-xs text-ink-muted">
        <span>Annual {split.annual} · Sick {split.sick} · Other {split.other}</span>
        <span className="text-sm font-semibold text-ink">{plural(row.months[month], 'day')}</span>
      </p>
      <p className="mt-2 flex items-center gap-4">
        {pinned ? (
          <>
            {rosterTo && <Link to={rosterTo} className={live}>Roster ›</Link>}
            <Link to={myYearPath(row.profileId, { tab: 'leave', year })} className={live}>{row.name || row.surname}’s year ›</Link>
          </>
        ) : (
          <>
            {rosterTo && <span className={greyed} aria-disabled="true">Roster ›</span>}
            <span className={greyed} aria-disabled="true">{row.name || row.surname}’s year ›</span>
          </>
        )}
      </p>
      {!pinned && (
        <p className="mt-2 rounded-lg bg-canvas-sunken px-2 py-1.5 text-xs text-ink-muted" data-testid="month-breakdown-hint">
          Click the month to keep this open and use the links.
        </p>
      )}
    </div>
  )
}

// All Leave › By month. Same frame, sections and sticky Doctor column as
// the By leave type table. A month cell opens its breakdown: on hover and
// keyboard focus on desktop, pinned by a click; a bottom sheet on a phone.
// The cells never navigate — the name and the arrow at the end of the row
// are what open a doctor's year.
export default function LeaveAuditByMonth({
  sections, collapsedSections, onToggleSection, displayNames, columnLabelOf, year, monthIds = {}, tableRef, tableFill,
  // The leave behind the bars (approved and pending), by doctor, and what a
  // bar opens: onOpenRequest(request, rect).
  requestsByProfile = new Map(), onOpenRequest = () => {},
  // A "Cancel" icon beside each leave in the month breakdown (admins; it
  // opens CancelLeaveModal) — so leave on any date can be cancelled here.
  onCancelLeave = null,
}) {
  const swatch = useSwatch()
  const isDesktop = useIsDesktop(768)
  // { row, month, rect, pinned }
  const [open, setOpen] = useState(null)
  const popoverRef = useRef(null)
  useDismissablePopover(Boolean(open?.pinned) && isDesktop, () => setOpen(null), popoverRef)

  useEffect(() => {
    if (!open) return undefined
    const onKey = e => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const rosterLink = month => {
    const id = monthIds[`${year}-${String(month + 1).padStart(2, '0')}`]
    return id ? `/roster/${id}` : null
  }
  const show = (row, month, el, pinned) => setOpen({ row, month, rect: el.getBoundingClientRect(), pinned })
  const isOpen = (row, month) => open?.row.profileId === row.profileId && open.month === month

  const hasRows = sections.some(s => s.rows.length > 0)
  const popoverStyle = open && isDesktop ? (() => {
    const width = 288
    const left = Math.max(8, Math.min(open.rect.left, window.innerWidth - width - 8))
    const below = window.innerHeight - open.rect.bottom > 260
    return below
      ? { left, top: open.rect.bottom + 6, width }
      : { left, bottom: window.innerHeight - open.rect.top + 6, width }
  })() : null

  return (
    <>
      <div ref={tableRef} style={tableFill} className="mt-4 overflow-auto rounded-lg border border-slate-line">
        <table className="w-full min-w-[1400px] table-fixed border-separate border-spacing-0 text-xs" data-testid="all-leave-by-month">
          <colgroup>
            <col style={{ width: DOCTOR_NAME_COL_PX }} />
            {MONTH_ABBR.map(m => <col key={m} style={{ width: MONTH_COL_PX }} />)}
            <col className="w-[66px]" /><col className="w-[66px]" /><col className="w-[52px]" /><col className="w-[52px]" /><col className="w-[60px]" />
            <col className="w-[150px]" />
            <col />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="text-[10px] uppercase tracking-wide text-ink-muted">
              <th scope="col" className="sticky left-0 z-20 border-b border-r border-slate-line bg-canvas-sunken px-2 py-1.5 text-left">Doctor</th>
              {MONTH_ABBR.map((m, i) => (
                <th key={m} scope="col" title={MONTH_NAMES[i]} className={`border-b border-slate-line bg-canvas-sunken px-1 py-1.5 text-center font-medium ${todayStr().startsWith(`${year}-${String(i + 1).padStart(2, '0')}`) ? 'text-accent' : ''}`}>{m}</th>
              ))}
              {['Annual booked', 'Annual left', 'Sick', 'Other', 'Total days'].map((h, i) => (
                <th key={h} scope="col" className={`border-b border-slate-line bg-canvas-sunken px-1 py-1.5 text-center align-bottom font-medium ${i === 0 ? 'border-l' : ''}`}>{h}</th>
              ))}
              <th scope="col" className="border-b border-slate-line bg-canvas-sunken px-2 py-1.5 text-left align-bottom font-medium">Since last break</th>
              <th className="border-b border-slate-line bg-canvas-sunken" />
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {!hasRows ? (
              <tr><td colSpan={COLUMN_COUNT} className="px-2 py-4 text-center text-ink-muted">No doctors match these filters.</td></tr>
            ) : sections.map(section => (
              <Fragment key={section.key}>
                <tr
                  onClick={() => onToggleSection(section.key)}
                  className="cursor-pointer transition-[filter] hover:brightness-110 active:brightness-110"
                >
                  <td colSpan={COLUMN_COUNT} className="border-b border-slate-hairline bg-canvas p-1">
                    <SectionBar label={section.label} count={section.rows.length} collapsed={collapsedSections[section.key]} />
                  </td>
                </tr>
                {!collapsedSections[section.key] && section.rows.map(row => {
                  const yearTo = myYearPath(row.profileId, { year })
                  const fullName = `${row.name} ${row.surname}`
                  // "EC Intern" / "OT Intern · Psych" (the current OT rotation),
                  // as Hours Summary names them; ⅝ is the one contract worth
                  // saying — full-time is the default.
                  const subtype = row.contractType === 'Junior_Doctor_Overtime' ? OT_SUBTYPE_SHORT[row.psychSubcategory] : null
                  const underName = [columnLabelOf(row.profileId), subtype, row.contractType === 'five_eighths' ? CONTRACT_TYPE_LABEL.five_eighths : null].filter(Boolean).join(' · ')
                  return (
                    <tr key={row.profileId} className="group">
                      <td title={fullName} className="sticky left-0 z-[1] border-b border-b-slate-hairline border-r border-r-slate-line bg-canvas px-2 py-1.5 align-top group-hover:bg-canvas-cool">
                        <Link
                          to={yearTo}
                          aria-label={`${fullName}’s year`}
                          className="inline-block max-w-full truncate whitespace-nowrap rounded px-1.5 py-0.5 align-bottom text-[10px] font-medium hover:underline"
                          style={swatch.fill(row.colorCode || '#4A90D9', { text: true })}
                        >
                          {fullDoctorName(row, displayNames.get(row.profileId) ?? row.surname)}
                        </Link>
                        <p className="mt-0.5 truncate text-[10px] text-ink-muted">{underName}</p>
                      </td>
                      {row.months.map((days, month) => (
                        <td key={month} className={`relative border-b border-slate-hairline p-0 ${month > 0 ? 'border-l border-l-slate-hairline' : ''}`}>
                          {/* The month itself (under the bars): hover or tap
                              for its days and the leave behind them. */}
                          <button
                            type="button"
                            aria-label={`${fullName}, ${MONTH_NAMES[month]}: ${plural(days, 'day')} on leave`}
                            aria-expanded={isOpen(row, month)}
                            onMouseEnter={e => { if (isDesktop && !open?.pinned) show(row, month, e.currentTarget, false) }}
                            onMouseLeave={() => { if (isDesktop && !open?.pinned) setOpen(null) }}
                            onFocus={e => { if (isDesktop && !open?.pinned) show(row, month, e.currentTarget, false) }}
                            onBlur={() => { if (isDesktop && !open?.pinned) setOpen(null) }}
                            onClick={e => {
                              if (isOpen(row, month) && open.pinned) setOpen(null)
                              else show(row, month, e.currentTarget, true)
                            }}
                            aria-pressed={isOpen(row, month) && open.pinned}
                            className={`block h-9 w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                              isOpen(row, month) ? (open.pinned ? 'bg-accent-tint ring-2 ring-inset ring-accent' : 'bg-canvas-sunken') : 'hover:bg-canvas-sunken'
                            }`}
                            data-testid="month-cell"
                            data-days={days}
                          />
                          <MonthBars requests={requestsByProfile.get(row.profileId)} year={year} month={month} onOpen={onOpenRequest} />
                        </td>
                      ))}
                      <td className="border-b border-l border-b-slate-hairline border-l-slate-line px-1 py-1.5 text-center font-semibold text-ink">{row.annual}</td>
                      <td className="border-b border-slate-hairline px-1 py-1.5 text-center text-ink">{row.annualLeft}</td>
                      <td className="border-b border-slate-hairline px-1 py-1.5 text-center text-ink">{row.sick}</td>
                      <td className="border-b border-slate-hairline px-1 py-1.5 text-center text-ink">{row.other}</td>
                      <td className="border-b border-slate-hairline px-1 py-1.5 text-center font-semibold text-ink">{row.total}</td>
                      <td className="border-b border-slate-hairline px-2 py-1.5 text-ink-light">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {sinceLastBreakText(row.sinceBreak)}
                          {row.sinceBreak.long && <span className="chip-amber rounded-full px-1.5 py-0.5 text-[10px] font-medium">Long</span>}
                        </span>
                      </td>
                      <td className="border-b border-slate-hairline px-1 text-right">
                        <Link
                          to={yearTo}
                          aria-label={`Open ${fullName}’s year`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-muted hover:bg-canvas-sunken hover:text-ink"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {open && isDesktop && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`${MONTH_NAMES[open.month]} ${year}, ${open.row.name} ${open.row.surname}`}
          style={popoverStyle}
          className={`fixed z-50 popup ${open.pinned ? '' : 'pointer-events-none'}`}
        >
          <MonthBreakdown row={open.row} month={open.month} year={year} rosterTo={rosterLink(open.month)} pinned={open.pinned} onClose={open.pinned ? () => setOpen(null) : null} onCancelLeave={onCancelLeave ? r => { setOpen(null); onCancelLeave(r) } : null} />
        </div>,
        document.body,
      )}
      {open && !isDesktop && (
        <ActionSheet title="Month" onClose={() => setOpen(null)}>
          <div className="px-3 pb-3 pt-1">
            <MonthBreakdown row={open.row} month={open.month} year={year} rosterTo={rosterLink(open.month)} onCancelLeave={onCancelLeave ? r => { setOpen(null); onCancelLeave(r) } : null} />
          </div>
        </ActionSheet>
      )}
    </>
  )
}

// Under the table: the four shades, and what "Long" means.
export function ByMonthLegend({ longBreakDays }) {
  return (
    <div className="mt-3 space-y-1.5 text-xs text-ink-muted" data-testid="by-month-legend">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Legend">
        {LEAVE_GROUP_OPTIONS.map(o => (
          <li key={o.key} className="flex items-center gap-1.5"><LeaveTypeIcon groupKey={o.key} size="sm" />{o.label}</li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2 w-5 rounded-sm border border-dashed border-ink-muted" />Pending (the thin line under a doctor)
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3.5 w-px bg-accent" />Today
        </li>
        <li>Hover or tap a month for its days.</li>
      </ul>
      <p>
        <span className="chip-amber mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium">Long</span>
        More than {longBreakDays} days since a break of 5 or more days of annual leave in a row.
      </p>
    </div>
  )
}
