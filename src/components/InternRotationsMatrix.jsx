import { useEffect, useRef, useState } from 'react'
import SectionBar from './SectionBar'
import ExpandAllButton from './ExpandAllButton'
import { allSectionsCollapsed } from '../lib/collapsibleSections'
import {
  ChevronDown, EllipsisVertical, CircleQuestionMark, ScrollText,
  TriangleAlert, X, Plus, ChevronLeft, ChevronRight,
} from 'lucide-react'
import SelectMenu from './SelectMenu'
import DateFieldButton from './DateFieldButton'
import DoctorDropdown from './DoctorDropdown'
import Modal from './Modal'
import LegendSheet from './LegendSheet'
import { LegendIcon } from './PlannerIcons'
import PageActionsMenu from './PageActionsMenu'
import Toolbar from './Toolbar'
import FloatingActionMenu from './FloatingActionMenu'
import DateStepper from './DateStepper'
import RotationSequenceRow, { MonthLetterHeader } from './RotationSequenceRow'
import {
  rotationForDate, groupRotationsByDoctorId, activeRotationStatus, monthSpan, monthlyTypeKeys, CATEGORY_GROUP_ORDER, categoryGroupKey,
  matchesRotationFilter,
} from '../lib/internRotations'
import {
  ROTATION_TYPE_KEY_OPTIONS, rotationTypeKey, rotationTypeOptionsForCategory, rotationTypeLabel, rotationTypeShortName,
  ROTATION_TYPE_COLOR,
} from '../lib/staffDefaults'
import { todayStr, addDays, addMonths, MONTH_ABBR, formatDayMonthYear, parseLocalDate } from '../lib/dateRange'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useFillToViewport } from '../lib/useFillToViewport'

// Literal pixel widths, not 1fr/minmax — every row (and the header) shares
// the exact same `gridTemplateColumns` string built from these two
// constants, which is what keeps month columns pixel-aligned across rows
// that would otherwise size independently. Desktop grid only — mobile
// renders a flat, non-grid row instead (RotationSequenceRow's own
// 'mobile' layout). The month columns stretch to fill the table's width;
// this is only the floor, below which the grid scrolls sideways instead.
const MIN_MONTH_COL_WIDTH = 56 // px
const LABEL_COL_WIDTH = 240 // px — room for the name and the position line under it ("Until 31 Mar 2027 · month 8 of 12")

// Sections are Intern then Registrar (CATEGORY_GROUP_ORDER and
// categoryGroupKey, shared with the Rotation status table, live in
// lib/internRotations.js with the reasoning).
const CATEGORY_GROUP_LABEL = { Intern: 'Interns', Registrar: 'Registrars' }

// The Filter's one group — interns by the rotation they're on (OT split
// into its placements, nested under "OT intern"), registrars by category.
// Values are rotation-type keys (see matchesRotationFilter); placement
// labels come from the same map as the legend so the two always agree.
const ROTATION_FILTER_OPTIONS = [
  { value: 'EC', label: 'EC intern' },
  {
    label: 'OT intern',
    children: ['OT_DPM_BCH', 'OT_PSYCH', 'OT_LRCHC'].map(key => ({ value: key, label: rotationTypeLabel(key).replace('OT · ', '') })),
  },
  { value: 'Registrar', label: 'Registrar' },
]

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// The "right now" panel's own sections — unlike the table/cards below,
// which group by fixed category, this panel is specifically about what
// everyone's doing THIS month, so splitting interns by EC/OT here still
// earns its keep. Registrars only ever rotate in the EC, so they need no
// split.
const NOW_SECTIONS = [
  { key: 'ec-interns', label: 'EC interns' },
  { key: 'ot-interns', label: 'OT interns' },
  { key: 'registrars', label: 'Registrars' },
]

// "From 1 Jul 2026 to 31 Dec 2026", or "From 1 Jul 2026 · ongoing" with no end.
function rotationPeriodLabel(rotation) {
  const from = `From ${formatDayMonthYear(rotation.start_date)}`
  return rotation.end_date ? `${from} to ${formatDayMonthYear(rotation.end_date)}` : `${from} · ongoing`
}

