import { useEffect, useState } from 'react'
import SectionBar from './SectionBar'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import ExpandAllButton from './ExpandAllButton'
import { allSectionsCollapsed } from '../lib/collapsibleSections'
import Modal from './Modal'
import Tag from './Tag'
import DateFieldButton from './DateFieldButton'
import Toolbar from './Toolbar'
import { RotationLegendButton, RotationLegendSwatches, RotationsMoreMenu } from './RotationsToolbarParts'
import { ROTATIONS_PAGE_TITLE, ROTATIONS_MENU_ITEMS } from './rotationsMenuItems'
import FloatingActionMenu from './FloatingActionMenu'
import DateStepper from './DateStepper'
import RotationSequenceRow, { MonthLetterHeader } from './RotationSequenceRow'
import {
  groupRotationsByDoctorId, upcomingRotationStatus, completedRotationStatus, monthSpan, CATEGORY_GROUP_ORDER, categoryGroupKey,
  matchesRotationFilter, ROTATION_FILTER_OPTIONS,
} from '../lib/internRotations'
import { rotationTypeKey, rotationTypeShortName, ROTATION_TYPE_KEY_OPTIONS, ROTATION_TYPE_COLOR } from '../lib/staffDefaults'
import { todayStr, MONTH_ABBR, parseLocalDate } from '../lib/dateRange'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useFillToViewport } from '../lib/useFillToViewport'

const MIN_MONTH_COL_WIDTH = 56 // px — same floor as InternRotationsMatrix's own grid
const LABEL_COL_WIDTH = 240 // px — same as InternRotationsMatrix, so the tabs line up

const CATEGORY_GROUP_LABEL = { Intern: 'Interns', Registrar: 'Registrars' }
const NO_ROTATIONS_GROUP_KEY = 'no-rotations'

function matchesSearch(doctor, search) {
  if (!search.trim()) return true
  const q = search.trim().toLowerCase()
  return `${doctor.name || ''} ${doctor.surname || ''}`.toLowerCase().includes(q)
}

// formatDayMonthYear's style, minus the year when it already matches the
// year the grid is showing — same rule InternRotationsMatrix's own
// position lines use.
function formatPositionDate(dateStr, displayYear) {
  const d = parseLocalDate(dateStr)
  const base = `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`
  return d.getFullYear() === displayYear ? base : `${base} ${d.getFullYear()}`
}

const COPY = {
  upcoming: {
    status: 'Scheduled',
    tone: 'warning',
    empty: 'No doctors with a scheduled start date.',
  },
  completed: {
    status: 'Inactive',
    tone: 'danger',
    empty: 'No completed doctors.',
  },
}

// The Upcoming tab's chip + position line for one doctor — see
// upcomingRotationStatus in internRotations.js for the underlying
// situation this formats.
function upcomingChipAndLine(doctor, doctorRotations, year) {
  const chip = { tone: 'neutral', text: `Starts ${formatPositionDate(doctor.scheduled_active_date, year)}` }
  const status = upcomingRotationStatus(doctorRotations)
  if (status.situation === 'none') return { chip, line: 'No rotations added yet' }
  if (status.situation === 'single') {
    const key = rotationTypeKey(status.rotation.rotation_type, status.rotation.subtype)
    const months = monthSpan(status.rotation.start_date, status.rotation.end_date)
    return {
      chip,
      line: `${rotationTypeShortName(key)} for ${months} month${months === 1 ? '' : 's'} · ends ${formatPositionDate(status.rotation.end_date, year)}`,
    }
  }
  const names = status.rotations.map(r => rotationTypeShortName(rotationTypeKey(r.rotation_type, r.subtype)))
  return {
    chip,
    line: `${names[0]}, then ${names.slice(1).join(', ')} · block ends ${formatPositionDate(status.blockEnd, year)}`,
  }
}

