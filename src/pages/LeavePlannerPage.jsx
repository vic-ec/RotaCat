import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LeaveRequestForm from '../components/LeaveRequestForm'
import LeaveApprovalQueue from '../components/LeaveApprovalQueue'
import LeaveListView from '../components/LeaveListView'

function defaultTab({ isAdmin, canSubmitLeave }) {
  if (isAdmin) return 'queue'
  if (canSubmitLeave) return 'submit'
  return 'team'
}

export default function LeavePlannerPage() {
  const { canSubmitLeave, isAdmin, isLocum } = useAuth()
  const [tab, setTab] = useState(() => defaultTab({ isAdmin, canSubmitLeave }))

  // Locums can't submit or see leave at all (leave_select RLS returns
  // nothing for them) — redirect rather than render restricted content
  // behind a resolved route.
  if (isLocum) return <Navigate to="/" replace />

  const tabs = [
    ...(isAdmin ? [{ key: 'queue', label: 'Approval queue' }] : []),
    ...(canSubmitLeave ? [{ key: 'submit', label: 'My leave' }] : []),
    { key: 'team', label: 'Team leave' },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-ink">Leave</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {isAdmin ? 'Review pending requests, or submit your own.' : "Submit a leave request — an admin reviews it before it's approved."}
      </p>

      {tabs.length > 1 && (
        <div className="mt-4 flex rounded-lg border border-slate-line bg-canvas-raised overflow-hidden w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {tab === 'queue' && isAdmin && <LeaveApprovalQueue />}
        {tab === 'submit' && canSubmitLeave && <LeaveRequestForm />}
        {tab === 'team' && <LeaveListView />}
      </div>
    </div>
  )
}
