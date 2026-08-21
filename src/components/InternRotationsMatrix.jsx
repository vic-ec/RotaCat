import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown, EllipsisVertical, CircleQuestionMark, ScrollText,
  TriangleAlert, X, Plus, ListFilter,
} from 'lucide-react'
import SelectMenu from './SelectMenu'
import DoctorChip from './DoctorChip'
import DoctorDropdown from './DoctorDropdown'
import Modal from './Modal'
import LegendSheet from './LegendSheet'
import PageActionsMenu from './PageActionsMenu'
import Toolbar from './Toolbar'
import FloatingActionMenu from './FloatingActionMenu'
import DateStepper from './DateStepper'
import { rotationForDate, groupRotationsByDoctorId, rotationTouchesMonth } from '../lib/internRotations'
import {
  ROTATION_TYPE_KEY_OPTIONS, rotationTypeKey, rotationTypeOptionsForCategory, ROTATION_TYPE_COLOR,
} from '../lib/staffDefaults'
import { todayStr, addDays, addMonths, MONTH_ABBR } from '../lib/dateRange'
import { useIsDesktop } from '../lib/useIsDesktop'

// Literal pixel widths, not 1fr/minmax — every row (and the header) shares
// the exact same `gridTemplateColumns` string built from these two
// constants, which is what keeps month columns pixel-aligned across rows
// that would otherwise size independently. Desktop grid only — mobile
// renders a per-doctor strip of just the covered months instead (see
// flattenSegmentsToCells below), not a fixed 12-column grid at all.
const MONTH_COL_WIDTH = 56 // px
const LABEL_COL_WIDTH = 152 // px

const CATEGORY_GROUP_ORDER = ['Intern', 'Registrar', 'COSMO']
const CATEGORY_GROUP_LABEL = { Intern: 'Intern', Registrar: 'Registrar', COSMO: 'COSMO' }
const CATEGORY_FILTER_OPTIONS = [
  { value: 'all', label: 'All categories' },
  { value: 'Intern', label: 'Intern' },
  { value: 'Registrar', label: 'Registrar' },
  { value: 'COSMO', label: 'COSMO' },
]

const FAR_FUTURE = '9999-12-31' // stand-in for a null (open-ended) end_date in string date-range comparisons only

function typeLabel(key) {
  return ROTATION_TYPE_KEY_OPTIONS.find(o => o.key === key)?.label || key
}

// One type-key per month (1-12) for a doctor's rotations in the displayed
// year, or null for a genuine gap. A real data overlap (two rotations
// touching the same month) is tie-broken by latest start_date — this only
// decides what the bar/cell itself shows; the overlap is still surfaced by
// the panel's warning banner/modal regardless of which one wins here.
function monthlyTypeKeys(doctorRotations, year) {
  const keys = []
  for (let month = 1; month <= 12; month++) {
    const touching = doctorRotations.filter(r => rotationTouchesMonth(r, year, month))
    if (touching.length === 0) { keys.push(null); continue }
    const winner = [...touching].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
    keys.push(rotationTypeKey(winner.rotation_type, winner.subtype))
  }
  return keys
}

// Run-length-encodes 12 monthly type-keys into spanning segments — this is
// what makes consecutive same-type months render as one bar/run, and
// adjacent different-type months render as two segments with no gap
// between them (both fall directly out of the pixel/cell math once
// segments are computed).
function runLengthSegments(keys) {
  const segments = []
  let i = 0
  while (i < keys.length) {
    if (keys[i] === null) { i++; continue }
    let j = i
    while (j + 1 < keys.length && keys[j + 1] === keys[i]) j++
    segments.push({ startMonthIndex: i, endMonthIndex: j, typeKey: keys[i] })
    i = j + 1
  }
  return segments
}

// Flattens segments into one cell per covered month — the mobile card
// strip's own unit, since it renders one small box per assigned month
// (only rounding the very first/last box of the whole strip) rather than
// desktop's absolutely-positioned spanning bars over a fixed grid.
function flattenSegmentsToCells(segments) {
  const cells = []
  for (const seg of segments) {
    for (let m = seg.startMonthIndex; m <= seg.endMonthIndex; m++) cells.push({ monthIndex: m, typeKey: seg.typeKey })
  }
  return cells
}

function blocksOverlap(a, b) {
  const aEnd = a.end_date === null ? FAR_FUTURE : a.end_date
  const bEnd = b.end_date === null ? FAR_FUTURE : b.end_date
  return a.start_date <= bEnd && b.start_date <= aEnd
}

