import { useEffect, useState } from 'react'
import {
  fetchProfilesById, fetchAdminOptions, fetchDoctorOptions,
  nameMapFromProfiles, queryRosterChanges, rosterChangeDetail, ROSTER_ACTION_OPTIONS,
} from '../lib/changeLog'
import SelectMenu from './SelectMenu'
import LocumBadge from './LocumBadge'

const EMPTY_FILTERS = { dateFrom: '', dateTo: '', adminId: '', doctorId: '', action: '' }

function formatTimestampParts(iso) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return { date, time }
}

function DoctorCell({ change, profilesById }) {
  const before = change.profile_id_before ? profilesById.get(change.profile_id_before) : null
  const after = change.profile_id_after ? profilesById.get(change.profile_id_after) : null

  if (before && after && before.id !== after.id) {
    return (
      <span className="whitespace-nowrap">
        {before.name} {before.surname}{before.role === 'locum' && <LocumBadge />}
        {' → '}
        {after.name} {after.surname}{after.role === 'locum' && <LocumBadge />}
      </span>
    )
  }
  const person = after || before
  if (!person) return <span className="text-ink-muted">—</span>
  return <span className="whitespace-nowrap">{person.name} {person.surname}{person.role === 'locum' && <LocumBadge />}</span>
}

// Searchable, filterable audit trail for one roster_month_id — every manual
// edit (assign/unassign/remove/move) logged by RosterGridPage/
// RosterVacancyModal. Scheduler-generated entries never appear here since
// nothing in the generation flow writes to roster_entry_changes.
export default function RosterChangeLogModal({ rosterMonthId, monthLabel, onClose }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [locumOnly, setLocumOnly] = useState(false)
  const [changes, setChanges] = useState([])
  const [profilesById, setProfilesById] = useState(new Map())
  const [adminOptions, setAdminOptions] = useState([])
  const [doctorOptions, setDoctorOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminOptions().then(setAdminOptions)
    fetchDoctorOptions().then(setDoctorOptions)
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load closes over filters/locumOnly/rosterMonthId; refetch whenever any of those change
  }, [rosterMonthId, filters, locumOnly])

  async function load() {
    setLoading(true)
    setError('')
    const locumIds = doctorOptions.filter(o => o.isLocum).map(o => o.value)
    const { data, error: err } = await queryRosterChanges({ rosterMonthId, ...filters, locumOnly, locumIds })
    if (err) { setError(err.message); setLoading(false); return }

    const ids = (data || []).flatMap(c => [c.changed_by, c.profile_id_before, c.profile_id_after])
    setProfilesById(await fetchProfilesById(ids))
    setChanges(data || [])
    setLoading(false)
  }

  const filtersActive = Object.values(filters).some(Boolean) || locumOnly
  const nameById = nameMapFromProfiles(profilesById)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card flex w-full max-w-5xl max-h-[85vh] flex-col p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Review log — {monthLabel}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close review log">×</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="label-text">From</label>
            <input type="date" className="input-field" value={filters.dateFrom}
              onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          <div>
            <label className="label-text">To</label>
            <input type="date" className="input-field" value={filters.dateTo}
              onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          </div>
          <div>
            <label className="label-text">Admin</label>
            <SelectMenu
              value={filters.adminId}
              onChange={v => setFilters(f => ({ ...f, adminId: v }))}
              options={[{ value: '', label: 'All admins' }, ...adminOptions]}
            />
          </div>
          <div>
            <label className="label-text">Doctor</label>
            <SelectMenu
              value={filters.doctorId}
              onChange={v => setFilters(f => ({ ...f, doctorId: v }))}
              options={[{ value: '', label: 'All doctors' }, ...doctorOptions]}
            />
          </div>
          <div>
            <label className="label-text">Change type</label>
            <SelectMenu
              value={filters.action}
              onChange={v => setFilters(f => ({ ...f, action: v }))}
              options={ROSTER_ACTION_OPTIONS}
            />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <label className="flex items-center gap-1.5 text-sm text-ink-light">
              <input type="checkbox" checked={locumOnly} onChange={e => setLocumOnly(e.target.checked)} disabled={!!filters.doctorId} />
              Locums only
            </label>
            {filtersActive && (
              <button type="button" className="text-sm text-accent hover:underline"
                onClick={() => { setFilters(EMPTY_FILTERS); setLocumOnly(false) }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {loading && <p className="mt-4 text-sm text-ink-muted">Loading…</p>}
        {error && <p className="mt-4 text-sm text-flagRed">{error}</p>}
        {!loading && !error && changes.length === 0 && (
          <p className="mt-4 text-sm text-ink-muted">
            {filtersActive ? 'No edits match these filters.' : 'No manual edits recorded for this roster yet.'}
          </p>
        )}
        {!loading && !error && changes.length > 0 && (
          <div className="mt-4 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-canvas-raised text-xs uppercase text-ink-muted">
                <tr>
                  <th className="whitespace-nowrap py-2 pr-4">Date</th>
                  <th className="whitespace-nowrap py-2 pr-4">Time</th>
                  <th className="whitespace-nowrap py-2 pr-4">Admin</th>
                  <th className="whitespace-nowrap py-2 pr-4">Doctor</th>
                  <th className="whitespace-nowrap py-2 pr-4">Type</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="text-ink-light">
                {changes.map(c => {
                  const { date, time } = formatTimestampParts(c.changed_at)
                  const admin = profilesById.get(c.changed_by)
                  return (
                    <tr key={c.id} className="border-t border-slate-line align-top">
                      <td className="whitespace-nowrap py-2 pr-4">{date}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-ink-muted">{time}</td>
                      <td className="whitespace-nowrap py-2 pr-4">{admin ? `${admin.name} ${admin.surname}` : 'Unknown'}</td>
                      <td className="py-2 pr-4"><DoctorCell change={c} profilesById={profilesById} /></td>
                      <td className="whitespace-nowrap py-2 pr-4 capitalize">{c.action}</td>
                      <td className="py-2 text-ink-muted">{rosterChangeDetail(c, nameById)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
