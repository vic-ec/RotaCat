import { useEffect, useState } from 'react'
import {
  fetchProfilesById, fetchAdminOptions, fetchDoctorOptions,
  nameMapFromProfiles, queryRosterChanges, rosterChangeDetail, ROSTER_ACTION_OPTIONS,
} from '../lib/changeLog'
import CompactDateField from './CompactDateField'
import ChangeLogFilterMenu from './ChangeLogFilterMenu'
import DetailInfoButton from './DetailInfoButton'
import LocumBadge from './LocumBadge'

const EMPTY_FILTERS = { dateFrom: '', dateTo: '', adminId: '', doctorId: '', action: '', role: '' }

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
      <span>
        {before.name} {before.surname}{before.role === 'locum' && <LocumBadge />}
        {' → '}
        {after.name} {after.surname}{after.role === 'locum' && <LocumBadge />}
      </span>
    )
  }
  const person = after || before
  if (!person) return <span className="text-ink-muted">—</span>
  return <span>{person.name} {person.surname}{person.role === 'locum' && <LocumBadge />}</span>
}

// Searchable, filterable audit trail for one roster_month_id — every manual
// edit (assign/unassign/remove/move) logged by RosterGridPage/
// RosterVacancyModal. Scheduler-generated entries never appear here since
// nothing in the generation flow writes to roster_entry_changes.
export default function RosterChangeLogModal({ rosterMonthId, monthLabel, onClose }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load closes over filters/rosterMonthId; refetch whenever either changes
  }, [rosterMonthId, filters])

  async function load() {
    setLoading(true)
    setError('')
    const roleIds = filters.role ? doctorOptions.filter(o => o.role === filters.role).map(o => o.value) : []
    const { data, error: err } = await queryRosterChanges({ rosterMonthId, ...filters, roleIds })
    if (err) { setError(err.message); setLoading(false); return }

    const ids = (data || []).flatMap(c => [c.changed_by, c.profile_id_before, c.profile_id_after])
    setProfilesById(await fetchProfilesById(ids))
    setChanges(data || [])
    setLoading(false)
  }

  const filtersActive = Object.values(filters).some(Boolean)
  const activeCount = [filters.adminId, filters.doctorId, filters.action, filters.role].filter(Boolean).length
  const nameById = nameMapFromProfiles(profilesById)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card flex w-full max-w-5xl max-h-[85vh] flex-col p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Review log — {monthLabel}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close review log">×</button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CompactDateField label="From" value={filters.dateFrom} max={filters.dateTo || undefined}
            onChange={v => setFilters(f => ({ ...f, dateFrom: v }))} />
          <CompactDateField label="To" value={filters.dateTo} min={filters.dateFrom || undefined}
            onChange={v => setFilters(f => ({ ...f, dateTo: v }))} />
          <ChangeLogFilterMenu
            adminOptions={adminOptions}
            doctorOptions={doctorOptions}
            actionOptions={ROSTER_ACTION_OPTIONS}
            adminId={filters.adminId}
            doctorId={filters.doctorId}
            action={filters.action}
            role={filters.role}
            onAdminChange={v => setFilters(f => ({ ...f, adminId: v }))}
            onDoctorChange={v => setFilters(f => ({ ...f, doctorId: v }))}
            onActionChange={v => setFilters(f => ({ ...f, action: v }))}
            onRoleChange={v => setFilters(f => ({ ...f, role: v }))}
            activeCount={activeCount}
          />
          {filtersActive && (
            <button type="button" className="text-sm text-accent hover:underline" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear
            </button>
          )}
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
                  <th className="py-2 pr-4">Doctor</th>
                  <th className="whitespace-nowrap py-2 pr-4">Type</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="text-ink-light">
                {changes.map(c => {
                  const { date, time } = formatTimestampParts(c.changed_at)
                  const admin = profilesById.get(c.changed_by)
                  const detail = rosterChangeDetail(c, nameById)
                  return (
                    <tr key={c.id} className="border-t border-slate-line">
                      <td className="whitespace-nowrap py-2 pr-4 align-top">{date}</td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top text-ink-muted">{time}</td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top">{admin ? `${admin.name} ${admin.surname}` : 'Unknown'}</td>
                      <td className="max-w-[10rem] py-2 pr-4 align-top"><DoctorCell change={c} profilesById={profilesById} /></td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top capitalize">{c.action}</td>
                      <td className="max-w-[12rem] py-2 align-top">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-ink-muted">{detail}</span>
                          <DetailInfoButton text={detail} />
                        </div>
                      </td>
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
