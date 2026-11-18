import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import Modal from './Modal'
import Tag from './Tag'
import DateFieldButton from './DateFieldButton'
import { rotationForDate } from '../lib/internRotations'
import { rotationTypeKey, ROTATION_TYPE_KEY_OPTIONS, ROTATION_TYPE_COLOR } from '../lib/staffDefaults'
import { todayStr, formatDayMonthYear } from '../lib/dateRange'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useFillToViewport } from '../lib/useFillToViewport'

// The Rotations page's Upcoming and Completed tabs: one table + side panel,
// the same shape as the Active tab's matrix (table on the page ground,
// foldable category sections, whole-row selection, a sticky panel on the
// right that describes the selected doctor and carries their actions).
// They were two flat lists with the actions inline on every row.
//
// `variant`:
//   'upcoming'  — inactive doctors with a scheduled start. Columns: Due to
//                 start, Upcoming rotation. Actions: Edit rotation, Change
//                 start date, Activate now.
//   'completed' — inactive doctors with no start scheduled. Columns: Last
//                 active, Last rotation. Actions: Reactivate, View account.
const SECTIONS = [
  { key: 'Registrar', label: 'Registrar' },
  { key: 'Intern', label: 'Intern' },
]

const COPY = {
  upcoming: {
    dateHeading: 'Due to start',
    rotationHeading: 'Upcoming rotation',
    status: 'Scheduled',
    tone: 'warning',
    empty: 'No doctors with a scheduled start date.',
  },
  completed: {
    dateHeading: 'Last active',
    rotationHeading: 'Last rotation',
    status: 'Inactive',
    tone: 'danger',
    empty: 'No completed doctors.',
  },
}

function typeLabel(key) {
  return ROTATION_TYPE_KEY_OPTIONS.find(o => o.key === key)?.label ?? key
}

function rotationPeriod(rotation) {
  const from = formatDayMonthYear(rotation.start_date)
  return rotation.end_date ? `${from} – ${formatDayMonthYear(rotation.end_date)}` : `from ${from}`
}

// The rotation each tab is about: for Upcoming, the one they will start on
// (the first not yet over); for Completed, the last one they held.
function relevantRotation(variant, rotations, today) {
  const sorted = [...rotations].sort((a, b) => a.start_date.localeCompare(b.start_date))
  if (sorted.length === 0) return null
  if (variant === 'upcoming') {
    return sorted.find(r => r.start_date >= today) || rotationForDate(sorted, today) || sorted[sorted.length - 1]
  }
  return sorted[sorted.length - 1]
}

function RotationLabel({ rotation }) {
  if (!rotation) return <span className="text-ink-muted">None set</span>
  const key = rotationTypeKey(rotation.rotation_type, rotation.subtype)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: ROTATION_TYPE_COLOR[key] }} />
      <span>{typeLabel(key)} · {rotationPeriod(rotation)}</span>
    </span>
  )
}

