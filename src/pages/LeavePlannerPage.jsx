import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import LeaveRequestForm from '../components/LeaveRequestForm'
import LeaveApprovalQueue from '../components/LeaveApprovalQueue'

export default function LeavePlannerPage() {
  const { canSubmitLeave, isAdmin } = useAuth()
  const [tab, setTab] = useState(isAdmin ? 'queue' : 'submit')

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-ink">Leave</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {isAdmin ? 'Review pending requests, or submit your own.' : "Submit a leave request — an admin reviews it before it's approved."}
      </p>

      {isAdmin && (
        <div className="mt-4 flex rounded-lg border border-slate-line bg-canvas-raised overflow-hidden w-fit">
          <button
            onClick={() => setTab('queue')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'queue' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
            }`}
          >
            Approval queue
          </button>
          <button
            onClick={() => setTab('submit')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'submit' ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
            }`}
          >
            My leave
          </button>
        </div>
      )}

      <div className="mt-6">
        {isAdmin && tab === 'queue' ? (
          <LeaveApprovalQueue />
        ) : canSubmitLeave ? (
          <LeaveRequestForm />
        ) : (
          <div className="card p-6 text-center">
            <p className="text-sm text-ink-muted">This account can't submit leave requests.</p>
          </div>
        )}
      </div>
    </div>
  )
}
