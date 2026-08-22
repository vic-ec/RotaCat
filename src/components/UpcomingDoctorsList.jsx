import { useState } from 'react'

// Upcoming tab of the Rotations page — Intern/Registrar doctors
// with a future start already scheduled (profiles.scheduled_active_date;
// see PendingApprovalReviewPage's "Active from" field, and
// CompletedDoctorsList's own reactivate-with-a-future-date path, both of
// which set the same column). The daily apply-scheduled-status-changes
// job (see supabase/migrations/..._add_scheduled_active_date_and_combine_
// status_job.sql) flips them into the Active tab on its own once that
// date arrives — "Activate now" here just does that immediately instead
// of waiting.
export default function UpcomingDoctorsList({ doctors, displayNames, onUpdateDate, onActivateNow }) {
  const [editingId, setEditingId] = useState(null)
  const [draftDate, setDraftDate] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [errorId, setErrorId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const sorted = [...doctors].sort((a, b) => (a.scheduled_active_date || '').localeCompare(b.scheduled_active_date || ''))

  if (sorted.length === 0) {
    return <p className="mt-4 text-sm text-ink-muted">No doctors with a scheduled start date.</p>
  }

  function startEditing(doctor) {
    setEditingId(doctor.id)
    setDraftDate(doctor.scheduled_active_date)
    setErrorId(null)
  }

  async function saveDate(doctorId) {
    setSavingId(doctorId)
    setErrorId(null)
    try {
      await onUpdateDate(doctorId, draftDate)
      setEditingId(null)
    } catch (err) {
      setErrorId(doctorId)
      setErrorMessage(err.message)
    }
    setSavingId(null)
  }

  async function activateNow(doctorId) {
    setSavingId(doctorId)
    setErrorId(null)
    try {
      await onActivateNow(doctorId)
    } catch (err) {
      setErrorId(doctorId)
      setErrorMessage(err.message)
    }
    setSavingId(null)
  }

  return (
    <div className="mt-4 divide-y divide-slate-line">
      {sorted.map(doctor => {
        const isEditing = editingId === doctor.id
        const rowSaving = savingId === doctor.id
        return (
          <div key={doctor.id} className="py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: doctor.color_code }} />
                <span className="font-medium text-ink">{displayNames?.get(doctor.id) ?? doctor.surname}</span>
                <span className="text-xs text-ink-muted capitalize">{doctor.category}</span>
              </div>
              {!isEditing && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-light">Starts {doctor.scheduled_active_date}</span>
                  <button type="button" onClick={() => startEditing(doctor)} className="text-xs font-medium text-accent hover:underline">
                    Edit date
                  </button>
                  <button
                    type="button"
                    onClick={() => activateNow(doctor.id)}
                    disabled={rowSaving}
                    className="btn-secondary px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {rowSaving ? 'Activating…' : 'Activate now'}
                  </button>
                </div>
              )}
            </div>
            {isEditing && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                  Starts
                  <input
                    type="date"
                    value={draftDate}
                    onChange={e => setDraftDate(e.target.value)}
                    className="input-field py-1 text-xs"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => saveDate(doctor.id)}
                  disabled={rowSaving || !draftDate}
                  className="btn-primary px-2 py-1 text-xs disabled:opacity-50"
                >
                  {rowSaving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditingId(null)} disabled={rowSaving} className="text-xs text-ink-muted hover:text-ink">
                  Cancel
                </button>
              </div>
            )}
            {errorId === doctor.id && <p className="mt-1 text-xs text-flagRed">{errorMessage}</p>}
          </div>
        )
      })}
    </div>
  )
}
