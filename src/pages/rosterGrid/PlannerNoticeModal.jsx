import Modal from '../../components/Modal'

// What the planner chip opens (see the comment where RosterGridPage
// renders it). Moved out of RosterGridPage as it was.
export default function PlannerNoticeModal({ plannerChangedSince, setShowPlannerNotice, plannerDrift, isAdmin, navigate, setShowDriftDetails }) {
  return (
    <Modal
      title={plannerChangedSince ? 'Weekend Planner updated' : 'Draft differs from the Weekend Planner'}
      onClose={() => setShowPlannerNotice(false)}
      centered
      maxWidthClassName="md:max-w-md"
    >
      <p className="text-sm text-ink-light">
        {plannerChangedSince
          ? 'Changed since this draft was generated — regenerate to apply the latest plan.'
          : `${plannerDrift.length} weekend${plannerDrift.length === 1 ? '' : 's'} in this draft ${plannerDrift.length === 1 ? "doesn't" : "don't"} match the plan. The planner hasn't changed since this draft was generated.`}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isAdmin && plannerChangedSince && (
          <button onClick={() => navigate('/roster/generate')} className="btn-primary text-sm">
            Regenerate roster
          </button>
        )}
        <button
          onClick={() => { setShowPlannerNotice(false); setShowDriftDetails(true) }}
          className="btn-secondary text-sm"
        >
          {plannerChangedSince ? 'View changes' : 'View differences'}
        </button>
      </div>
    </Modal>
  )
}