// Every overlapping pair among a doctor's blocks, as a Map of stable
// "smallerId|largerId" keys — used both to render the persistent banner
// (non-empty map) and to detect the exact moment a NEW pair appears (diff
// against the previous render's set) for the one-time modal.
function overlapPairSet(doctorRotations) {
  const pairs = new Map()
  for (let i = 0; i < doctorRotations.length; i++) {
    for (let j = i + 1; j < doctorRotations.length; j++) {
      const a = doctorRotations[i], b = doctorRotations[j]
      if (blocksOverlap(a, b)) {
        const [x, y] = [a, b].sort((p, q) => p.id.localeCompare(q.id))
        pairs.set(`${x.id}|${y.id}`, [x, y])
      }
    }
  }
  return pairs
}

// "Aug" or "Aug–Sep" — the overlapping month range between two blocks, for
// the one-time modal's "X and Y both cover <range> for <name>" copy.
function overlapMonthRange(a, b) {
  const start = a.start_date > b.start_date ? a.start_date : b.start_date
  const aEnd = a.end_date === null ? FAR_FUTURE : a.end_date
  const bEnd = b.end_date === null ? FAR_FUTURE : b.end_date
  const end = aEnd < bEnd ? aEnd : bEnd
  const startMonth = MONTH_ABBR[Number(start.slice(5, 7)) - 1]
  if (end === FAR_FUTURE) return `${startMonth} onward`
  const endMonth = MONTH_ABBR[Number(end.slice(5, 7)) - 1]
  return startMonth === endMonth ? startMonth : `${startMonth}–${endMonth}`
}

function categoryGroupKey(doctor) {
  return CATEGORY_GROUP_ORDER.includes(doctor.category) ? doctor.category : 'COSMO'
}

function matchesSearch(doctor, search) {
  if (!search.trim()) return true
  const q = search.trim().toLowerCase()
  return `${doctor.name || ''} ${doctor.surname || ''}`.toLowerCase().includes(q)
}

