import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Pencil, Users, CircleCheck, CircleAlert, Copy, ClipboardPaste, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr, addDays, parseLocalDate, monthBounds } from '../lib/dateRange'
import {
  CATEGORY_GROUPS, groupForCategory, resolvedCategoryForDoctor, saturdaysInRange, saturdaysInMonth, nextWeekendSaturday,
  weekendCoverageSummary, isProfileAssignedToWeekend, groupEntriesByWeekend,
  isEvenWeekend, weekendExceptionRequestsBySaturday, planWeekendPasteAcrossMonths,
} from '../lib/weekendPlanner'
import { logWeekendPlannerChange, restoreWeekendPlannerBatch } from '../lib/changeLog'
import WeekendPlannerChangeLogModal from './WeekendPlannerChangeLogModal'
import InlineRuleHint from './InlineRuleHint'

const WEEKS_AHEAD = 26 // ~6 months, enough runway to plan several roster months ahead
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
// never a background wash. Uses accent/rose (not accent/flagAmber like the
// mobile scheme above) because flagAmber is spoken for on desktop: it's the
// Status column's "N gaps" chip, a genuine roster-state signal, and mixing
// it into parity too would blur that meaning.
function weekendBadge(saturday, weekendIndex) {
  const even = isEvenWeekend(saturday)
  return {
    label: `Wknd ${weekendIndex} · ${even ? 'Even' : 'Odd'}`,
    chip: even ? 'bg-accent-tint text-accent' : 'bg-rose-tint text-rose-dark',
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
// the admin add/remove controls. Shared between the mobile card layout and
// the desktop inspector's edit mode so the edit logic exists in exactly one
// place.
function CategoryGroupRow({
  group, groupEntries, doctorById, availableDoctors, isAdmin, saving, textClass,
  saturday, pickerKey, openPicker, setOpenPicker, addEntry, removeEntry,
}) {
  const rows = chunkInPairs(groupEntries)
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">{group.label}</span>
        {groupEntries.length === 0 && <span className="text-xs font-medium text-rose-dark">1 open</span>}
      </div>

      {rows.length > 0 && (
        <div className="mt-1 space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              {row.map(entry => {
                const doctor = doctorById.get(entry.profile_id)
                return (
                  <span key={entry.id} className={`flex items-center gap-1 text-sm ${textClass}`}>
                    {doctor ? doctor.surname : '(unknown)'}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        disabled={saving}
                        className={`${textClass} hover:text-flagRed`}
                        aria-label={`Remove ${doctor?.surname ?? 'doctor'} from ${saturday}`}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mt-1.5 flex justify-end">
          {openPicker === pickerKey ? (
            <select
              autoFocus
              className="input-field w-full text-sm"
              disabled={saving}
              defaultValue=""
              onChange={e => {
                if (e.target.value) addEntry(saturday, group.key, e.target.value)
                else setOpenPicker(null)
              }}
              onBlur={() => setOpenPicker(null)}
            >
              <option value="">Select doctor…</option>
              {availableDoctors.map(d => (
                <option key={d.id} value={d.id}>{d.name} {d.surname}</option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setOpenPicker(pickerKey)}
              disabled={saving || availableDoctors.length === 0}
              className={`rounded border border-dashed border-slate-line px-2 py-1 text-xs ${textClass} hover:bg-canvas-sunken disabled:opacity-40`}
            >
              Add doctor
            </button>
          )}
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
function AssignmentSummaryRow({ group, groupEntries, doctorById }) {
  const filled = groupEntries.length > 0
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-ink-muted">{group.label}</span>
      <div className="flex items-center gap-2">
        {filled ? (
          <span className="text-sm text-ink">
            {groupEntries.map(e => doctorById.get(e.profile_id)?.surname ?? '(unknown)').join(', ')}
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
  saturday, weekendIndex, bySaturday, doctors, doctorById, isAdmin, saving, myRequest, canViewRequests,
  assignedIds, openPicker, setOpenPicker, addEntry, removeEntry, onClearWeekend,
  onCopyWeekend, onPasteWeekend, hasWeekendClipboard,
}) {
  const [editing, setEditing] = useState(false)
  useEffect(() => { setEditing(false) }, [saturday])

  const coverage = weekendCoverageSummary(bySaturday)
  const needsPlanning = coverage.openGroups.length > 0
  const badge = weekendBadge(saturday, weekendIndex)

  return (
    <div data-testid="weekend-inspector">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected weekend</p>
          <p className="mt-0.5 text-base font-semibold text-ink">{formatWeekendRange(saturday)}</p>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.chip}`}>{badge.label}</span>
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

      {!editing ? (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Assignments</p>
          <div className="mt-1 divide-y divide-slate-line">
            {CATEGORY_GROUPS.map(group => (
              <AssignmentSummaryRow key={group.key} group={group} groupEntries={bySaturday[group.key] || []} doctorById={doctorById} />
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
              <Link to="/leave?tab=planners&sub=requests" className="btn-secondary flex w-full items-center justify-center gap-1.5 text-sm">
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
            {CATEGORY_GROUPS.map(group => {
              const groupEntries = bySaturday[group.key] || []
              const availableDoctors = doctors
                .filter(d => groupForCategory(resolvedCategoryForDoctor(d)) === group.key)
                .filter(d => !assignedIds.has(d.id))
              return (
                <CategoryGroupRow
                  key={group.key}
                  group={group}
                  groupEntries={groupEntries}
                  doctorById={doctorById}
                  availableDoctors={availableDoctors}
                  isAdmin={isAdmin}
                  saving={saving}
                  textClass="text-ink"
                  saturday={saturday}
                  pickerKey={`${saturday}:${group.key}`}
                  openPicker={openPicker}
                  setOpenPicker={setOpenPicker}
                  addEntry={addEntry}
                  removeEntry={removeEntry}
                />
              )
            })}
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
function WeekendDetailSheet({ saturday, weekendIndex, bySaturday, doctorById, myRequest, onClose }) {
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
            <AssignmentSummaryRow key={group.key} group={group} groupEntries={bySaturday[group.key] || []} doctorById={doctorById} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
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
// its year overview at a specific month, possibly outside today's rolling
// WEEKS_AHEAD window (a past/future year an admin navigated to). onBackToYear,
// when present, renders a "← Year view" link back to that overview — absent
// when this is reached directly (the standalone /weekend route, or a caller
// with no year overview of its own).
export default function WeekendPlannerView({ initialYear, initialMonth, onBackToYear } = {}) {
  const { isAdmin, isClerk, canSubmitLeave, profile } = useAuth()
  const [doctors, setDoctors] = useState([])
  const [entries, setEntries] = useState([])
  const [myWeekendRequests, setMyWeekendRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openPicker, setOpenPicker] = useState(null) // `${saturday}:${groupKey}` or null
  const [saving, setSaving] = useState(false)
  const [showChangeLog, setShowChangeLog] = useState(false)
  // An admin's default concern is the whole roster, not their own rotation
  // (they may not even be on it) — lands on "All weekends" rather than
  // sharing non-admins' "My weekends" default, matching ADMIN_FILTERS
  // leading with the same chip above.
  const [filter, setFilter] = useState(isAdmin || isClerk ? 'all' : 'mine')
  const [searchQuery, setSearchQuery] = useState('') // desktop-only: filter grid rows by assigned surname
  const [selectedSaturday, setSelectedSaturday] = useState(null) // desktop-only: which row the inspector shows
  const [detailSaturday, setDetailSaturday] = useState(null) // mobile-only: which card's read-only quick-glance sheet is open
  // Copy/Paste/Clear (admin-only) — clipboard is plain component state, not
  // persisted: the intended flow is copy → navigate forward a month or two
  // → paste, all within one visit, so it only needs to survive the mounted
  // session. { granularity: 'weekend'|'month'|'quarter', sourceLabel, months }
  // — months is always an array of "month blocks" (each an array of that
  // month's weekends-by-position, each a list of {groupKey,profileId,category}
  // entries) so planWeekendPasteAcrossMonths handles all three granularities
  // uniformly: weekend = 1 block of 1 weekend, month = 1 block, quarter = 3
  // blocks (see copyWeekend/copyMonth/copyQuarter below).
  const [clipboard, setClipboard] = useState(null)
  const [pasteTarget, setPasteTarget] = useState(null) // { months, label } or null — which paste-confirmation modal (if any) is open
  const [showClearMonthModal, setShowClearMonthModal] = useState(false)
  const [showClearQuarterModal, setShowClearQuarterModal] = useState(false)
  const [clearWeekendTarget, setClearWeekendTarget] = useState(null) // saturday string or null
  // The post-action Undo toast (right after a paste-with-overwrite or any
  // Clear) — { batchId, label } or null. Calls the exact same
  // restoreWeekendPlannerBatch the "Recent actions" panel in
  // WeekendPlannerChangeLogModal uses, per batch_id, not a separate
  // in-memory-only code path (see changeLog.js).
  const [undoToast, setUndoToast] = useState(null)
  const [undoing, setUndoing] = useState(false)
  const today = todayStr()
  const [viewYear, setViewYear] = useState(() => initialYear ?? Number(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => initialMonth ?? Number(today.slice(5, 7)))

  // The Requests planner tab only exists for admins (approval queue) and
  // doctors (their own history) — matches the same condition LeavePlannerPage
  // uses to decide whether to render that tab at all, so "View requests"
  // never links somewhere that redirects the visitor elsewhere.
  const canViewRequests = isAdmin || canSubmitLeave

  const filters = isAdmin ? ADMIN_FILTERS : isClerk ? CLERK_FILTERS : FILTERS_BASE

  // The default rolling window (today through WEEKS_AHEAD later), widened
  // to also cover initialYear/initialMonth's whole month when that's
  // seeded from further away — otherwise a month the year overview opened
  // from a past/future year would fetch a range that never includes it.
  // Computed once from stable inputs (today/initialYear/initialMonth never
  // change after mount, matching viewYear/viewMonth's own useState
  // initializers above), reused by both load() and the saturdays memo below
  // so what's fetched and what's considered "in range" for prev/next-month
  // bounds always agree.
  const seededBounds = initialYear && initialMonth ? monthBounds(initialYear, initialMonth) : null
  const defaultThroughDate = addDays(today, WEEKS_AHEAD * 7)
  const fetchFromDate = seededBounds && seededBounds.start < today ? seededBounds.start : today
  const fetchThroughDate = seededBounds && seededBounds.end > defaultThroughDate ? seededBounds.end : defaultThroughDate

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; nothing it closes over (profile, fetchFromDate/fetchThroughDate) changes within a session

  async function load() {
    setLoading(true)
    setError('')

    const [profilesRes, entriesRes, myRequestsRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, category, contract_type')
        .eq('is_approved', true).eq('is_active', true),
      supabase.from('weekend_planner_entries').select('id, weekend_saturday, profile_id, category')
        .gte('weekend_saturday', fetchFromDate).lte('weekend_saturday', fetchThroughDate),
      supabase.from('leave_requests').select('id, date_from, status')
        .eq('profile_id', profile?.id ?? '').eq('leave_type', 'weekend_exception')
        .gte('date_from', fetchFromDate).lte('date_from', fetchThroughDate),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (entriesRes.error) { setError(entriesRes.error.message); setLoading(false); return }
    if (myRequestsRes.error) { setError(myRequestsRes.error.message); setLoading(false); return }

    setDoctors((profilesRes.data || []).filter(p => groupForCategory(resolvedCategoryForDoctor(p))))
    setEntries(entriesRes.data || [])
    setMyWeekendRequests(myRequestsRes.data || [])
    setLoading(false)
  }

  const saturdays = useMemo(
    () => saturdaysInRange(fetchFromDate, fetchThroughDate),
    [fetchFromDate, fetchThroughDate]
  )
  const byWeekend = useMemo(() => groupEntriesByWeekend(entries), [entries])
  const doctorById = useMemo(() => new Map(doctors.map(d => [d.id, d])), [doctors])
  const activeDoctorIds = useMemo(() => new Set(doctors.map(d => d.id)), [doctors])
  const myRequestsBySaturday = useMemo(() => weekendExceptionRequestsBySaturday(myWeekendRequests), [myWeekendRequests])

  const firstFetchedSaturday = saturdays[0]
  const lastFetchedSaturday = saturdays[saturdays.length - 1]
  const canGoPrevMonth = firstFetchedSaturday
    && !(viewYear === Number(firstFetchedSaturday.slice(0, 4)) && viewMonth === Number(firstFetchedSaturday.slice(5, 7)))
  const canGoNextMonth = lastFetchedSaturday
    && !(viewYear === Number(lastFetchedSaturday.slice(0, 4)) && viewMonth === Number(lastFetchedSaturday.slice(5, 7)))

  function goPrevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }
  function goNextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }
  function goToday() {
    setViewYear(Number(today.slice(0, 4)))
    setViewMonth(Number(today.slice(5, 7)))
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
  const visibleSaturdays = monthSaturdays.filter(saturday => {
    const bySaturday = byWeekend.get(saturday)
    if (filter === 'needs-planning') return weekendCoverageSummary(bySaturday).openGroups.length > 0
    if (filter === 'mine') return isProfileAssignedToWeekend(bySaturday, profile?.id)
    if (filter === 'my-requests') return myRequestsBySaturday.has(saturday)
    return true
  })

  // Desktop-only: the surname search narrows the grid further still (any
  // doctor assigned to that weekend, in any group), on top of whichever
  // filter chip is active.
  const searchTerm = searchQuery.trim().toLowerCase()
  const desktopSaturdays = !searchTerm ? visibleSaturdays : visibleSaturdays.filter(saturday => {
    const bySaturday = byWeekend.get(saturday) || {}
    return Object.values(bySaturday).flat().some(e => doctorById.get(e.profile_id)?.surname?.toLowerCase().includes(searchTerm))
  })

  const nextWeekend = nextWeekendSaturday(today)
  const nextWeekendCoverage = weekendCoverageSummary(byWeekend.get(nextWeekend))
  const nextWeekendMine = isProfileAssignedToWeekend(byWeekend.get(nextWeekend), profile?.id)
  const nextWeekendScheme = weekendColorScheme(nextWeekend)

  // The inspector defaults to Next weekend when it's in view, so the most
  // urgent question is answered the moment the page loads — otherwise the
  // first visible row, and whatever the admin last clicked as long as it's
  // still in view after a filter/search/month change.
  const inspectorSaturday = (selectedSaturday && desktopSaturdays.includes(selectedSaturday))
    ? selectedSaturday
    : (desktopSaturdays.includes(nextWeekend) ? nextWeekend : desktopSaturdays[0]) ?? null

  // Doctors already placed SOMEWHERE this weekend (any group) — the DB's
  // unique(weekend_saturday, profile_id) means a doctor can only fill one
  // slot per weekend, so they're excluded from every group's picker once
  // placed, not just their own.
  function assignedDoctorIds(saturday) {
    const bySaturday = byWeekend.get(saturday)
    if (!bySaturday) return new Set()
    return new Set(Object.values(bySaturday).flat().map(e => e.profile_id))
  }

  // Both handlers patch local state directly from the write's own result
  // rather than reloading — load() flips `loading` back to true, which
  // unmounts the whole grid for a "Loading…" placeholder. A single
  // weekend_planner_entries row is simple enough to update in place
  // without a round trip back through the full query. Each gets its own
  // fresh batch_id (a batch of one) — see deleteEntries/insertEntries below
  // for why every write, single or bulk, is tagged this way.
  async function addEntry(saturday, groupKey, profileId) {
    const doctor = doctorById.get(profileId)
    if (!doctor) return
    setSaving(true)
    const { data, error: err } = await supabase.from('weekend_planner_entries').insert({
      weekend_saturday: saturday,
      profile_id: profileId,
      category: resolvedCategoryForDoctor(doctor),
      created_by: profile?.id ?? null,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setOpenPicker(null)
    setEntries(prev => [...prev, data])
    await logWeekendPlannerChange({
      weekendSaturday: saturday, category: resolvedCategoryForDoctor(doctor), action: 'add',
      profileId, changedBy: profile?.id ?? null, batchId: crypto.randomUUID(),
    })
  }

  async function removeEntry(entryId) {
    setSaving(true)
    const removed = entries.find(e => e.id === entryId)
    const { error: err } = await supabase.from('weekend_planner_entries').delete().eq('id', entryId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEntries(prev => prev.filter(e => e.id !== entryId))
    if (removed) {
      await logWeekendPlannerChange({
        weekendSaturday: removed.weekend_saturday, category: removed.category, action: 'remove',
        profileId: removed.profile_id, changedBy: profile?.id ?? null, batchId: crypto.randomUUID(),
      })
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

  // One weekend's own entries as the {groupKey,profileId,category} shape
  // the clipboard/planWeekendPasteAcrossMonths use — shared by
  // copyWeekend/copyMonth/copyQuarter below.
  function weekendClipboardEntries(saturday) {
    const bySaturday = byWeekend.get(saturday) || {}
    return Object.entries(bySaturday).flatMap(([groupKey, groupEntries]) =>
      groupEntries.map(e => ({ groupKey, profileId: e.profile_id, category: e.category }))
    )
  }

  function copyWeekend(saturday) {
    setClipboard({ granularity: 'weekend', sourceLabel: formatWeekendRange(saturday), months: [[weekendClipboardEntries(saturday)]] })
  }

  // Indexed by POSITION (months[0][i] = the (i+1)th Saturday of the copied
  // month) rather than literal date — planWeekendPasteAcrossMonths maps by
  // that same position, so pasting into a month with a different actual
  // weekend count still lines up sensibly.
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
  async function handleConfirmPaste(plan) {
    setSaving(true)
    const batchId = crypto.randomUUID()
    const deleteOk = await deleteEntries(plan.toDelete, batchId)
    if (deleteOk) await insertEntries(plan.toInsert, batchId)
    setSaving(false)
    setPasteTarget(null)
    if (plan.toDelete.length > 0) setUndoToast({ batchId, label: `Pasted into ${pasteTarget.label} (overwrite)` })
  }

  async function handleConfirmClearMonth() {
    setSaving(true)
    const batchId = crypto.randomUUID()
    const toDelete = monthSaturdays.flatMap(s => Object.values(byWeekend.get(s) || {}).flat())
    await deleteEntries(toDelete, batchId)
    setSaving(false)
    setShowClearMonthModal(false)
    if (toDelete.length > 0) setUndoToast({ batchId, label: `Cleared ${MONTH_LABELS[viewMonth - 1]} ${viewYear}` })
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
    if (toDelete.length > 0) setUndoToast({ batchId, label: `Cleared ${quarterLabel(quarterMonths)}` })
  }

  async function handleConfirmClearWeekend() {
    setSaving(true)
    const batchId = crypto.randomUUID()
    const toDelete = Object.values(byWeekend.get(clearWeekendTarget) || {}).flat()
    const label = formatWeekendRange(clearWeekendTarget)
    await deleteEntries(toDelete, batchId)
    setSaving(false)
    setClearWeekendTarget(null)
    if (toDelete.length > 0) setUndoToast({ batchId, label: `Cleared ${label}` })
  }

  // The Undo toast's own action — identical to "Restore this" in
  // WeekendPlannerChangeLogModal's Recent actions list, just triggered
  // right after the action instead of minutes later; both call
  // restoreWeekendPlannerBatch with nothing but the batchId (see
  // changeLog.js for why it re-fetches everything fresh rather than
  // trusting this component's own already-loaded state).
  async function handleUndoToast() {
    if (!undoToast) return
    setUndoing(true)
    const result = await restoreWeekendPlannerBatch({ batchId: undoToast.batchId, changedBy: profile?.id ?? null })
    setUndoing(false)
    if (result.error) { setError(result.error); setUndoToast(null); return }
    setUndoToast(null)
    await load()
  }

  const monthNav = (
    <div className="flex flex-wrap items-center gap-2">
      {onBackToYear && (
        <button type="button" onClick={onBackToYear} className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink">
          ← Year view
        </button>
      )}
      <button type="button" onClick={goPrevMonth} disabled={!canGoPrevMonth} className="btn-secondary px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous month">←</button>
      <span className="font-display text-base font-semibold text-ink">{MONTH_LABELS[viewMonth - 1]} {viewYear}</span>
      <button type="button" onClick={goNextMonth} disabled={!canGoNextMonth} className="btn-secondary px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next month">→</button>
      <button type="button" onClick={goToday} className="btn-secondary px-2 py-1 text-xs">Today</button>
    </div>
  )

  const filterChips = (
    <div className="flex gap-1 rounded-lg border border-slate-line bg-canvas-raised p-0.5">
      {filters.map(f => (
        <button
          key={f.key}
          type="button"
          onClick={() => setFilter(f.key)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            filter === f.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      {isAdmin && (
        <div className="flex justify-end lg:hidden">
          <button onClick={() => setShowChangeLog(true)} className="btn-secondary text-sm">
            Review log
          </button>
        </div>
      )}

      <InlineRuleHint
        inline="No more than one person per slot — a colour marks which weekends you're on for the month."
        bullets={[
          'No more than one person per slot.',
          'If your name is listed in a specific colour for a given month, you work every weekend in that colour that month.',
          'Use surnames when populating the planner.',
        ]}
      />

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}

      {!loading && !error && (
        <>
          {/* ── Copy/Paste/Clear (admin-only), shared across mobile+desktop rather
              than duplicated per viewport — Copy/Clear month/quarter act on
              whichever month (or quarter starting from it) is currently
              viewed; the clipboard pill (once non-null) stays visible across
              month navigation so it's always clear what's copied and what
              "Paste" would currently target. Per-weekend Copy/Paste live on
              each weekend row itself (mobile card header / desktop
              inspector) instead, since there's no single "current weekend"
              here to infer a target from. ── */}
          {isAdmin && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={copyMonth} disabled={monthSaturdays.length === 0} className="btn-secondary flex items-center gap-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40">
                <Copy className="h-3.5 w-3.5" /> Copy {MONTH_LABELS[viewMonth - 1]}
              </button>
              <button type="button" onClick={copyQuarter} disabled={monthSaturdays.length === 0} className="btn-secondary flex items-center gap-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40">
                <Copy className="h-3.5 w-3.5" /> Copy quarter
              </button>
              <button
                type="button"
                onClick={() => setShowClearMonthModal(true)}
                disabled={monthEntryCount === 0}
                className="flex items-center gap-1.5 rounded border border-flagRed px-3 py-1.5 text-sm font-medium text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear {MONTH_LABELS[viewMonth - 1]}
              </button>
              <button
                type="button"
                onClick={() => setShowClearQuarterModal(true)}
                disabled={quarterEntryCount === 0}
                className="flex items-center gap-1.5 rounded border border-flagRed px-3 py-1.5 text-sm font-medium text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear quarter
              </button>
            </div>
          )}

          {isAdmin && clipboard && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent-tint px-3 py-2 text-sm text-accent-dark">
              <span>📋 {clipboard.sourceLabel} copied</span>
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
                {clipboard.granularity === 'weekend' && (
                  <span className="text-xs text-accent-dark">Use a weekend&rsquo;s own Paste action</span>
                )}
                <button type="button" onClick={() => setClipboard(null)} className="text-xs font-medium text-accent-dark underline hover:no-underline">
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* ── Mobile: month-at-a-time card list (unchanged from the earlier mobile-first redesign) ── */}
          <div className="lg:hidden" data-testid="weekend-mobile">
            <div className={`mt-6 card p-4 ${nextWeekendScheme.bg}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next weekend</p>
              <p className={`mt-0.5 text-base font-semibold ${nextWeekendScheme.text}`}>{formatWeekendRange(nextWeekend)}</p>
              <p className="mt-1 text-sm text-ink-light">
                {nextWeekendCoverage.filledGroups} of {nextWeekendCoverage.totalGroups} groups planned
                {nextWeekendCoverage.openGroups.length > 0 && (
                  <> — <span className="text-rose-dark">{nextWeekendCoverage.openGroups.map(k => CATEGORY_GROUPS.find(g => g.key === k)?.label).join(', ')} still open</span></>
                )}
              </p>
              {nextWeekendMine && <p className="mt-1 text-sm font-medium text-accent">You&rsquo;re on rotation this weekend.</p>}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {monthNav}
              {filterChips}
            </div>

            <div className="mt-3 space-y-3">
              {visibleSaturdays.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {monthSaturdays.length === 0 ? 'No weekends to plan in this month yet.' : 'No weekends match this filter.'}
                </p>
              ) : visibleSaturdays.map(saturday => {
                const bySaturday = byWeekend.get(saturday) || {}
                const coverage = weekendCoverageSummary(bySaturday)
                const needsPlanning = coverage.openGroups.length > 0
                const assignedIds = assignedDoctorIds(saturday)
                const myRequest = myRequestsBySaturday.get(saturday)
                const scheme = weekendColorScheme(saturday)

                return (
                  <div
                    key={saturday}
                    className={`card p-4 ${scheme.bg}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Tapping the date opens a read-only quick-glance sheet
                          (WeekendDetailSheet) — a condensed alternative to
                          scrolling this card's own always-expanded, fully
                          editable breakdown below, not a replacement for it. */}
                      <button
                        type="button"
                        onClick={() => setDetailSaturday(saturday)}
                        className={`text-sm font-medium underline decoration-dotted underline-offset-2 ${scheme.text}`}
                      >
                        {formatWeekendRange(saturday)}
                      </button>
                      <div className="flex items-center gap-2">
                        {myRequest && (
                          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            {EXCEPTION_STATUS_LABEL[myRequest.status] ?? myRequest.status}
                          </span>
                        )}
                        {needsPlanning && (
                          <span className="rounded-full bg-rose-light px-2 py-0.5 text-xs font-medium text-rose-dark">
                            Needs planning
                          </span>
                        )}
                        {isAdmin && coverage.filledGroups > 0 && (
                          <button
                            type="button"
                            onClick={() => copyWeekend(saturday)}
                            aria-label={`Copy weekend ${saturday}`}
                            className={scheme.text}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isAdmin && clipboard?.granularity === 'weekend' && (
                          <button
                            type="button"
                            onClick={() => openWeekendPaste(saturday)}
                            aria-label={`Paste weekend into ${saturday}`}
                            className={scheme.text}
                          >
                            <ClipboardPaste className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isAdmin && coverage.filledGroups > 0 && (
                          <button
                            type="button"
                            onClick={() => setClearWeekendTarget(saturday)}
                            aria-label={`Clear weekend ${saturday}`}
                            className={`${scheme.text} hover:text-flagRed`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 divide-y divide-slate-line">
                      {CATEGORY_GROUPS.map(group => {
                        const groupEntries = bySaturday[group.key] || []
                        const availableDoctors = doctors
                          .filter(d => groupForCategory(resolvedCategoryForDoctor(d)) === group.key)
                          .filter(d => !assignedIds.has(d.id))

                        return (
                          <CategoryGroupRow
                            key={group.key}
                            group={group}
                            groupEntries={groupEntries}
                            doctorById={doctorById}
                            availableDoctors={availableDoctors}
                            isAdmin={isAdmin}
                            saving={saving}
                            textClass={scheme.text}
                            saturday={saturday}
                            pickerKey={`${saturday}:${group.key}`}
                            openPicker={openPicker}
                            setOpenPicker={setOpenPicker}
                            addEntry={addEntry}
                            removeEntry={removeEntry}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Desktop: weekend-first summary table + inspector (see file-level comment for rationale) ── */}
          <div className="hidden lg:block" data-testid="weekend-desktop">
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              {monthNav}
              <span className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search surname…"
                  aria-label="Search by surname"
                  className="input-field w-48 py-1.5 pl-7 text-sm"
                />
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-line pb-3">
              {filterChips}
              {isAdmin && (
                <button onClick={() => setShowChangeLog(true)} className="btn-secondary text-sm">
                  Review log
                </button>
              )}
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
                    {desktopSaturdays.length === 0 ? (
                      <tr>
                        <td colSpan={CATEGORY_GROUPS.length + 2} className="px-3 py-6 text-center text-ink-muted">
                          {monthSaturdays.length === 0 ? 'No weekends to plan in this month yet.' : 'No weekends match this filter/search.'}
                        </td>
                      </tr>
                    ) : desktopSaturdays.map(saturday => {
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
                                      <div key={i} className="text-ink">{row.map(e => doctorById.get(e.profile_id)?.surname ?? '(unknown)').join(', ')}</div>
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
                    doctors={doctors}
                    doctorById={doctorById}
                    isAdmin={isAdmin}
                    saving={saving}
                    myRequest={myRequestsBySaturday.get(inspectorSaturday)}
                    canViewRequests={canViewRequests}
                    assignedIds={assignedDoctorIds(inspectorSaturday)}
                    openPicker={openPicker}
                    setOpenPicker={setOpenPicker}
                    addEntry={addEntry}
                    removeEntry={removeEntry}
                    onClearWeekend={saturday => setClearWeekendTarget(saturday)}
                    onCopyWeekend={copyWeekend}
                    onPasteWeekend={openWeekendPaste}
                    hasWeekendClipboard={clipboard?.granularity === 'weekend'}
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
          myRequest={myRequestsBySaturday.get(detailSaturday)}
          onClose={() => setDetailSaturday(null)}
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

      {undoToast && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          <span>{undoToast.label}</span>
          <button
            type="button"
            onClick={handleUndoToast}
            disabled={undoing}
            className="font-semibold text-accent-tint hover:text-white disabled:opacity-60"
          >
            {undoing ? 'Undoing…' : 'Undo'}
          </button>
          <button type="button" onClick={() => setUndoToast(null)} className="text-white/60 hover:text-white" aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  )
}
