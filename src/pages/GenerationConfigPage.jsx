import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { generateRoster, checkBackendHealth } from '../lib/schedulerApi'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Generation takes up to 2 minutes on a cold Render free instance.
// These messages cycle during the wait so the admin knows it's working.
const PROGRESS_MESSAGES = [
  'Waking up the scheduling engine…',
  'Loading your team data from the database…',
  'Building the calendar and checking public holidays…',
  'Loading approved leave and calendar blocks…',
  'Running the constraint solver — this can take up to 60 seconds…',
  'Applying soft constraints and optimising hour distribution…',
  'Post-processing: generating locum placeholders and flags…',
  'Writing the draft roster to the database…',
  'Almost done…',
]

export default function GenerationConfigPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  // Default to next month
  const now = new Date()
  const defaultMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2
  const defaultYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()

  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)
  const [useCarryForward, setUseCarryForward] = useState(false)
  const [leaveBlocks, setLeaveBlocks] = useState([])
  const [loadingLeave, setLoadingLeave] = useState(false)
  const [existingRoster, setExistingRoster] = useState(null)

  const [generating, setGenerating] = useState(false)
  const [progressIdx, setProgressIdx] = useState(0)
  const [error, setError] = useState('')

  // Load leave summary and check for existing roster whenever month/year changes
  useEffect(() => {
    loadLeaveSummary()
    checkExistingRoster()
  }, [year, month])

  // Cycle progress messages during generation
  useEffect(() => {
    if (!generating) return
    const interval = setInterval(() => {
      setProgressIdx(i => Math.min(i + 1, PROGRESS_MESSAGES.length - 1))
    }, 9000)
    return () => clearInterval(interval)
  }, [generating])

  async function loadLeaveSummary() {
    setLoadingLeave(true)
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).toISOString().split('T')[0]

    const { data } = await supabase
      .from('leave_requests')
      .select('profile_id, date_from, date_to, leave_type, profiles(surname, name)')
      .eq('status', 'approved')
      .lte('date_from', lastDay)
      .gte('date_to', firstDay)

    setLeaveBlocks(data || [])
    setLoadingLeave(false)
  }

  async function checkExistingRoster() {
    const { data } = await supabase
      .from('roster_months')
      .select('id, status')
      .eq('year', year)
      .eq('month', month)
      .is('deleted_at', null)
      .single()
    setExistingRoster(data || null)
  }

  async function handleGenerate() {
    if (!profile?.id) return
    setError('')
    setGenerating(true)
    setProgressIdx(0)

    try {
      const result = await generateRoster({
        year,
        month,
        useCarryForward,
        adminProfileId: profile.id,
      })

      if (result.roster_month_id) {
        navigate(`/roster/${result.roster_month_id}`)
      } else {
        throw new Error(result.message || 'Generation failed — no roster ID returned.')
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Check that the scheduling backend is running.')
      setGenerating(false)
    }
  }

  const yearOptions = [now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <button
          onClick={() => navigate('/roster')}
          className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Back to rosters
        </button>
        <h1 className="font-display text-2xl text-ink">Generate roster</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Configure options, review leave, then generate your draft roster.
        </p>
      </div>

      {/* Existing roster warning */}
      {existingRoster && (
        <div className="mb-4 rounded-lg border border-flagAmber bg-flagAmber-bg p-4">
          <p className="text-sm font-medium text-flagAmber">
            A {existingRoster.status} roster already exists for {MONTH_NAMES[month]} {year}.
          </p>
          <p className="mt-1 text-sm text-flagAmber">
            Generating a new one will replace its entries.{' '}
            {existingRoster.status === 'published' && (
              <strong>This month is published — regenerating will revert it to draft.</strong>
            )}
          </p>
        </div>
      )}

      <div className="card p-6 space-y-6">
        {/* Month and year picker */}
        <div>
          <label className="label-text">Month</label>
          <div className="flex gap-3">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="input-field flex-1"
              disabled={generating}
            >
              {MONTH_NAMES.slice(1).map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="input-field w-28"
              disabled={generating}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Carry-forward toggle */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">Balance from previous month</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Doctors who worked more last month will be given slightly fewer shifts
              this month, and vice versa.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={useCarryForward}
            onClick={() => setUseCarryForward(v => !v)}
            disabled={generating}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              useCarryForward ? 'bg-accent' : 'bg-slate-line'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                useCarryForward ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Leave summary */}
        <div>
          <p className="label-text">
            Approved leave in {MONTH_NAMES[month]} {year}
          </p>
          {loadingLeave ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : leaveBlocks.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No approved leave for this month.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-slate-line rounded-lg border border-slate-line">
              {leaveBlocks.map((lb, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5">
                  <p className="text-sm font-medium text-ink">
                    {lb.profiles?.surname || 'Unknown'}
                  </p>
                  <div className="text-right">
                    <p className="text-xs text-ink-muted capitalize">{lb.leave_type}</p>
                    <p className="text-xs text-ink-muted">
                      {lb.date_from === lb.date_to
                        ? lb.date_from
                        : `${lb.date_from} → ${lb.date_to}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded bg-flagRed-bg px-3 py-2.5 text-sm text-flagRed">
            {error}
          </div>
        )}

        {/* Generate button / progress */}
        {generating ? (
          <div className="rounded-lg border border-accent-light bg-accent-tint p-5 text-center">
            <SpinnerIcon className="mx-auto mb-3 h-7 w-7 animate-spin text-accent" />
            <p className="text-sm font-medium text-ink">
              {PROGRESS_MESSAGES[progressIdx]}
            </p>
            <p className="mt-1.5 text-xs text-ink-muted">
              Please don't close this tab — generation can take up to 2 minutes.
            </p>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            className="btn-primary w-full"
          >
            Generate {MONTH_NAMES[month]} {year} roster
          </button>
        )}
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
function SpinnerIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
