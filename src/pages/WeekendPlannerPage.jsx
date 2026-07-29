import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr, addDays } from '../lib/dateRange'
import { CATEGORY_GROUPS, groupForCategory, saturdaysInRange, groupEntriesByWeekend } from '../lib/weekendPlanner'

const WEEKS_AHEAD = 26 // ~6 months, enough runway to plan several roster months ahead

export default function WeekendPlannerPage() {
  const { isLocum, isAdmin, profile } = useAuth()
  const [doctors, setDoctors] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openPicker, setOpenPicker] = useState(null) // `${saturday}:${groupKey}` or null
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isLocum) return
    load()
  }, [isLocum])

  async function load() {
    setLoading(true)
    setError('')
    const fromDate = todayStr()
    const throughDate = addDays(fromDate, WEEKS_AHEAD * 7)

    const [profilesRes, entriesRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, category')
        .eq('is_approved', true).eq('is_active', true),
      supabase.from('weekend_planner_entries').select('id, weekend_saturday, profile_id, category')
        .gte('weekend_saturday', fromDate).lte('weekend_saturday', throughDate),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (entriesRes.error) { setError(entriesRes.error.message); setLoading(false); return }

    setDoctors((profilesRes.data || []).filter(p => groupForCategory(p.category)))
    setEntries(entriesRes.data || [])
    setLoading(false)
  }

  const saturdays = useMemo(
    () => saturdaysInRange(todayStr(), addDays(todayStr(), WEEKS_AHEAD * 7)),
    []
  )
  const byWeekend = useMemo(() => groupEntriesByWeekend(entries), [entries])
  const doctorById = useMemo(() => new Map(doctors.map(d => [d.id, d])), [doctors])

  // Doctors already placed SOMEWHERE this weekend (any group) — the DB's
  // unique(weekend_saturday, profile_id) means a doctor can only fill one
  // slot per weekend, so they're excluded from every group's picker once
  // placed, not just their own.
  function assignedDoctorIds(saturday) {
    const bySaturday = byWeekend.get(saturday)
    if (!bySaturday) return new Set()
    return new Set(Object.values(bySaturday).flat().map(e => e.profile_id))
  }

  // Both handlers patch local state directly from the write's own result
  // rather than reloading — load() flips `loading` back to true, which
  // unmounts the whole grid for a "Loading…" placeholder. A single
  // weekend_planner_entries row is simple enough to update in place
  // without a round trip back through the full query.
  async function addEntry(saturday, groupKey, profileId) {
    const doctor = doctorById.get(profileId)
    if (!doctor) return
    setSaving(true)
    const { data, error: err } = await supabase.from('weekend_planner_entries').insert({
      weekend_saturday: saturday,
      profile_id: profileId,
      category: doctor.category,
      created_by: profile?.id ?? null,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setOpenPicker(null)
    setEntries(prev => [...prev, data])
  }

  async function removeEntry(entryId) {
    setSaving(true)
    const { error: err } = await supabase.from('weekend_planner_entries').delete().eq('id', entryId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEntries(prev => prev.filter(e => e.id !== entryId))
  }

  // Locums can't see the weekend grid (canViewWeekendGrid excludes them) —
  // redirect rather than render restricted content behind a resolved route.
  if (isLocum) return <Navigate to="/" replace />

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-ink">Weekend planner</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {isAdmin
          ? 'Who works which weekend — the scheduler reads this directly when generating a roster. Every weekend must be filled in before its month can be generated.'
          : 'Who works which weekend, as planned by admin.'}
      </p>

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}

      {!loading && !error && (
        <div className="mt-6 space-y-3">
          {saturdays.map(saturday => {
            const bySaturday = byWeekend.get(saturday) || {}
            const totalCount = Object.values(bySaturday).flat().length
            const isEmpty = totalCount === 0
            const assignedIds = assignedDoctorIds(saturday)
            const sunday = addDays(saturday, 1)

            return (
              <div
                key={saturday}
                className={`card p-4 ${isEmpty ? 'border-flagRed/50 bg-flagRed/5' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{saturday} → {sunday}</p>
                  {isEmpty && (
                    <span className="text-xs font-semibold uppercase tracking-wide text-flagRed">
                      Not yet planned
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {CATEGORY_GROUPS.map(group => {
                    const groupEntries = bySaturday[group.key] || []
                    const pickerKey = `${saturday}:${group.key}`
                    const availableDoctors = doctors
                      .filter(d => groupForCategory(d.category) === group.key)
                      .filter(d => !assignedIds.has(d.id))

                    return (
                      <div key={group.key}>
                        <p className="label-text">{group.label}</p>
                        {groupEntries.length === 0 ? (
                          <p className="mt-1 text-sm text-ink-muted">—</p>
                        ) : (
                          <ul className="mt-1 space-y-1 text-sm text-ink-light">
                            {groupEntries.map(entry => {
                              const doctor = doctorById.get(entry.profile_id)
                              return (
                                <li key={entry.id} className="flex items-center justify-between gap-1">
                                  <span>{doctor ? `${doctor.name} ${doctor.surname}` : '(unknown)'}</span>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => removeEntry(entry.id)}
                                      disabled={saving}
                                      className="text-ink-muted hover:text-flagRed"
                                      aria-label={`Remove ${doctor?.surname ?? 'doctor'} from ${saturday}`}
                                    >
                                      ×
                                    </button>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        {isAdmin && (
                          openPicker === pickerKey ? (
                            <select
                              autoFocus
                              className="input-field mt-1 text-sm"
                              disabled={saving}
                              defaultValue=""
                              onChange={e => {
                                if (e.target.value) addEntry(saturday, group.key, e.target.value)
                                else setOpenPicker(null)
                              }}
                              onBlur={() => setOpenPicker(null)}
                            >
                              <option value="">Select doctor…</option>
                              {availableDoctors.map(d => (
                                <option key={d.id} value={d.id}>{d.name} {d.surname}</option>
                              ))}
                            </select>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOpenPicker(pickerKey)}
                              disabled={saving || availableDoctors.length === 0}
                              className="mt-1 text-sm text-accent hover:underline disabled:text-ink-muted disabled:no-underline"
                            >
                              + add
                            </button>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
