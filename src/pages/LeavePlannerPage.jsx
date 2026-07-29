import { useAuth } from '../context/AuthContext'
import LeaveRequestForm from '../components/LeaveRequestForm'

export default function LeavePlannerPage() {
  const { canSubmitLeave } = useAuth()

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-ink">Leave</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Submit a leave request — an admin reviews it before it's approved.
      </p>

      <div className="mt-6">
        {canSubmitLeave ? (
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
