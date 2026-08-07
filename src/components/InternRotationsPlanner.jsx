import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import {
  fetchAllInternRotations, createInternRotation, updateInternRotation, deleteInternRotation,
} from '../lib/internRotations'
import DoctorDropdown from './DoctorDropdown'
import DoctorChip from './DoctorChip'
import SelectMenu from './SelectMenu'
import { OT_SUBTYPE_OPTIONS, OT_SUBTYPE_LABELS } from '../lib/staffDefaults'

const ROTATION_TYPE_OPTIONS = [
  { value: 'EC', label: 'EC' },
  { value: 'OT', label: 'OT' },
]

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// { year, month } shifted by `delta` months (positive or negative),
// rolling over year boundaries — used for the timeline's 4-month sliding
// window, since dateRange.js has no month-arithmetic helper of its own.
function shiftMonth(year, month, delta) {
  const zeroBased = (year * 12 + (month - 1)) + delta
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 }
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

// True if the rotation block [start_date, end_date] overlaps this calendar
// month at all (not just fully contains it) — a rotation starting
// mid-month, or ending mid-month, still shows a chip in that month's cell.
function rotationTouchesMonth(rotation, year, month) {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-31` // string comparison is safe here — YYYY-MM-DD sorts lexically, and no real date exceeds 31
  // null end_date = current/ongoing, no scheduled end yet — treat as
  // extending past every month being shown, not as "before monthStart".
  return rotation.start_date <= monthEnd && (rotation.end_date === null || rotation.end_date >= monthStart)
}

// Admin-only intern rotation management (dormant until the Intern category
// is reactivated, same as the rest of that machinery) — two views over the
// same intern_rotations table: an editable table (add/edit/delete blocks)
// and a read-only 4-month timeline. Both always read live (no caching),
// since rotation blocks are meant to be freely editable, including
// last-minute swaps, and every capacity-counting call site elsewhere in
// the app depends on seeing that edit immediately.
export default function InternRotationsPlanner() {
  const { profile } = useAuth()
  const [view, setView] = useState('table')
  const [interns, setInterns] = useState([])
  const [rotations, setRotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [openDoctorPickerFor, setOpenDoctorPickerFor] = useState(null) // rotation id, or 'new'
  const [doctorSearch, setDoctorSearch] = useState('')
  const [newRow, setNewRow] = useState(null) // draft row before it's created
  const today = todayStr()
  const [timelineStart, setTimelineStart] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return { year: y, month: m }
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const [profilesRes, rotationsData] = await Promise.all([
      // COSMO, not just Intern -- the OT/72h band (and its LRCHC/DPM-BCH/
      // Psych subtypes) is shared between the two categories, and real
      // rotation rows already exist for COSMO doctors.
      supabase.from('profiles').select('id, name, surname, color_code, category').in('category', ['COSMO', 'Intern']),
      fetchAllInternRotations().catch(err => { setError(err.message); return [] }),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    setInterns(profilesRes.data || [])
    setRotations(rotationsData)
    setLoading(false)
  }

  const internById = new Map(interns.map(i => [i.id, i]))

  async function handleAddRow() {
    if (!newRow?.doctorId || !newRow?.startDate) return
    if (newRow.endDate && newRow.startDate > newRow.endDate) { setError('Start date must be on or before the end date.'); return }
    setSavingId('new')
    setError('')
    try {
      await createInternRotation({
        doctorId: newRow.doctorId, rotationType: newRow.rotationType, subtype: newRow.subtype,
        startDate: newRow.startDate, endDate: newRow.endDate || null,
        createdBy: profile?.id,
      })
      setNewRow(null)
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSavingId(null)
  }

  async function handleUpdateRow(rotation, patch) {
    const next = {
      doctorId: rotation.doctor_id, rotationType: rotation.rotation_type, subtype: rotation.subtype,
      startDate: rotation.start_date, endDate: rotation.end_date, ...patch,
    }
    if (next.endDate && next.startDate > next.endDate) { setError('Start date must be on or before the end date.'); return }
    setSavingId(rotation.id)
    setError('')
    try {
      await updateInternRotation(rotation.id, next)
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSavingId(null)
  }

  async function handleDeleteRow(rotation) {
    setSavingId(rotation.id)
    setError('')
    try {
      await deleteInternRotation(rotation.id, rotation.doctor_id)
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSavingId(null)
  }

  const timelineMonths = [0, 1, 2, 3].map(i => shiftMonth(timelineStart.year, timelineStart.month, i))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Intern rotations</h2>
          <p className="text-xs text-ink-muted">
            EC/OT rotation blocks for COSMO/Intern doctors — drives which leave capacity pool a doctor&apos;s leave counts against, and (via the OT subtype) which shift restrictions the scheduling backend applies for that block. Leave End date blank for a block that&apos;s current/ongoing with no known end yet.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-line bg-canvas-raised p-0.5 w-fit">
          {[{ key: 'table', label: 'Table' }, { key: 'timeline', label: 'Timeline' }].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                view === t.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-flagRed">{error}</p>}
      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}

      {!loading && view === 'table' && (
        <div className="mt-4 card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-line text-left text-xs text-ink-muted">
                <th className="px-3 py-2 font-medium">Doctor</th>
                <th className="px-3 py-2 font-medium">Rotation</th>
                <th className="px-3 py-2 font-medium">OT subtype</th>
                <th className="px-3 py-2 font-medium">Start date</th>
                <th className="px-3 py-2 font-medium">End date</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-line">
              {rotations.length === 0 && !newRow && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-ink-muted">No rotation blocks yet.</td></tr>
              )}
              {rotations.map(rotation => {
                const intern = internById.get(rotation.doctor_id)
                const rowSaving = savingId === rotation.id
                return (
                  <tr key={rotation.id}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => { setDoctorSearch(''); setOpenDoctorPickerFor(rotation.id) }}
                        className="text-left font-medium text-ink hover:text-accent"
                      >
                        {intern ? `${intern.surname}, ${intern.name}` : 'Unknown doctor'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <SelectMenu
                        value={rotation.rotation_type}
                        onChange={v => handleUpdateRow(rotation, { rotationType: v, subtype: v === 'OT' ? rotation.subtype : null })}
                        options={ROTATION_TYPE_OPTIONS}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {rotation.rotation_type === 'OT' ? (
                        <SelectMenu
                          value={rotation.subtype || ''}
                          onChange={v => handleUpdateRow(rotation, { subtype: v })}
                          placeholder="Not yet assigned…"
                          options={OT_SUBTYPE_OPTIONS}
                        />
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={rotation.start_date}
                        onChange={e => handleUpdateRow(rotation, { startDate: e.target.value })}
                        className="input-field"
                        disabled={rowSaving}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={rotation.end_date || ''}
                        onChange={e => handleUpdateRow(rotation, { endDate: e.target.value || null })}
                        className="input-field"
                        disabled={rowSaving}
                        placeholder="Ongoing"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(rotation)}
                        disabled={rowSaving}
                        className="text-xs font-medium text-flagRed hover:underline disabled:opacity-50"
                      >
                        {rowSaving ? 'Saving…' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                )
              })}

              {newRow && (
                <tr>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => { setDoctorSearch(''); setOpenDoctorPickerFor('new') }}
                      className="text-left font-medium text-ink hover:text-accent"
                    >
                      {newRow.doctorId ? `${internById.get(newRow.doctorId)?.surname}, ${internById.get(newRow.doctorId)?.name}` : 'Pick a doctor…'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <SelectMenu
                      value={newRow.rotationType}
                      onChange={v => setNewRow(r => ({ ...r, rotationType: v, subtype: v === 'OT' ? r.subtype : null }))}
                      options={ROTATION_TYPE_OPTIONS}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {newRow.rotationType === 'OT' ? (
                      <SelectMenu
                        value={newRow.subtype || ''}
                        onChange={v => setNewRow(r => ({ ...r, subtype: v }))}
                        placeholder="Not yet assigned…"
                        options={OT_SUBTYPE_OPTIONS}
                      />
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={newRow.startDate}
                      onChange={e => setNewRow(r => ({ ...r, startDate: e.target.value }))}
                      className="input-field"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={newRow.endDate || ''}
                      onChange={e => setNewRow(r => ({ ...r, endDate: e.target.value || null }))}
                      className="input-field"
                      placeholder="Ongoing"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={handleAddRow}
                      disabled={savingId === 'new' || !newRow.doctorId || !newRow.startDate}
                      className="btn-primary px-2 py-1 text-xs disabled:opacity-50"
                    >
                      {savingId === 'new' ? 'Saving…' : 'Add'}
                    </button>
                    <button type="button" onClick={() => setNewRow(null)} className="ml-2 text-xs text-ink-muted hover:text-ink">
                      Cancel
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {!newRow && (
            <div className="border-t border-slate-line p-2">
              <button
                type="button"
                onClick={() => setNewRow({ doctorId: null, rotationType: 'EC', subtype: null, startDate: today, endDate: null })}
                className="btn-secondary text-xs"
              >
                + Add rotation block
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && view === 'timeline' && (
        <div className="mt-4">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setTimelineStart(s => shiftMonth(s.year, s.month, -1))}
              className="btn-secondary px-2 py-1 text-sm"
              aria-label="Previous month"
            >
              ←
            </button>
            <span className="font-display text-sm font-semibold text-ink">
              {MONTH_LABELS[timelineMonths[0].month - 1]} {timelineMonths[0].year} – {MONTH_LABELS[timelineMonths[3].month - 1]} {timelineMonths[3].year}
            </span>
            <button
              type="button"
              onClick={() => setTimelineStart(s => shiftMonth(s.year, s.month, 1))}
              className="btn-secondary px-2 py-1 text-sm"
              aria-label="Next month"
            >
              →
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {timelineMonths.map(({ year, month }) => {
              const key = monthKey(year, month)
              const inThisMonth = rotations.filter(r => rotationTouchesMonth(r, year, month))
              return (
                <div key={key} className="card p-3">
                  <p className="text-sm font-semibold text-ink">{MONTH_LABELS[month - 1]} {year}</p>
                  {['EC', 'OT'].map(type => (
                    <div key={type} className="mt-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{type}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {inThisMonth.filter(r => r.rotation_type === type).length === 0 ? (
                          <span className="text-xs text-ink-muted">—</span>
                        ) : (
                          inThisMonth.filter(r => r.rotation_type === type).map(r => (
                            <span key={r.id} className="inline-flex items-center gap-1">
                              <DoctorChip profile={internById.get(r.doctor_id)} />
                              {type === 'OT' && r.subtype && (
                                <span className="text-[10px] font-medium text-ink-muted">{OT_SUBTYPE_LABELS[r.subtype] || r.subtype}</span>
                              )}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {openDoctorPickerFor && (
        <DoctorDropdown
          profiles={interns}
          search={doctorSearch}
          onSearchChange={setDoctorSearch}
          onSelect={doctorId => {
            if (openDoctorPickerFor === 'new') setNewRow(r => ({ ...r, doctorId }))
            else {
              const rotation = rotations.find(r => r.id === openDoctorPickerFor)
              if (rotation) handleUpdateRow(rotation, { doctorId })
            }
            setOpenDoctorPickerFor(null)
          }}
          onClose={() => setOpenDoctorPickerFor(null)}
          date={openDoctorPickerFor === 'new' ? (newRow?.startDate || today) : (rotations.find(r => r.id === openDoctorPickerFor)?.start_date || today)}
          shiftCode="Intern rotation"
        />
      )}
    </div>
  )
}