// formatDayMonthYear's style, minus the year when it already matches the
// year the grid/cards are showing — "Until 30 Nov, then TB" reads fine
// without one; "block ends 28 Feb 2027" needs it once the block runs past
// the displayed year.
function formatPositionDate(dateStr, displayYear) {
  const d = parseLocalDate(dateStr)
  const base = `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`
  return d.getFullYear() === displayYear ? base : `${base} ${d.getFullYear()}`
}

// The Active tab's chip + position line for one doctor — see
// activeRotationStatus in internRotations.js for the underlying situation
// this formats, and its own docstring for the exact copy per case.
function activeChipAndLine(doctorRotations, year, today) {
  const status = activeRotationStatus(doctorRotations, today)
  const typeChip = rotation => {
    const key = rotationTypeKey(rotation.rotation_type, rotation.subtype)
    return { tone: 'type', color: ROTATION_TYPE_COLOR[key], text: rotationTypeLabel(key) }
  }
  switch (status.situation) {
    case 'ongoing':
      return { chip: typeChip(status.current), line: 'Ongoing' }
    case 'mid-block': {
      const nextKey = rotationTypeKey(status.next.rotation_type, status.next.subtype)
      return {
        chip: typeChip(status.current),
        line: `Until ${formatPositionDate(status.current.end_date, year)}, then ${rotationTypeShortName(nextKey)} · block ends ${formatPositionDate(status.blockEnd, year)}`,
      }
    }
    case 'last-in-block':
      return { chip: typeChip(status.current), line: `Until ${formatPositionDate(status.current.end_date, year)} · last rotation in block` }
    case 'single': {
      const index = monthSpan(status.blockStart, today)
      const total = monthSpan(status.blockStart, status.current.end_date)
      return { chip: typeChip(status.current), line: `Until ${formatPositionDate(status.current.end_date, year)} · month ${index} of ${total}` }
    }
    case 'between-blocks': {
      const nextKey = rotationTypeKey(status.next.rotation_type, status.next.subtype)
      return { chip: { tone: 'neutral', text: 'Between blocks' }, line: `Next: ${rotationTypeShortName(nextKey)} from ${formatPositionDate(status.next.start_date, year)}` }
    }
    default:
      return { chip: { tone: 'neutral', text: 'No rotation' }, line: 'No rotation scheduled' }
  }
}

function matchesSearch(doctor, search) {
  if (!search.trim()) return true
  const q = search.trim().toLowerCase()
  return `${doctor.name || ''} ${doctor.surname || ''}`.toLowerCase().includes(q)
}

function blocksOverlap(a, b) {
  const aEnd = a.end_date === null ? FAR_FUTURE : a.end_date
  const bEnd = b.end_date === null ? FAR_FUTURE : b.end_date
  return a.start_date <= bEnd && b.start_date <= aEnd
}

const FAR_FUTURE = '9999-12-31' // stand-in for a null (open-ended) end_date in string date-range comparisons only

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

