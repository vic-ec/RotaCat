import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  startRosterGeneration, fetchGenerationJob, fetchLatestGenerationJob,
  describeJob, isJobActive, isJobStale, jobToEngineResult, jobFailureDetail, POLL_INTERVAL_MS,
} from '../lib/rosterGeneration'
import { buildGenerationReport, saveGenerationReport } from '../lib/generationReport'
import { CATEGORY_LABELS } from '../lib/categoryLabels'
import { useSwatch } from '../lib/useSwatch'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Categories the solver actually schedules — Consultants and Locums
// are never auto-scheduled so we exclude them from the selection panel.
// COSMO/COSMOPsych/EC_COSMO_Intern/OT_COSMO_Intern were retired from the
// staff_category enum in Aug 2026 (folded into Intern/EC_Intern/OT_Intern)
// — a stale value here isn't just dead, it makes the whole query error.
const SCHEDULABLE_CATEGORIES = [
  'MO', 'Registrar', 'Intern',
  // Future values included so they work automatically when activated
  'EC_Intern', 'OT_Intern',
]

export default function GenerationConfigPage() {
  const navigate = useNavigate()
  const swatch = useSwatch()
  const { profile } = useAuth()

  const now = new Date()
  const defaultMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2
  const defaultYear  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()

  // ?year=&month= opens the page on a specific month — the Roster page's
  // "View progress" / "Try again" links land here that way.
  const [searchParams] = useSearchParams()
  const paramYear  = Number(searchParams.get('year'))
  const paramMonth = Number(searchParams.get('month'))
  const [year, setYear]                 = useState(Number.isInteger(paramYear) && paramYear >= 2024 ? paramYear : defaultYear)
  const [month, setMonth]               = useState(paramMonth >= 1 && paramMonth <= 12 ? paramMonth : defaultMonth)
  const [useCarryForward, setUseCarryForward] = useState(false)
  const [leaveBlocks, setLeaveBlocks]   = useState([])
  const [loadingLeave, setLoadingLeave] = useState(false)
  const [existingRoster, setExistingRoster] = useState(null)

  // Doctor selection — all schedulable active doctors, keyed by profile id
  const [allDoctors, setAllDoctors]   = useState([])
  const [excluded, setExcluded]       = useState(new Set()) // profile ids to exclude
  const [loadingDoctors, setLoadingDoctors] = useState(false)

  // Generation is a background job (see lib/rosterGeneration.js): `job`
  // is the roster_generation_jobs row being followed, `starting` covers
  // the moment between the click and the job existing. `tick` only exists
  // to re-render the elapsed time between polls.
  const [job, setJob]                 = useState(null)
  const [starting, setStarting]       = useState(false)
  const [, setTick]                   = useState(0)
  const [error, setError]             = useState('')
  const [errorDetail, setErrorDetail] = useState('')
  const [errorRunUrl, setErrorRunUrl] = useState('')
  const jobActive  = isJobActive(job) && !isJobStale(job)
  const generating = starting || jobActive
  // The doctors list is folded to a one-line summary per category until
  // someone needs to change who is included — it is 20+ rows that are
  // almost always left exactly as they are.
  const [showDoctors, setShowDoctors] = useState(false)

  useEffect(() => {
    loadLeaveSummary()
    checkExistingRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadLeaveSummary/checkExistingRoster are redefined every render; including them would refetch in a loop
  }, [year, month])

  useEffect(() => {
    loadDoctors()
  }, [])

  // A run outlives this page: coming back to a month that is still being
  // generated (by this admin or another) picks its job up again rather
  // than offering to start a second one.
  useEffect(() => {
    let cancelled = false
    fetchLatestGenerationJob(year, month)
      .then(latest => {
        if (cancelled) return
        if (isJobActive(latest) && !isJobStale(latest)) {
          setJob(latest)
          return
        }
        setJob(null)
        // The last run for this month ended badly and nothing has replaced
        // it: say so, so "what happened to my run?" is answered here too.
        const recent = latest && Date.now() - new Date(latest.created_at).getTime() < 24 * 3600000
        if (recent && !latest.summary?.dry_run && describeJob(latest).phase === 'failed') {
          showFailure(latest)
        } else {
          setError(''); setErrorDetail(''); setErrorRunUrl('')
        }
      })
      .catch(() => { /* no job to resume is the same as none found */ })
    return () => { cancelled = true }
  }, [year, month])

  // Follow the job until it finishes. The runner updates the row; this
  // only reads it.
  const jobId = job?.id
  useEffect(() => {
    if (!jobId || !jobActive) return
    let cancelled = false
    const interval = setInterval(async () => {
      setTick(t => t + 1)
      try {
        const fresh = await fetchGenerationJob(jobId)
        if (!cancelled && fresh) setJob(fresh)
      } catch {
        /* a dropped poll on hospital wifi is not a failed run — try again */
      }
    }, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [jobId, jobActive])

  // The job finished (or went stale) while this page was watching it.
  useEffect(() => {
    if (!job) return
    if (job.status === 'succeeded') {
      if (job.roster_month_id) {
        openFinishedRoster(job)
      } else {
        showFailure(job, 'The run finished but did not report a roster.')
      }
    } else if (job.status === 'failed' || isJobStale(job)) {
      showFailure(job)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the job row only; showFailure/navigate are stable in effect
  }, [job])

  // Keep the engine's account of the run and open the roster on it. Saved
  // on the roster itself so every admin can open it; if that write fails,
  // at least keep it on this device.
  async function openFinishedRoster(finishedJob) {
    const report = buildGenerationReport(jobToEngineResult(finishedJob), {
      excludedCount: (finishedJob.excluded_profile_ids || []).length,
    })
    const { error: saveError } = await supabase
      .from('roster_months')
      .update({ generation_report: report })
      .eq('id', finishedJob.roster_month_id)
    if (saveError) saveGenerationReport(finishedJob.roster_month_id, report)
    navigate(`/roster/${finishedJob.roster_month_id}?report=1`)
  }

  function showFailure(failedJob, fallbackMessage) {
    const described = describeJob(failedJob)
    setError(fallbackMessage || `${described.title}. ${described.detail}`.trim())
    setErrorDetail(jobFailureDetail(failedJob))
    setErrorRunUrl(failedJob?.github_run_url || '')
    setJob(null)
  }

  async function loadDoctors() {
    setLoadingDoctors(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, name, surname, category, color_code, is_active')
      .eq('is_approved', true)
      .eq('is_active', true)
      .in('category', SCHEDULABLE_CATEGORIES)
      .order('category')
      .order('surname')
    setAllDoctors(data || [])
    setLoadingDoctors(false)
  }

  async function loadLeaveSummary() {
    setLoadingLeave(true)
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay  = new Date(year, month, 0).toISOString().split('T')[0]

    const { data } = await supabase
      .from('leave_requests')
      .select('profile_id, date_from, date_to, leave_type, profiles!leave_requests_profile_id_fkey(surname, name)')
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

  function toggleDoctor(profileId) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  function toggleAll(include) {
    if (include) {
      setExcluded(new Set())
    } else {
      setExcluded(new Set(allDoctors.map(d => d.id)))
    }
  }

  async function handleGenerate() {
    if (!profile?.id) return
    setError('')
    setErrorDetail('')
    setErrorRunUrl('')
    setStarting(true)
    // Fold the list away and bring the page back to the top, so the
    // progress dialog opens over a short, settled page.
    setShowDoctors(false)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })

    const result = await startRosterGeneration({
      year,
      month,
      useCarryForward,
      excludedProfileIds: Array.from(excluded),
    })
    setStarting(false)

    if (result.ok) {
      setJob(result.job)
    } else {
      setError(result.error)
      setErrorDetail(result.detail || result.job?.error_detail || '')
      setErrorRunUrl(result.job?.github_run_url || '')
    }
  }

  const yearOptions = [...new Set([year, now.getFullYear(), now.getFullYear() + 1])].sort()
  const includedCount = allDoctors.length - excluded.size

  // Group doctors by category for display in the selection panel
  const grouped = allDoctors.reduce((acc, doc) => {
    const key = CATEGORY_LABELS[doc.category] || doc.category
    if (!acc[key]) acc[key] = []
    acc[key].push(doc)
    return acc
  }, {})

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <button
          onClick={() => navigate('/roster')}
          className="sticky top-14 md:top-0 z-[5] mb-4 flex items-center gap-1.5 rounded bg-canvas px-2 py-1.5 -ml-2 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Back to rosters
        </button>
        <h1 className="font-display text-2xl font-bold text-ink">Generate roster</h1>
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
<strong>This month is published — revert it to draft before generating again.</strong>
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
            <p className="text-sm text-ink-muted">No approved leave for this month.</p>
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

        {/* ── Doctor selection panel ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="label-text">
              Doctors included in this roster
            </p>
            <span className="flex items-center gap-3 text-xs text-ink-muted">
              {includedCount} of {allDoctors.length} included
              <button
                type="button"
                onClick={() => setShowDoctors(v => !v)}
                disabled={generating}
                aria-expanded={showDoctors}
                className="font-medium text-accent hover:text-accent-dark hover:underline disabled:opacity-40"
              >
                {showDoctors ? 'Done' : 'Change'}
              </button>
            </span>
          </div>

          {excluded.size > 0 && (
            <div className="mb-2 rounded bg-flagAmber-bg px-3 py-2 text-xs text-flagAmber">
              {excluded.size} doctor{excluded.size !== 1 ? 's' : ''} excluded from this generation run.
            </div>
          )}

          {loadingDoctors ? (
            <p className="text-sm text-ink-muted">Loading doctors…</p>
          ) : !showDoctors ? (
            /* Folded: one line per category, and the names of anyone left
               out — the only detail worth seeing without opening it. */
            <div className="rounded-lg border border-slate-line">
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2.5 text-sm text-ink-light">
                {Object.entries(grouped).map(([categoryLabel, doctors]) => (
                  <span key={categoryLabel}>
                    {categoryLabel}{' '}
                    <span className="font-semibold text-ink">
                      {doctors.filter(d => !excluded.has(d.id)).length}/{doctors.length}
                    </span>
                  </span>
                ))}
              </div>
              {excluded.size > 0 && (
                <p className="border-t border-slate-line px-3 py-2 text-xs text-ink-muted">
                  Excluded: {allDoctors.filter(d => excluded.has(d.id)).map(d => d.surname).join(', ')}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-line overflow-hidden">
              {/* Select all / none */}
              <div className="flex items-center justify-between border-b border-slate-line bg-canvas-sunken px-3 py-2">
                <p className="text-xs font-medium text-ink-muted">All active doctors</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => toggleAll(true)}
                    disabled={generating}
                    className="text-xs text-accent hover:underline disabled:opacity-40"
                  >
                    Include all
                  </button>
                  <button
                    onClick={() => toggleAll(false)}
                    disabled={generating}
                    className="text-xs text-ink-muted hover:underline disabled:opacity-40"
                  >
                    Exclude all
                  </button>
                </div>
              </div>

              {/* Grouped doctor list */}
              {Object.entries(grouped).map(([categoryLabel, doctors]) => (
                <div key={categoryLabel}>
                  <div className="bg-canvas-sunken px-3 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      {categoryLabel} ({doctors.filter(d => !excluded.has(d.id)).length}/{doctors.length})
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2">
                  {doctors.map(doc => {
                    const isExcluded = excluded.has(doc.id)
                    return (
                      <button
                        key={doc.id}
                        onClick={() => !generating && toggleDoctor(doc.id)}
                        disabled={generating}
                        className={`flex w-full items-center gap-2.5 border-b border-slate-hairline px-3 py-1.5 text-left transition-colors ${
                          isExcluded
                            ? 'bg-canvas-sunken opacity-50'
                            : 'hover:bg-accent-tint'
                        }`}
                      >
                        {/* Checkbox */}
                        <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
                          isExcluded
                            ? 'border-slate-line bg-canvas-raised'
                            : 'border-accent bg-accent'
                        }`}>
                          {!isExcluded && (
                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        {/* Colour dot */}
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={swatch.fill(doc.color_code || '#4A90D9')}
                        />
                        <span className={`text-sm ${isExcluded ? 'line-through text-ink-muted' : 'text-ink'}`}>
                          {doc.surname}{doc.name ? `, ${doc.name}` : ''}
                        </span>
                      </button>
                    )
                  })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded bg-flagRed-bg px-3 py-2.5 text-sm text-flagRed">
            <p className="font-medium">{error}</p>
            {/* The technical account, for whoever troubleshoots it: the
                runner's own error text and a link to its full log. */}
            {(errorDetail || errorRunUrl) && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium">Technical details</summary>
                {errorDetail && (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-card p-2 text-xs text-ink">{errorDetail}</pre>
                )}
                {errorRunUrl && (
                  <a href={errorRunUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline">
                    Open the full run log on GitHub
                  </a>
                )}
              </details>
            )}
          </div>
        )}

        {/* Generate — the progress itself is the dialog below, not a
            panel down here at the foot of the form. */}
        <button
          onClick={handleGenerate}
          disabled={includedCount === 0 || generating}
          className="btn-primary w-full disabled:opacity-50"
        >
          {generating ? 'Generating…' : <>Generate {MONTH_NAMES[month]} {year} roster{excluded.size > 0 && ` (${includedCount} doctors)`}</>}
        </button>
      </div>

      {/* Progress — centred over the page while the run is followed. The
          run itself happens on a GitHub runner and carries on whether or
          not this page stays open, so the one action offered is to leave
          it to it; coming back to this page for the same month picks the
          run up again. It closes itself onto the new roster, or back to
          the form with the error. */}
      {generating && (() => {
        const described = starting
          ? { title: 'Starting the run', detail: 'Asking for a runner…' }
          : describeJob(job)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center scrim-strong px-4">
            <div role="dialog" aria-modal="true" aria-labelledby="generating-title" className="card w-full max-w-sm p-6 text-center">
              <SpinnerIcon className="mx-auto mb-4 h-9 w-9 animate-spin text-accent" />
              <h2 id="generating-title" className="font-display text-base font-bold text-ink">
                Generating {MONTH_NAMES[job?.month ?? month]} {job?.year ?? year}
              </h2>
              <p className="mt-2 text-sm font-medium text-ink" aria-live="polite">{described.title}</p>
              <p className="mt-1 text-sm text-ink-light">{described.detail}</p>
              <p className="mt-4 text-xs text-ink-muted">
                The whole run takes about five minutes. The roster opens by itself when it&apos;s ready. You can leave this page — the run carries on, and Generate roster shows its progress when you come back.
              </p>
              <button onClick={() => navigate('/roster')} className="btn-secondary mt-4 w-full">
                Leave it running
              </button>
            </div>
          </div>
        )
      })()}
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
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