// The Completed tab's chip + position line for one doctor — totalled
// across every rotation on record, not just the displayed year (see
// completedRotationStatus).
function completedChipAndLine(doctor, doctorRotations, year) {
  const sorted = [...doctorRotations].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const lastEnd = sorted[sorted.length - 1]?.end_date || doctor.scheduled_inactive_date || null
  const chip = { tone: 'neutral', text: lastEnd ? `Finished ${formatPositionDate(lastEnd, year)}` : 'No rotations recorded' }
  const status = completedRotationStatus(doctorRotations)
  if (status.situation === 'none') return { chip, line: '' } // chip already says "No rotations recorded"
  const suffix = status.totalMonths === 1 ? '' : 's'
  if (status.situation === 'single-type') {
    const key = rotationTypeKey(status.rotation.rotation_type, status.rotation.subtype)
    return { chip, line: `${status.totalMonths} month${suffix} in ${rotationTypeShortName(key)}` }
  }
  return { chip, line: `${status.totalMonths} month${suffix} in ${status.blockCount} block${status.blockCount === 1 ? '' : 's'}` }
}

// What a row shows. Completed folds its "Finished …" chip into the line
// under the name ("Finished 31 Aug · 6 months in EC") — the chip was long
// enough to crowd the name out of the row's label column.
function rowChipAndLine(variant, doctor, doctorRotations, year) {
  if (variant === 'upcoming') return upcomingChipAndLine(doctor, doctorRotations, year)
  const { chip, line } = completedChipAndLine(doctor, doctorRotations, year)
  return { chip: null, line: [chip.text, line].filter(Boolean).join(' · ') }
}

function lastRotationEndYear(doctorRotations) {
  if (doctorRotations.length === 0) return null
  const sorted = [...doctorRotations].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const end = sorted[sorted.length - 1].end_date
  return end ? Number(end.slice(0, 4)) : null
}

