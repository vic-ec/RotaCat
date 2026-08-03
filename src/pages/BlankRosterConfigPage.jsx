import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// "Build my own" (§1.2): creates an empty roster_months draft row — no
// roster_entries — for the chosen month, then hands off to RosterGridPage
// for manual editing. RosterGridPage already owns every assign/remove/move
// affordance a draft needs; a blank roster is simply a draft with nothing
// in it yet.
export default function BlankRosterConfigPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const now = new Date()
  const defaultMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2
  const defaultYear  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()

  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)
  const [existingRoster, setExistingRoster] = useState(null)
  const [checkingExisting, setCheckingExisting] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    checkExistingRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkExistingRoster is redefined every render; including it would refetch in a loop
  }, [year, month])

  async function checkExistingRoster() {
    setCheckingExisting(true)
    const { data } = await supabase
      .from('roster_months')
      .select('id, status')
      .eq('year', year)
      .eq('month', month)
      .is('deleted_at', null)
      .single()
    setExistingRoster(data || null)
    setCheckingExisting(false)
  }

  async function handleCreate() {
    if (!profile?.id) return
    setError('')

    // A draft already exists for this month — open it rather than creating
    // a second roster_months row for the same year+month.
    if (existingRoster?.status === 'draft') {
      navigate(`/roster/${existingRoster.id}`)
      return
    }

    setCreating(true)
    try {
      const { data, error: insertError } = await supabase
        .from('roster_months')
        .insert({ year, month, status: 'draft', carry_forward: false, created_by: profile.id })
        .select('id')
        .single()
      if (insertError) throw new Error(insertError.message)
      navigate(`/roster/${data.id}`)
    } catch (err) {
      setError(err.message || 'Something went wrong creating the roster.')
      setCreating(false)
    }
  }

  const yearOptions = [now.getFullYear(), now.getFullYear() + 1]
  const blocked = existingRoster?.status === 'published'

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <button
          onClick={() => navigate('/roster')}
          className="sticky top-14 md:top-0 z-[5] mb-4 flex items-center gap-1.5 rounded bg-canvas px-2 py-1.5 -ml-2 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Back to rosters
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">Build my own roster</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Choose a month to create a blank draft roster you assign by hand.
        </p>
      </div>

      {existingRoster && (
        <div className={`mb-4 rounded-lg border p-4 ${
          blocked ? 'border-flagRed bg-flagRed-bg' : 'border-flagAmber bg-flagAmber-bg'
        }`}>
          <p className={`text-sm font-medium ${blocked ? 'text-flagRed' : 'text-flagAmber'}`}>
            A {existingRoster.status} roster already exists for {MONTH_NAMES[month]} {year}.
          </p>
          <p className={`mt-1 text-sm ${blocked ? 'text-flagRed' : 'text-flagAmber'}`}>
            {blocked
              ? 'It’s already published, so a new blank roster can’t be created for this month. Regenerate from the Rosters page if you need to replace it.'
              : 'Continuing will open that existing draft instead of creating a new one.'}
          </p>
        </div>
      )}

      <div className="card p-6 space-y-6">
        <div>
          <label className="label-text">Month</label>
          <div className="flex gap-3">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="input-field flex-1"
              disabled={creating}
            >
              {MONTH_NAMES.slice(1).map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="input-field w-28"
              disabled={creating}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded bg-flagRed-bg px-3 py-2.5 text-sm text-flagRed">
            {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={creating || checkingExisting || blocked}
          className="btn-primary w-full disabled:opacity-50"
        >
          {creating
            ? 'Creating…'
            : existingRoster?.status === 'draft'
              ? `Open ${MONTH_NAMES[month]} ${year} draft`
              : `Create blank ${MONTH_NAMES[month]} ${year} roster`}
        </button>
      </div>
    </div>
  )
}

function ChevronLeftIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}
