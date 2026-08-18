import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Filter, Pencil, Users, CircleCheck, CircleAlert, Copy, ClipboardPaste, Trash2,
  MoreVertical, EllipsisVertical, ChevronRight, ScrollText, Plus,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr, addDays, parseLocalDate, monthBounds } from '../lib/dateRange'
import {
  CATEGORY_GROUPS, groupForCategory, resolvedCategoryForDoctor, resolveWeekendCategoryForDoctor,
  saturdaysInRange, saturdaysInMonth, nextWeekendSaturday,
  weekendCoverageSummary, isProfileAssignedToWeekend, groupEntriesByWeekend,
  isEvenWeekend, weekendExceptionRequestsBySaturday, planWeekendPasteAcrossMonths,
} from '../lib/weekendPlanner'
import { fetchInternRotationsForDoctorIds, groupRotationsByDoctorId } from '../lib/internRotations'
import { buildDoctorDisplayNames } from '../lib/doctorNames'
import { logWeekendPlannerChange, restoreWeekendPlannerBatch } from '../lib/changeLog'
import WeekendPlannerChangeLogModal from './WeekendPlannerChangeLogModal'
import DateStepper from './DateStepper'
import LegendSheet from './LegendSheet'
import PageActionsMenu from './PageActionsMenu'
import { ActionSheet, ActionSheetButton } from './ActionSheet'
import Toolbar from './Toolbar'
import FloatingActionMenu from './FloatingActionMenu'
import Tag from './Tag'

const WEEKS_AHEAD = 26 // ~6 months, enough runway to plan several roster months ahead
const MONTHS_PADDING = 3 // either side of a freshly-navigated-to month — see boundsAroundMonth below

// (year, month) shifted by `delta` months, handling year rollover for any
// delta (not just ±1 — unlike DateStepper's own stepMonth, this needs to
// jump straight to a month several steps away for boundsAroundMonth below).
function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1)
  return [d.getFullYear(), d.getMonth() + 1]
}

// A fresh (not ever-growing) fetch window centred on (year, month), used
// whenever navigation lands somewhere outside what's currently loaded — see
// goToMonth's own comment for why this is recomputed from scratch each time
// rather than merged with whatever was already loaded.
function boundsAroundMonth(year, month) {
  const [fromYear, fromMonth] = shiftMonth(year, month, -MONTHS_PADDING)
  const [throughYear, throughMonth] = shiftMonth(year, month, MONTHS_PADDING)
  return { from: monthBounds(fromYear, fromMonth).start, through: monthBounds(throughYear, throughMonth).end }
}
// My weekends is both the default landing filter and leftmost chip for a
// non-admin viewer. Needs planning is admin-only (nothing a non-admin
// viewer can act on) and sits at the far right, appended only for admins
// rather than shared. For an admin, All weekends leads instead — an admin's
// default concern is the whole roster, not just their own rotation — so
// ADMIN_FILTERS reorders FILTERS_BASE to put it first rather than sharing
// the same leftmost chip as everyone else.
const FILTERS_BASE = [
  { key: 'mine', label: 'My weekends' },
  { key: 'my-requests', label: 'My requests' },
  { key: 'all', label: 'All weekends' },
]
const ADMIN_FILTERS = [
  FILTERS_BASE.find(f => f.key === 'all'),
  ...FILTERS_BASE.filter(f => f.key !== 'all'),
  { key: 'needs-planning', label: 'Needs planning' },
]
// Clerks are read-only "All" access only — "My weekends"/"My requests" are
// personal/actionable views that don't apply to them.
const CLERK_FILTERS = [FILTERS_BASE.find(f => f.key === 'all')]
const EXCEPTION_STATUS_LABEL = { pending: 'Exception pending', approved: 'Exception approved', rejected: 'Exception rejected' }
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// The "How it works" explanation — the Legend sheet's own footer (see
// MonthLegendTrigger) on both viewports, not a separate standalone banner.
const RULE_BULLETS = [
  'No more than one person per slot.',
  'If your name is listed in a specific colour for a given month, you work every weekend in that colour that month.',
  'Use surnames when populating the planner.',
]

// The 3 consecutive months starting at (year, month) — "whichever month is
// currently viewed, plus the next 2" — for Copy quarter/Paste quarter/Clear
// quarter, all keyed off whatever the toolbar's month nav is currently
// showing at the moment each is triggered.
function quarterMonthsFrom(year, month) {
  const months = []
  for (let i = 0; i < 3; i++) {
    let m = month + i
    let y = year
    while (m > 12) { m -= 12; y += 1 }
    months.push({ year: y, month: m })
  }
  return months
}

// "Jan-Mar 2026" (same year throughout) or "Nov 2026-Jan 2027" (crosses a
// year boundary) for a quarterMonthsFrom() result.
function quarterLabel(quarterMonths) {
  const [first, , last] = quarterMonths
  const firstLabel = first.year === last.year ? MONTH_ABBR[first.month - 1] : `${MONTH_ABBR[first.month - 1]} ${first.year}`
  return `${firstLabel}-${MONTH_ABBR[last.month - 1]} ${last.year}`
}

// Mobile's alternating card background always follows even/odd parity —
// unrelated to the desktop badge scheme below, which deliberately doesn't
// tint anything (see the desktop section's own comment for why).
function weekendColorScheme(saturday) {
  return isEvenWeekend(saturday)
    ? { bg: 'bg-accent-tint', text: 'text-accent' }
    : { bg: 'bg-flagAmber-bg', text: 'text-flagAmber' }
}

// Desktop's weekend-parity badge — a small labelled pill ("Wknd 2 · Odd"),
// never a background wash. Uses groupEven/groupOdd — a dedicated parity
// color family, not flagAmber/success (reserved for the Status column's "N
// gaps" chip, a genuine roster-state signal that parity mixing into would
// blur) and not accent/rose (a status-adjacent pairing that read as one
// more roster-state signal rather than its own thing — see tailwind.config.js).
function weekendBadge(saturday, weekendIndex) {
  const even = isEvenWeekend(saturday)
  return {
    label: `Wknd ${weekendIndex} · ${even ? 'Even' : 'Odd'}`,
    chip: even ? 'bg-groupEven-tint text-groupEven' : 'bg-groupOdd-tint text-groupOdd',
  }
}

function XIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// "2026-08-15" → "Sat 15 - Sun 16 Aug 2026" (or "Sat 31 Aug - Sun 1 Sep 2026"
// when the weekend straddles a month boundary) — replaces the verbose
// YYYY-MM-DD → YYYY-MM-DD range everywhere a weekend is displayed.
function formatWeekendRange(saturday) {
  const sunday = addDays(saturday, 1)
  const satDate = parseLocalDate(saturday)
  const sunDate = parseLocalDate(sunday)
  const sunMonth = sunDate.toLocaleDateString('en-GB', { month: 'short' })
  const sunYear = sunDate.getFullYear()
  const sameMonth = satDate.getMonth() === sunDate.getMonth() && satDate.getFullYear() === sunDate.getFullYear()
  if (sameMonth) return `Sat ${satDate.getDate()} - Sun ${sunDate.getDate()} ${sunMonth} ${sunYear}`
  const satMonth = satDate.toLocaleDateString('en-GB', { month: 'short' })
  return `Sat ${satDate.getDate()} ${satMonth} - Sun ${sunDate.getDate()} ${sunMonth} ${sunYear}`
}

// Splits a list into rows of (at most) 2 — used to lay assigned names out as
// two lines (e.g. a 4-person MO group) instead of one line that can overflow
// a fixed-width column/panel.
function chunkInPairs(items) {
  const rows = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

// One category group's row: assigned surname(s) (or an open-slot count) plus
// the admin add/remove controls — the desktop inspector's edit mode. Mirrors
// MobileRoleRow's own empty/filled split (an "Add doctor" button while
// there's nothing to anchor a smaller trigger to; a compact + once there's
// at least one name) rather than the full-width button this used to always
// show regardless of fill state — that was the one real desktop/mobile
// inconsistency left once WeekendAddDoctorsSheet became both viewports'
// shared add mechanism (multi-select, switchable category), replacing this
// row's own single-doctor native <select>.
function CategoryGroupRow({
  group, groupEntries, doctorById, displayNames, isAdmin, saving, textClass, saturday, removeEntry, onOpenPicker,
}) {
  const rows = chunkInPairs(groupEntries)
  const isEmpty = groupEntries.length === 0
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">{group.label}</span>
        {isEmpty && <span className="text-xs font-medium text-rose-dark">1 open</span>}
      </div>

      {rows.length > 0 && (
        <div className="mt-1 space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              {row.map(entry => {
                const doctor = doctorById.get(entry.profile_id)
                const label = doctor ? (displayNames.get(doctor.id) ?? doctor.surname) : '(unknown)'
                return (
                  <span key={entry.id} className={`flex items-center gap-1 text-sm ${textClass}`}>
                    {label}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        disabled={saving}
                        className={`${textClass} hover:text-flagRed`}
                        aria-label={`Remove ${label} from ${saturday}`}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                )
              })}
              {!isEmpty && i === rows.length - 1 && isAdmin && (
                <button
                  type="button"
                  onClick={onOpenPicker}
                  disabled={saving}
                  aria-label={`Add another doctor to ${group.label}`}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent hover:opacity-80"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isEmpty && isAdmin && (
        <div className="mt-1.5">
          <button type="button" onClick={onOpenPicker} disabled={saving} className="btn-primary w-full text-sm">
            Add doctor
          </button>
        </div>
      )}
    </div>
  )
}

// One category's read-only summary row for the desktop inspector's default
// (non-editing) view: label, comma-joined surnames or an "Open" chip, and a
// status icon — no buttons. Editing lives behind the "Edit assignments"
// action instead of always-visible +/x controls, per a desktop UX review
// ("quick actions only on hover/select, not always-visible plus icons
// everywhere").
function AssignmentSummaryRow({ group, groupEntries, doctorById, displayNames }) {
  const filled = groupEntries.length > 0
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-ink-muted">{group.label}</span>
      <div className="flex items-center gap-2">
        {filled ? (
          <span className="text-right text-sm text-ink">
            {groupEntries.map(e => displayNames.get(e.profile_id) ?? doctorById.get(e.profile_id)?.surname ?? '(unknown)').join(', ')}
          </span>
        ) : (
          <span className="rounded-full bg-flagAmber-bg px-2 py-0.5 text-xs font-medium text-flagAmber">Open</span>
        )}
        {filled
          ? <CircleCheck className="h-4 w-4 flex-shrink-0 text-success" />
          : <CircleAlert className="h-4 w-4 flex-shrink-0 text-flagAmber" />}
      </div>
    </div>
  )
}

