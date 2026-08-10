import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { groupRotationsByDoctorId, endOfRotationFlag } from '../lib/internRotations'
import { rotationTypeKey, ROTATION_TYPE_KEY_OPTIONS, ROTATION_TYPE_COLOR } from '../lib/staffDefaults'
import { addDays, todayStr, formatShortDateRange } from '../lib/dateRange'

function typeLabel(key) {
  return ROTATION_TYPE_KEY_OPTIONS.find(o => o.key === key)?.label || key
}

// Persistent queue of Intern/Registrar doctors whose last planned
// rotation block has ended with nothing lined up next — same "needs
// admin attention" visual weight as the Staff nav's Pending Approvals
// badge (see the matching badge on the Rotations tab itself in
// LeavePlannerPage.jsx), not a one-shot toast. Stays visible until
// resolved: either a deactivation gets scheduled here, or an admin adds
// their next block in the Matrix (via onViewInMatrix).
export default function EndOfRotationQueue({ doctors, rotations, displayNames, onScheduleDeactivation, onViewInMatrix }) {
  const [schedulingId, setSchedulingId] = useState(null)
  const [draftDate, setDraftDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const rotationsByDoctorId = groupRotationsByDoctorId(rotations)
  const entries = doctors
    .map(doctor => {
      const lastRotation = endOfRotationFlag({
        category: doctor.category,
        scheduledInactiveDate: doctor.scheduled_inactive_date,
        rotations: rotationsByDoctorId.get(doctor.id) || [],
      })
      return lastRotation ? { doctor, lastRotation } : null
    })
    .filter(Boolean)
    .sort((a, b) => a.lastRotation.end_date.localeCompare(b.lastRotation.end_date))

  if (entries.length === 0) return null

  function startScheduling(entry) {
    setSchedulingId(entry.doctor.id)
    setDraftDate(addDays(entry.lastRotation.end_date, 1))
    setError('')
  }

  async function confirmScheduling(doctorId) {
    setSaving(true)
    setError('')
    try {
      await onScheduleDeactivation(doctorId, draftDate)
      setSchedulingId(null)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="mb-4 rounded-lg border border-flagRed/30 bg-flagRed-bg p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-flagRed">
        <TriangleAlert className="h-4 w-4 flex-shrink-0" />
        {entries.length} rotation{entries.length === 1 ? '' : 's'} ended with nothing lined up next
      </p>
      <div className="mt-2 divide-y divide-flagRed/20">
        {entries.map(({ doctor, lastRotation }) => {
          const key = rotationTypeKey(lastRotation.rotation_type, lastRotation.subtype)
          const isScheduling = schedulingId === doctor.id
          return (
            <div key={doctor.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-ink">{displayNames?.get(doctor.id) ?? doctor.surname}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: ROTATION_TYPE_COLOR[key] }}
                  >
                    {typeLabel(key)}
                  </span>
                  <span className="text-xs text-ink-light">ended {formatShortDateRange(lastRotation.end_date, lastRotation.end_date)}</span>
                </div>
                {!isScheduling && (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onViewInMatrix(doctor.id)} className="text-xs font-medium text-accent hover:underline">
                      View in Matrix
                    </button>
                    <button type="button" onClick={() => startScheduling({ doctor, lastRotation })} className="btn-secondary px-2 py-1 text-xs">
                      Schedule deactivation
                    </button>
                  </div>
                )}
              </div>
              {isScheduling && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                    Inactive from
                    <input
                      type="date"
                      value={draftDate}
                      min={todayStr()}
                      onChange={e => setDraftDate(e.target.value)}
                      className="input-field py-1 text-xs"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => confirmScheduling(doctor.id)}
                    disabled={saving || !draftDate}
                    className="btn-primary px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Confirm'}
                  </button>
                  <button type="button" onClick={() => setSchedulingId(null)} disabled={saving} className="text-xs text-ink-muted hover:text-ink">
                    Cancel
                  </button>
                </div>
              )}
              {isScheduling && error && <p className="mt-1 text-xs text-flagRed">{error}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