// The only view this page has — Table and the old 4-month Timeline are
// both retired (Table's one remaining job, adding a new doctor, is now
// the "+ Add doctor" flow below). Rows = doctors, grouped by category
// (Intern / Registrar, same visual pattern as the Staff list's category
// grouping) — a doctor's row sequence (RotationSequenceRow.jsx) shows
// their whole year regardless of what's current, so no row ever jumps
// section when a rotation changes. Desktop: columns = the 12 months of a
// navigable year. Mobile: a genuinely different layout, not a shrunk
// grid — flat rows with a hairline divider, not cards.
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
  const [fillRef, fillStyle] = useFillToViewport(32, { fit: true })
  // "Right now"/doctor aside panel — measured the same way as the grid
  // (rather than a fixed `max-h-[calc(100dvh-2rem)]`) so the two land at
  // the same height instead of the panel always having more room than the
  // grid actually has to give.
  const [panelFillRef, panelFillStyle] = useFillToViewport(32, { fit: true })
  // The table's own width, so the twelve month columns can share it.
  const [gridNode, setGridNodeState] = useState(null)
  const [gridWidth, setGridWidth] = useState(0)
  useEffect(() => {
    if (!gridNode || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setGridWidth(gridNode.clientWidth))
    observer.observe(gridNode)
    setGridWidth(gridNode.clientWidth)
    return () => observer.disconnect()
  }, [gridNode])
  const setGridNode = el => { setGridNodeState(el); fillRef(el) }
  const today = todayStr()
  const currentYear = Number(today.slice(0, 4))
  const currentMonthIndex = Number(today.slice(5, 7)) - 1
  const [collapsedGroups, setCollapsedGroups] = useState({})
  // "Right now" panel: which of its sections are folded, and (below lg)
  // whether its sheet is open.
  const [collapsedNowSections, setCollapsedNowSections] = useState({})
  const [showNowSheet, setShowNowSheet] = useState(false)
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
  // Rotation awaiting delete confirmation, or null. Removing a block drops a
  // real date range off someone's record and there is no undo, so the X asks
  // first rather than acting on the single tap.
  const [removingRotation, setRemovingRotation] = useState(null)
  const seenOverlapPairsRef = useRef(new Map()) // doctorId -> Set of pair keys already surfaced
  const [search, setSearch] = useState('')
  const [rotationFilter, setRotationFilter] = useState(() => new Set())
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

  // The grid filters on the rotations its rows show (the displayed year);
  // the right-now panel below filters on today's instead.
  const searchedDoctors = doctors.filter(d => matchesSearch(d, search))
  const filteredDoctors = searchedDoctors.filter(d => matchesRotationFilter(
    d, monthlyTypeKeys(rotationsByDoctorId.get(d.id) || [], year).filter(Boolean), rotationFilter,
  ))

  // Fixed category sections — Interns, then Registrars, in that order. A
  // doctor never moves section when their current rotation changes (that
  // used to section by EC/OT interns here too, same as the "right now"
  // panel still does — see NOW_SECTIONS, which is unchanged and unrelated).
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
  const currentRotationId = selectedDoctorId ? rotationForDate(selectedDoctorRotations, today)?.id : null

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
    setRemovingRotation(null)
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

  // "Right now" panel — resolved off TODAY, not whichever year the grid
  // happens to be showing (answers "who's doing what right now"
  // independent of browsing), and respects the toolbar's own search and
  // Filter — the Filter applied to today's rotation, since that's what
  // this panel shows.
  const nowBySection = new Map(NOW_SECTIONS.map(sec => [sec.key, []]))
  for (const doctor of searchedDoctors) {
    const rotation = rotationForDate(rotationsByDoctorId.get(doctor.id), today)
    if (!rotation) continue
    const typeKey = rotationTypeKey(rotation.rotation_type, rotation.subtype)
    if (!matchesRotationFilter(doctor, [typeKey], rotationFilter)) continue
    const sectionKey = categoryGroupKey(doctor) === 'Registrar'
      ? 'registrars'
      : (typeKey === 'EC' ? 'ec-interns' : 'ot-interns')
    nowBySection.get(sectionKey).push({ doctor, rotation, typeKey })
  }
  for (const rows of nowBySection.values()) {
    // Surname first (what a reviewer scans for), start date as the
    // tie-break for two doctors sharing a surname.
    rows.sort((x, y) => {
      const bySurname = (x.doctor.surname || '').localeCompare(y.doctor.surname || '')
      if (bySurname !== 0) return bySurname
      return (x.rotation.start_date || '').localeCompare(y.rotation.start_date || '')
    })
  }
  const nowCount = [...nowBySection.values()].reduce((n, rows) => n + rows.length, 0)
  const nowTitle = `${MONTH_NAMES[currentMonthIndex]} ${currentYear}`

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

  const monthColWidth = Math.max(MIN_MONTH_COL_WIDTH, Math.floor((gridWidth - LABEL_COL_WIDTH) / 12))
  const gridTemplateColumns = `${LABEL_COL_WIDTH}px repeat(12, ${monthColWidth}px)`

  const filterGroups = [{
    key: 'category', label: 'Category', defaultExpanded: true,
    options: ROTATION_FILTER_OPTIONS,
    selected: rotationFilter, onChange: setRotationFilter,
  }]
  const clearActive = Boolean(search) || rotationFilter.size > 0
  const onClearAll = () => { setSearch(''); setRotationFilter(new Set()) }

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
  const dateNav = <DateStepper unit="year" year={year} onChange={onYearChange} nowrap todayLabel showToday={year !== currentYear} />

  const overflowMenu = (
    <PageActionsMenu
      title="Intern & Registrar Rotations"
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
  function renderNoSelectionPanel(showHeader = true) {
    const visibleNowSections = NOW_SECTIONS.filter(sec => nowBySection.get(sec.key).length > 0)
    return (
      <>
        {showHeader && (
          <>
            <p className="text-section-label uppercase text-ink-muted">Right now</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">{nowTitle}</p>
          </>
        )}
        {nowCount === 0 ? (
          <p className="mt-3 text-xs text-ink-muted">No active rotations this month.</p>
        ) : (
          <>
          {visibleNowSections.map(sec => {
            const rows = nowBySection.get(sec.key)
            const collapsed = collapsedNowSections[sec.key]
            return (
              <div key={sec.key} className="mt-3">
                <button
                  type="button"
                  onClick={() => setCollapsedNowSections(c => ({ ...c, [sec.key]: !c[sec.key] }))}
                  aria-expanded={!collapsed}
                  title={collapsed ? 'Expand' : 'Collapse'}
                  className="sheen-divider text-left transition-[filter] hover:brightness-110 active:brightness-110"
                >
                  <span>{sec.label} <span className="divider-meta ml-1 normal-case font-normal">{rows.length}</span></span>
                  <ChevronDown className={`divider-meta h-3 w-3 flex-shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
                </button>
                {!collapsed && (
                  <ul className="mt-1 divide-y divide-slate-hairline">
                    {rows.map(({ doctor, rotation, typeKey }) => (
                      <li key={doctor.id} className="flex items-start gap-2 py-2">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                          style={{ backgroundColor: ROTATION_TYPE_COLOR[typeKey] }}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-1.5">
                            <button
                              type="button"
                              onClick={() => { setShowNowSheet(false); selectDoctorFromList(doctor.id) }}
                              className="text-left text-sm font-semibold text-ink underline decoration-accent/50 underline-offset-[3px] transition-colors hover:text-accent"
                            >
                              {displayNames?.get(doctor.id) ?? doctor.surname}
                            </button>
                            {/* OT placement (Psych, LRCHC…) — plain OT has none. */}
                            {typeKey.startsWith('OT_') && (
                              <span className="rounded-full border border-slate-line px-1.5 text-[10px] text-ink-light">
                                {rotationTypeLabel(typeKey).replace('OT · ', '')}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-muted">{rotationPeriodLabel(rotation)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          {allSectionsCollapsed(visibleNowSections, collapsedNowSections) && (
            <ExpandAllButton onExpandAll={() => setCollapsedNowSections({})} />
          )}
          </>
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
          <>
            {/* Back to the "right now" list this doctor was opened from
                (or that sits behind a grid-row click). */}
            <button
              type="button"
              onClick={() => onSelectDoctor(null)}
              className="-ml-1 flex items-center gap-0.5 rounded px-1 text-sm font-medium text-accent hover:text-accent-dark"
            >
              <ChevronLeft className="h-4 w-4" /> Right now
            </button>
            <p className="mt-2 text-section-label uppercase text-ink-muted">{selectedDoctor.category}</p>
            <p className="mt-1 truncate font-display text-lg font-semibold text-ink" title={`${selectedDoctor.name || ''} ${selectedDoctor.surname}`.trim()}>
              {displayNames?.get(selectedDoctor.id) ?? selectedDoctor.surname}
            </p>
          </>
        )}

        {currentOverlapPairs.size > 0 && (
          <div className="mt-2 flex items-start gap-1.5 rounded border border-flagRed/30 bg-flagRed-bg px-2 py-1.5 text-xs text-flagRed">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              {[...currentOverlapPairs.values()].map(([a, b], i) => (
                <span key={i}>
                  {i > 0 && '; '}
                  {rotationTypeLabel(rotationTypeKey(a.rotation_type, a.subtype))} and {rotationTypeLabel(rotationTypeKey(b.rotation_type, b.subtype))} both cover {overlapMonthRange(a, b)}
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
                const isCurrent = rotation.id === currentRotationId
                return (
                  <div
                    key={rotation.id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                      isCurrent ? 'border-accent bg-accent-tint' : 'border-slate-line'
                    }`}
                  >
                    <span
                      className="flex-shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 font-medium text-white"
                      style={{ backgroundColor: ROTATION_TYPE_COLOR[key] }}
                    >
                      {rotationTypeLabel(key)}
                    </span>
                    <span className="text-ink-light">
                      {formatDayMonthYear(rotation.start_date)} – {rotation.end_date ? formatDayMonthYear(rotation.end_date) : 'ongoing'}
                    </span>
                    {key === 'OT' && (
                      <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0 text-flagRed" aria-label="Needs a subtype" />
                    )}
                    {isCurrent && <span className="ml-auto text-[10px] font-bold tracking-wide text-accent">NOW</span>}
                  </div>
                )
              })}
            </div>
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary mt-3 w-full">
              Edit rotations
            </button>
          </>
        ) : (
          <div className="mt-3 space-y-3">
            {selectedDoctorRotations.map(rotation => {
              const key = rotationTypeKey(rotation.rotation_type, rotation.subtype)
              const rowSaving = savingBlockId === rotation.id
              // There's no standalone "OT" rotation to pick, so
              // rotationTypeOptionsForCategory never offers it — but an
              // existing bare-OT row (legacy data, or a direct DB edit)
              // still needs its own current value represented, rather than
              // the dropdown falling back to its placeholder as if nothing
              // were selected. Shown only for the row that's actually on
              // it; choosing a real option below moves it off this state
              // for good, same as warningless rows.
              const typeOptions = key === 'OT'
                ? [{ key: 'OT', label: rotationTypeLabel('OT') }, ...rotationTypeOptionsForCategory(selectedDoctor.category)]
                : rotationTypeOptionsForCategory(selectedDoctor.category)
              return (
                <div key={rotation.id} className="rounded border border-slate-line p-2">
                  <div className="flex items-center gap-2">
                    <SelectMenu
                      value={key}
                      disabled={rowSaving}
                      onChange={v => {
                        if (v === 'OT') return // not a real choice — see typeOptions' own comment
                        const opt = ROTATION_TYPE_KEY_OPTIONS.find(o => o.key === v)
                        handleBlockUpdate(rotation, { rotationType: opt.rotationType, subtype: opt.subtype })
                      }}
                      options={typeOptions.map(o => ({ value: o.key, label: o.label }))}
                      className="flex-1"
                    />
                    {key === 'OT' && (
                      <TriangleAlert className="h-4 w-4 flex-shrink-0 text-flagRed" aria-label="Needs a subtype" />
                    )}
                    <button
                      type="button"
                      onClick={() => setRemovingRotation(rotation)}
                      disabled={rowSaving}
                      aria-label="Remove block"
                      title="Remove block"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-flagRed hover:bg-flagRed-bg disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {/* Each label sits beside its field rather than wrapping
                      it: this control carries a clear button of its own, and
                      a <label> around two labelable children names neither.
                      Commit-on-blur is unchanged — a date still saves when
                      it is approved (blur) or Done editing is pressed, never
                      on an intermediate keystroke. Clearing sets the draft
                      the same way and waits for the same commit point; an
                      empty To reads as "Ongoing", which a native date input
                      could not say (it ignores `placeholder` entirely). */}
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <label htmlFor={`rotation-from-${rotation.id}`} className="w-8 flex-shrink-0">From</label>
                      <div className="min-w-0 flex-1">
                        <DateFieldButton
                          id={`rotation-from-${rotation.id}`}
                          label="Rotation starts"
                          labelledExternally
                          value={draftDateValue(rotation, 'startDate')}
                          disabled={rowSaving}
                          onChange={v => setDraftDateValue(rotation.id, 'startDate', v)}
                          onBlur={() => commitBlockDraft(rotation)}
                          fullWidth
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <label htmlFor={`rotation-to-${rotation.id}`} className="w-8 flex-shrink-0">To</label>
                      <div className="min-w-0 flex-1">
                        <DateFieldButton
                          id={`rotation-to-${rotation.id}`}
                          label="Rotation ends"
                          labelledExternally
                          emptyLabel="Ongoing"
                          value={draftDateValue(rotation, 'endDate')}
                          disabled={rowSaving}
                          onChange={v => setDraftDateValue(rotation.id, 'endDate', v)}
                          onBlur={() => commitBlockDraft(rotation)}
                          fullWidth
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <button
              type="button"
              onClick={handleAddBlock}
              disabled={savingBlockId === 'new'}
              className="btn-secondary flex w-full items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> {savingBlockId === 'new' ? 'Adding…' : 'Add block'}
            </button>
            {/* A real button, not a bare text link: it closes the editor and
                flushes any uncommitted date draft, which is the same weight of
                action as the two buttons above it and was sitting at 16px
                against their 30. */}
            <button type="button" onClick={finishEditing} className="btn-ghost w-full">
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
        {rotationTypeLabel(rotationTypeKey(newOverlapModal.a.rotation_type, newOverlapModal.a.subtype))} and{' '}
        {rotationTypeLabel(rotationTypeKey(newOverlapModal.b.rotation_type, newOverlapModal.b.subtype))} both cover{' '}
        {overlapMonthRange(newOverlapModal.a, newOverlapModal.b)} for {displayNames?.get(selectedDoctor?.id) ?? selectedDoctor?.surname}.
      </p>
      <p className="mt-2 text-xs text-ink-muted">
        This doesn&apos;t block saving — adjust the dates above if this wasn&apos;t intended.
      </p>
    </Modal>
  )

  const removeModal = removingRotation && (
    <Modal
      title="Delete this rotation?"
      onClose={() => setRemovingRotation(null)}
      maxWidthClassName="md:max-w-[420px]"
      footer={
        <>
          <button type="button" onClick={() => handleBlockRemove(removingRotation)} className="btn-danger text-sm">Yes, delete</button>
          <button type="button" onClick={() => setRemovingRotation(null)} className="btn-secondary text-sm">No</button>
        </>
      }
    >
      <p className="text-sm text-ink">
        {rotationTypeLabel(rotationTypeKey(removingRotation.rotation_type, removingRotation.subtype))},{' '}
        {removingRotation.start_date} – {removingRotation.end_date || 'ongoing'}, will be removed from{' '}
        {displayNames?.get(selectedDoctor?.id) ?? selectedDoctor?.surname}&apos;s record.
      </p>
      <p className="mt-2 text-xs text-ink-muted">This cannot be undone.</p>
    </Modal>
  )

  // ── Desktop ──────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div>
        {/* Search, Filter, Legend and the kebab in one run on the left. The
            year isn't here — it leads the side panel instead, the way the
            leave planners' year stepper leads theirs. The search box is
            what gives as the window narrows. */}
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 max-w-[480px] flex-1">
            <Toolbar
              className=""
              stretch
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search name…"
              filterGroups={filterGroups}
              mobileMode="inline"
              active={clearActive}
              onClearAll={onClearAll}
            />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <LegendSheet
              title="Legend"
              trigger={onClick => (
                <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-utility h-[30px] w-[30px] p-0"><LegendIcon className="h-4 w-4" /></button>
              )}
            >
              {legendSwatches}
            </LegendSheet>
            {overflowMenu}
          </div>
        </div>

        {/* Grid and panel start on the same line, below the toolbar. */}
        <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {/* Ends at its last row when the list is short; with a long one it
              stops at the window's edge and scrolls inside, month header
              pinned. */}
          {/* On the page's own dark ground rather than a card, like Team
              Leave and Hours Summary — so a selected row's tint stands out. */}
          <div ref={setGridNode} style={fillStyle} className="overflow-auto rounded-lg border border-slate-line bg-canvas">
            <div className="sticky top-0 z-20 grid border-b border-slate-line bg-canvas-sunken text-[11px] font-semibold uppercase tracking-wide text-ink-muted" style={{ gridTemplateColumns }}>
              <div className="sticky left-0 z-10 bg-canvas-sunken px-3 py-2">Doctor</div>
              {MONTH_ABBR.map((label, i) => (
                <div key={label} className={`px-1 py-2 text-center ${i === currentMonthIndex && year === currentYear ? 'text-accent' : ''}`}>
                  {label}
                </div>
              ))}
            </div>

            {groups.length === 0 && (
              <p className="p-4 text-center text-sm text-ink-muted">No doctors match this filter.</p>
            )}

            {groups.map(group => (
              <div key={group.key} data-section={group.key} className="w-max min-w-full">
                <SectionBar label={group.label} count={group.items.length} collapsed={collapsedGroups[group.key]} onToggle={() => toggleGroupCollapsed(group.key)} className="m-1" />
                {!collapsedGroups[group.key] && group.items.map(doctor => {
                  const doctorRotations = rotationsByDoctorId.get(doctor.id) || []
                  const label = displayNames?.get(doctor.id) ?? doctor.surname
                  const { chip, line } = activeChipAndLine(doctorRotations, year, today)
                  const isSelected = selectedDoctorId === doctor.id
                  return (
                    <RotationSequenceRow
                      key={doctor.id}
                      layout="desktop"
                      doctor={doctor}
                      label={label}
                      rotations={doctorRotations}
                      year={year}
                      currentYear={currentYear}
                      showCurrentMonthHalo
                      chip={chip}
                      positionLine={line}
                      isSelected={isSelected}
                      onSelect={() => selectDoctor(doctor.id)}
                      gridTemplateColumns={gridTemplateColumns}
                    />
                  )
                })}

                {!collapsedGroups[group.key] && (
                  <div className="border-t border-slate-hairline px-3 py-1.5">
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
          {allSectionsCollapsed(groups, collapsedGroups) && (
            <ExpandAllButton onExpandAll={() => setCollapsedGroups({})} />
          )}
        </div>

        {/* The year leads the panel (as on the leave planners) and stays
            put; what's under it scrolls on its own once it outgrows the
            screen, and the grid stays put either way. */}
        <aside className="sticky top-4 w-72 flex-shrink-0">
          <div ref={panelFillRef} style={panelFillStyle} className="card flex flex-col overflow-hidden">
            <div className="flex-shrink-0 border-b border-slate-line p-3">
              <DateStepper unit="year" year={year} onChange={onYearChange} centered nowrap todayLabel showToday={year !== currentYear} />
            </div>
            <div className="min-h-0 overflow-y-auto p-4">{!selectedDoctor ? renderNoSelectionPanel() : renderDoctorPanel()}</div>
          </div>
        </aside>
        </div>

        {addDoctorPicker}
        {addDoctorError && <p className="mt-2 text-xs text-flagRed">{addDoctorError}</p>}
        {overlapModal}
        {removeModal}
      </div>
    )
  }

  // ── Mobile ───────────────────────────────────────────────────────────
  return (
    <div>
      {/* Below `md` search, Category, Legend and the kebab live in the
          Toolbar FAB (§15), so only the year selector stays on this row.
          From `md` to `lg` (this branch runs to useIsDesktop's 1024px) they
          share one row with it: find on the left, year + Legend + kebab on
          the right — the desktop toolbar's shape, nothing wrapping. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-line bg-canvas px-4 py-2">
        <div className="flex items-center gap-2 pb-2">
          <div className="hidden min-w-0 flex-1 md:block">
            <Toolbar
              className=""
              stretch
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search name…"
              filterGroups={filterGroups}
              mobileMode="inline"
              active={clearActive}
              onClearAll={onClearAll}
            />
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {dateNav}
            <div className="hidden items-center gap-2 md:flex">
              <div className="h-5 w-px bg-slate-line" aria-hidden="true" />
              <LegendSheet
                title="Legend"
                trigger={onClick => (
                  <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-utility h-[30px] w-[30px] p-0"><LegendIcon className="h-4 w-4" /></button>
                )}
              >
                {legendSwatches}
              </LegendSheet>
              {overflowMenu}
            </div>
          </div>
          {/* On a phone the year stepper is alone on this row, so the
              "right now" summary rides beside it rather than taking a
              line of its own under it. The label gives way first: the
              count and the chevron are what make it read as a button. */}
          <button
            type="button"
            onClick={() => setShowNowSheet(true)}
            aria-label={`Now, ${MONTH_ABBR[currentMonthIndex]} ${currentYear}: ${nowCount} active. View`}
            className="card flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm md:hidden"
          >
            <span className="truncate font-semibold text-ink">Now · {MONTH_ABBR[currentMonthIndex]}</span>
            <span className="flex-shrink-0 text-xs text-ink-muted">{nowCount} active</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden="true" />
          </button>
        </div>

        {/* The "right now" panel, folded to one line — a 288px side panel
            would squeeze the grid at this width. Opens the full list. Sits
            above the month-letter header, inside the same sticky block, so
            it stays reachable alongside it rather than scrolling away.
            From md only: below that it is on the stepper's row above. */}
        <button
          type="button"
          onClick={() => setShowNowSheet(true)}
          className="card mb-2 hidden w-full items-center gap-2 px-3 py-2 text-left text-sm md:flex"
        >
          <span className="font-semibold text-ink">Now · {MONTH_ABBR[currentMonthIndex]} {currentYear}</span>
          <span className="truncate text-xs text-ink-muted">{nowCount} active</span>
          <span className="ml-auto flex flex-shrink-0 items-center text-xs font-medium text-accent">
            View <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </button>

        <MonthLetterHeader year={year} currentYear={currentYear} />
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
              title={collapsedGroups[group.key] ? 'Expand' : 'Collapse'}
              className="sheen-divider text-left transition-[filter] hover:brightness-110 active:brightness-110"
            >
              <span>{group.label} <span className="divider-meta ml-1 normal-case font-normal">{group.items.length}</span></span>
              <ChevronDown className={`divider-meta h-3 w-3 flex-shrink-0 transition-transform ${collapsedGroups[group.key] ? 'rotate-180' : ''}`} />
            </button>

            {!collapsedGroups[group.key] && (
              <div className="mt-2 space-y-0 overflow-hidden rounded-lg border border-slate-line">
                {group.items.map(doctor => {
                  const doctorRotations = rotationsByDoctorId.get(doctor.id) || []
                  const label = displayNames?.get(doctor.id) ?? doctor.surname
                  const { chip, line } = activeChipAndLine(doctorRotations, year, today)
                  return (
                    <RotationSequenceRow
                      key={doctor.id}
                      layout="mobile"
                      doctor={doctor}
                      label={label}
                      rotations={doctorRotations}
                      year={year}
                      currentYear={currentYear}
                      showCurrentMonthHalo
                      chip={chip}
                      positionLine={line}
                      isSelected={selectedDoctorId === doctor.id}
                      onSelect={() => selectDoctor(doctor.id)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        ))}
        {allSectionsCollapsed(groups, collapsedGroups) && (
          <ExpandAllButton onExpandAll={() => setCollapsedGroups({})} />
        )}
      </div>

      {/* Add doctor was its own bottom-right FAB, which put two FABs in one
          corner once the Toolbar FAB arrived — below `md` it's the Toolbar
          FAB's `primaryAction` (nearest the ⊕) instead. The md–lg band,
          which the Toolbar FAB doesn't cover, keeps the standalone button. */}
      <button
        type="button"
        onClick={openAddDoctor}
        aria-label="Add doctor"
        className="btn-fab fixed bottom-20 right-4 z-40 hidden h-14 w-14 md:flex"
      >
        <Plus className="h-6 w-6" />
      </button>

      <FloatingActionMenu
        primaryAction={{ icon: Plus, label: 'Add doctor', onClick: openAddDoctor }}
        search={{ value: search, onChange: setSearch, placeholder: 'Search name…' }}
        filter={{
          groups: filterGroups,
          active: clearActive,
          onClearAll,
          sheetTitle: 'Filters',
        }}
        legend={{ title: 'Legend', children: legendSwatches }}
        moreMenu={{ title: 'Intern & Registrar Rotations', items: menuItems }}
      />

      {showNowSheet && (
        <Modal title={`Right now · ${nowTitle}`} onClose={() => setShowNowSheet(false)}>
          {renderNoSelectionPanel(false)}
        </Modal>
      )}

      {selectedDoctor && (
        <Modal title={displayNames?.get(selectedDoctor.id) ?? selectedDoctor.surname} onClose={() => onSelectDoctor(null)}>
          {renderDoctorPanel(false)}
        </Modal>
      )}

      {addDoctorPicker}
      {addDoctorError && (
        <div className="fixed inset-x-0 bottom-[calc(70px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-4">
          <p className="rounded-lg bg-flagRed-bg px-3 py-2 text-xs text-flagRed shadow-raised">{addDoctorError}</p>
        </div>
      )}
      {overlapModal}
      {removeModal}
    </div>
  )
}