export default function RotationStatusTable({
  variant, doctors, rotations, displayNames,
  onUpdateDate, onActivateNow, onReactivate, onEditRotation,
}) {
  const copy = COPY[variant]
  const today = todayStr()
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const [tableRef, tableFill] = useFillToViewport(32, { fit: true })
  const [selectedId, setSelectedId] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  // Panel-local editing: the start date (Upcoming) or active-from date
  // (Completed) field is only open after its button is pressed.
  const [dateOpen, setDateOpen] = useState(false)
  const [draftDate, setDraftDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const rotationsByDoctor = new Map()
  for (const r of rotations) {
    if (!rotationsByDoctor.has(r.doctor_id)) rotationsByDoctor.set(r.doctor_id, [])
    rotationsByDoctor.get(r.doctor_id).push(r)
  }

  const rows = doctors.map(doctor => {
    const rotation = relevantRotation(variant, rotationsByDoctor.get(doctor.id) || [], today)
    const date = variant === 'upcoming'
      ? doctor.scheduled_active_date
      : (rotation?.end_date || doctor.scheduled_inactive_date || null)
    return { doctor, rotation, date, name: displayNames?.get(doctor.id) ?? doctor.surname }
  })

  const groups = SECTIONS
    .map(section => ({
      ...section,
      rows: rows
        .filter(r => (r.doctor.category === 'Registrar' ? 'Registrar' : 'Intern') === section.key)
        .sort((a, b) => variant === 'upcoming'
          ? (a.date || '').localeCompare(b.date || '') || (a.doctor.surname || '').localeCompare(b.doctor.surname || '')
          : (a.doctor.surname || '').localeCompare(b.doctor.surname || '')),
    }))
    .filter(g => g.rows.length > 0)

  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">{copy.empty}</p>
  }

  const selected = rows.find(r => r.doctor.id === selectedId) || null

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
    if (!selected) {
      return (
        <>
          <p className="text-section-label uppercase text-ink-muted">{variant === 'upcoming' ? 'Upcoming' : 'Completed'}</p>
          <p className="mt-1 font-display text-lg font-semibold text-ink">{rows.length} doctor{rows.length === 1 ? '' : 's'}</p>
          <p className="mt-2 text-sm text-ink-light">Select a doctor to see their details and actions.</p>
        </>
      )
    }
    const { doctor, rotation, date } = selected
    const fullName = `${doctor.name || ''} ${doctor.surname}`.trim()
    return (
      <>
        {showHeader && (
          <>
            <p className="text-section-label uppercase text-ink-muted">{doctor.category}</p>
            <p className="mt-1 truncate font-display text-lg font-semibold text-ink" title={fullName}>{fullName}</p>
          </>
        )}
        <dl className="mt-3 divide-y divide-slate-line border-y border-slate-line text-sm">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-muted">Status</dt>
            <dd><Tag variant="status" tone={copy.tone}>{copy.status}</Tag></dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-muted">{copy.dateHeading}</dt>
            <dd className="text-ink">{date ? formatDayMonthYear(date) : '—'}</dd>
          </div>
          <div className="flex items-start justify-between gap-3 py-2">
            <dt className="flex-shrink-0 text-ink-muted">{copy.rotationHeading}</dt>
            <dd className="text-right text-ink"><RotationLabel rotation={rotation} /></dd>
          </div>
        </dl>

        {error && <p className="mt-2 text-xs text-flagRed">{error}</p>}

        {dateOpen ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <label htmlFor={`rotation-date-${doctor.id}`} className="flex-shrink-0">
                {variant === 'upcoming' ? 'Starts' : 'Active from'}
              </label>
              <div className="min-w-0 flex-1">
                <DateFieldButton
                  id={`rotation-date-${doctor.id}`}
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
                ? onUpdateDate(doctor.id, draftDate)
                : onReactivate(doctor.id, draftDate)))}
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
            <button type="button" disabled={saving} onClick={() => onEditRotation(doctor.id)} className="btn-primary w-full disabled:opacity-50">
              Edit rotation
            </button>
            <button type="button" disabled={saving} onClick={() => openDate(doctor.scheduled_active_date || today)} className="btn-secondary w-full disabled:opacity-50">
              Change start date
            </button>
            <button type="button" disabled={saving} onClick={() => run(() => onActivateNow(doctor.id))} className="btn-secondary w-full disabled:opacity-50">
              {saving ? 'Activating…' : 'Activate now'}
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <button type="button" disabled={saving} onClick={() => openDate(today)} className="btn-primary w-full disabled:opacity-50">
              Reactivate
            </button>
            <button type="button" onClick={() => navigate(`/account/${doctor.id}`)} className="btn-secondary w-full">
              View account
            </button>
          </div>
        )}
      </>
    )
  }

  const headCell = 'border-b border-slate-line bg-canvas-sunken px-3 py-2'
  const cell = 'border-b border-slate-hairline px-3 py-2.5'
  // Doctor stays put during horizontal scroll, as on Hours Summary — the
  // name is what every other column is about, and scrolling to the rotation
  // used to leave the rows anonymous. A sticky cell can't inherit its row's
  // background while it repositions, so each one paints its own: z-20 on the
  // header's corner cell keeps it above both the sticky header row and the
  // sticky column it sits atop.
  const stickyHead = `sticky left-0 z-20 border-r border-slate-line ${headCell}`
  const stickyCell = isSelected => `sticky left-0 z-[1] border-r border-slate-line ${cell} ${
    isSelected ? 'bg-accent-tint' : 'bg-canvas group-hover:bg-canvas-cool'
  }`

  return (
    <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {/* Ends at its last row when the list is short; stops at the window's
            edge and scrolls inside when long — the same frame as Hours
            Summary and Team Leave. */}
        <div ref={tableRef} style={tableFill} className="overflow-auto rounded-lg border border-slate-line bg-canvas">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className={stickyHead}>Doctor</th>
                <th className={headCell}>Category</th>
                <th className={headCell}>Status</th>
                <th className={headCell}>{copy.dateHeading}</th>
                <th className={headCell}>{copy.rotationHeading}</th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {groups.map(group => (
                <Fragment key={group.key}>
                  <tr
                    onClick={() => setCollapsed(c => ({ ...c, [group.key]: !c[group.key] }))}
                    className="cursor-pointer transition-[filter] hover:brightness-110 active:brightness-110"
                  >
                    <td colSpan={5} className="border-b border-slate-hairline p-1">
                      <button type="button" aria-expanded={!collapsed[group.key]} className="sheen-divider text-left">
                        <span>{group.label} <span className="divider-meta ml-1 normal-case font-normal">{group.rows.length}</span></span>
                        <ChevronDown className={`divider-meta h-3 w-3 flex-shrink-0 transition-transform ${collapsed[group.key] ? 'rotate-180' : ''}`} />
                      </button>
                    </td>
                  </tr>
                  {!collapsed[group.key] && group.rows.map(({ doctor, rotation, date, name }) => {
                    const isSelected = selectedId === doctor.id
                    return (
                      <tr
                        key={doctor.id}
                        onClick={() => select(doctor.id)}
                        aria-selected={isSelected}
                        className={`group cursor-pointer transition-colors ${isSelected ? 'bg-accent-tint' : 'hover:bg-canvas-cool'}`}
                      >
                        <td className={`${stickyCell(isSelected)} ${isSelected ? 'shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]' : ''}`}>
                          <button
                            type="button"
                            title={`${doctor.name || ''} ${doctor.surname}`.trim()}
                            className={`text-left font-medium ${isSelected ? 'text-accent' : 'text-ink'}`}
                          >
                            {name}
                          </button>
                        </td>
                        <td className={`${cell} text-ink-light`}>{doctor.category}</td>
                        <td className={cell}><Tag variant="status" tone={copy.tone}>{copy.status}</Tag></td>
                        <td className={`${cell} whitespace-nowrap text-ink-light`}>{date ? formatDayMonthYear(date) : '—'}</td>
                        <td className={`${cell} text-ink-light`}><RotationLabel rotation={rotation} /></td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Desktop: the sticky side panel, same width as the Active tab's.
          Below lg a selection opens the same content as a sheet instead. */}
      {isDesktop ? (
        <aside className="sticky top-4 w-72 flex-shrink-0">
          <div className="card max-h-[calc(100dvh-2rem)] overflow-y-auto p-4">{renderPanel()}</div>
        </aside>
      ) : selected && (
        <Modal title={`${selected.doctor.name || ''} ${selected.doctor.surname}`.trim()} onClose={() => setSelectedId(null)}>
          {renderPanel(false)}
        </Modal>
      )}
    </div>
  )
}
