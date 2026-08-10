import { useEffect, useRef, useState } from 'react'
import { ChevronDown, TriangleAlert, X, Plus } from 'lucide-react'
import SelectMenu from './SelectMenu'
import DoctorChip from './DoctorChip'
import Modal from './Modal'
import { rotationForDate, groupRotationsByDoctorId, rotationTouchesMonth } from '../lib/internRotations'
import {
  ROTATION_TYPE_KEY_OPTIONS, rotationTypeKey, rotationTypeOptionsForCategory, ROTATION_TYPE_COLOR,
} from '../lib/staffDefaults'
import { todayStr, addDays, addMonths, MONTH_ABBR } from '../lib/dateRange'

// Literal pixel widths, not 1fr/minmax — every row (and the header) shares
// the exact same `gridTemplateColumns` string built from these two
// constants, which is what keeps month columns pixel-aligned across rows
// that would otherwise size independently.
const MONTH_COL_WIDTH = 56 // px
const LABEL_COL_WIDTH = 152 // px

const CATEGORY_GROUP_ORDER = ['Intern', 'Registrar', 'COSMO']
const CATEGORY_GROUP_LABEL = { Intern: 'Intern', Registrar: 'Registrar', COSMO: 'COSMO' }

const FAR_FUTURE = '9999-12-31' // stand-in for a null (open-ended) end_date in string date-range comparisons only

function typeLabel(key) {
  return ROTATION_TYPE_KEY_OPTIONS.find(o => o.key === key)?.label || key
}

// One type-key per month (1-12) for a doctor's rotations in the displayed
// year, or null for a genuine gap. A real data overlap (two rotations
// touching the same month) is tie-broken by latest start_date — this only
// decides what the bar itself shows; the overlap is still surfaced by the
// side panel's warning banner/modal regardless of which one wins here.
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
// what makes consecutive same-type months render as one bar, and adjacent
// different-type months render as two bars with no gap between them
// (both fall directly out of the pixel math once segments are computed).
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

function blocksOverlap(a, b) {
  const aEnd = a.end_date === null ? FAR_FUTURE : a.end_date
  const bEnd = b.end_date === null ? FAR_FUTURE : b.end_date
  return a.start_date <= bEnd && b.start_date <= aEnd
}

// Every overlapping pair among a doctor's blocks, as a Set of stable
// "smallerId|largerId" keys — used both to render the persistent banner
// (non-empty set) and to detect the exact moment a NEW pair appears (diff
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

// Replaces the old 4-month Timeline view. Rows = doctors, grouped by
// category (Intern / Registrar / COSMO, same visual pattern as the Staff
// list's category grouping); columns = the 12 months of one navigable
// year. Colour bars are driven by rotation_type + subtype together (5
// visual states — see ROTATION_TYPE_COLOR); a sticky right-hand panel
// shows either the current month's roster (nothing selected) or one
// doctor's editable block list.
//
// Deliberately month-granularity, not day-precision (a Gantt view was
// evaluated and dropped) — every date comparison here is in service of
// "which month(s) does this block touch", never a day-level layout.
export default function InternRotationsMatrix({
  doctors, rotations, displayNames, currentUserId, year,
  onUpdateRotation, onCreateRotation, onDeleteRotation,
  selectedDoctorId, onSelectDoctor,
}) {
  const today = todayStr()
  const currentYear = Number(today.slice(0, 4))
  const currentMonthIndex = Number(today.slice(5, 7)) - 1
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [editing, setEditing] = useState(false)
  const [savingBlockId, setSavingBlockId] = useState(null)
  const [blockError, setBlockError] = useState('')
  const [newOverlapModal, setNewOverlapModal] = useState(null) // { a, b } | null
  const seenOverlapPairsRef = useRef(new Map()) // doctorId -> Set of pair keys already surfaced

  const rotationsByDoctorId = groupRotationsByDoctorId(rotations)
  const doctorById = new Map(doctors.map(d => [d.id, d]))

  function toggleGroupCollapsed(key) {
    setCollapsedGroups(g => ({ ...g, [key]: !g[key] }))
  }

  const groups = CATEGORY_GROUP_ORDER
    .map(key => ({
      key,
      label: CATEGORY_GROUP_LABEL[key],
      items: doctors
        .filter(d => categoryGroupKey(d) === key)
        .sort((a, b) => (a.surname || '').localeCompare(b.surname || '')),
    }))
    .filter(g => g.items.length > 0)

  function selectDoctor(doctorId) {
    setEditing(false)
    setBlockError('')
    onSelectDoctor(doctorId === selectedDoctorId ? null : doctorId)
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

  // "Current month" side-panel default view — resolved off TODAY, not
  // whichever year the grid happens to be showing (answers "who's doing
  // what right now" independent of browsing).
  const currentByTypeKey = new Map()
  if (!selectedDoctorId) {
    for (const doctor of doctors) {
      const rotation = rotationForDate(rotationsByDoctorId.get(doctor.id), today)
      if (!rotation) continue
      const key = rotationTypeKey(rotation.rotation_type, rotation.subtype)
      if (!currentByTypeKey.has(key)) currentByTypeKey.set(key, [])
      currentByTypeKey.get(key).push(doctor)
    }
  }

  const gridTemplateColumns = `${LABEL_COL_WIDTH}px repeat(12, ${MONTH_COL_WIDTH}px)`

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        {/* Legend — 5 visual states, since colour alone otherwise needs decoding */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {ROTATION_TYPE_KEY_OPTIONS.map(o => (
            <span key={o.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: ROTATION_TYPE_COLOR[o.key] }} />
              {o.label}
            </span>
          ))}
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

          {groups.map(group => (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => toggleGroupCollapsed(group.key)}
                className="flex w-full items-center justify-between bg-canvas-sunken px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted transition-colors hover:bg-slate-line"
              >
                <span>{group.label} <span className="ml-1 normal-case font-normal">{group.items.length}</span></span>
                <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${collapsedGroups[group.key] ? '' : 'rotate-180'}`} />
              </button>

              {!collapsedGroups[group.key] && group.items.map(doctor => {
                const doctorRotations = rotationsByDoctorId.get(doctor.id) || []
                const segments = runLengthSegments(monthlyTypeKeys(doctorRotations, year))
                const label = displayNames?.get(doctor.id) ?? doctor.surname
                return (
                  <div
                    key={doctor.id}
                    className="grid border-b border-slate-line last:border-0"
                    style={{ gridTemplateColumns }}
                  >
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
            </div>
          ))}
        </div>
      </div>

      {/* Sticky side panel */}
      <div className="lg:sticky lg:top-4 lg:h-fit lg:w-72 lg:flex-shrink-0">
        <div className="card p-3">
          {!selectedDoctor ? (
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
                        <DoctorChip key={doctor.id} profile={doctor} displayNames={displayNames} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <>
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
                              value={rotation.start_date}
                              disabled={rowSaving}
                              onChange={e => handleBlockUpdate(rotation, { startDate: e.target.value })}
                              className="input-field flex-1 py-1 text-xs"
                            />
                          </label>
                          <label className="flex items-center gap-2 text-xs text-ink-muted">
                            <span className="w-8 flex-shrink-0">To</span>
                            <input
                              type="date"
                              value={rotation.end_date || ''}
                              disabled={rowSaving}
                              placeholder="Ongoing"
                              onChange={e => handleBlockUpdate(rotation, { endDate: e.target.value || null })}
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
                  <button type="button" onClick={() => setEditing(false)} className="w-full text-center text-xs text-ink-muted hover:text-ink">
                    Done editing
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {newOverlapModal && (
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
      )}
    </div>
  )
}
