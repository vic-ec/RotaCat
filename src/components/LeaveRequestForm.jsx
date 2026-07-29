import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import SelectMenu from './SelectMenu'
import { LEAVE_TYPE_OPTIONS, submitLeaveRequest } from '../lib/leaveRequests'

const WEEKEND_EXCEPTION_HINT = 'Pick the Saturday — the Sunday is added automatically. Must be a single weekend.'

export default function LeaveRequestForm({ onSubmitted }) {
  const { profile, isAdmin } = useAuth()
  const [leaveType, setLeaveType] = useState('annual')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'error' | 'success', text }

  const isWeekendException = leaveType === 'weekend_exception'

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
        notes,
      })
      setMsg({ type: 'success', text: 'Leave request submitted — pending admin approval.' })
      setDateFrom('')
      setDateTo('')
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
          onChange={v => { setLeaveType(v); setDateFrom(''); setDateTo('') }}
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
          <div>
            <label htmlFor="leave-date-from" className="label-text">From</label>
            <input
              id="leave-date-from"
              type="date"
              required
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div>
            <label htmlFor="leave-date-to" className="label-text">To</label>
            <input
              id="leave-date-to"
              type="date"
              required
              min={dateFrom || undefined}
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="input-field w-full"
            />
          </div>
        </div>
      )}

      {leaveType === 'sick' && (
        <p className="text-xs text-ink-muted">
          Sick leave can be backdated within the admin-configured window. Older dates need an admin to log them.
        </p>
      )}

      <div>
        <label htmlFor="leave-notes" className="label-text">Notes (optional)</label>
        <textarea
          id="leave-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="input-field w-full"
          placeholder="Any context for the admin reviewing this request…"
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