// The desktop split view's right-hand panel: a summary of whichever weekend
// is selected in the grid, with editing tucked behind an "Edit assignments"
// action instead of always-on inline controls — a proper inspector, not a
// second copy of the mobile card. Editing state is local and resets
// whenever the selected weekend changes, so switching weekends never leaves
// a stale picker open.
function WeekendInspector({
  saturday, weekendIndex, bySaturday, doctorById, displayNames, isAdmin, saving, myRequest, canViewRequests,
  removeEntry, onClearWeekend, onCopyWeekend, onPasteWeekend, hasWeekendClipboard, onOpenAddDoctor,
}) {
  const [editing, setEditing] = useState(false)
  useEffect(() => { setEditing(false) }, [saturday])

  const coverage = weekendCoverageSummary(bySaturday)
  const needsPlanning = coverage.openGroups.length > 0
  const badge = weekendBadge(saturday, weekendIndex)

  return (
    <div data-testid="weekend-inspector">
      <div>
        <p className="whitespace-nowrap text-base font-semibold text-ink">{formatWeekendRange(saturday)}</p>
        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.chip}`}>{badge.label}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-line pt-3">
        <span className="text-sm text-ink-muted">Overall status</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
        }`}>
          {needsPlanning ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
          {needsPlanning
            ? `${coverage.openGroups.length} role${coverage.openGroups.length === 1 ? '' : 's'} open`
            : `${coverage.filledGroups} of ${coverage.totalGroups} groups planned`}
        </span>
      </div>

      {myRequest && (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {EXCEPTION_STATUS_LABEL[myRequest.status] ?? myRequest.status}
        </p>
      )}

      {!editing ? (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Assignments</p>
          <div className="mt-1 divide-y divide-slate-line">
            {CATEGORY_GROUPS.map(group => (
              <AssignmentSummaryRow key={group.key} group={group} groupEntries={bySaturday[group.key] || []} doctorById={doctorById} displayNames={displayNames} />
            ))}
          </div>

          <div className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-xs ${needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'}`}>
            {needsPlanning ? <CircleAlert className="h-4 w-4 flex-shrink-0" /> : <CircleCheck className="h-4 w-4 flex-shrink-0" />}
            <span>
              {needsPlanning
                ? `${coverage.openGroups.map(k => CATEGORY_GROUPS.find(g => g.key === k)?.label).join(', ')} still need${coverage.openGroups.length === 1 ? 's' : ''} a staff member.`
                : 'All required groups have an assigned staff member.'}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-primary flex w-full items-center justify-center gap-1.5 text-sm"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit assignments
              </button>
            )}
            {canViewRequests && (
              <Link to="/leave?tab=requests" className="btn-secondary flex w-full items-center justify-center gap-1.5 text-sm">
                <Users className="h-3.5 w-3.5" /> View requests
              </Link>
            )}
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onCopyWeekend(saturday)}
                  disabled={coverage.filledGroups === 0}
                  className="btn-secondary flex flex-1 items-center justify-center gap-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy weekend
                </button>
                {hasWeekendClipboard && (
                  <button
                    type="button"
                    onClick={() => onPasteWeekend(saturday)}
                    className="btn-secondary flex flex-1 items-center justify-center gap-1.5 text-xs"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" /> Paste weekend
                  </button>
                )}
              </div>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => onClearWeekend(saturday)}
                disabled={coverage.filledGroups === 0}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-flagRed px-3 py-1.5 text-xs font-medium text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear weekend
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 divide-y divide-slate-line border-t border-slate-line">
            {CATEGORY_GROUPS.map(group => (
              <CategoryGroupRow
                key={group.key}
                group={group}
                groupEntries={bySaturday[group.key] || []}
                doctorById={doctorById}
                displayNames={displayNames}
                isAdmin={isAdmin}
                saving={saving}
                textClass="text-ink"
                saturday={saturday}
                removeEntry={removeEntry}
                onOpenPicker={() => onOpenAddDoctor(group.key)}
              />
            ))}
          </div>
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary mt-4 w-full text-sm">
            Done editing
          </button>
        </>
      )}
    </div>
  )
}