// The Rotations page's Upcoming and Completed tabs — built on the same
// grid/row shell as the Active tab's matrix (InternRotationsMatrix.jsx):
// toolbar, legend, month header, fixed category sections, RotationSequenceRow
// rows, and the same sticky-panel/bottom-sheet selection pattern. Every
// existing action and its handler stays exactly as it was — they live in
// the panel, not on the row.
//
// `variant`:
//   'upcoming'  — inactive doctors with a scheduled start. Lists everyone
//                 regardless of the displayed year; the year only decides
//                 which twelve months the cells show. Actions: Edit
//                 rotation, Change start date, Activate now.
//   'completed' — inactive doctors with no start scheduled. Scoped to the
//                 displayed year (whoever's last rotation ended in it); a
//                 doctor with no rotation rows at all can't be year-scoped,
//                 so they sit in their own trailing section every year.
//                 Actions: Reactivate, Edit rotation, View account.
export default function RotationStatusTable({
  variant, doctors, rotations, displayNames, year, onYearChange,
  onUpdateDate, onActivateNow, onReactivate, onEditRotation,
}) {
  const copy = COPY[variant]
  const today = todayStr()
  const currentYear = Number(today.slice(0, 4))
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const [gridRef, fillStyle] = useFillToViewport(32, { fit: true })
  const [gridNode, setGridNodeState] = useState(null)
  const [gridWidth, setGridWidth] = useState(0)
  useEffect(() => {
    if (!gridNode || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setGridWidth(gridNode.clientWidth))
    observer.observe(gridNode)
    setGridWidth(gridNode.clientWidth)
    return () => observer.disconnect()
  }, [gridNode])
  const setGridNode = el => { setGridNodeState(el); gridRef(el) }

  const [search, setSearch] = useState('')
  const [rotationFilter, setRotationFilter] = useState(() => new Set())
  const [selectedId, setSelectedId] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  // Panel-local editing: the start date (Upcoming) or active-from date
  // (Completed) field is only open after its button is pressed.
  const [dateOpen, setDateOpen] = useState(false)
  const [draftDate, setDraftDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const rotationsByDoctor = groupRotationsByDoctorId(rotations)

  // Same Filter as the Active tab, matched against every rotation on
  // record rather than the displayed year's: Upcoming lists its doctors
  // whatever year is showing, and a Completed doctor's history is the
  // point of the tab.
  const filteredDoctors = doctors.filter(d => matchesSearch(d, search) && matchesRotationFilter(
    d, (rotationsByDoctor.get(d.id) || []).map(r => rotationTypeKey(r.rotation_type, r.subtype)), rotationFilter,
  ))

  const groups = variant === 'upcoming'
    ? CATEGORY_GROUP_ORDER
      .map(key => ({
        key,
        label: CATEGORY_GROUP_LABEL[key],
        items: filteredDoctors
          .filter(d => categoryGroupKey(d) === key)
          .sort((a, b) => (a.scheduled_active_date || '').localeCompare(b.scheduled_active_date || '') || (a.surname || '').localeCompare(b.surname || '')),
      }))
      .filter(g => g.items.length > 0)
    : [
      ...CATEGORY_GROUP_ORDER.map(key => ({
        key,
        label: CATEGORY_GROUP_LABEL[key],
        items: filteredDoctors
          .filter(d => categoryGroupKey(d) === key && lastRotationEndYear(rotationsByDoctor.get(d.id) || []) === year)
          .sort((a, b) => {
            const aEnd = [...(rotationsByDoctor.get(a.id) || [])].sort((x, y) => x.start_date.localeCompare(y.start_date)).pop()?.end_date || ''
            const bEnd = [...(rotationsByDoctor.get(b.id) || [])].sort((x, y) => x.start_date.localeCompare(y.start_date)).pop()?.end_date || ''
            return bEnd.localeCompare(aEnd) // most recently finished first
          }),
      })),
      {
        key: NO_ROTATIONS_GROUP_KEY,
        label: 'No rotations recorded',
        items: filteredDoctors
          .filter(d => (rotationsByDoctor.get(d.id) || []).length === 0)
          .sort((a, b) => (a.surname || '').localeCompare(b.surname || '')),
      },
    ].filter(g => g.items.length > 0)

  if (doctors.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">{copy.empty}</p>
  }

  function toggleGroupCollapsed(key) {
    setCollapsed(c => ({ ...c, [key]: !c[key] }))
  }

  const selectedDoctor = doctors.find(d => d.id === selectedId) || null

  function select(id) {
    setSelectedId(current => (current === id ? null : id))
    setDateOpen(false)
    setError('')
  }

  // One wrapper for every panel action: lock the buttons, show a failure in
  // the panel, and leave the selection alone so the admin sees the result.
  async function run(action) {
    setSaving(true)
    setError('')
    try {
      await action()
      setDateOpen(false)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  function openDate(initial) {
    setDraftDate(initial)
    setDateOpen(true)
    setError('')
  }

  function renderPanel(showHeader = true) {
    if (!selectedDoctor) {
      return (
        <>
          <p className="text-section-label uppercase text-ink-muted">{variant === 'upcoming' ? 'Upcoming' : 'Completed'}</p>
          <p className="mt-1 font-display text-lg font-semibold text-ink">{doctors.length} doctor{doctors.length === 1 ? '' : 's'}</p>
          <p className="mt-2 text-sm text-ink-light">Select a doctor to see their details and actions.</p>
        </>
      )
    }
    const doctorRotations = rotationsByDoctor.get(selectedDoctor.id) || []
    const { chip, line } = variant === 'upcoming'
      ? upcomingChipAndLine(selectedDoctor, doctorRotations, year)
      : completedChipAndLine(selectedDoctor, doctorRotations, year)
    const fullName = `${selectedDoctor.name || ''} ${selectedDoctor.surname}`.trim()
    const sortedRotations = [...doctorRotations].sort((a, b) => a.start_date.localeCompare(b.start_date))
    return (
      <>
        {showHeader && (
          <>
            <p className="text-section-label uppercase text-ink-muted">{selectedDoctor.category}</p>
            <p className="mt-1 truncate font-display text-lg font-semibold text-ink" title={fullName}>{fullName}</p>
          </>
        )}
        <dl className="mt-3 divide-y divide-slate-line border-y border-slate-line text-sm">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-muted">Status</dt>
            <dd><Tag variant="status" tone={copy.tone}>{copy.status}</Tag></dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-muted">{chip.text}</dt>
            <dd className="text-right text-ink">{line}</dd>
          </div>
        </dl>

        {sortedRotations.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {sortedRotations.map(rotation => {
              const key = rotationTypeKey(rotation.rotation_type, rotation.subtype)
              return (
                <div key={rotation.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="flex-shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 font-medium text-white"
                    style={{ backgroundColor: ROTATION_TYPE_COLOR[key] }}
                  >
                    {ROTATION_TYPE_KEY_OPTIONS.find(o => o.key === key)?.label || key}
                  </span>
                  <span className="text-ink-light">
                    {rotation.start_date} – {rotation.end_date || 'ongoing'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {error && <p className="mt-2 text-xs text-flagRed">{error}</p>}

        {dateOpen ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <label htmlFor={`rotation-date-${selectedDoctor.id}`} className="flex-shrink-0">
                {variant === 'upcoming' ? 'Starts' : 'Active from'}
              </label>
              <div className="min-w-0 flex-1">
                <DateFieldButton
                  id={`rotation-date-${selectedDoctor.id}`}
                  label={variant === 'upcoming' ? 'Starts' : 'Active from'}
                  labelledExternally
                  value={draftDate}
                  onChange={setDraftDate}
                  fullWidth
                />
              </div>
            </div>
            <button
              type="button"
              disabled={saving || !draftDate}
              onClick={() => run(() => (variant === 'upcoming'
                ? onUpdateDate(selectedDoctor.id, draftDate)
                : onReactivate(selectedDoctor.id, draftDate)))}
              className="btn-primary w-full disabled:opacity-50"
            >
              {saving ? 'Saving…' : variant === 'upcoming' ? 'Save start date' : (draftDate <= today ? 'Activate now' : 'Schedule')}
            </button>
            <button type="button" disabled={saving} onClick={() => setDateOpen(false)} className="btn-ghost w-full">
              Cancel
            </button>
          </div>
        ) : variant === 'upcoming' ? (
          <div className="mt-3 space-y-2">
            {/* Opens the Active tab's own rotation editor on this doctor. */}
            <button type="button" disabled={saving} onClick={() => onEditRotation(selectedDoctor.id)} className="btn-primary w-full disabled:opacity-50">
              Edit rotation
            </button>
            <button type="button" disabled={saving} onClick={() => openDate(selectedDoctor.scheduled_active_date || today)} className="btn-secondary w-full disabled:opacity-50">
              Change start date
            </button>
            <button type="button" disabled={saving} onClick={() => run(() => onActivateNow(selectedDoctor.id))} className="btn-secondary w-full disabled:opacity-50">
              {saving ? 'Activating…' : 'Activate now'}
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <button type="button" disabled={saving} onClick={() => openDate(today)} className="btn-primary w-full disabled:opacity-50">
              Reactivate
            </button>
            {/* Opens the Active tab's own rotation editor on this doctor,
                without reactivating them — for back-filling or correcting
                rotation history on someone who stays inactive. */}
            <button type="button" disabled={saving} onClick={() => onEditRotation(selectedDoctor.id)} className="btn-secondary w-full disabled:opacity-50">
              Edit rotation
            </button>
            <button type="button" onClick={() => navigate(`/account/${selectedDoctor.id}`)} className="btn-secondary w-full">
              View account
            </button>
          </div>
        )}
      </>
    )
  }

  const allCollapsed = allSectionsCollapsed(groups, collapsed)

  const monthColWidth = Math.max(MIN_MONTH_COL_WIDTH, Math.floor((gridWidth - LABEL_COL_WIDTH) / 12))
  const gridTemplateColumns = `${LABEL_COL_WIDTH}px repeat(12, ${monthColWidth}px)`
  const currentMonthIndex = Number(today.slice(5, 7)) - 1

  const filterGroups = [{
    key: 'category', label: 'Category', defaultExpanded: true,
    options: ROTATION_FILTER_OPTIONS,
    selected: rotationFilter, onChange: setRotationFilter,
  }]
  const clearActive = Boolean(search) || rotationFilter.size > 0
  const onClearAll = () => { setSearch(''); setRotationFilter(new Set()) }

  const dateNav = <DateStepper unit="year" year={year} onChange={onYearChange} nowrap todayLabel showToday={year !== currentYear} />

  // The year leads the side panel and stays put while what's under it
  // scrolls — the same as the Active tab's.
  const panelAside = (
    <aside className="sticky top-4 w-72 flex-shrink-0">
      <div className="card flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-slate-line p-3">
          <DateStepper unit="year" year={year} onChange={onYearChange} centered nowrap todayLabel showToday={year !== currentYear} />
        </div>
        <div className="min-h-0 overflow-y-auto p-4">{renderPanel()}</div>
      </div>
    </aside>
  )

  // ── Desktop ──────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div className="mt-4">
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
            <RotationLegendButton />
            <RotationsMoreMenu />
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
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
                  <SectionBar label={group.label} count={group.items.length} collapsed={collapsed[group.key]} onToggle={() => toggleGroupCollapsed(group.key)} className="m-1" />
                  {!collapsed[group.key] && group.items.map(doctor => {
                    const doctorRotations = rotationsByDoctor.get(doctor.id) || []
                    const label = displayNames?.get(doctor.id) ?? doctor.surname
                    const { chip, line } = rowChipAndLine(variant, doctor, doctorRotations, year)
                    return (
                      <RotationSequenceRow
                        key={doctor.id}
                        layout="desktop"
                        doctor={doctor}
                        label={label}
                        rotations={doctorRotations}
                        year={year}
                        currentYear={currentYear}
                        chip={chip}
                        positionLine={line}
                        isSelected={selectedId === doctor.id}
                        onSelect={() => select(doctor.id)}
                        gridTemplateColumns={gridTemplateColumns}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
            {allCollapsed && <ExpandAllButton onExpandAll={() => setCollapsed({})} />}
          </div>

          {panelAside}
        </div>
      </div>
    )
  }

  // ── Mobile ───────────────────────────────────────────────────────────
  return (
    <div className="mt-4">
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
              <RotationLegendButton />
              <RotationsMoreMenu />
            </div>
          </div>
        </div>
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
              className="sheen-divider text-left transition-[filter] hover:brightness-110 active:brightness-110"
            >
              <span>{group.label} <span className="divider-meta ml-1 normal-case font-normal">{group.items.length}</span></span>
              <ChevronDown className={`divider-meta h-3 w-3 flex-shrink-0 transition-transform ${collapsed[group.key] ? 'rotate-180' : ''}`} />
            </button>

            {!collapsed[group.key] && (
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-line">
                {group.items.map(doctor => {
                  const doctorRotations = rotationsByDoctor.get(doctor.id) || []
                  const label = displayNames?.get(doctor.id) ?? doctor.surname
                  const { chip, line } = rowChipAndLine(variant, doctor, doctorRotations, year)
                  return (
                    <RotationSequenceRow
                      key={doctor.id}
                      layout="mobile"
                      doctor={doctor}
                      label={label}
                      rotations={doctorRotations}
                      year={year}
                      currentYear={currentYear}
                      chip={chip}
                      positionLine={line}
                      isSelected={selectedId === doctor.id}
                      onSelect={() => select(doctor.id)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        ))}
        {allCollapsed && <ExpandAllButton onExpandAll={() => setCollapsed({})} />}
      </div>

      <FloatingActionMenu
        search={{ value: search, onChange: setSearch, placeholder: 'Search name…' }}
        filter={{ groups: filterGroups, active: clearActive, onClearAll, sheetTitle: 'Filters' }}
        legend={{ title: 'Legend', children: <RotationLegendSwatches /> }}
        moreMenu={{ title: ROTATIONS_PAGE_TITLE, items: ROTATIONS_MENU_ITEMS }}
      />

      {selectedDoctor && (
        <Modal title={`${selectedDoctor.name || ''} ${selectedDoctor.surname}`.trim()} onClose={() => setSelectedId(null)}>
          {renderPanel(false)}
        </Modal>
      )}
    </div>
  )
}
