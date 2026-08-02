import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import SelectMenu from './SelectMenu'
import { datesInRange } from '../lib/dateRange'
import { LEAVE_TYPE_OPTIONS, submitLeaveRequest } from '../lib/leaveRequests'

const WEEKEND_EXCEPTION_HINT = 'Pick the Saturday — the Sunday is added automatically. Must be a single weekend.'

function CalendarIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

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

  const isWeekendException = leaveType === 'weekend_exception'
  const isAnnual = leaveType === 'annual'
  const totalDays = dateFrom && dateTo && dateFrom <= dateTo ? datesInRange(dateFrom, dateTo).length : null

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
          <label htmlFor="leave-date-saturday" className="label-text">Saturday</label>
          <input
            id="leave-date-saturday"
            type="date"
            required
            value={dateFrom}
            onChange={e => handleWeekendSaturdayChange(e.target.value)}
            className="input-field w-full"
          />
          <p className="mt-1 text-xs text-ink-muted">{WEEKEND_EXCEPTION_HINT}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* min-w-0 on each grid item: a native date input's intrinsic
              content width doesn't shrink on its own inside a grid track,
              which was pushing the two fields wide enough to overlap on
              narrow mobile screens. */}
          <div className="min-w-0">
            <label htmlFor="leave-date-from" className="label-text flex items-center gap-1">
              <CalendarIcon className="h-3.5 w-3.5" /> From
            </label>
            <input
              id="leave-date-from"
              type="date"
              required
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="input-field w-full min-w-0"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="leave-date-to" className="label-text flex items-center gap-1">
              <CalendarIcon className="h-3.5 w-3.5" /> To
            </label>
            <input
              id="leave-date-to"
              type="date"
              required
              min={dateFrom || undefined}
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="input-field w-full min-w-0"
            />
          </div>
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
