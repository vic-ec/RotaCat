import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import SelectMenu from './SelectMenu'
import LeaveCapacityBanner from './LeaveCapacityBanner'
import { datesInRange } from '../lib/dateRange'
import { LEAVE_CAPACITY_COLUMNS } from '../lib/leaveYearGrid'
import {
  LEAVE_TYPE_OPTIONS, SPECIAL_LEAVE_TYPES, submitLeaveRequest, fetchAnnualCapacityPreview, fetchSpecialLeavePressure,
  fetchWeekendExceptionPreview,
} from '../lib/leaveRequests'
import {
  INTERN_ROTATION_CATEGORY, fetchInternRotationsForDoctorIds, rotationBoundaryNote, resolveLeaveCapacityColumn,
} from '../lib/internRotations'
import DateFieldButton from './DateFieldButton'

const WEEKEND_EXCEPTION_HINT = 'Pick the Saturday — the Sunday is added automatically. Must be a single weekend.'

// initialDateFrom/initialDateTo: optional prefill for a specific date (or
// range) — used by the Annual planner's month workspace when someone opens
// this form from a day they clicked, rather than starting from a blank
// date field. Submission itself is unaffected: still always files under
// the signed-in user's own profile via useAuth(), same as before.
export default function LeaveRequestForm({ onSubmitted, initialDateFrom = '', initialDateTo = '' }) {
  const { profile, isAdmin } = useAuth()
  const [leaveType, setLeaveType] = useState('annual')
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo)
  const [annualLeaveDays, setAnnualLeaveDays] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'error' | 'success', text }
  const [annualPreview, setAnnualPreview] = useState(null)
  const [annualPreviewLoading, setAnnualPreviewLoading] = useState(false)
  const [specialPressure, setSpecialPressure] = useState(null)
  const [weekendPreview, setWeekendPreview] = useState(null)
  const [myRotations, setMyRotations] = useState([])
  const [myRotationsLoaded, setMyRotationsLoaded] = useState(false)
  const [columnOverride, setColumnOverride] = useState(null)

  const isWeekendException = leaveType === 'weekend_exception'
  const isAnnual = leaveType === 'annual'
  const isSpecial = SPECIAL_LEAVE_TYPES.includes(leaveType)
  const isIntern = profile?.category === INTERN_ROTATION_CATEGORY
  const totalDays = dateFrom && dateTo && dateFrom <= dateTo ? datesInRange(dateFrom, dateTo).length : null
  const hasValidRange = Boolean(totalDays)

  // An Intern's own rotation blocks — fetched once per signed-in profile
  // (not per date change), live rather than cached, so an admin's
  // last-minute rotation swap is reflected the next time this form
  // mounts/re-fetches. Drives both the boundary-straddle note below and the
  // "no rotation assigned yet" state — never blocks the rest of the form on
  // failure (see leaveRequests.js's own resolveLeaveCapacityColumn callers
  // for the same never-throw contract).
  useEffect(() => {
    if (!isIntern || !profile?.id) { setMyRotations([]); setMyRotationsLoaded(false); return }
    let cancelled = false
    fetchInternRotationsForDoctorIds([profile.id])
      .then(rotations => { if (!cancelled) { setMyRotations(rotations); setMyRotationsLoaded(true) } })
      .catch(() => { if (!cancelled) { setMyRotations([]); setMyRotationsLoaded(true) } })
    return () => { cancelled = true }
  }, [isIntern, profile?.id])

  // Date-driven per requirement #2/#3: resolved off the START of the
  // requested range (dateFrom), never today's date and never split
  // day-by-day across a range that straddles two blocks — matches exactly
  // what checkAnnualLeaveCapacity/fetchAnnualCapacityPreview resolve this
  // same request against.
  const boundaryNote = isAnnual && isIntern && hasValidRange ? rotationBoundaryNote(myRotations, dateFrom, dateTo) : null
  const noRotationAssigned = isAnnual && isIntern && hasValidRange && myRotationsLoaded
    && !myRotations.some(r => r.start_date <= dateFrom && dateFrom <= r.end_date)

  // The category this request would actually be checked against today, for
  // this exact date range — same resolution fetchAnnualCapacityPreview/
  // checkAnnualLeaveCapacity use server-side. Drives both the default
  // selection and the visibility of the "Checking capacity for" picker
  // below (a category with no capacity column at all, e.g. Consultant, has
  // nothing to preview). `columnOverride` lets the picker preview a
  // DIFFERENT column's room without changing what actually gets submitted —
  // useful for an Intern (or anyone) looking ahead into a month they expect
  // to be on a different rotation for, before that rotation is confirmed on
  // record.
  const resolvedColumnKey = isAnnual && hasValidRange
    ? resolveLeaveCapacityColumn({
      category: profile?.category, contractType: profile?.contract_type, profileId: profile?.id, date: dateFrom,
      rotationsByDoctorId: profile?.id ? new Map([[profile.id, myRotations]]) : new Map(),
    })
    : null
  const resolvedColumnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === resolvedColumnKey)
  const previewColumnKey = columnOverride ?? resolvedColumnKey
  const isColumnOverridden = Boolean(columnOverride) && columnOverride !== resolvedColumnKey

  // Live capacity feedback for a range that's actually complete — a date
  // <input>'s onChange already only fires on a committed value (not per
  // keystroke the way a text field would), so reacting to dateFrom/dateTo
  // here already behaves like "on blur," without needing to wire that up
  // separately across two fields (and however dateFrom/dateTo got set —
  // typed, prefilled via initialDateFrom/To, or derived from the weekend-
  // exception Saturday picker — this still fires exactly once each way).
  // Neither fetch can throw (see fetchAnnualCapacityPreview/
  // fetchSpecialLeavePressure), so this is purely informative — it can
  // never block or interfere with submission.
  useEffect(() => {
    if (!isAnnual || !hasValidRange) { setAnnualPreview(null); setAnnualPreviewLoading(false); return }
    let cancelled = false
    setAnnualPreviewLoading(true)
    fetchAnnualCapacityPreview({
      dateFrom, dateTo, category: profile?.category, contractType: profile?.contract_type, profileId: profile?.id, columnKeyOverride: columnOverride || undefined,
    }).then(result => {
      if (!cancelled) { setAnnualPreview(result); setAnnualPreviewLoading(false) }
    })
    return () => { cancelled = true }
  }, [isAnnual, hasValidRange, dateFrom, dateTo, profile?.category, profile?.contract_type, profile?.id, columnOverride])

  useEffect(() => {
    if (!isSpecial || !hasValidRange) { setSpecialPressure(null); return }
    let cancelled = false
    fetchSpecialLeavePressure({ dateFrom, dateTo }).then(result => {
      if (!cancelled) setSpecialPressure(result)
    })
    return () => { cancelled = true }
  }, [isSpecial, hasValidRange, dateFrom, dateTo])

  // Live coverage read for the weekend-exception advisory banner below —
  // purely informative (see fetchWeekendExceptionPreview's own never-throw
  // contract), same as the annual/special previews above: a weekend
  // exception has no capacity check at all, so this can never block or
  // interfere with submission. Fires off dateFrom alone (the picked
  // Saturday) rather than waiting on hasValidRange/dateTo, since
  // handleWeekendSaturdayChange already derives dateTo from it in the same
  // update.
  useEffect(() => {
    if (!isWeekendException || !dateFrom) { setWeekendPreview(null); return }
    let cancelled = false
    fetchWeekendExceptionPreview({ saturday: dateFrom }).then(result => {
      if (!cancelled) setWeekendPreview(result)
    })
    return () => { cancelled = true }
  }, [isWeekendException, dateFrom])

  function handleWeekendSaturdayChange(value) {
    setDateFrom(value)
    if (!value) { setDateTo(''); return }
    const [y, m, d] = value.split('-').map(Number)
    const sunday = new Date(y, m - 1, d + 1)
    const sy = sunday.getFullYear()
    const sm = String(sunday.getMonth() + 1).padStart(2, '0')
    const sd = String(sunday.getDate()).padStart(2, '0')
    setDateTo(`${sy}-${sm}-${sd}`)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setMsg(null)
    setSubmitting(true)
    try {
      await submitLeaveRequest({
        profileId: profile.id,
        isAdmin,
        leaveType,
        dateFrom,
        dateTo,
        annualLeaveDays: isAnnual ? Number(annualLeaveDays) : null,
        notes,
      })
      setMsg({
        type: 'success',
        text: isAnnual
          ? `Leave request submitted — ${totalDays} total day${totalDays === 1 ? '' : 's'} (${annualLeaveDays} annual leave) — pending admin approval.`
          : 'Leave request submitted — pending admin approval.',
      })
      setDateFrom('')
      setDateTo('')
      setAnnualLeaveDays('')
      setNotes('')
      onSubmitted?.()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-5">
      <div>
        <label className="label-text">Leave type</label>
        <SelectMenu
          value={leaveType}
          onChange={v => { setLeaveType(v); setDateFrom(''); setDateTo(''); setAnnualLeaveDays('') }}
          options={LEAVE_TYPE_OPTIONS}
        />
      </div>

      {isWeekendException ? (
        <div>
          <DateFieldButton
            id="leave-date-saturday"
            label="Saturday"
            required
            value={dateFrom}
            onChange={handleWeekendSaturdayChange}
          />
          <p className="mt-1 text-xs text-ink-muted">{WEEKEND_EXCEPTION_HINT}</p>
        </div>
      ) : (
        <div className="flex gap-3">
          <DateFieldButton id="leave-date-from" label="From" required value={dateFrom} onChange={setDateFrom} />
          <DateFieldButton id="leave-date-to" label="To" required min={dateFrom || undefined} value={dateTo} onChange={setDateTo} />
        </div>
      )}

      {isWeekendException && dateFrom && (
        <div className="flex items-start gap-2 rounded-lg bg-flagAmber-bg p-3 text-xs text-flagAmber">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <div className="space-y-1">
            <p>
              Approving this pulls the doctor out of the strict day/night alternation pattern for future weekends —
              it doesn&rsquo;t automatically create a make-up shift elsewhere, so admin will need to compensate manually.
            </p>
            {weekendPreview && (
              <p>This weekend is currently {weekendPreview.filledGroups} of {weekendPreview.totalGroups} groups planned.</p>
            )}
          </div>
        </div>
      )}

      {isAnnual && hasValidRange && resolvedColumnDef && (
        <div>
          <label className="label-text">Checking capacity for</label>
          <SelectMenu
            value={previewColumnKey}
            onChange={v => setColumnOverride(v === resolvedColumnKey ? null : v)}
            options={LEAVE_CAPACITY_COLUMNS.map(c => ({ value: c.key, label: c.label }))}
          />
          {isColumnOverridden && (
            <p className="mt-1 text-xs text-ink-muted">
              Your own category resolves to {resolvedColumnDef.label} for these dates — this previews {LEAVE_CAPACITY_COLUMNS.find(c => c.key === columnOverride)?.label}&rsquo;s room only.
              Submitting still checks against your real category.
            </p>
          )}
        </div>
      )}

      {isAnnual && hasValidRange && (
        annualPreviewLoading ? (
          <p className="text-xs text-ink-muted">Checking availability…</p>
        ) : annualPreview && (
          <LeaveCapacityBanner
            mySlots={{ taken: annualPreview.taken, max: annualPreview.max }}
            columnLabel={annualPreview.columnLabel}
          />
        )
      )}

      {noRotationAssigned && (
        <p className="text-xs text-ink-muted">
          No EC/OT rotation is assigned to you yet for this date — showing the default pool until an admin sets one.
        </p>
      )}

      {boundaryNote && (
        <div className="flex items-start gap-2 rounded-lg bg-flagAmber-bg p-3 text-xs text-flagAmber">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p>{boundaryNote}</p>
        </div>
      )}

      {isSpecial && hasValidRange && specialPressure?.overSoftCap && (
        <div className="flex items-start gap-2 rounded-lg bg-flagAmber-bg p-3 text-xs text-flagAmber">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p>
            {specialPressure.count} doctor{specialPressure.count === 1 ? '' : 's'} already {specialPressure.count === 1 ? 'has' : 'have'} special
            leave requests over this period — above the informal guideline of {specialPressure.softCap}, but you can still submit; admin will review.
          </p>
        </div>
      )}

      {isAnnual && (
        <div>
          <label htmlFor="leave-annual-days" className="label-text">How many days will be taken as annual leave?</label>
          <input
            id="leave-annual-days"
            type="number"
            min="1"
            step="1"
            max={totalDays || undefined}
            required
            value={annualLeaveDays}
            onChange={e => setAnnualLeaveDays(e.target.value)}
            className="input-field w-full"
          />
          <p className="mt-1 text-xs text-ink-muted">
            {totalDays
              ? `Total days requested: ${totalDays}. If this span includes a padding weekend that doesn't count as annual leave (see Rules), enter only the days that do.`
              : "Pick From/To first — if the span includes a padding weekend that doesn't count as annual leave (see Rules), enter only the days that do."}
          </p>
        </div>
      )}

      {leaveType === 'sick' && (
        <p className="text-xs text-ink-muted">
          Sick leave can be backdated within the admin-configured window. Older dates need an admin to log them.
        </p>
      )}

      <div>
        <label htmlFor="leave-notes" className="label-text">Motivations — see Rules for details</label>
        <textarea
          id="leave-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="input-field w-full"
          placeholder="Explain your reasoning for the admin reviewing this request…"
        />
      </div>

      {msg && (
        <p className={`text-sm ${msg.type === 'error' ? 'text-flagRed' : 'text-success'}`} role="status">
          {msg.text}
        </p>
      )}

      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  )
}