// The only view this page has — Table and the old 4-month Timeline are
// both retired (Table's one remaining job, adding a new doctor, is now
// the "+ Add doctor" flow below). Rows = doctors, grouped by category
// (Intern / Registrar / COSMO, same visual pattern as the Staff list's
// category grouping). Desktop: columns = the 12 months of a navigable
// year, rotation blocks as colour-coded spanning bars. Mobile: a
// genuinely different layout, not a shrunk grid — one card per doctor
// showing only their own covered months as a flush strip, with a bottom
// sheet instead of the sticky side panel.
//
// Deliberately month-granularity, not day-precision (a Gantt view was
// evaluated and dropped) — every date comparison here is in service of
// "which month(s) does this block touch", never a day-level layout.
export default function InternRotationsMatrix({
  doctors, rotations, displayNames, currentUserId, year, onYearChange,
  onUpdateRotation, onCreateRotation, onDeleteRotation,
  selectedDoctorId, onSelectDoctor,
  focusDoctorId, onFocusDoctorConsumed,
}) {
  const isDesktop = useIsDesktop()
  const today = todayStr()
  const currentYear = Number(today.slice(0, 4))
  const currentMonthIndex = Number(today.slice(5, 7)) - 1
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [editing, setEditing] = useState(false)
  const [savingBlockId, setSavingBlockId] = useState(null)
  const [blockError, setBlockError] = useState('')
  // Uncommitted date-field edits, keyed by rotation id -> { startDate?,
  // endDate? } — typing/tapping in a From/To date input only updates this
  // local draft, never saves. A save only fires on that field's blur (the
  // date is "confirmed") or when flushed by Done editing below — a native
  // date input's onChange can fire mid-pick on some mobile browsers (e.g.
  // after just the month segment is set), which previously triggered a
  // save-and-refetch on every partial tap, visibly closing/reopening the
  // panel out from under whoever was still picking a date.
  const [blockDrafts, setBlockDrafts] = useState({})
  const [newOverlapModal, setNewOverlapModal] = useState(null) // { a, b } | null
  const seenOverlapPairsRef = useRef(new Map()) // doctorId -> Set of pair keys already surfaced
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  // Add-doctor picker: `addDoctorFor` is null (closed), a category key
  // (desktop's per-section "+ Add doctor"), or 'all' (mobile's one FAB,
  // which offers unassigned doctors across every category at once).
  const [addDoctorFor, setAddDoctorFor] = useState(null)
  const [addDoctorSearch, setAddDoctorSearch] = useState('')
  const [addingDoctor, setAddingDoctor] = useState(false)
  const [addDoctorError, setAddDoctorError] = useState('')

  const rotationsByDoctorId = groupRotationsByDoctorId(rotations)
  const doctorById = new Map(doctors.map(d => [d.id, d]))

  function toggleGroupCollapsed(key) {
    setCollapsedGroups(g => ({ ...g, [key]: !g[key] }))
  }

  const filteredDoctors = doctors.filter(d => matchesSearch(d, search) && (categoryFilter === 'all' || categoryGroupKey(d) === categoryFilter))

  const groups = CATEGORY_GROUP_ORDER
    .map(key => ({
      key,
      label: CATEGORY_GROUP_LABEL[key],
      items: filteredDoctors
        .filter(d => categoryGroupKey(d) === key)
        .sort((a, b) => (a.surname || '').localeCompare(b.surname || '')),
    }))
    .filter(g => g.items.length > 0)

  // Row click (desktop) / card tap (mobile) — toggles selection off if the
  // same doctor is already selected.
  function selectDoctor(doctorId) {
    setEditing(false)
    setBlockError('')
    onSelectDoctor(doctorId === selectedDoctorId ? null : doctorId)
  }
  // Clicking a name in the "no selection" panel's current-month list
  // always selects (never toggles off) — "exactly as clicking their
  // matrix row would" when they weren't already selected.
  function selectDoctorFromList(doctorId) {
    setEditing(false)
    setBlockError('')
    onSelectDoctor(doctorId)
  }

  const selectedDoctor = selectedDoctorId ? doctorById.get(selectedDoctorId) : null
  const selectedDoctorRotations = selectedDoctorId
    ? (rotationsByDoctorId.get(selectedDoctorId) || []).slice().sort((a, b) => a.start_date.localeCompare(b.start_date))
    : []

  // Tracks the previous render's overlap-pair set per doctor so a newly-
  // selected doctor's PRE-EXISTING overlaps show the persistent banner
  // immediately without also popping the one-time modal — only a pair
  // that appears where it wasn't a moment ago triggers that.
  useEffect(() => {
    if (!selectedDoctorId) return
    const currentPairs = overlapPairSet(selectedDoctorRotations)
    const seen = seenOverlapPairsRef.current.get(selectedDoctorId) || new Set()
    const newlyAppeared = [...currentPairs.entries()].find(([key]) => !seen.has(key))
    if (newlyAppeared && seen.size > 0) {
      // seen.size > 0 guard: on first selection (seen is empty) every
      // existing overlap is "newly appeared" relative to an empty set —
      // that case is exactly the "pre-existing, banner-only" one above.
      setNewOverlapModal({ a: newlyAppeared[1][0], b: newlyAppeared[1][1] })
    }
    seenOverlapPairsRef.current.set(selectedDoctorId, new Set(currentPairs.keys()))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the doctor's rotation identity, not a stable dep array
  }, [selectedDoctorId, JSON.stringify(selectedDoctorRotations.map(r => [r.id, r.start_date, r.end_date]))])

  // External "jump here and start editing" entry point — e.g. the
  // end-of-rotation queue's "View in Matrix", or (a later prompt)
  // reactivating a doctor and dropping straight into adding their next
  // block. One-shot: consumed immediately so it doesn't re-fire on every
  // render, same shape as AnnualLeavePlanner's deepLinkMonth/
  // onDeepLinkConsumed pattern.
  useEffect(() => {
    if (!focusDoctorId) return
    onSelectDoctor(focusDoctorId)
    setEditing(true)
    setBlockError('')
    onFocusDoctorConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per focusDoctorId value, not on every onSelectDoctor/onFocusDoctorConsumed identity change
  }, [focusDoctorId])

  const currentOverlapPairs = selectedDoctorId ? overlapPairSet(selectedDoctorRotations) : new Map()

  async function handleBlockUpdate(rotation, patch) {
    setSavingBlockId(rotation.id)
    setBlockError('')
    try {
      await onUpdateRotation(rotation, patch)
    } catch (err) {
      setBlockError(err.message)
    }
    setSavingBlockId(null)
  }

  // A date field's current value: the uncommitted draft if there is one,
  // otherwise the rotation's own saved value — so typing doesn't lose its
  // place while nothing's been saved yet. `field` is the camelCase patch
  // key ('startDate'/'endDate', matching onUpdateRotation's shape); the
  // rotation object itself is snake_case ('start_date'/'end_date').
  function draftDateValue(rotation, field) {
    const rawField = field === 'startDate' ? 'start_date' : 'end_date'
    return blockDrafts[rotation.id]?.[field] ?? rotation[rawField] ?? ''
  }
  function setDraftDateValue(rotationId, field, value) {
    setBlockDrafts(d => ({ ...d, [rotationId]: { ...d[rotationId], [field]: value } }))
  }

  // Fires on a date field's blur — "confirming" that date, per the ask that
  // this only save when a date is approved (blur) or Done editing is
  // clicked, never on every intermediate onChange. A no-op if nothing
  // actually changed from the persisted value (e.g. a focus/blur with no
  // edit in between never fires a pointless save).
  async function commitBlockDraft(rotation) {
    const draft = blockDrafts[rotation.id]
    if (!draft) return
    const patch = {}
    if ('startDate' in draft && draft.startDate !== rotation.start_date) patch.startDate = draft.startDate
    if ('endDate' in draft && (draft.endDate || null) !== rotation.end_date) patch.endDate = draft.endDate || null
    setBlockDrafts(d => { const next = { ...d }; delete next[rotation.id]; return next })
    if (Object.keys(patch).length === 0) return
    await handleBlockUpdate(rotation, patch)
  }

  // Done editing's safety net — blur already fires (and so already saves)
  // when a click moves focus elsewhere, including onto Done editing
  // itself, so in practice any draft is usually already committed by the
  // time this runs. Flushing here too just covers a keyboard-driven close
  // (e.g. Enter) that never blurred the field first.
  async function finishEditing() {
    await Promise.all(selectedDoctorRotations.map(commitBlockDraft))
    setEditing(false)
  }

  async function handleBlockRemove(rotation) {
    setSavingBlockId(rotation.id)
    setBlockError('')
    try {
      await onDeleteRotation(rotation)
    } catch (err) {
      setBlockError(err.message)
    }
    setSavingBlockId(null)
  }

  async function handleAddBlock() {
    if (!selectedDoctor) return
    setSavingBlockId('new')
    setBlockError('')
    const last = selectedDoctorRotations[selectedDoctorRotations.length - 1]
    const startDate = last ? (last.end_date === null ? today : addDays(last.end_date, 1)) : today
    const endDate = selectedDoctor.category === 'Registrar' ? addMonths(startDate, 3) : null
    try {
      await onCreateRotation({
        doctorId: selectedDoctor.id,
        rotationType: 'EC',
        subtype: null,
        startDate,
        endDate,
        createdBy: currentUserId,
      })
    } catch (err) {
      setBlockError(err.message)
    }
    setSavingBlockId(null)
  }

  // "Current month" panel default view — resolved off TODAY, not
  // whichever year the grid happens to be showing (answers "who's doing
  // what right now" independent of browsing), and respects the toolbar's
  // own search/category filter same as the grid/cards below it.
  const currentByTypeKey = new Map()
  if (!selectedDoctorId) {
    for (const doctor of filteredDoctors) {
      const rotation = rotationForDate(rotationsByDoctorId.get(doctor.id), today)
      if (!rotation) continue
      const key = rotationTypeKey(rotation.rotation_type, rotation.subtype)
      if (!currentByTypeKey.has(key)) currentByTypeKey.set(key, [])
      currentByTypeKey.get(key).push(doctor)
    }
  }

  // Add-doctor candidates: doctors with zero intern_rotations rows at
  // all — "unassigned". Always computed off the full, unfiltered doctor
  // pool (the toolbar's search/category filter narrows what's visible in
  // the grid/cards, not who's eligible to be added).
  function unassignedInCategory(catKey) {
    return doctors.filter(d => categoryGroupKey(d) === catKey && !(rotationsByDoctorId.get(d.id)?.length))
  }
  function allUnassigned() {
    return doctors.filter(d => !(rotationsByDoctorId.get(d.id)?.length))
  }

  async function handlePickNewDoctor(doctorId) {
    if (addingDoctor) return
    const doctor = doctorById.get(doctorId)
    if (!doctor) return
    setAddingDoctor(true)
    setAddDoctorError('')
    const startDate = today
    const endDate = doctor.category === 'Registrar' ? addMonths(startDate, 3) : null
    try {
      await onCreateRotation({ doctorId, rotationType: 'EC', subtype: null, startDate, endDate, createdBy: currentUserId })
      setAddDoctorFor(null)
      setAddDoctorSearch('')
      onSelectDoctor(doctorId)
      setEditing(true)
      setBlockError('')
    } catch (err) {
      setAddDoctorError(err.message)
    }
    setAddingDoctor(false)
  }

  const gridTemplateColumns = `${LABEL_COL_WIDTH}px repeat(12, ${MONTH_COL_WIDTH}px)`

  const filterFacets = [{
    key: 'category', icon: <ListFilter className="h-4 w-4" />, label: 'Category',
    value: categoryFilter, onChange: setCategoryFilter,
    options: CATEGORY_FILTER_OPTIONS,
    isActive: categoryFilter !== 'all',
  }]
  const clearActive = Boolean(search) || categoryFilter !== 'all'
  const onClearAll = () => { setSearch(''); setCategoryFilter('all') }

  // Shared by the md–lg standalone button and the Toolbar FAB's primary
  // action below `md` — same reset-then-open, one definition.
  const openAddDoctor = () => { setAddDoctorSearch(''); setAddDoctorError(''); setAddDoctorFor('all') }

  const menuItems = [
    { key: 'how-it-works', icon: <CircleQuestionMark className="h-4 w-4" />, label: 'How it works', disabled: true, onClick: () => {} },
    { key: 'review-log', icon: <ScrollText className="h-4 w-4" />, label: 'Review log', disabled: true, onClick: () => {} },
  ]

  const legendSwatches = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
      {ROTATION_TYPE_KEY_OPTIONS.map(o => (
        <span key={o.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: ROTATION_TYPE_COLOR[o.key] }} />
          {o.label}
        </span>
      ))}
    </div>
  )

  // Year nav + Today — the shared DateStepper rather than a hand-rolled
  // pair of buttons, so this page gets the same standard button styling
  // and the same "Today only shows once you've paged away" behaviour as
  // every other planner for free, instead of yet another bespoke copy of
  // both.
  const dateNav = <DateStepper unit="year" year={year} onChange={onYearChange} />

  const overflowMenu = (
    <PageActionsMenu
      title="Intern, COSMO, & Registrar Rotations"
      items={menuItems}
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
  )

  // ── Shared panel content (desktop's sticky aside / mobile's bottom sheet) ──
  function renderNoSelectionPanel() {
    return (
      <>
        <p className="text-sm font-semibold text-ink">{MONTH_ABBR[currentMonthIndex]} {currentYear} — right now</p>
        {currentByTypeKey.size === 0 ? (
          <p className="mt-2 text-xs text-ink-muted">No active rotations this month.</p>
        ) : (
          ROTATION_TYPE_KEY_OPTIONS.filter(o => currentByTypeKey.has(o.key)).map(o => (
            <div key={o.key} className="mt-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: ROTATION_TYPE_COLOR[o.key] }} />
                {o.label}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {currentByTypeKey.get(o.key).map(doctor => (
                  <button key={doctor.id} type="button" onClick={() => selectDoctorFromList(doctor.id)}>
                    <DoctorChip profile={doctor} displayNames={displayNames} />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </>
    )
  }

  // `showHeader` is false on mobile — there, this panel is the body of a
  // Modal that already renders the doctor's name and its own Close button
  // in the sheet header, so repeating both here would just be redundant
  // chrome stacked on top of Modal's.
  function renderDoctorPanel(showHeader = true) {
    return (
      <>
        {showHeader && (
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-ink" title={`${selectedDoctor.name || ''} ${selectedDoctor.surname}`.trim()}>
              {displayNames?.get(selectedDoctor.id) ?? selectedDoctor.surname}
            </p>
            <button
              type="button"
              onClick={() => onSelectDoctor(null)}
              aria-label="Close"
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-ink-muted hover:bg-canvas-sunken hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {currentOverlapPairs.size > 0 && (
          <div className="mt-2 flex items-start gap-1.5 rounded border border-flagRed/30 bg-flagRed-bg px-2 py-1.5 text-xs text-flagRed">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              {[...currentOverlapPairs.values()].map(([a, b], i) => (
                <span key={i}>
                  {i > 0 && '; '}
                  {typeLabel(rotationTypeKey(a.rotation_type, a.subtype))} and {typeLabel(rotationTypeKey(b.rotation_type, b.subtype))} both cover {overlapMonthRange(a, b)}
                </span>
              ))}
            </span>
          </div>
        )}
        {blockError && <p className="mt-2 text-xs text-flagRed">{blockError}</p>}

        {!editing ? (
          <>
            <div className="mt-3 space-y-2">
              {selectedDoctorRotations.length === 0 && (
                <p className="text-xs text-ink-muted">No rotation blocks yet.</p>
              )}
              {selectedDoctorRotations.map(rotation => {
                const key = rotationTypeKey(rotation.rotation_type, rotation.subtype)
                return (
                  <div key={rotation.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="rounded px-1.5 py-0.5 font-medium text-white"
                      style={{ backgroundColor: ROTATION_TYPE_COLOR[key] }}
                    >
                      {typeLabel(key)}
                    </span>
                    <span className="text-ink-light">
                      {rotation.start_date} – {rotation.end_date || 'ongoing'}
                    </span>
                  </div>
                )
              })}
            </div>
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary mt-3 w-full text-xs">
              Edit rotations
            </button>
          </>
        ) : (
          <div className="mt-3 space-y-3">
            {selectedDoctorRotations.map(rotation => {
              const key = rotationTypeKey(rotation.rotation_type, rotation.subtype)
              const rowSaving = savingBlockId === rotation.id
              const typeOptions = rotationTypeOptionsForCategory(selectedDoctor.category)
              return (
                <div key={rotation.id} className="rounded border border-slate-line p-2">
                  <div className="flex items-center gap-2">
                    <SelectMenu
                      value={key}
                      disabled={rowSaving}
                      onChange={v => {
                        const opt = ROTATION_TYPE_KEY_OPTIONS.find(o => o.key === v)
                        handleBlockUpdate(rotation, { rotationType: opt.rotationType, subtype: opt.subtype })
                      }}
                      options={typeOptions.map(o => ({ value: o.key, label: o.label }))}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleBlockRemove(rotation)}
                      disabled={rowSaving}
                      aria-label="Remove block"
                      title="Remove block"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-flagRed hover:bg-flagRed-bg disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <label className="flex items-center gap-2 text-xs text-ink-muted">
                      <span className="w-8 flex-shrink-0">From</span>
                      <input
                        type="date"
                        value={draftDateValue(rotation, 'startDate')}
                        disabled={rowSaving}
                        onChange={e => setDraftDateValue(rotation.id, 'startDate', e.target.value)}
                        onBlur={() => commitBlockDraft(rotation)}
                        className="input-field flex-1 py-1 text-xs"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-ink-muted">
                      <span className="w-8 flex-shrink-0">To</span>
                      <input
                        type="date"
                        value={draftDateValue(rotation, 'endDate')}
                        disabled={rowSaving}
                        placeholder="Ongoing"
                        onChange={e => setDraftDateValue(rotation.id, 'endDate', e.target.value)}
                        onBlur={() => commitBlockDraft(rotation)}
                        className="input-field flex-1 py-1 text-xs"
                      />
                    </label>
                  </div>
                </div>
              )
            })}
            <button
              type="button"
              onClick={handleAddBlock}
              disabled={savingBlockId === 'new'}
              className="btn-secondary flex w-full items-center justify-center gap-1.5 text-xs disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> {savingBlockId === 'new' ? 'Adding…' : 'Add block'}
            </button>
            <button type="button" onClick={finishEditing} className="w-full text-center text-xs text-ink-muted hover:text-ink">
              Done editing
            </button>
          </div>
        )}
      </>
    )
  }

  const addDoctorPicker = addDoctorFor && (
    <DoctorDropdown
      profiles={addDoctorFor === 'all' ? allUnassigned() : unassignedInCategory(addDoctorFor)}
      displayNames={displayNames}
      search={addDoctorSearch}
      onSearchChange={setAddDoctorSearch}
      onSelect={handlePickNewDoctor}
      onClose={() => { if (!addingDoctor) { setAddDoctorFor(null); setAddDoctorSearch(''); setAddDoctorError('') } }}
      date={today}
      shiftCode={addingDoctor ? 'Adding…' : 'Add to rotation'}
    />
  )

  const overlapModal = newOverlapModal && (
    <Modal title="Overlapping rotations" onClose={() => setNewOverlapModal(null)} maxWidthClassName="md:max-w-sm">
      <p className="text-sm text-ink">
        {typeLabel(rotationTypeKey(newOverlapModal.a.rotation_type, newOverlapModal.a.subtype))} and{' '}
        {typeLabel(rotationTypeKey(newOverlapModal.b.rotation_type, newOverlapModal.b.subtype))} both cover{' '}
        {overlapMonthRange(newOverlapModal.a, newOverlapModal.b)} for {displayNames?.get(selectedDoctor?.id) ?? selectedDoctor?.surname}.
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        This doesn&apos;t block saving — adjust the dates above if this wasn&apos;t intended.
      </p>
    </Modal>
  )

  // ── Desktop ──────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Toolbar
            className="mb-3"
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search name…"
            filterFacets={filterFacets}
            mobileMode="inline"
            desktopTrailing={<div className="flex items-center gap-2">{dateNav}{overflowMenu}</div>}
            active={clearActive}
            onClearAll={onClearAll}
          />

          <div className="mb-3">{legendSwatches}</div>

          <div className="card overflow-x-auto p-0">
            <div className="grid border-b border-slate-line bg-canvas-cool text-[11px] font-semibold uppercase tracking-wide text-ink-muted" style={{ gridTemplateColumns }}>
              <div className="sticky left-0 z-10 bg-canvas-cool px-2 py-1.5">Doctor</div>
              {MONTH_ABBR.map((label, i) => (
                <div key={label} className={`px-1 py-1.5 text-center ${i === currentMonthIndex && year === currentYear ? 'text-accent' : ''}`}>
                  {label}
                </div>
              ))}
            </div>

            {groups.length === 0 && (
              <p className="p-4 text-center text-sm text-ink-muted">No doctors match this filter.</p>
            )}

            {groups.map(group => (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroupCollapsed(group.key)}
                  className="flex w-full items-center justify-between bg-canvas-sunken px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted transition-colors hover:bg-slate-line"
                >
                  <span>{group.label} <span className="ml-1 normal-case font-normal">{group.items.length}</span></span>
                  <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
                </button>

                {!collapsedGroups[group.key] && group.items.map(doctor => {
                  const doctorRotations = rotationsByDoctorId.get(doctor.id) || []
                  const segments = runLengthSegments(monthlyTypeKeys(doctorRotations, year))
                  const label = displayNames?.get(doctor.id) ?? doctor.surname
                  return (
                    <div key={doctor.id} className="grid border-b border-slate-line last:border-0" style={{ gridTemplateColumns }}>
                      <button
                        type="button"
                        onClick={() => selectDoctor(doctor.id)}
                        title={`${doctor.name || ''} ${doctor.surname}`.trim()}
                        className={`sticky left-0 z-10 truncate border-r border-slate-line bg-canvas-raised px-2 py-2 text-left text-xs font-medium transition-colors hover:bg-canvas-sunken ${
                          selectedDoctorId === doctor.id ? 'bg-accent-tint text-accent' : 'text-ink'
                        }`}
                      >
                        {label}
                      </button>
                      <div className="relative col-span-12" style={{ height: 36 }}>
                        {segments.map(seg => (
                          <div
                            key={`${seg.startMonthIndex}-${seg.typeKey}`}
                            title={typeLabel(seg.typeKey)}
                            className="absolute top-1/2 -translate-y-1/2"
                            style={{
                              left: seg.startMonthIndex * MONTH_COL_WIDTH,
                              width: (seg.endMonthIndex - seg.startMonthIndex + 1) * MONTH_COL_WIDTH,
                              height: 22,
                              backgroundColor: ROTATION_TYPE_COLOR[seg.typeKey],
                            }}
                          />
                        ))}
                        {year === currentYear && (
                          <div
                            className="pointer-events-none absolute top-1/2 -translate-y-1/2"
                            style={{
                              left: currentMonthIndex * MONTH_COL_WIDTH,
                              width: MONTH_COL_WIDTH,
                              height: 24,
                              boxShadow: '0 0 0 0.5px white, 0 0 0 2px #0f172a, 0 0 0 2.5px white',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}

                {!collapsedGroups[group.key] && (
                  <div className="border-b border-slate-line px-2 py-1.5 last:border-0">
                    <button
                      type="button"
                      onClick={() => { setAddDoctorSearch(''); setAddDoctorError(''); setAddDoctorFor(group.key) }}
                      className="rounded border border-dashed border-slate-line px-2 py-1 text-xs text-ink hover:bg-canvas-sunken"
                    >
                      + Add doctor
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 lg:h-fit lg:w-72 lg:flex-shrink-0">
          <div className="card p-3">{!selectedDoctor ? renderNoSelectionPanel() : renderDoctorPanel()}</div>
        </aside>

        {addDoctorPicker}
        {addDoctorError && <p className="mt-2 text-xs text-flagRed">{addDoctorError}</p>}
        {overlapModal}
      </div>
    )
  }

  // ── Mobile ───────────────────────────────────────────────────────────
  return (
    <div>
      {/* Below `md` everything here except the year selector moves into the
          Toolbar FAB (§15) — search, Category, Legend and the kebab. This
          branch runs to `lg` (useIsDesktop) while the FAB stops at `md`, so
          the md–lg band keeps the row it already had. The year selector
          stays put at every width: it's what the grid below is showing, not
          a way of narrowing it. */}
      <div className="sticky top-0 z-20 -mx-4 space-y-2 border-b border-slate-line bg-canvas px-4 py-2">
        <div className="hidden md:block">
          <Toolbar
            className=""
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search name…"
            filterFacets={filterFacets}
            mobileMode="inline"
            active={clearActive}
            onClearAll={onClearAll}
            trailing={
              <div className="flex items-center gap-1.5">
                <LegendSheet
                  title="Legend"
                  trigger={onClick => (
                    <button type="button" onClick={onClick} className="btn-secondary h-[30px] px-2 text-xs">Legend</button>
                  )}
                >
                  {legendSwatches}
                </LegendSheet>
                {overflowMenu}
              </div>
            }
          />
        </div>
        {dateNav}
      </div>

      <div className="mt-3 space-y-4 pb-20">
        {groups.length === 0 && (
          <p className="p-4 text-center text-sm text-ink-muted">No doctors match this filter.</p>
        )}
        {groups.map(group => (
          <div key={group.key}>
            <button
              type="button"
              onClick={() => toggleGroupCollapsed(group.key)}
              className="flex w-full items-center justify-between bg-canvas-sunken px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted transition-colors hover:bg-slate-line"
            >
              <span>{group.label} <span className="ml-1 normal-case font-normal">{group.items.length}</span></span>
              <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
            </button>

            {!collapsedGroups[group.key] && (
              <div className="mt-2 space-y-2">
                {group.items.map(doctor => {
                  const doctorRotations = rotationsByDoctorId.get(doctor.id) || []
                  const segments = runLengthSegments(monthlyTypeKeys(doctorRotations, year))
                  const cells = flattenSegmentsToCells(segments)
                  const label = displayNames?.get(doctor.id) ?? doctor.surname
                  return (
                    <button
                      key={doctor.id}
                      type="button"
                      onClick={() => selectDoctor(doctor.id)}
                      className={`card block w-full p-3 text-left ${selectedDoctorId === doctor.id ? 'ring-1 ring-accent' : ''}`}
                    >
                      <p className="text-sm font-medium text-ink">{label}</p>
                      {cells.length === 0 ? (
                        <p className="mt-1 text-xs text-ink-muted">No rotation in {year}</p>
                      ) : (
                        <>
                          <div className="mt-2 flex overflow-hidden rounded">
                            {cells.map((cell, i) => (
                              <div
                                key={cell.monthIndex}
                                title={`${MONTH_ABBR[cell.monthIndex]} — ${typeLabel(cell.typeKey)}`}
                                className={`h-6 flex-1 ${i === 0 ? 'rounded-l' : ''} ${i === cells.length - 1 ? 'rounded-r' : ''}`}
                                style={{ backgroundColor: ROTATION_TYPE_COLOR[cell.typeKey] }}
                              />
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-ink-muted">
                            {MONTH_ABBR[cells[0].monthIndex]} – {MONTH_ABBR[cells[cells.length - 1].monthIndex]} {year}
                          </p>
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add doctor was its own bottom-right FAB, which put two FABs in one
          corner once the Toolbar FAB arrived — below `md` it's the Toolbar
          FAB's `primaryAction` (nearest the ⊕) instead. The md–lg band,
          which the Toolbar FAB doesn't cover, keeps the standalone button. */}
      <button
        type="button"
        onClick={openAddDoctor}
        aria-label="Add doctor"
        className="fixed bottom-20 right-4 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-raised md:flex"
      >
        <Plus className="h-6 w-6" />
      </button>

      <FloatingActionMenu
        primaryAction={{ icon: Plus, label: 'Add doctor', onClick: openAddDoctor }}
        search={{ value: search, onChange: setSearch, placeholder: 'Search name…' }}
        filter={{
          facets: filterFacets,
          active: clearActive,
          onClearAll,
          sheetTitle: 'Filters',
        }}
        legend={{ title: 'Legend', children: legendSwatches }}
        moreMenu={{ title: 'Intern, COSMO, & Registrar Rotations', items: menuItems }}
      />

      {selectedDoctor && (
        <Modal title={displayNames?.get(selectedDoctor.id) ?? selectedDoctor.surname} onClose={() => onSelectDoctor(null)}>
          {renderDoctorPanel(false)}
        </Modal>
      )}

      {addDoctorPicker}
      {addDoctorError && (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <p className="rounded-lg bg-flagRed-bg px-3 py-2 text-xs text-flagRed shadow-raised">{addDoctorError}</p>
        </div>
      )}
      {overlapModal}
    </div>
  )
}
