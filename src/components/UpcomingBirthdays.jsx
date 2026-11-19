import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr, parseLocalDate } from '../lib/dateRange'
import ProfileAvatar from './ProfileAvatar'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Only birthdays in the next month are worth surfacing as "upcoming" — a
// birthday 300 days out isn't actionable, it'd just be noise.
const UPCOMING_WINDOW_DAYS = 30

// profiles.birthday is stored as a `date` with a fixed placeholder year
// (2000, a leap year — see AccountSettingsPage's BIRTHDAY_YEAR comment).
// Only the month/day are real, so "days until next occurrence" has to wrap
// year-end itself rather than a plain date subtraction/ORDER BY.
function daysUntilNextBirthday(birthday, today) {
  const [, month, day] = birthday.split('-').map(Number)
  const todayDate = parseLocalDate(today)
  let next = new Date(todayDate.getFullYear(), month - 1, day)
  if (next < todayDate) next = new Date(todayDate.getFullYear() + 1, month - 1, day)
  return Math.round((next - todayDate) / 86400000)
}

function formatBirthday(birthday) {
  const [, month, day] = birthday.split('-').map(Number)
  return `${day} ${MONTH_NAMES[month - 1]}`
}

// A small right-aligned card at the top of the Dashboard/My shifts page —
// visible to every role/category/permission level (unlike the widgets
// below it, which branch on isAdmin/isClerk/isLocum), so it fetches
// independently of those role-specific queries rather than being folded
// into loadAdminWidgets/loadClerkWidgets/etc.
function whenLabel(daysUntil) {
  if (daysUntil === 0) return 'Today'
  if (daysUntil === 1) return 'Tomorrow'
  return `in ${daysUntil} days`
}

// Birthdays in the next 30 days, soonest first — the window runs straight
// across a month end and a year end (see daysUntilNextBirthday). Always
// rendered once loaded: this used to disappear entirely whenever the window
// was empty, which with few birthdays on record meant it was never seen and
// nobody could tell whether it existed. An empty window now says so, and
// says how many people have a birthday saved at all — usually the real
// reason the list is short.
export default function UpcomingBirthdays() {
  const { profile } = useAuth()
  const [birthdays, setBirthdays] = useState([])
  const [counts, setCounts] = useState({ total: 0, withBirthday: 0 })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('id, name, surname, birthday, avatar_url, color_code, pattern_type')
      .eq('is_approved', true)
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled) return
        const today = todayStr()
        const people = data || []
        const known = people.filter(p => p.birthday)
        const upcoming = known
          .map(p => ({ ...p, daysUntil: daysUntilNextBirthday(p.birthday, today) }))
          .filter(p => p.daysUntil <= UPCOMING_WINDOW_DAYS)
          .sort((a, b) => a.daysUntil - b.daysUntil || (a.surname || '').localeCompare(b.surname || ''))
        setBirthdays(upcoming)
        setCounts({ total: people.length, withBirthday: known.length })
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [profile?.id])

  if (!loaded) return null

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Upcoming birthdays</h2>
        <span className="whitespace-nowrap text-xs text-ink-muted">Next {UPCOMING_WINDOW_DAYS} days</span>
      </div>
      {birthdays.length === 0 ? (
        <div className="card p-4">
          <p className="text-sm text-ink-muted">No birthdays in the next {UPCOMING_WINDOW_DAYS} days</p>
          {counts.withBirthday < counts.total && (
            <p className="mt-1 text-xs text-ink-muted">
              {counts.withBirthday} of {counts.total} staff have a birthday saved. Each person can add theirs on their Account page.
            </p>
          )}
        </div>
      ) : (
        <ul className="card divide-y divide-slate-line overflow-hidden">
          {birthdays.map(p => (
            <li key={p.id} className="flex items-center gap-2.5 px-4 py-2.5">
              <ProfileAvatar profile={p} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{p.name} {p.surname}</span>
                <span className="block text-xs text-ink-muted">{formatBirthday(p.birthday)}</span>
              </span>
              <span className={`flex-shrink-0 text-xs ${p.daysUntil === 0 ? 'font-semibold text-accent' : 'text-ink-muted'}`}>
                {whenLabel(p.daysUntil)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
