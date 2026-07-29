import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr, addDays } from '../lib/dateRange'
import { projectTeamWeekends } from '../lib/weekendProjection'

const WEEKS_AHEAD = 20 // ~10 projected working weekends per doctor

export default function WeekendPlannerPage() {
  const { isLocum } = useAuth()
  const [weekends, setWeekends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLocum) return
    loadWeekends()
  }, [isLocum])

  async function loadWeekends() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('weekend_patterns')
      .select('profile_id, last_worked_weekend, last_weekend_type, next_weekend_type, profiles(name, surname)')
    if (err) { setError(err.message); setLoading(false); return }

    const rows = (data || []).map(r => ({ ...r, name: r.profiles?.name, surname: r.profiles?.surname }))
    const fromDate = todayStr()
    const throughDate = addDays(fromDate, WEEKS_AHEAD * 7)
    setWeekends(projectTeamWeekends(rows, { fromDate, throughDate }))
    setLoading(false)
  }

  // Locums can't see the weekend grid (canViewWeekendGrid excludes them) —
  // redirect rather than render restricted content behind a resolved route.
  if (isLocum) return <Navigate to="/" replace />

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-ink">Weekend planner</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Projected from each doctor's current weekend rotation — days/nights alternate strictly every second weekend.
      </p>

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}

      {!loading && !error && (
        weekends.length === 0 ? (
          <div className="card mt-6 p-8 text-center">
            <p className="text-sm text-ink-muted">No weekend rotation data yet.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {weekends.map(w => (
              <div key={w.saturday} className="card p-4">
                <p className="text-sm font-medium text-ink">{w.saturday} → {w.sunday}</p>
                <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Days</p>
                    {w.days.length === 0 ? (
                      <p className="text-ink-muted">—</p>
                    ) : (
                      <ul className="text-ink-light">
                        {w.days.map(d => <li key={d.profileId}>{d.name} {d.surname}</li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Nights</p>
                    {w.nights.length === 0 ? (
                      <p className="text-ink-muted">—</p>
                    ) : (
                      <ul className="text-ink-light">
                        {w.nights.map(d => <li key={d.profileId}>{d.name} {d.surname}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
