// Roster generation as a background job.
//
// Generation runs on a GitHub Actions runner (RotaCatScheduler's
// generate-roster workflow), not in a web request the browser can wait on.
// The roster-generation Edge Function records the request as a row in
// roster_generation_jobs and starts the run; the runner writes its
// progress and outcome back to that row; this module starts a run and
// reads the row. Admins can read jobs through RLS — nobody can write them
// from the browser, so what is shown is always what the runner reported.
import { supabase } from './supabase'

const FUNCTION_NAME = 'roster-generation'

// A healthy run reports within about five minutes and the workflow is
// capped at 20. Past this the runner is gone; the Edge Function applies
// the same limit and abandons the job on the next start.
export const STALE_AFTER_MINUTES = 30
export const POLL_INTERVAL_MS = 5000

// Same reason as staffCredentials.js: supabase-js reports a non-2xx
// function response as a generic error with the real body on
// error.context.
async function readFunctionError(error) {
  try {
    const body = await error.context?.json?.()
    if (body?.error) return { message: body.error, detail: body.detail || '', job: body.job || null }
  } catch {
    /* not a JSON body — fall through */
  }
  return { message: error.message || 'Something went wrong. Please try again.', detail: '', job: null }
}

/**
 * Asks for a generation run. Resolves to { ok: true, job, alreadyRunning }
 * or { ok: false, error, detail, job } — job is set on failure when the
 * request was recorded but the run could not be started.
 */
export async function startRosterGeneration({ year, month, useCarryForward, excludedProfileIds = [] }) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action: 'start', year, month, useCarryForward, excludedProfileIds },
  })
  if (error) {
    const { message, detail, job } = await readFunctionError(error)
    return { ok: false, error: message, detail, job }
  }
  if (!data?.ok || !data.job) {
    return { ok: false, error: data?.error || 'Something went wrong. Please try again.', detail: data?.detail || '', job: data?.job || null }
  }
  return { ok: true, job: data.job, alreadyRunning: data.alreadyRunning === true }
}

export async function fetchGenerationJob(jobId) {
  const { data, error } = await supabase
    .from('roster_generation_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** The most recent job for a month, whatever its status, or null. */
export async function fetchLatestGenerationJob(year, month) {
  const { data, error } = await supabase
    .from('roster_generation_jobs')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export function isJobActive(job) {
  return job?.status === 'queued' || job?.status === 'running'
}

export function isJobStale(job, now = Date.now()) {
  if (!isJobActive(job) || !job.created_at) return false
  return now - new Date(job.created_at).getTime() > STALE_AFTER_MINUTES * 60000
}

function minutesSince(iso, now) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
}

function elapsedLabel(iso, now) {
  const m = minutesSince(iso, now)
  if (m < 1) return 'less than a minute ago'
  return `${m} minute${m === 1 ? '' : 's'} ago`
}

/**
 * What to tell the person watching: a phase the page switches on, a short
 * title and one line of detail.
 */
export function describeJob(job, now = Date.now()) {
  if (!job) return { phase: 'none', title: '', detail: '' }
  if (isJobStale(job, now)) {
    return {
      phase: 'failed',
      title: 'The run stopped responding',
      detail: `No result after ${STALE_AFTER_MINUTES} minutes. Generate again to start a fresh run.`,
    }
  }
  if (job.status === 'queued') {
    return {
      phase: 'queued',
      title: 'Waiting to start',
      detail: `Requested ${elapsedLabel(job.created_at, now)}. A run usually starts within a minute.`,
    }
  }
  if (job.status === 'running') {
    return {
      phase: 'running',
      title: 'Building the roster',
      detail: `Started ${elapsedLabel(job.started_at || job.created_at, now)}. This usually takes four to five minutes.`,
    }
  }
  if (job.status === 'succeeded') {
    return { phase: 'succeeded', title: 'Roster ready', detail: job.message || '' }
  }
  return { phase: 'failed', title: 'Generation failed', detail: job.message || 'The run did not finish.' }
}

/**
 * The runner's result in the shape the scheduler's old web response had
 * ({ status, entries_written, summary }), which is what
 * saveGenerationReport and the Generation report modal read. The runner
 * nests the flag counts under summary.flags.
 */
export function jobToEngineResult(job) {
  const s = job?.summary || {}
  return {
    status: s.status || null,
    entries_written: s.entries_written ?? s.entries ?? null,
    summary: s.flags || {},
  }
}

/** The technical account of a failed job, for the troubleshooting panel. */
export function jobFailureDetail(job, now = Date.now()) {
  if (!job) return ''
  const lines = []
  if (isJobStale(job, now)) {
    lines.push(`Job ${job.id} was still "${job.status}" ${minutesSince(job.created_at, now)} minutes after it was requested.`)
  }
  if (job.error_detail) lines.push(job.error_detail)
  const failures = job.summary?.validator_failures || []
  for (const f of failures) {
    lines.push(`${f.rule} ${f.title} — ${f.violation_count} violation(s)`)
  }
  return lines.join('\n\n')
}

// How long a finished-badly run stays on the Roster page before it is old
// news. Long enough to be seen after a night's sleep.
export const RECENT_JOB_HOURS = 24

/** Jobs requested in the last day, newest first — what the Roster page lists. */
export async function fetchRecentGenerationJobs(now = Date.now()) {
  const since = new Date(now - RECENT_JOB_HOURS * 3600000).toISOString()
  const { data, error } = await supabase
    .from('roster_generation_jobs')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data || []
}

/**
 * Which runs deserve a line on the Roster page: for each month, only its
 * newest job, and only when it is still going or ended in failure. A month
 * whose newest run succeeded needs nothing here — its draft is in the list
 * below. A dry run writes no roster, so it is never shown either.
 * `dismissedIds` are failures the admin has already acknowledged.
 */
export function generationRunsToShow(jobs, { dismissedIds = [], now = Date.now() } = {}) {
  const newestPerMonth = new Map()
  for (const job of [...jobs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))) {
    const key = `${job.year}-${job.month}`
    if (!newestPerMonth.has(key)) newestPerMonth.set(key, job)
  }
  const dismissed = new Set(dismissedIds)
  return [...newestPerMonth.values()]
    .filter(job => {
      if (job.summary?.dry_run) return false
      const phase = describeJob(job, now).phase
      if (phase === 'queued' || phase === 'running') return true
      return phase === 'failed' && !dismissed.has(job.id)
    })
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
}
