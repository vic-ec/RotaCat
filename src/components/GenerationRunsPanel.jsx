import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SectionLabel from './SectionLabel'
import {
  fetchRecentGenerationJobs, generationRunsToShow, describeJob, jobFailureDetail,
  isJobActive, isJobStale, POLL_INTERVAL_MS,
} from '../lib/rosterGeneration'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DISMISSED_KEY = 'rotacat:dismissedGenerationJobs'

function readDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') } catch { return [] }
}

// Generation runs for the Roster page. A run takes about five minutes on
// a GitHub runner and the admin is free to leave the Generate page, so
// this is where they find it again: what is still running, and what
// failed and why. A month whose latest run succeeded shows nothing here —
// its draft is in the list below. Renders nothing when there is nothing
// to say.
export default function GenerationRunsPanel({ onRunFinished }) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [dismissed, setDismissed] = useState(readDismissed)
  const [, setTick] = useState(0)
  const activeIds = useRef(new Set())

  async function load() {
    try {
      const fresh = await fetchRecentGenerationJobs()
      // A run that was active last time and no longer is has just
      // finished: the roster list underneath may have a new draft.
      const nowActive = new Set(fresh.filter(j => isJobActive(j) && !isJobStale(j)).map(j => j.id))
      const finished = [...activeIds.current].some(id => !nowActive.has(id))
      activeIds.current = nowActive
      setJobs(fresh)
      if (finished) onRunFinished?.()
    } catch {
      /* a dropped poll is not news — the next one will do */
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount only; polling below takes over
  }, [])

  const shown = generationRunsToShow(jobs, { dismissedIds: dismissed })
  const anyActive = shown.some(j => isJobActive(j) && !isJobStale(j))
  useEffect(() => {
    if (!anyActive) return
    const interval = setInterval(() => { setTick(t => t + 1); load() }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is redefined every render; only the active state should restart the timer
  }, [anyActive])

  function dismiss(id) {
    const next = [...new Set([...dismissed, id])].slice(-50)
    setDismissed(next)
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  if (shown.length === 0) return null

  return (
    <div className="mb-6">
      <SectionLabel count={shown.length}>Generation runs</SectionLabel>
      <ul className="card divide-y divide-slate-hairline">
        {shown.map(job => {
          const described = describeJob(job)
          const failed = described.phase === 'failed'
          const detail = failed ? jobFailureDetail(job) : ''
          const openGenerate = () => navigate(`/roster/generate?year=${job.year}&month=${job.month}`)
          return (
            <li key={job.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {MONTH_NAMES[job.month]} {job.year}
                    <span className={`ml-2 font-medium ${failed ? 'text-flagRed' : 'text-ink-muted'}`}>
                      {described.title}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-light">{described.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {failed ? (
                    <>
                      <button onClick={openGenerate} className="btn-secondary px-3 py-1.5 text-xs">Try again</button>
                      <button onClick={() => dismiss(job.id)} className="px-2 py-1.5 text-xs text-ink-muted hover:text-ink">Dismiss</button>
                    </>
                  ) : (
                    <button onClick={openGenerate} className="btn-secondary px-3 py-1.5 text-xs">View progress</button>
                  )}
                </div>
              </div>
              {failed && (detail || job.github_run_url) && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-ink-muted">Technical details</summary>
                  {detail && (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-canvas p-2 text-xs text-ink">{detail}</pre>
                  )}
                  {job.github_run_url && (
                    <a href={job.github_run_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-ink-muted underline">
                      Open the full run log on GitHub
                    </a>
                  )}
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
