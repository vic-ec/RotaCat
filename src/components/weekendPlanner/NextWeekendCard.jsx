import { CATEGORY_GROUPS, formatWeekendRange } from '../../lib/weekendPlanner'

// The phone's dismissible "Next weekend" card.
export default function NextWeekendCard({ nextWeekendScheme, setNextWeekendDismissed, nextWeekend, nextWeekendCoverage, nextWeekendMine }) {
  return (
    <div className={`card relative mt-4 p-4 pr-12 ${nextWeekendScheme.bg}`}>
      <button
        type="button"
        onClick={() => setNextWeekendDismissed(true)}
        aria-label="Dismiss next weekend"
        className="btn-close absolute right-2 top-2 h-8 w-8 text-ink-muted"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next weekend</p>
      <p className={`mt-0.5 text-base font-semibold ${nextWeekendScheme.text}`}>{formatWeekendRange(nextWeekend)}</p>
      <p className="mt-1 text-sm text-ink-light">
        {nextWeekendCoverage.filledGroups} of {nextWeekendCoverage.totalGroups} groups staffed
        {nextWeekendCoverage.openGroups.length > 0 && (
          <> — <span className="text-rose-dark">{nextWeekendCoverage.openGroups.map(k => CATEGORY_GROUPS.find(g => g.key === k)?.label).join(', ')} still open</span></>
        )}
      </p>
      {nextWeekendMine && <p className="mt-1 text-sm font-medium text-accent">You&rsquo;re on rotation this weekend.</p>}
    </div>
  )
}
