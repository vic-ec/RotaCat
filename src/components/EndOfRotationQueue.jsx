import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { groupRotationsByDoctorId, endOfRotationFlag } from '../lib/internRotations'
import { rotationTypeKey, ROTATION_TYPE_KEY_OPTIONS, ROTATION_TYPE_COLOR } from '../lib/staffDefaults'
import { addDays, todayStr, formatShortDateRange } from '../lib/dateRange'
import DateFieldButton from './DateFieldButton'

function typeLabel(key) {
  return ROTATION_TYPE_KEY_OPTIONS.find(o => o.key === key)?.label || key
}

// "Remind me later" snoozes one doctor's warning until tomorrow, purely a
// local per-browser preference (this queue itself has no dismissal state
// of its own — it's recomputed fresh from doctors/rotations every load) —
// same localStorage-with-a-try/catch convention as the view-mode toggles
// elsewhere in the app (e.g. RosterDashboardPage's ROSTER_VIEW_KEY).
// Keyed by doctor + the specific end_date the warning is about, not just
// the doctor, so a snooze can never silently swallow a LATER, genuinely
// different end-of-rotation warning for the same doctor.
const SNOOZE_KEY_PREFIX = 'rotacat.endOfRotationSnoozedUntil.'

function snoozeKey(doctorId, endDate) {
  return `${SNOOZE_KEY_PREFIX}${doctorId}.${endDate}`
}
function readSnoozedUntil(doctorId, endDate) {
  try {
    return localStorage.getItem(snoozeKey(doctorId, endDate))
  } catch {
    return null
  }
}
function writeSnoozedUntil(doctorId, endDate, until) {
  try {
    localStorage.setItem(snoozeKey(doctorId, endDate), until)
  } catch { /* ignore */ }
}

// Persistent queue of Intern/Registrar doctors whose last planned
// rotation block has ended — or is about to — with nothing lined up next — same "needs
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
  // Bumped by remindLater below purely to force a re-render — entries
  // isn't memoized, so any state change is enough for the fresh render to
  // pick up the localStorage write remindLater just made.
  const [, forceRerender] = useState(0)

  const rotationsByDoctorId = groupRotationsByDoctorId(rotations)
  const today = todayStr()
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
    .filter(({ doctor, lastRotation }) => {
      const snoozedUntil = readSnoozedUntil(doctor.id, lastRotation.end_date)
      return !snoozedUntil || snoozedUntil <= today
    })
    .sort((a, b) => a.lastRotation.end_date.localeCompare(b.lastRotation.end_date))

  if (entries.length === 0) return null

  // This queue deliberately opens on the 1st of the month a block ends
  // (see endOfRotationFlag), so on any given day it holds a mix of blocks
  // that have already run out and blocks that are about to — "ended" was
  // being said about both. The heading follows the same rule as the rows:
  // it only settles on the past tense once every block in it really is
  // over.
  const anyStillRunning = entries.some(({ lastRotation }) => lastRotation.end_date >= today)

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

  function remindLater(doctorId, endDate) {
    writeSnoozedUntil(doctorId, endDate, addDays(today, 1))
    forceRerender(n => n + 1)
  }

  return (
    <div className="mb-4 rounded-lg border border-flagRed/30 bg-flagRed-bg p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-flagRed">
        <TriangleAlert className="h-4 w-4 flex-shrink-0" />
        {entries.length} rotation{entries.length === 1 ? '' : 's'} {anyStillRunning ? 'ending' : 'ended'} with nothing lined up next
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
                  <span className="text-xs text-ink-light">
                    {lastRotation.end_date < today ? 'ended' : 'ends'} {formatShortDateRange(lastRotation.end_date, lastRotation.end_date)}
                  </span>
                </div>
                {/* One line of same-shaped text links, the treatment the
                    dashboard's own inline actions use (DashboardPage's
                    EmptyRow, LeaveDashboard's pending-requests line) —
                    rather than the link / bordered button / muted link mix
                    this row used to be, which gave three actions of equal
                    weight three different shapes. Spaced rather than
                    dot-separated: the three don't fit one line on a phone,
                    and a separator between them either dangles at the end
                    of the first line or orphans onto the second. Remind me
                    later stays muted because it dismisses rather than
                    resolves, the same split as Confirm/Cancel on the row
                    below. */}
                {!isScheduling && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => onViewInMatrix(doctor.id)}
                      className="py-0.5 font-medium text-accent hover:underline"
                    >
                      View in Matrix
                    </button>
                    <button
                      type="button"
                      onClick={() => startScheduling({ doctor, lastRotation })}
                      className="py-0.5 font-medium text-accent hover:underline"
                    >
                      Schedule deactivation
                    </button>
                    <button
                      type="button"
                      onClick={() => remindLater(doctor.id, lastRotation.end_date)}
                      title="Hide this warning until tomorrow"
                      className="py-0.5 font-medium text-ink-muted hover:text-ink hover:underline"
                    >
                      Remind me later
                    </button>
                  </div>
                )}
              </div>
              {isScheduling && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {/* Label beside the field rather than around it — see
                      UpcomingDoctorsList for why. */}
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <label htmlFor={`inactive-from-${doctor.id}`}>Inactive from</label>
                    <DateFieldButton
                      id={`inactive-from-${doctor.id}`}
                      label="Inactive from"
                      labelledExternally
                      value={draftDate}
                      min={todayStr()}
                      onChange={setDraftDate}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => confirmScheduling(doctor.id)}
                    disabled={saving || !draftDate}
                    className="btn-primary px-2 disabled:opacity-50"
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
