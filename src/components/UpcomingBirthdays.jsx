import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr, parseLocalDate } from '../lib/dateRange'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Only birthdays in the next month are worth surfacing as "upcoming" — a
// birthday 300 days out isn't actionable, it'd just be noise.
const UPCOMING_WINDOW_DAYS = 30
const MAX_SHOWN = 5

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
export default function UpcomingBirthdays() {
  const { profile } = useAuth()
  const [birthdays, setBirthdays] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('id, name, surname, birthday')
      .not('birthday', 'is', null)
      .eq('is_approved', true)
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled) return
        const today = todayStr()
        const upcoming = (data || [])
          .filter(p => p.birthday)
          .map(p => ({ ...p, daysUntil: daysUntilNextBirthday(p.birthday, today) }))
          .filter(p => p.daysUntil <= UPCOMING_WINDOW_DAYS)
          .sort((a, b) => a.daysUntil - b.daysUntil)
          .slice(0, MAX_SHOWN)
        setBirthdays(upcoming)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [profile?.id])

  // Nothing in the window renders nothing at all — a card reading "No
  // birthdays in the next 30 days" occupies a whole slot on a phone screen
  // to tell the reader there's nothing to know. Same rule the Dashboard now
  // applies to its own conditional sections.
  if (!loaded || birthdays.length === 0) return null

  return (
    <div className="w-full flex-shrink-0 card p-4 md:w-72">
      <h2 className="text-sm font-semibold text-ink">Upcoming birthdays</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {birthdays.map(p => (
          <li key={p.id} className="flex items-center justify-between gap-3">
            <span className="text-ink-light">{p.name} {p.surname}</span>
            <span className={p.daysUntil === 0 ? 'font-medium text-accent' : 'text-ink-muted'}>
              {p.daysUntil === 0 ? 'Today' : formatBirthday(p.birthday)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
