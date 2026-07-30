import { useEffect, useState } from 'react'
import {
  fetchProfilesById, fetchAdminOptions, fetchDoctorOptions,
  nameMapFromProfiles, queryWeekendPlannerChanges, weekendChangeDetail, WEEKEND_ACTION_OPTIONS,
} from '../lib/changeLog'
import SelectMenu from './SelectMenu'
import LocumBadge from './LocumBadge'

const RECENT_LIMIT = 300
const EMPTY_FILTERS = { dateFrom: '', dateTo: '', adminId: '', doctorId: '', action: '' }

function formatTimestampParts(iso) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return { date, time }
}

// Searchable, filterable audit trail of add/remove edits to
// weekend_planner_entries. The planner is one continuous calendar rather
// than per-month like the roster, so this shows recent activity across it
// rather than being scoped to a single log.
export default function WeekendPlannerChangeLogModal({ onClose }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load closes over filters/locumOnly; refetch whenever either changes
  }, [filters, locumOnly])

  async function load() {
    setLoading(true)
    setError('')
    const locumIds = doctorOptions.filter(o => o.isLocum).map(o => o.value)
    const { data, error: err } = await queryWeekendPlannerChanges({ ...filters, locumOnly, locumIds, limit: RECENT_LIMIT })
    if (err) { setError(err.message); setLoading(false); return }

    const ids = (data || []).flatMap(c => [c.changed_by, c.profile_id])
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
          <h2 className="font-display text-lg font-bold text-ink">Review log — Weekend planner</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close review log">×</button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Most recent {RECENT_LIMIT} matching edits.</p>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
              options={WEEKEND_ACTION_OPTIONS}
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
            {filtersActive ? 'No edits match these filters.' : 'No edits recorded yet.'}
          </p>
        )}
        {!loading && !error && changes.length > 0 && (
          <div className="mt-4 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-canvas-raised text-xs uppercase text-ink-muted">
                <tr>
                  <th className="whitespace-nowrap py-2 pr-4">Weekend</th>
                  <th className="whitespace-nowrap py-2 pr-4">Time</th>
                  <th className="whitespace-nowrap py-2 pr-4">Admin</th>
                  <th className="whitespace-nowrap py-2 pr-4">Doctor</th>
                  <th className="whitespace-nowrap py-2 pr-4">Category</th>
                  <th className="whitespace-nowrap py-2 pr-4">Type</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="text-ink-light">
                {changes.map(c => {
                  const { date, time } = formatTimestampParts(c.changed_at)
                  const admin = profilesById.get(c.changed_by)
                  const doctor = profilesById.get(c.profile_id)
                  return (
                    <tr key={c.id} className="border-t border-slate-line align-top">
                      <td className="whitespace-nowrap py-2 pr-4">{date}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-ink-muted">{time}</td>
                      <td className="whitespace-nowrap py-2 pr-4">{admin ? `${admin.name} ${admin.surname}` : 'Unknown'}</td>
                      <td className="whitespace-nowrap py-2 pr-4">
                        {doctor ? <>{doctor.name} {doctor.surname}{doctor.role === 'locum' && <LocumBadge />}</> : 'Unknown'}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4">{c.category}</td>
                      <td className="whitespace-nowrap py-2 pr-4 capitalize">{c.action}</td>
                      <td className="py-2 text-ink-muted">{weekendChangeDetail(c, nameById)}</td>
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
