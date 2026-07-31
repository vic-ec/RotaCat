import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import WeekendPlannerView from '../components/WeekendPlannerView'

export default function WeekendPlannerPage() {
  const { isLocum, isAdmin } = useAuth()

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
      <WeekendPlannerView />
    </div>
  )
}
