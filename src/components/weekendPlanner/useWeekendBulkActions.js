import { useState } from 'react'
import { saturdaysInMonth, formatWeekendRange } from '../../lib/weekendPlanner'
import { MONTH_LABELS, quarterMonthsFrom, quarterLabel } from './viewHelpers'

// Copy / Paste / Clear for a weekend, the viewed month and the quarter
// from it: the confirmation modals' state, the clipboard writers and the
// confirmed writes. Moved out of WeekendPlannerView as it was.
export function useWeekendBulkActions({
  isAdmin, clipboard, setClipboard, byWeekend, monthSaturdays, fetchedSet, viewYear, viewMonth,
  selectedSaturday, searchedSaturdays, setSaving, deleteEntries, insertEntries, pushUndo,
}) {
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

  // Paste, wherever the clipboard came from, offered in the More menu and
  // the phone's ⊕. A copied weekend pastes into the SELECTED weekend (tap a
  // card on a phone, a row on a desktop), so the action is disabled until
  // one is chosen that is not the source itself; a copied month or quarter
  // pastes into the one being viewed, as the clipboard pill's button does.
  const pasteWeekendTarget = clipboard?.granularity === 'weekend'
    && selectedSaturday && searchedSaturdays.includes(selectedSaturday) && selectedSaturday !== clipboard.sourceSaturday
    ? selectedSaturday : null
  const pasteActions = !isAdmin || !clipboard ? [] : clipboard.granularity === 'weekend' ? [{
    key: 'paste-weekend',
    label: pasteWeekendTarget ? `Paste into ${formatWeekendRange(pasteWeekendTarget)}` : 'Paste weekend — select a weekend first',
    disabled: !pasteWeekendTarget,
    onClick: () => pasteWeekendTarget && openWeekendPaste(pasteWeekendTarget),
  }] : clipboard.granularity === 'month' ? [{
    key: 'paste-month', label: `Paste into ${MONTH_LABELS[viewMonth - 1]} ${viewYear}`, disabled: monthSaturdays.length === 0, onClick: openMonthPaste,
  }] : [{
    key: 'paste-quarter', label: `Paste into ${quarterLabel(quarterMonthsFrom(viewYear, viewMonth))}`, onClick: openQuarterPaste,
  }]

  return {
    pasteTarget, setPasteTarget, showClearMonthModal, setShowClearMonthModal, showClearQuarterModal,
    setShowClearQuarterModal, clearWeekendTarget, setClearWeekendTarget, copyWeekend, copyMonth, copyQuarter,
    openWeekendPaste, openMonthPaste, openQuarterPaste, handleConfirmPaste, handleConfirmClearMonth,
    handleConfirmClearQuarter, handleConfirmClearWeekend, pasteActions,
  }
}