// Mobile-only read-only quick-glance for a weekend, opened by tapping a
// card's date header — mirrors LeaveYearGrid.jsx's DayDetailSheet (fixed
// inset-0, bg-ink/20, items-end on mobile / items-center on desktop). This
// is deliberately NOT a replacement for the mobile card's own
// always-expanded, fully editable breakdown below it (which stays exactly
// as-is): that inline view already has everything, admin controls
// included, so a sheet re-showing the identical thing behind an extra tap
// would just be a redundant detour. This is a condensed alternative for a
// fast glance — status + assignments only, reusing WeekendInspector's own
// read-only AssignmentSummaryRow rather than rebuilding that breakdown a
// second time.
function WeekendDetailSheet({ saturday, weekendIndex, bySaturday, doctorById, displayNames, myRequest, onClose }) {
  const coverage = weekendCoverageSummary(bySaturday)
  const needsPlanning = coverage.openGroups.length > 0
  const badge = weekendBadge(saturday, weekendIndex)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-b-none p-5 sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold text-ink">{formatWeekendRange(saturday)}</h2>
            <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.chip}`}>{badge.label}</span>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-line pt-3">
          <span className="text-sm text-ink-muted">Overall status</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
          }`}>
            {needsPlanning ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
            {needsPlanning
              ? `${coverage.openGroups.length} ${coverage.openGroups.length === 1 ? 'gap' : 'gaps'}`
              : `${coverage.filledGroups} of ${coverage.totalGroups} groups planned`}
          </span>
        </div>

        {myRequest && (
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {EXCEPTION_STATUS_LABEL[myRequest.status] ?? myRequest.status}
          </p>
        )}

        <div className="mt-3 divide-y divide-slate-line">
          {CATEGORY_GROUPS.map(group => (
            <AssignmentSummaryRow key={group.key} group={group} groupEntries={bySaturday[group.key] || []} doctorById={doctorById} displayNames={displayNames} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Copy/Paste's confirmation step, styled like WeekendDriftDetailsModal.jsx
// (fixed inset-0, bg-ink/20, items-center, card max-w-lg p-5) — nothing is
// written until this is confirmed. Owns the fill-empty/overwrite mode
// toggle locally and recomputes planWeekendPasteAcrossMonths (the pure
// planner in weekendPlanner.js) on every mode/prop change so the preview counts below
// always match what Confirm would actually do.
function WeekendPasteModal({ clipboard, targetMonths, targetLabel, existingByWeekend, activeDoctorIds, saving, onConfirm, onClose }) {
  const [mode, setMode] = useState('fill-empty')
  const plan = useMemo(
    () => planWeekendPasteAcrossMonths({ sourceMonths: clipboard.months, targetMonths, existingByWeekend, activeDoctorIds, mode }),
    [clipboard, targetMonths, existingByWeekend, activeDoctorIds, mode]
  )
  const inactiveCount = plan.skipped.filter(s => s.reason === 'inactive').length
  const alreadyAssignedCount = plan.skipped.filter(s => s.reason === 'already-assigned').length
  const sourceWeekendCount = clipboard.months.reduce((sum, m) => sum + m.length, 0)
  const targetWeekendCount = targetMonths.reduce((sum, m) => sum + m.length, 0)
  const weekendCount = Math.min(sourceWeekendCount, targetWeekendCount)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-b-none p-5 sm:max-h-[80vh] sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Paste {clipboard.sourceLabel} into {targetLabel}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>

        <div className="mt-4 flex w-fit gap-1 rounded-lg border border-slate-line bg-canvas-raised p-0.5">
          <button
            type="button"
            onClick={() => setMode('fill-empty')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'fill-empty' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'}`}
          >
            Fill empty groups only
          </button>
          <button
            type="button"
            onClick={() => setMode('overwrite')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'overwrite' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'}`}
          >
            Overwrite instead
          </button>
        </div>
        {mode === 'overwrite' && (
          <p className="mt-2 text-xs text-flagRed">This removes every existing assignment on each target weekend before pasting — not reversible.</p>
        )}

        {plan.unmatchedSourceCount > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            {clipboard.sourceLabel} had {sourceWeekendCount} weekends, {targetLabel} has {targetWeekendCount} — the last {plan.unmatchedSourceCount} won&rsquo;t be pasted.
          </p>
        )}

        <p className="mt-3 text-sm text-ink">
          Will add {plan.toInsert.length} assignment{plan.toInsert.length === 1 ? '' : 's'} across {weekendCount} weekend{weekendCount === 1 ? '' : 's'}.
          {alreadyAssignedCount > 0 && ` ${alreadyAssignedCount} skipped (already assigned elsewhere that weekend).`}
          {inactiveCount > 0 && ` ${inactiveCount} skipped (no longer active).`}
          {mode === 'overwrite' && plan.toDelete.length > 0 && ` ${plan.toDelete.length} existing assignment${plan.toDelete.length === 1 ? '' : 's'} will be removed first.`}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            type="button"
            onClick={() => onConfirm(plan)}
            disabled={saving || (plan.toInsert.length === 0 && plan.toDelete.length === 0)}
            className="btn-primary text-sm"
          >
            {saving ? 'Pasting…' : 'Confirm paste'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Shared destructive-bulk-delete confirmation, used by both "Clear weekend"
// and "Clear month" — same visual template as WeekendPasteModal/
// WeekendDriftDetailsModal above. No undo, so this always requires an
// explicit confirm click; entryCount is the caller's own pre-computed count
// (how many weekend_planner_entries rows this specific action would delete).
function WeekendClearConfirmModal({ title, entryCount, saving, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-b-none p-5 sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>
        <p className="mt-3 text-sm text-ink">
          This removes {entryCount} assignment{entryCount === 1 ? '' : 's'}. This can&rsquo;t be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || entryCount === 0}
            className="btn-primary text-sm"
          >
            {saving ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Live status pill for a weekend's own coverage — Complete (success) / "N
// roles open" (flagAmber) / Empty (flagRed) — always derived fresh from
// weekendCoverageSummary rather than cached, so it updates the instant a
// role is filled or cleared. The mobile card's top-right pill (Part 3);
// desktop keeps its own existing "N gaps"/"Fully planned" chip unchanged.
function weekendStatusPill(coverage) {
  if (coverage.filledGroups === coverage.totalGroups) return { label: 'Complete', tone: 'success' }
  if (coverage.filledGroups === 0) return { label: 'Empty', tone: 'danger' }
  return { label: `${coverage.openGroups.length} role${coverage.openGroups.length === 1 ? '' : 's'} open`, tone: 'warning' }
}

// The month view's Legend — a live-count chip (real numbers, not a static
// swatch key, since "how many gaps right now" is worth surfacing without
// opening anything) shared by both viewports rather than each rolling its
// own. Doubles as the "How it works" entry point via LegendSheet's footer,
// replacing the separate Info icon each viewport used to render alongside
// this — one trigger, not two.
function MonthLegendTrigger({ counts, triggerClassName }) {
  return (
    <LegendSheet
      ruleBullets={RULE_BULLETS}
      trigger={onClick => (
        <button type="button" onClick={onClick} aria-label="Legend and how it works" className={triggerClassName}>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />{counts.complete} planned</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-flagAmber" />{counts.open} need staff</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-flagRed" />{counts.empty} empty</span>
        </button>
      )}
    >
      <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-success" /> Fully planned</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-flagAmber" /> Needs staff</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-flagRed" /> Empty</span>
      </div>
    </LegendSheet>
  )
}

// One role row on the mobile card (Part 3/5) — label left, value right,
// divider between rows (the parent's own divide-y). An unfilled role is a
// tappable amber "Open" pill (opens the doctor-add sheet, scoped to this
// weekend+group); an assigned doctor's name is itself tappable (opens the
// single-action "Remove from this weekend" sheet). A filled row still gets a
// small "+" trigger alongside the names — a category routinely holds 2-4
// doctors (e.g. 3-4 MOs on rotation together), and the "Open" pill alone
// only ever covered the very first name; without this there was no way to
// add a second one short of removing everyone and starting over.
function MobileRoleRow({ group, groupEntries, doctorById, displayNames, isAdmin, onOpenPicker, onOpenRemove }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="text-sm text-ink-muted">{group.label}</span>
      {groupEntries.length === 0 ? (
        isAdmin ? (
          <button
            type="button"
            onClick={onOpenPicker}
            className="rounded-full bg-flagAmber-bg px-2.5 py-1 text-xs font-medium text-flagAmber transition-colors hover:opacity-80"
          >
            Open
          </button>
        ) : (
          <span className="rounded-full bg-flagAmber-bg px-2.5 py-0.5 text-xs font-medium text-flagAmber">Open</span>
        )
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          {groupEntries.map(entry => {
            const doctor = doctorById.get(entry.profile_id)
            const name = doctor ? (displayNames.get(doctor.id) ?? doctor.surname) : '(unknown)'
            return isAdmin ? (
              <button
                key={entry.id}
                type="button"
                onClick={() => onOpenRemove(entry)}
                className="text-sm text-ink underline decoration-dotted underline-offset-2 hover:text-accent"
              >
                {name}
              </button>
            ) : (
              <span key={entry.id} className="text-sm text-ink">{name}</span>
            )
          })}
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenPicker}
              aria-label={`Add another doctor to ${group.label}`}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent hover:opacity-80"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Part 5's doctor picker, rebuilt: a category dropdown (switchable, not a
// fixed groupKey passed in from outside) plus a checkbox multi-select list,
// so opening it from either the card-level "Add doctor" button (no category
// preselected — the admin picks one) or a specific role row's "Open"/"+"
// (that row's category preselected, still changeable) lands on the same
// sheet. Multi-select matters because a category routinely holds several
// doctors at once (3-4 MOs on rotation together): the original one-tap-then-
// close picker meant re-opening it once per name. Candidates still come from
// the date-aware resolveWeekendCategoryForDoctor (Part 10), not a static
// category field, so a copied-over EC/OT rotation is reflected immediately.
// Deliberately no eligibility/conflict filtering beyond "not already
// assigned this weekend" (leave conflicts, hour caps — out of scope for this
// pass, already flagged as separate future work).
function WeekendAddDoctorsSheet({ saturday, initialGroupKey, doctors, assignedIds, rotationsByDoctorId, onAdd, onClose }) {
  const [groupKey, setGroupKey] = useState(initialGroupKey)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const group = CATEGORY_GROUPS.find(g => g.key === groupKey)
  const candidates = doctors
    .filter(d => !assignedIds.has(d.id))
    .map(d => ({ doctor: d, ...resolveWeekendCategoryForDoctor({ doctor: d, targetDate: saturday, rotationsByDoctorId }) }))
    .filter(r => r.groupKey === groupKey)
    .sort((a, b) => a.doctor.surname.localeCompare(b.doctor.surname))

  function changeGroup(key) {
    setGroupKey(key)
    setSelectedIds(new Set())
  }
  function toggle(doctorId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(doctorId)) next.delete(doctorId)
      else next.add(doctorId)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={onClose}>
      <div className="card flex w-full max-w-sm flex-col rounded-b-none p-4 sm:max-h-[75vh] sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">Add doctor — {formatWeekendRange(saturday)}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>

        <div className="mt-3">
          <label htmlFor="add-doctor-category" className="label-text">Category</label>
          <select
            id="add-doctor-category"
            className="input-field mt-1 w-full text-sm"
            value={groupKey}
            onChange={e => changeGroup(e.target.value)}
          >
            {CATEGORY_GROUPS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>

        <div className="mt-3 max-h-[50vh] flex-1 divide-y divide-slate-line overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-4 text-sm text-ink-muted">No eligible doctors available for {group?.label}.</p>
          ) : candidates.map(({ doctor, resolved }) => (
            <label
              key={doctor.id}
              className="flex w-full cursor-pointer items-center justify-between gap-2 px-1 py-2.5 text-left text-sm text-ink hover:bg-canvas-sunken"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(doctor.id)}
                  onChange={() => toggle(doctor.id)}
                  className="h-4 w-4 rounded border-slate-line text-accent focus:ring-accent"
                />
                {doctor.name} {doctor.surname}
              </span>
              {!resolved && <Tag variant="status" tone="warning">Needs rotation record</Tag>}
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onAdd(groupKey, [...selectedIds])}
          disabled={selectedIds.size === 0}
          className="btn-primary mt-3 w-full text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add {selectedIds.size > 0 ? selectedIds.size : ''} doctor{selectedIds.size === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}

// Part 5's "tap an assigned name" sheet — one action only (no swap-doctor:
// considered and explicitly rejected, remove-then-reassign covers it).
function WeekendRemoveDoctorSheet({ entry, doctor, saturday, groupLabel, onRemove, onClose }) {
  return (
    <ActionSheet title={`${doctor ? `${doctor.name} ${doctor.surname}` : 'Doctor'} — ${groupLabel}, ${formatWeekendRange(saturday)}`} onClose={onClose}>
      <ActionSheetButton danger icon={<Trash2 className="h-4 w-4" />} onClick={() => onRemove(entry.id)}>
        Remove from this weekend
      </ActionSheetButton>
    </ActionSheet>
  )
}

// Part 6's per-card ⋮ menu — Copy/Paste/Clear for exactly this weekend,
// reusing the same copyWeekend/openWeekendPaste/setClearWeekendTarget
// mutation functions the desktop inspector already uses (see
// WeekendPlannerView's own file-level comment), not a parallel mobile
// implementation.
function WeekendCardMenu({ saturday, hasClipboard, isSourceCard, canCopy, onCopy, onPaste, onClear, onClose }) {
  return (
    <ActionSheet title={formatWeekendRange(saturday)} onClose={onClose}>
      <ActionSheetButton icon={<Copy className="h-4 w-4" />} disabled={!canCopy} onClick={onCopy}>Copy weekend</ActionSheetButton>
      <ActionSheetButton icon={<ClipboardPaste className="h-4 w-4" />} disabled={!hasClipboard || isSourceCard} onClick={onPaste}>Paste here</ActionSheetButton>
      <ActionSheetButton danger icon={<Trash2 className="h-4 w-4" />} disabled={!canCopy} onClick={onClear}>Clear weekend</ActionSheetButton>
    </ActionSheet>
  )
}


// The Weekend Planner's grid + edit logic, factored out of WeekendPlannerPage
// so it can render both at its own /weekend route (unchanged nav entry) and
// nested inside the Leave page's "Planners" tab group — per the Planners-tabs
// restructure, without duplicating the assign/remove logic in two places.
// Callers own the page-level heading/locum-redirect; this is just the
// review-log button + rules + grid.
//
// Two genuinely different layouts share the same data/state below, not one
// layout stretched wider: mobile (lg:hidden) keeps the month-at-a-time card
// list from the earlier mobile-first redesign; desktop (hidden lg:block) is
// a weekend-first summary table + inspector, per a desktop UX review that
// flagged the previous desktop attempt (category-first columns, full-row
// parity tinting competing with warning states, an always-editable
// inspector) as fighting its own content instead of supporting it. Rows stay
// neutral/white; parity is a small labelled badge, not a background; a
// dedicated Status column ("Fully planned" / "N gaps") replaces the old
// inline pink pill; and the inspector defaults to a read-only summary with
// editing behind an explicit "Edit assignments" action. Still a fixed
// two-pane split (not drag-resizable) and still one month at a time — those
// scope cuts from the previous round stand.
// initialYear/initialMonth seed the starting viewYear/viewMonth instead of
// always defaulting to today — set when WeekendPlanner.jsx opens this from
// its year overview at a specific month, possibly outside today's default
// fetch window (a past/future year an admin navigated to); goToMonth widens
// the fetch on demand so browsing freely from there (in either direction,
// same as the year overview itself) doesn't run out of loaded months.
// onBackToYear,
// when present, renders a "← Overview" link back to that overview (matching
// MonthWorkspace.jsx's own back-link wording) — absent
// when this is reached directly (the standalone /weekend route, or a caller
// with no year overview of its own).
export default function WeekendPlannerView({ initialYear, initialMonth, onBackToYear, clipboard, setClipboard } = {}) {
  const { isAdmin, isClerk, canSubmitLeave, profile } = useAuth()
  const [doctors, setDoctors] = useState([])
  const [rotationsByDoctorId, setRotationsByDoctorId] = useState(new Map())
  const [entries, setEntries] = useState([])
  const [myWeekendRequests, setMyWeekendRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showChangeLog, setShowChangeLog] = useState(false)
  // Which weekend+group's add-doctor sheet is open — shared by the mobile
  // card's own Open pill/+ triggers and the desktop inspector's per-category
  // + trigger alike (both funnel through WeekendAddDoctorsSheet now, not two
  // separate edit mechanisms).
  const [openRolePicker, setOpenRolePicker] = useState(null) // { saturday, groupKey } or null
  const [removeSheetEntry, setRemoveSheetEntry] = useState(null) // { entry, saturday, groupLabel } or null
  const [cardMenuSaturday, setCardMenuSaturday] = useState(null) // which card's ⋮ menu is open, or null
  // An admin's default concern is the whole roster, not their own rotation
  // (they may not even be on it) — lands on "All weekends" rather than
  // sharing non-admins' "My weekends" default, matching ADMIN_FILTERS
  // leading with the same chip above.
  const [filter, setFilter] = useState(isAdmin || isClerk ? 'all' : 'mine')
  const [searchQuery, setSearchQuery] = useState('') // desktop-only: filter grid rows by assigned surname
  const [selectedSaturday, setSelectedSaturday] = useState(null) // desktop-only: which row the inspector shows
  const [detailSaturday, setDetailSaturday] = useState(null) // mobile-only: which card's read-only quick-glance sheet is open
  // Copy/Paste/Clear (admin-only) — clipboard/setClipboard are owned by
  // WeekendPlanner.jsx (the orchestrator), not local state here: this
  // component unmounts every time the admin switches back to the year
  // overview (a genuinely different child of that orchestrator, not just a
  // hidden one), which would otherwise silently drop whatever was copied —
  // e.g. copy August, check the year overview, open June to paste into.
  // Lifting it one level up means it survives that round trip, only
  // resetting on an actual full page reload (never persisted further than
  // that, same "this session" scope as before). { granularity:
  // 'weekend'|'month'|'quarter', sourceLabel, months } — months is always
  // an array of "month blocks" (each an array of that month's
  // weekends-by-position, each a list of {groupKey,profileId,category}
  // entries) so planWeekendPasteAcrossMonths handles all three granularities
  // uniformly: weekend = 1 block of 1 weekend, month = 1 block, quarter = 3
  // blocks (see copyWeekend/copyMonth/copyQuarter below).
  const [pasteTarget, setPasteTarget] = useState(null) // { months, label } or null — which paste-confirmation modal (if any) is open
  const [showClearMonthModal, setShowClearMonthModal] = useState(false)
  const [showClearQuarterModal, setShowClearQuarterModal] = useState(false)
  const [clearWeekendTarget, setClearWeekendTarget] = useState(null) // saturday string or null
  // The post-action Undo toast — every mutating action (single add/remove,
  // paste, clear, any granularity) sets this so the common "just did
  // something, tap Undo now" case is one tap away, right where the action
  // happened. Reaching further back than the single most recent action is
  // the Review log's job (WeekendPlannerChangeLogModal's "Recent actions"
  // panel) — that one already restores any recent batch, not just the
  // latest, persists across reloads, and now has its own confirm step, so
  // there's no separate in-page history to duplicate it. Deliberately NOT
  // persisted (no sessionStorage/localStorage) and reset whenever the
  // signed-in profile changes (see the effect below) — both a real page
  // reload AND an admin switching accounts in the same tab must start with
  // no pending toast, since Paul's undo must never be able to revert
  // George's action or vice versa.
  const [lastAction, setLastAction] = useState(null) // { batchId, label } or null
  const [toastVisible, setToastVisible] = useState(false)
  const [undoing, setUndoing] = useState(false)
  useEffect(() => { setLastAction(null); setToastVisible(false) }, [profile?.id])
  const today = todayStr()
  const [viewYear, setViewYear] = useState(() => initialYear ?? Number(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => initialMonth ?? Number(today.slice(5, 7)))

  // The Requests planner tab only exists for admins (approval queue) and
  // doctors (their own history) — matches the same condition LeavePlannerPage
  // uses to decide whether to render that tab at all, so "View requests"
  // never links somewhere that redirects the visitor elsewhere.
  const canViewRequests = isAdmin || canSubmitLeave

  const filters = isAdmin ? ADMIN_FILTERS : isClerk ? CLERK_FILTERS : FILTERS_BASE

  // What's actually fetched — a window around whichever month is being
  // viewed, not the whole calendar (year view's own fetch, in
  // WeekendPlanner.jsx, already covers a full year on its own; duplicating
  // that here for every month visited would be wasteful). Starts as today
  // through WEEKS_AHEAD later by default (the common "just landed on
  // /weekend" case wants a planning runway, not history), widened to also
  // cover initialYear/initialMonth's whole month when that's seeded from
  // further away (the year overview's "Open month" action) — otherwise the
  // very month this opens on could itself be outside what's loaded.
  // Navigating further than this window, in either direction, re-centres it
  // on the newly-viewed month instead (goToMonth below) rather than it ever
  // growing without bound.
  const [fetchBounds, setFetchBounds] = useState(() => {
    const seededBounds = initialYear && initialMonth ? monthBounds(initialYear, initialMonth) : null
    const defaultThroughDate = addDays(today, WEEKS_AHEAD * 7)
    return {
      from: seededBounds && seededBounds.start < today ? seededBounds.start : today,
      through: seededBounds && seededBounds.end > defaultThroughDate ? seededBounds.end : defaultThroughDate,
    }
  })

  useEffect(() => { load() }, [fetchBounds]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; fetchBounds is the only input that should trigger a refetch

  async function load() {
    setLoading(true)
    setError('')

    const [profilesRes, entriesRes, myRequestsRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, category, contract_type')
        .eq('is_approved', true).eq('is_active', true),
      supabase.from('weekend_planner_entries').select('id, weekend_saturday, profile_id, category')
        .gte('weekend_saturday', fetchBounds.from).lte('weekend_saturday', fetchBounds.through),
      supabase.from('leave_requests').select('id, date_from, status')
        .eq('profile_id', profile?.id ?? '').eq('leave_type', 'weekend_exception')
        .gte('date_from', fetchBounds.from).lte('date_from', fetchBounds.through),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (entriesRes.error) { setError(entriesRes.error.message); setLoading(false); return }
    if (myRequestsRes.error) { setError(myRequestsRes.error.message); setLoading(false); return }

    const rotationEligibleDoctors = (profilesRes.data || []).filter(p => groupForCategory(resolvedCategoryForDoctor(p)))
    setDoctors(rotationEligibleDoctors)
    setEntries(entriesRes.data || [])
    setMyWeekendRequests(myRequestsRes.data || [])
    setLoading(false)

    // Batch-fetched ONCE for every rotation-eligible doctor here, then
    // resolved client-side per weekend via resolveWeekendCategoryForDoctor
    // — not one RPC call per doctor per picker open (see that function's
    // own comment in weekendPlanner.js). Awaited separately from the main
    // load above so a slow/failed rotations fetch never blocks the planner
    // grid itself from rendering; a resolver call with no matching rows
    // just falls back to the doctor's plain base category (resolved:false).
    try {
      const rotations = await fetchInternRotationsForDoctorIds(rotationEligibleDoctors.map(d => d.id))
      setRotationsByDoctorId(groupRotationsByDoctorId(rotations))
    } catch {
      setRotationsByDoctorId(new Map())
    }
  }

  const saturdays = useMemo(
    () => saturdaysInRange(fetchBounds.from, fetchBounds.through),
    [fetchBounds]
  )
  const byWeekend = useMemo(() => groupEntriesByWeekend(entries), [entries])
  const doctorById = useMemo(() => new Map(doctors.map(d => [d.id, d])), [doctors])
  // Surname alone, unless it collides with another rotation-eligible
  // doctor (any category — MO/Registrar/EC/OT all share one namespace
  // here), in which case a first initial (or, if that collides too, the
  // full first name) disambiguates — see buildDoctorDisplayNames.
  const displayNames = useMemo(() => buildDoctorDisplayNames(doctors), [doctors])
  const activeDoctorIds = useMemo(() => new Set(doctors.map(d => d.id)), [doctors])
  const myRequestsBySaturday = useMemo(() => weekendExceptionRequestsBySaturday(myWeekendRequests), [myWeekendRequests])

  // Free browsing in either direction, matching the year overview's own
  // unbounded prev/next — widens (re-centres, really) fetchBounds the
  // moment navigation lands on a month outside what's currently loaded, so
  // there's no artificial edge to hit the way the old fixed rolling window
  // had one. A month already inside fetchBounds is a no-op state update
  // (same object reference back), so stepping through already-loaded months
  // doesn't refetch on every click.
  function goToMonth(newYear, newMonth) {
    const target = monthBounds(newYear, newMonth)
    setFetchBounds(prev => (target.start >= prev.from && target.end <= prev.through) ? prev : boundsAroundMonth(newYear, newMonth))
    setViewYear(newYear)
    setViewMonth(newMonth)
  }

  // Part 9's banner action — jumps to nextOpenWeekend's month if it isn't
  // already in view, and switches to "Needs planning" (clearing search) so
  // the target card is guaranteed to actually render there rather than
  // being hidden by whatever filter/search happened to be active. The
  // scroll-into-view + picker-open itself happens in the effect above,
  // once the target card exists in the DOM.
  function handlePlanNextOpenWeekend() {
    if (!nextOpenWeekend) return
    const y = Number(nextOpenWeekend.slice(0, 4))
    const m = Number(nextOpenWeekend.slice(5, 7))
    if (y !== viewYear || m !== viewMonth) goToMonth(y, m)
    if (filter !== 'needs-planning') setFilter('needs-planning')
    if (searchQuery) setSearchQuery('')
    setPendingFocusSaturday(nextOpenWeekend)
  }

  // Only Saturdays actually in the fetched window are shown — this
  // naturally excludes both already-passed weekends this month (the fetch
  // starts from today) and anything beyond the fetch's runway, without
  // separate min/max bounds logic.
  const fetchedSet = useMemo(() => new Set(saturdays), [saturdays])
  const monthSaturdays = useMemo(
    () => saturdaysInMonth(viewYear, viewMonth).filter(s => fetchedSet.has(s)),
    [viewYear, viewMonth, fetchedSet]
  )
  // Total assignments currently on the board across the viewed month — the
  // "Clear month" button's disabled state and the confirm modal's count.
  const monthEntryCount = useMemo(
    () => monthSaturdays.reduce((sum, s) => sum + Object.values(byWeekend.get(s) || {}).flat().length, 0),
    [monthSaturdays, byWeekend]
  )
  // Same, across the quarter starting at the viewed month — "Clear
  // quarter"'s disabled state and confirm-modal count.
  const quarterEntryCount = useMemo(
    () => quarterMonthsFrom(viewYear, viewMonth).reduce((sum, { year, month }) =>
      sum + saturdaysInMonth(year, month).filter(s => fetchedSet.has(s)).reduce((s2, s) => s2 + Object.values(byWeekend.get(s) || {}).flat().length, 0), 0),
    [viewYear, viewMonth, fetchedSet, byWeekend]
  )
  // Part 4's compact coverage indicator — dot+count per status, across the
  // viewed month (not the search/filter-narrowed list, so it always reads
  // as "the whole month's state" regardless of what's currently filtered).
  const monthStatusCounts = useMemo(() => {
    let complete = 0, open = 0, empty = 0
    for (const s of monthSaturdays) {
      const cov = weekendCoverageSummary(byWeekend.get(s))
      if (cov.filledGroups === cov.totalGroups) complete++
      else if (cov.filledGroups === 0) empty++
      else open++
    }
    return { complete, open, empty }
  }, [monthSaturdays, byWeekend])

  const visibleSaturdays = monthSaturdays.filter(saturday => {
    const bySaturday = byWeekend.get(saturday)
    if (filter === 'needs-planning') return weekendCoverageSummary(bySaturday).openGroups.length > 0
    if (filter === 'mine') return isProfileAssignedToWeekend(bySaturday, profile?.id)
    if (filter === 'my-requests') return myRequestsBySaturday.has(saturday)
    return true
  })

  // The surname search (shared Toolbar, both breakpoints) narrows the
  // visible weekends further still (any doctor assigned to that weekend, in
  // any group), on top of whichever filter chip is active.
  const searchTerm = searchQuery.trim().toLowerCase()
  const searchedSaturdays = !searchTerm ? visibleSaturdays : visibleSaturdays.filter(saturday => {
    const bySaturday = byWeekend.get(saturday) || {}
    return Object.values(bySaturday).flat().some(e => doctorById.get(e.profile_id)?.surname?.toLowerCase().includes(searchTerm))
  })

  const nextWeekend = nextWeekendSaturday(today)
  const nextWeekendCoverage = weekendCoverageSummary(byWeekend.get(nextWeekend))
  const nextWeekendMine = isProfileAssignedToWeekend(byWeekend.get(nextWeekend), profile?.id)
  const nextWeekendScheme = weekendColorScheme(nextWeekend)

  // Part 9's "Plan next open weekend" shortcut — the first FUTURE weekend
  // (today or later; date order) with ANY open role, across the whole
  // fetched window (not just the currently viewed month/filter),
  // recomputed on every entries/saturdays change so it's never a stale
  // target once a role gets filled. `saturdays` itself can widen to
  // include past dates once an admin navigates to view a past month (see
  // fetchFromDate above) — filtering to `>= today` here is what keeps this
  // always pointing forward instead of surfacing an already-passed,
  // never-filled weekend as if it still needed planning.
  const nextOpenWeekend = useMemo(
    () => saturdays.find(s => s >= today && weekendCoverageSummary(byWeekend.get(s)).openGroups.length > 0) ?? null,
    [saturdays, byWeekend, today]
  )
  const nextOpenWeekendCoverage = nextOpenWeekend ? weekendCoverageSummary(byWeekend.get(nextOpenWeekend)) : null
  const nextOpenWeekendScheme = nextOpenWeekend ? weekendColorScheme(nextOpenWeekend) : null
  const cardRefs = useRef(new Map())
  // Set right after navigating to nextOpenWeekend's month (if it isn't
  // already the one in view) — the effect below waits for that card to
  // actually exist in the DOM (the month switch re-renders the list from
  // already-fetched data, no loading spinner) before scrolling to it and
  // opening its first open role's picker in one motion.
  const [pendingFocusSaturday, setPendingFocusSaturday] = useState(null)
  useEffect(() => {
    if (!pendingFocusSaturday) return
    const node = cardRefs.current.get(pendingFocusSaturday)
    if (!node) return // month switch hasn't re-rendered this card yet — effect re-fires once searchedSaturdays changes
    // Optional call — jsdom (this app's test environment) doesn't implement
    // scrollIntoView at all, unlike every real browser.
    node.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    const firstOpenGroup = weekendCoverageSummary(byWeekend.get(pendingFocusSaturday)).openGroups[0]
    if (firstOpenGroup) setOpenRolePicker({ saturday: pendingFocusSaturday, groupKey: firstOpenGroup })
    setPendingFocusSaturday(null)
    // searchedSaturdays is a deliberate extra dep, not read in the body —
    // it's what makes this effect re-fire once a month switch re-renders
    // the list, so it can catch the target card mounting.
  }, [pendingFocusSaturday, searchedSaturdays, byWeekend])

  // The inspector defaults to Next weekend when it's in view, so the most
  // urgent question is answered the moment the page loads — otherwise the
  // first visible row, and whatever the admin last clicked as long as it's
  // still in view after a filter/search/month change.
  const inspectorSaturday = (selectedSaturday && searchedSaturdays.includes(selectedSaturday))
    ? selectedSaturday
    : (searchedSaturdays.includes(nextWeekend) ? nextWeekend : searchedSaturdays[0]) ?? null

  // Doctors already placed SOMEWHERE this weekend (any group) — the DB's
  // unique(weekend_saturday, profile_id) means a doctor can only fill one
  // slot per weekend, so they're excluded from every group's picker once
  // placed, not just their own.
  function assignedDoctorIds(saturday) {
    const bySaturday = byWeekend.get(saturday)
    if (!bySaturday) return new Set()
    return new Set(Object.values(bySaturday).flat().map(e => e.profile_id))
  }

  // Patches local state directly from the write's own result rather than
  // reloading — load() flips `loading` back to true, which unmounts the
  // whole grid for a "Loading…" placeholder. One shared batchId across
  // every profile added in the same submit (behind WeekendAddDoctorsSheet,
  // both viewports' now-only add mechanism), so adding 3 MOs in one go is a
  // single undoable action, not 3 — see deleteEntries/insertEntries below
  // for why every write, single or bulk, is tagged this way.
  async function addEntries(saturday, groupKey, profileIds) {
    if (profileIds.length === 0) return
    const toInsert = profileIds.map(profileId => {
      const doctor = doctorById.get(profileId)
      const { category } = resolveWeekendCategoryForDoctor({ doctor, targetDate: saturday, rotationsByDoctorId })
      return { weekendSaturday: saturday, profileId, category }
    })
    setSaving(true)
    const batchId = crypto.randomUUID()
    const ok = await insertEntries(toInsert, batchId)
    setSaving(false)
    if (!ok) return
    const group = CATEGORY_GROUPS.find(g => g.key === groupKey)
    const label = profileIds.length === 1
      ? `Added ${displayNames.get(profileIds[0]) ?? 'doctor'} to ${group?.label ?? groupKey} (${formatWeekendRange(saturday)})`
      : `Added ${profileIds.length} doctors to ${group?.label ?? groupKey} (${formatWeekendRange(saturday)})`
    pushUndo(batchId, label)
  }

  async function removeEntry(entryId) {
    setSaving(true)
    const removed = entries.find(e => e.id === entryId)
    const { error: err } = await supabase.from('weekend_planner_entries').delete().eq('id', entryId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEntries(prev => prev.filter(e => e.id !== entryId))
    if (removed) {
      const batchId = crypto.randomUUID()
      await logWeekendPlannerChange({
        weekendSaturday: removed.weekend_saturday, category: removed.category, action: 'remove',
        profileId: removed.profile_id, changedBy: profile?.id ?? null, batchId,
      })
      const group = CATEGORY_GROUPS.find(g => g.key === groupForCategory(removed.category))
      pushUndo(batchId, `Removed ${displayNames.get(removed.profile_id) ?? 'doctor'} from ${group?.label ?? removed.category} (${formatWeekendRange(removed.weekend_saturday)})`)
    }
  }

  // Bulk-write helpers behind Copy/Paste and Clear weekend/month/quarter —
  // same "patch local state from the write's own result, log one
  // weekend_planner_changes row per affected entry" pattern as
  // addEntry/removeEntry above, just batched under a single shared batchId
  // per call (the caller generates it once and passes it into both, when a
  // paste needs both a delete and an insert leg — see handleConfirmPaste).
  // Reuses the existing 'add'/'remove' actions (weekend_planner_changes.action
  // has a CHECK constraint limited to exactly those two values) rather than
  // introducing a new bulk-specific action. Return a boolean so callers can
  // decide whether to proceed to a dependent second write.
  async function deleteEntries(entriesToDelete, batchId) {
    if (entriesToDelete.length === 0) return true
    const ids = entriesToDelete.map(e => e.id)
    const { error: err } = await supabase.from('weekend_planner_entries').delete().in('id', ids)
    if (err) { setError(err.message); return false }
    const idSet = new Set(ids)
    setEntries(prev => prev.filter(e => !idSet.has(e.id)))
    await Promise.all(entriesToDelete.map(e => logWeekendPlannerChange({
      weekendSaturday: e.weekend_saturday, category: e.category, action: 'remove',
      profileId: e.profile_id, changedBy: profile?.id ?? null, batchId,
    })))
    return true
  }

  async function insertEntries(toInsert, batchId) {
    if (toInsert.length === 0) return true
    const payload = toInsert.map(t => ({
      weekend_saturday: t.weekendSaturday, profile_id: t.profileId, category: t.category, created_by: profile?.id ?? null,
    }))
    const { data, error: err } = await supabase.from('weekend_planner_entries').insert(payload).select()
    if (err) { setError(err.message); return false }
    setEntries(prev => [...prev, ...(data || [])])
    await Promise.all(toInsert.map(t => logWeekendPlannerChange({
      weekendSaturday: t.weekendSaturday, category: t.category, action: 'add',
      profileId: t.profileId, changedBy: profile?.id ?? null, batchId,
    })))
    return true
  }

  // One weekend's own { saturday, entries } — entries in the
  // {groupKey,profileId,category} shape planWeekendPaste uses. The
  // saturday itself travels with its entries (not just their position in
  // the copied month) because planWeekendPaste now matches by real
  // calendar parity, not raw position — see its own comment. Shared by
  // copyWeekend/copyMonth/copyQuarter below.
  function weekendClipboardEntries(saturday) {
    const bySaturday = byWeekend.get(saturday) || {}
    const entries = Object.entries(bySaturday).flatMap(([groupKey, groupEntries]) =>
      groupEntries.map(e => ({ groupKey, profileId: e.profile_id, category: e.category }))
    )
    return { saturday, entries }
  }

  function copyWeekend(saturday) {
    setClipboard({
      granularity: 'weekend', sourceLabel: formatWeekendRange(saturday), sourceSaturday: saturday,
      months: [[weekendClipboardEntries(saturday)]],
    })
  }

  // Each weekend keeps its own saturday alongside its entries (see
  // weekendClipboardEntries) — planWeekendPasteAcrossMonths matches by real
  // calendar parity rather than position, so pasting into a month with a
  // different weekend count still lands each group on the correct parity.
  function copyMonth() {
    const weekends = monthSaturdays.map(weekendClipboardEntries)
    setClipboard({ granularity: 'month', sourceLabel: `${MONTH_LABELS[viewMonth - 1]} ${viewYear}`, months: [weekends] })
  }

  // Same idea, one step up: 3 consecutive months (the currently viewed one,
  // plus the next 2), each kept as its OWN position-mapped block rather
  // than flattened into one long list — see planWeekendPasteAcrossMonths's
  // own file-level comment for why that distinction matters (it's what
  // keeps Jan's pattern landing on Apr, Feb's on May, Mar's on Jun, instead
  // of drifting out of alignment the moment any month in between has a
  // different weekend count).
  function copyQuarter() {
    const quarterMonths = quarterMonthsFrom(viewYear, viewMonth)
    const months = quarterMonths.map(({ year, month }) =>
      saturdaysInMonth(year, month).filter(s => fetchedSet.has(s)).map(weekendClipboardEntries)
    )
    setClipboard({ granularity: 'quarter', sourceLabel: quarterLabel(quarterMonths), months })
  }

  function openWeekendPaste(saturday) {
    setPasteTarget({ months: [[saturday]], label: formatWeekendRange(saturday) })
  }
  function openMonthPaste() {
    setPasteTarget({ months: [monthSaturdays], label: `${MONTH_LABELS[viewMonth - 1]} ${viewYear}` })
  }
  function openQuarterPaste() {
    const quarterMonths = quarterMonthsFrom(viewYear, viewMonth)
    setPasteTarget({
      months: quarterMonths.map(({ year, month }) => saturdaysInMonth(year, month).filter(s => fetchedSet.has(s))),
      label: quarterLabel(quarterMonths),
    })
  }

  // Delete-then-insert order matters for 'overwrite' mode: plan.toDelete
  // clears every existing entry on each target weekend (freeing up
  // unique(weekend_saturday, profile_id) for a copied profile who'd
  // otherwise still collide with their own pre-paste row) before
  // plan.toInsert writes the copied set. Both legs share ONE batchId so
  // the whole paste — deletes and inserts together — restores as a single
  // "Undo," not weekend-by-weekend. An overwrite that actually deleted
  // something gets the post-action Undo toast; a plain fill-empty paste
  // (nothing lost) doesn't need one — it's still individually restorable
  // from the Recent actions panel like everything else. Clipboard is
  // deliberately left populated afterward — the same copied source is a
  // reasonable thing to paste into more than one target in a row.
  // Records the most recent mutating action and surfaces the toast for it
  // — the single call every action above/below routes through, so the
  // toast can never drift out of sync with what actually just happened.
  function pushUndo(batchId, label) {
    setLastAction({ batchId, label })
    setToastVisible(true)
  }

  // The toast's own action — identical to "Restore this" in
  // WeekendPlannerChangeLogModal's Recent actions list (which also now
  // confirms before writing), just triggered inline right after the
  // action instead of from the review log. Calls restoreWeekendPlannerBatch
  // with nothing but the batchId (see changeLog.js for why it re-fetches
  // everything fresh rather than trusting this component's own
  // already-loaded state) — the restore logic is identical either way.
  async function undoLastAction() {
    if (!lastAction) return
    setUndoing(true)
    const result = await restoreWeekendPlannerBatch({ batchId: lastAction.batchId, changedBy: profile?.id ?? null })
    setUndoing(false)
    if (result.error) { setError(result.error); setToastVisible(false); return }
    setLastAction(null)
    setToastVisible(false)
    await load()
  }

  async function handleConfirmPaste(plan) {
    setSaving(true)
    const batchId = crypto.randomUUID()
    const deleteOk = await deleteEntries(plan.toDelete, batchId)
    if (deleteOk) await insertEntries(plan.toInsert, batchId)
    setSaving(false)
    const label = `Pasted into ${pasteTarget.label}${plan.toDelete.length > 0 ? ' (overwrite)' : ''}`
    setPasteTarget(null)
    if (plan.toDelete.length > 0 || plan.toInsert.length > 0) pushUndo(batchId, label)
  }

  async function handleConfirmClearMonth() {
    setSaving(true)
    const batchId = crypto.randomUUID()
    const toDelete = monthSaturdays.flatMap(s => Object.values(byWeekend.get(s) || {}).flat())
    await deleteEntries(toDelete, batchId)
    setSaving(false)
    setShowClearMonthModal(false)
    if (toDelete.length > 0) pushUndo(batchId, `Cleared ${MONTH_LABELS[viewMonth - 1]} ${viewYear}`)
  }

  async function handleConfirmClearQuarter() {
    setSaving(true)
    const batchId = crypto.randomUUID()
    const quarterMonths = quarterMonthsFrom(viewYear, viewMonth)
    const toDelete = quarterMonths.flatMap(({ year, month }) =>
      saturdaysInMonth(year, month).filter(s => fetchedSet.has(s)).flatMap(s => Object.values(byWeekend.get(s) || {}).flat())
    )
    await deleteEntries(toDelete, batchId)
    setSaving(false)
    setShowClearQuarterModal(false)
    if (toDelete.length > 0) pushUndo(batchId, `Cleared ${quarterLabel(quarterMonths)}`)
  }

  async function handleConfirmClearWeekend() {
    setSaving(true)
    const batchId = crypto.randomUUID()
    const toDelete = Object.values(byWeekend.get(clearWeekendTarget) || {}).flat()
    const label = formatWeekendRange(clearWeekendTarget)
    await deleteEntries(toDelete, batchId)
    setSaving(false)
    setClearWeekendTarget(null)
    if (toDelete.length > 0) pushUndo(batchId, `Cleared ${label}`)
  }

  // Weekend's page-level "More actions" kebab (PageActionsMenu) — the bulk
  // Copy/Clear month+quarter actions as one group, Review log as its own
  // group after a divider (previously a separate always-visible button on
  // both viewports; now this menu's one home instead of two entry points
  // to the same action). Shared by both viewports' own trigger instances.
  const weekendMenuItems = [
    { key: 'copy-month', icon: <Copy className="h-4 w-4" />, label: `Copy ${MONTH_LABELS[viewMonth - 1]}`, disabled: monthSaturdays.length === 0, onClick: copyMonth },
    { key: 'copy-quarter', icon: <Copy className="h-4 w-4" />, label: 'Copy quarter', disabled: monthSaturdays.length === 0, onClick: copyQuarter },
    { key: 'clear-month', icon: <Trash2 className="h-4 w-4" />, label: `Clear ${MONTH_LABELS[viewMonth - 1]}`, danger: true, disabled: monthEntryCount === 0, onClick: () => setShowClearMonthModal(true) },
    { key: 'clear-quarter', icon: <Trash2 className="h-4 w-4" />, label: 'Clear quarter', danger: true, disabled: quarterEntryCount === 0, onClick: () => setShowClearQuarterModal(true) },
    'divider',
    { key: 'review-log', icon: <ScrollText className="h-4 w-4" />, label: 'Review log', onClick: () => setShowChangeLog(true) },
  ]

  // `extra` renders right after the Today button (DateStepper's own
  // extension point) — different per viewport (mobile: the More actions
  // kebab; desktop: More Actions + the Legend trigger), so this stays a
  // function rather than one shared JSX constant.
  function renderMonthNav(extra) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {onBackToYear && (
          <button type="button" onClick={onBackToYear} className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink">
            ← Overview
          </button>
        )}
        <DateStepper unit="month" year={viewYear} month={viewMonth} onChange={goToMonth}>
          {extra}
        </DateStepper>
      </div>
    )
  }

  const defaultFilter = isAdmin || isClerk ? 'all' : 'mine'
  // A function, not a single element — mobile keeps this as its own
  // standalone row (default `mb-4` spacing), while desktop instead embeds
  // it as one flex item inline with the nav row below (`className=""`, its
  // own margin would just misalign against nav-row siblings that don't
  // carry one) — two different layouts sharing the same underlying search/
  // filter state, not two different controls.
  function renderToolbar(className) {
    return (
      <Toolbar
        compact
        className={className}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search name…"
        filterFacets={[{
          key: 'filter', icon: <Filter className="h-4 w-4" />, label: 'Filter',
          value: filter, onChange: setFilter,
          options: filters.map(f => ({ value: f.key, label: f.label })),
          isActive: filter !== defaultFilter,
        }]}
        active={Boolean(searchQuery) || filter !== defaultFilter}
        onClearAll={() => { setSearchQuery(''); setFilter(defaultFilter) }}
      />
    )
  }

  return (
    <div>
      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}

      {!loading && !error && (
        <>
          {/* ── Copy/Paste/Clear (admin-only), shared across mobile+desktop rather
              than duplicated per viewport — Copy/Clear month/quarter act on
              whichever month (or quarter starting from it) is currently
              viewed, both reached through the "More actions" kebab
              (PageActionsMenu, shared by both viewports — see
              weekendMenuItems above). The clipboard pill (once non-null) stays
              visible across month navigation so it's always clear what's
              copied and what "Paste" would currently target. Per-weekend
              Copy/Paste live on each weekend row itself (mobile card header
              / desktop inspector) instead, since there's no single "current
              weekend" here to infer a target from. ── */}

          {isAdmin && clipboard && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent-tint px-3 py-2 text-sm text-accent-dark">
              <span>📋 {clipboard.sourceLabel} copied{clipboard.granularity === 'weekend' ? ' — tap another weekend’s ⋮ menu to paste' : ''}</span>
              <div className="flex items-center gap-2">
                {clipboard.granularity === 'month' && (
                  <button type="button" onClick={openMonthPaste} className="btn-primary px-3 py-1 text-xs">
                    Paste into {MONTH_LABELS[viewMonth - 1]} {viewYear}
                  </button>
                )}
                {clipboard.granularity === 'quarter' && (
                  <button type="button" onClick={openQuarterPaste} className="btn-primary px-3 py-1 text-xs">
                    Paste into {quarterLabel(quarterMonthsFrom(viewYear, viewMonth))}
                  </button>
                )}
                <button type="button" onClick={() => setClipboard(null)} className="text-xs font-medium text-accent-dark underline hover:no-underline">
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* ── Mobile: month-at-a-time card list (unchanged from the earlier mobile-first redesign) ── */}
          <div className="lg:hidden" data-testid="weekend-mobile">
            {/* Search/Filter moved into the Toolbar FAB below phones
                (§15) — but this "mobile" block runs all the way to `lg`
                while FloatingActionMenu stops at `md`, so the md–lg band
                (tablets, most landscape phones) keeps the inline row it
                already had rather than losing search/filter entirely. */}
            <div className="mt-4 hidden md:block">{renderToolbar('mb-4')}</div>
            {/* Fixed-positioned, so where it sits in this block is
                immaterial — kept next to the toolbar row it replaces. The
                Legend trigger deliberately stays out of it (see the sticky
                row below: information, not an action), so `legend` is
                unused here. Search/Filter render for everyone, matching
                who the inline row served; only More is admin-gated, same
                as the kebab it replaces. */}
            <FloatingActionMenu
              search={{ value: searchQuery, onChange: setSearchQuery, placeholder: 'Search name…' }}
              filter={{
                facets: [{
                  key: 'filter', icon: <Filter className="h-4 w-4" />, label: 'Filter',
                  value: filter, onChange: setFilter,
                  options: filters.map(f => ({ value: f.key, label: f.label })),
                  isActive: filter !== defaultFilter,
                }],
                active: Boolean(searchQuery) || filter !== defaultFilter,
                onClearAll: () => { setSearchQuery(''); setFilter(defaultFilter) },
                sheetTitle: 'Filters',
              }}
              moreMenu={isAdmin ? { title: 'More actions', items: weekendMenuItems } : undefined}
            />
            {/* Two side-by-side panels: the literal next weekend (always
                shown) and, for admins, the nearest weekend (today or later)
                that still has an open role — which may or may not be the
                same weekend as the first panel. Each keeps its own
                parity-based color scheme (weekendColorScheme), since they
                can land on different weekends with different parities. */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <div className={`card flex-1 p-4 ${nextWeekendScheme.bg}`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next weekend</p>
                <p className={`mt-0.5 text-base font-semibold ${nextWeekendScheme.text}`}>{formatWeekendRange(nextWeekend)}</p>
                <p className="mt-1 text-sm text-ink-light">
                  {nextWeekendCoverage.filledGroups} of {nextWeekendCoverage.totalGroups} groups staffed
                  {nextWeekendCoverage.openGroups.length > 0 && (
                    <> — <span className="text-rose-dark">{nextWeekendCoverage.openGroups.map(k => CATEGORY_GROUPS.find(g => g.key === k)?.label).join(', ')} still open</span></>
                  )}
                </p>
                {nextWeekendMine && <p className="mt-1 text-sm font-medium text-accent">You&rsquo;re on rotation this weekend.</p>}
              </div>

              {isAdmin && nextOpenWeekend && (
                <div className={`card flex-1 p-4 ${nextOpenWeekendScheme.bg}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next weekend needing staff</p>
                  <p className={`mt-0.5 text-base font-semibold ${nextOpenWeekendScheme.text}`}>{formatWeekendRange(nextOpenWeekend)}</p>
                  <p className="mt-1 text-sm text-ink-light">
                    {nextOpenWeekendCoverage.filledGroups} of {nextOpenWeekendCoverage.totalGroups} groups planned
                  </p>
                  <button
                    type="button"
                    onClick={handlePlanNextOpenWeekend}
                    className="btn-primary mt-3 flex w-full items-center justify-center gap-1.5 text-sm"
                  >
                    Plan now <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Part 4's sticky mobile toolbar, pinned flush to the top of
                the viewport while scrolling — the Planners sub-nav
                (LeavePlannerPage.jsx) has its own separate sticky/
                hide-on-scroll behaviour shared across every planner tab
                (deliberately not touched here, since that's shared
                cross-tab chrome this rebuild doesn't own); this row simply
                sticks at top-0 in its own right rather than reserving space
                for wherever that sub-nav happens to be.
                Month nav + actions on their own row; the coverage-count
                Legend trigger is information, not an action, so it gets
                its own caption line below instead of competing with icon
                buttons for space in the same row. */}
            <div className="sticky top-0 z-10 -mx-4 mt-4 bg-canvas px-4 py-2 sm:mx-0 sm:rounded-lg sm:border sm:border-slate-line sm:bg-canvas-raised">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {renderMonthNav()}
                {/* Below `md` this kebab lives in the Toolbar FAB instead;
                    it stays here for the md–lg band, which the FAB doesn't
                    cover (see the toolbar row above). */}
                {isAdmin && (
                  <div className="hidden md:block">
                    <PageActionsMenu
                      items={weekendMenuItems}
                      trigger={(onClick, open) => (
                        <button
                          type="button"
                          onClick={onClick}
                          aria-label="More actions"
                          aria-expanded={open}
                          className={`icon-btn ${open ? 'icon-btn-active' : 'icon-btn-idle'}`}
                        >
                          <EllipsisVertical className="h-4 w-4" />
                        </button>
                      )}
                    />
                  </div>
                )}
              </div>
              <MonthLegendTrigger counts={monthStatusCounts} triggerClassName="mt-1.5 flex items-center gap-2.5 text-xs text-ink-muted hover:text-ink" />
            </div>

            <div data-testid="weekend-mobile-list" className="mt-3 space-y-3">
              {searchedSaturdays.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {monthSaturdays.length === 0 ? 'No weekends to plan in this month yet.' : 'No weekends match this filter/search.'}
                </p>
              ) : searchedSaturdays.map(saturday => {
                const bySaturday = byWeekend.get(saturday) || {}
                const coverage = weekendCoverageSummary(bySaturday)
                const myRequest = myRequestsBySaturday.get(saturday)
                const even = isEvenWeekend(saturday)
                const statusPill = weekendStatusPill(coverage)
                const isClipboardSource = clipboard?.granularity === 'weekend' && clipboard.sourceSaturday === saturday

                return (
                  <div
                    key={saturday}
                    ref={el => { if (el) cardRefs.current.set(saturday, el); else cardRefs.current.delete(saturday) }}
                    className={`card border-l-4 p-4 ${even ? 'border-l-groupEven' : 'border-l-groupOdd'} ${isClipboardSource ? 'ring-2 ring-accent' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {/* Tapping the date opens a read-only quick-glance sheet
                            (WeekendDetailSheet) — a condensed alternative to
                            scrolling this card's own always-expanded, fully
                            editable breakdown below, not a replacement for it. */}
                        <button
                          type="button"
                          onClick={() => setDetailSaturday(saturday)}
                          className="text-sm font-medium text-ink underline decoration-dotted underline-offset-2"
                        >
                          {formatWeekendRange(saturday)}
                        </button>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Wknd {monthSaturdays.indexOf(saturday) + 1} · {even ? 'Even' : 'Odd'}
                        </p>
                        {myRequest && (
                          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            {EXCEPTION_STATUS_LABEL[myRequest.status] ?? myRequest.status}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        <Tag variant="status" tone={statusPill.tone}>{statusPill.label}</Tag>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setCardMenuSaturday(saturday)}
                            aria-label={`More actions for weekend ${saturday}`}
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-ink-muted hover:bg-canvas-sunken"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 divide-y divide-slate-line">
                      {CATEGORY_GROUPS.map(group => (
                        <MobileRoleRow
                          key={group.key}
                          group={group}
                          groupEntries={bySaturday[group.key] || []}
                          doctorById={doctorById}
                          displayNames={displayNames}
                          isAdmin={isAdmin}
                          onOpenPicker={() => setOpenRolePicker({ saturday, groupKey: group.key })}
                          onOpenRemove={entry => setRemoveSheetEntry({ entry, saturday, groupLabel: group.label })}
                        />
                      ))}
                    </div>

                    {/* Always available, not just while a category is still
                        completely empty — this is the "pick a category, then
                        candidates" entry point (WeekendAddDoctorsSheet's own
                        dropdown), for topping up a category that already has
                        names as much as for filling a blank one. Defaults to
                        the first still-open category when there is one, but
                        stays fully changeable from the sheet itself. */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setOpenRolePicker({ saturday, groupKey: coverage.openGroups[0] ?? CATEGORY_GROUPS[0].key })}
                        className="btn-primary mt-3 w-full text-sm"
                      >
                        Add doctor
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Desktop: weekend-first summary table + inspector (see file-level comment for rationale) ── */}
          <div className="hidden lg:block" data-testid="weekend-desktop">
            {/* One toolbar row, not two accidental ones: nav cluster (Overview,
                month stepper, Today, More Actions, Legend) on the left,
                search+filter on the right — previously the search/filter row
                sat entirely above this one, unconnected, with nothing tying
                the two together and the search field free to stretch across
                nearly the full table width for lack of any sibling to share
                the row with. `justify-between` only does anything useful
                once there are genuinely two flex children here, which is why
                this merge (not just a shared wrapper) is what actually fixes
                it. */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-line pb-3">
              {renderMonthNav(isAdmin && (
                <div className="flex items-center gap-3">
                  <PageActionsMenu
                    items={weekendMenuItems}
                    trigger={(onClick, open) => (
                      <button type="button" onClick={onClick} aria-expanded={open} className="btn-secondary flex items-center gap-1.5 text-sm">
                        <EllipsisVertical className="h-3.5 w-3.5" /> More Actions
                      </button>
                    )}
                  />
                  <MonthLegendTrigger counts={monthStatusCounts} triggerClassName="flex items-center gap-2.5 text-xs text-ink-muted hover:text-ink" />
                </div>
              ))}
              <div className="min-w-0">{renderToolbar('')}</div>
            </div>

            <div className="mt-4 flex items-start gap-4">
              <div className="max-h-[60vh] flex-1 overflow-auto rounded-lg border border-slate-line">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted">
                      <th className="sticky top-0 left-0 z-20 bg-canvas-raised px-3 py-2 font-medium">Weekend</th>
                      {CATEGORY_GROUPS.map(group => (
                        <th key={group.key} className="sticky top-0 z-10 bg-canvas-raised px-3 py-2 font-medium">{group.label}</th>
                      ))}
                      <th className="sticky top-0 z-10 bg-canvas-raised px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-line">
                    {searchedSaturdays.length === 0 ? (
                      <tr>
                        <td colSpan={CATEGORY_GROUPS.length + 2} className="px-3 py-6 text-center text-ink-muted">
                          {monthSaturdays.length === 0 ? 'No weekends to plan in this month yet.' : 'No weekends match this filter/search.'}
                        </td>
                      </tr>
                    ) : searchedSaturdays.map(saturday => {
                      const bySaturday = byWeekend.get(saturday) || {}
                      const coverage = weekendCoverageSummary(bySaturday)
                      const needsPlanning = coverage.openGroups.length > 0
                      const badge = weekendBadge(saturday, monthSaturdays.indexOf(saturday) + 1)
                      const isSelected = saturday === inspectorSaturday

                      return (
                        <tr
                          key={saturday}
                          onClick={() => setSelectedSaturday(saturday)}
                          aria-selected={isSelected}
                          className={`group cursor-pointer transition-colors ${isSelected ? 'bg-accent-tint/50' : 'hover:bg-canvas-sunken/40'}`}
                        >
                          {/* Sticky column needs an OPAQUE background — unlike the rest of
                              the row, it must occlude the non-sticky cells (e.g. MO) that
                              scroll underneath it, so it can't reuse the row's translucent
                              tint opacity modifier (that let their text ghost through
                              beneath the date). */}
                          <td className={`sticky left-0 z-10 border-l-4 px-3 py-2.5 font-medium text-ink ${
                            isSelected ? 'border-l-accent bg-accent-tint' : 'border-l-transparent bg-canvas-raised group-hover:bg-canvas-sunken'
                          }`}>
                            <div className="flex flex-col gap-1">
                              <span>{formatWeekendRange(saturday)}</span>
                              <span className={`inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.chip}`}>{badge.label}</span>
                            </div>
                          </td>
                          {CATEGORY_GROUPS.map(group => {
                            const groupEntries = bySaturday[group.key] || []
                            return (
                              <td key={group.key} className="px-3 py-2.5">
                                {groupEntries.length === 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-flagAmber-bg px-2 py-0.5 text-xs font-medium text-flagAmber">Open</span>
                                ) : (
                                  <div className="space-y-0.5">
                                    {chunkInPairs(groupEntries).map((row, i) => (
                                      <div key={i} className="text-ink">{row.map(e => displayNames.get(e.profile_id) ?? '(unknown)').join(', ')}</div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
                            }`}>
                              {needsPlanning ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
                              {needsPlanning ? `${coverage.openGroups.length} ${coverage.openGroups.length === 1 ? 'gap' : 'gaps'}` : 'Fully planned'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="w-80 flex-shrink-0 rounded-lg border border-slate-line p-4">
                {inspectorSaturday ? (
                  <WeekendInspector
                    saturday={inspectorSaturday}
                    weekendIndex={monthSaturdays.indexOf(inspectorSaturday) + 1}
                    bySaturday={byWeekend.get(inspectorSaturday) || {}}
                    doctorById={doctorById}
                    displayNames={displayNames}
                    isAdmin={isAdmin}
                    saving={saving}
                    myRequest={myRequestsBySaturday.get(inspectorSaturday)}
                    canViewRequests={canViewRequests}
                    removeEntry={removeEntry}
                    onClearWeekend={saturday => setClearWeekendTarget(saturday)}
                    onCopyWeekend={copyWeekend}
                    onPasteWeekend={openWeekendPaste}
                    hasWeekendClipboard={clipboard?.granularity === 'weekend'}
                    onOpenAddDoctor={groupKey => setOpenRolePicker({ saturday: inspectorSaturday, groupKey })}
                  />
                ) : (
                  <p className="text-sm text-ink-muted">Select a weekend to see details.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {showChangeLog && <WeekendPlannerChangeLogModal onClose={() => setShowChangeLog(false)} onDataChanged={load} />}

      {detailSaturday && (
        <WeekendDetailSheet
          saturday={detailSaturday}
          weekendIndex={monthSaturdays.indexOf(detailSaturday) + 1}
          bySaturday={byWeekend.get(detailSaturday) || {}}
          doctorById={doctorById}
          displayNames={displayNames}
          myRequest={myRequestsBySaturday.get(detailSaturday)}
          onClose={() => setDetailSaturday(null)}
        />
      )}

      {openRolePicker && (
        <WeekendAddDoctorsSheet
          saturday={openRolePicker.saturday}
          initialGroupKey={openRolePicker.groupKey}
          doctors={doctors}
          assignedIds={assignedDoctorIds(openRolePicker.saturday)}
          rotationsByDoctorId={rotationsByDoctorId}
          onAdd={(groupKey, profileIds) => { addEntries(openRolePicker.saturday, groupKey, profileIds); setOpenRolePicker(null) }}
          onClose={() => setOpenRolePicker(null)}
        />
      )}

      {removeSheetEntry && (
        <WeekendRemoveDoctorSheet
          entry={removeSheetEntry.entry}
          doctor={doctorById.get(removeSheetEntry.entry.profile_id)}
          saturday={removeSheetEntry.saturday}
          groupLabel={removeSheetEntry.groupLabel}
          onRemove={entryId => { removeEntry(entryId); setRemoveSheetEntry(null) }}
          onClose={() => setRemoveSheetEntry(null)}
        />
      )}

      {cardMenuSaturday && (
        <WeekendCardMenu
          saturday={cardMenuSaturday}
          hasClipboard={clipboard?.granularity === 'weekend'}
          isSourceCard={clipboard?.sourceSaturday === cardMenuSaturday}
          canCopy={weekendCoverageSummary(byWeekend.get(cardMenuSaturday)).filledGroups > 0}
          onCopy={() => { copyWeekend(cardMenuSaturday); setCardMenuSaturday(null) }}
          onPaste={() => { openWeekendPaste(cardMenuSaturday); setCardMenuSaturday(null) }}
          onClear={() => { setClearWeekendTarget(cardMenuSaturday); setCardMenuSaturday(null) }}
          onClose={() => setCardMenuSaturday(null)}
        />
      )}

      {pasteTarget && clipboard && (
        <WeekendPasteModal
          clipboard={clipboard}
          targetMonths={pasteTarget.months}
          targetLabel={pasteTarget.label}
          existingByWeekend={byWeekend}
          activeDoctorIds={activeDoctorIds}
          saving={saving}
          onConfirm={handleConfirmPaste}
          onClose={() => setPasteTarget(null)}
        />
      )}

      {showClearMonthModal && (
        <WeekendClearConfirmModal
          title={`Clear ${MONTH_LABELS[viewMonth - 1]} ${viewYear}?`}
          entryCount={monthEntryCount}
          saving={saving}
          onConfirm={handleConfirmClearMonth}
          onClose={() => setShowClearMonthModal(false)}
        />
      )}

      {showClearQuarterModal && (
        <WeekendClearConfirmModal
          title={`Clear ${quarterLabel(quarterMonthsFrom(viewYear, viewMonth))}?`}
          entryCount={quarterEntryCount}
          saving={saving}
          onConfirm={handleConfirmClearQuarter}
          onClose={() => setShowClearQuarterModal(false)}
        />
      )}

      {clearWeekendTarget && (
        <WeekendClearConfirmModal
          title={`Clear ${formatWeekendRange(clearWeekendTarget)}?`}
          entryCount={Object.values(byWeekend.get(clearWeekendTarget) || {}).flat().length}
          saving={saving}
          onConfirm={handleConfirmClearWeekend}
          onClose={() => setClearWeekendTarget(null)}
        />
      )}

      {toastVisible && lastAction && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          <span>{lastAction.label}</span>
          <button
            type="button"
            onClick={undoLastAction}
            disabled={undoing}
            className="font-semibold text-accent-tint hover:text-white disabled:opacity-60"
          >
            {undoing ? 'Undoing…' : 'Undo'}
          </button>
          <button type="button" onClick={() => setToastVisible(false)} className="text-white/60 hover:text-white" aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  )
}
