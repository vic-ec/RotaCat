import { useEffect, useMemo, useState } from 'react'
import { formatWeekdayDateShort, todayStr } from '../lib/dateRange'
import { shiftStartLabel } from '../lib/myYear'
import {
  minutesLate, lateByLabel, validateLateArrival, shiftHasStarted, MAX_MINUTES_LATE,
  fetchShiftOptionsForDate, fetchShiftOptionsForProfile, fetchLateArrivalForEntry, saveLateArrival, deleteLateArrival,
} from '../lib/lateArrivals'
import Modal from './Modal'
import SelectMenu from './SelectMenu'

// The one late-arrival form, used from every entry point. Whatever the
// caller already knows is filled in and read-only:
//   option     a rostered shift (from the roster): person, date and shift
//   profileId  one person (from their Attendance tab): pick one of the
//              shifts they were rostered for in `year`
//   record     an existing record to correct or delete
//   neither    (from the Dashboard): today's date, then anyone rostered
//              on the chosen date
// A shift that already has a record opens that record for editing — there
// is one per shift.
export default function LateArrivalModal({ option: fixedOption = null, profileId = null, personName = '', year, record: givenRecord = null, onClose, onSaved }) {
  const today = todayStr()
  const mode = givenRecord ? 'record' : fixedOption ? 'shift' : profileId ? 'person' : 'date'

  const recordOption = useMemo(() => givenRecord && {
    entryId: givenRecord.roster_entry_id,
    date: givenRecord.entry_date,
    shiftCode: givenRecord.shift_code,
    shiftStart: String(givenRecord.shift_start).slice(0, 5),
    name: personName || givenRecord.locum_name || '',
    label: personName || givenRecord.locum_name || '',
  }, [givenRecord, personName])

  const [date, setDate] = useState(today)
  const [options, setOptions] = useState(null) // null while loading
  const [entryId, setEntryId] = useState(null)
  const [record, setRecord] = useState(givenRecord)
  const [arrivedAt, setArrivedAt] = useState(givenRecord ? String(givenRecord.arrived_at).slice(0, 5) : '')
  const [reason, setReason] = useState(givenRecord?.reason_given || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The people (or, for one person, the shifts) to choose from.
  useEffect(() => {
    if (mode !== 'date' && mode !== 'person') return undefined
    let cancelled = false
    setOptions(null)
    setEntryId(null)
    const read = mode === 'date' ? fetchShiftOptionsForDate(date) : fetchShiftOptionsForProfile(profileId, year)
    read
      .then(rows => { if (!cancelled) setOptions(rows.filter(o => shiftHasStarted(o.date, o.shiftStart))) })
      .catch(err => { if (!cancelled) { setOptions([]); setError(err.message) } })
    return () => { cancelled = true }
  }, [mode, date, profileId, year])

  const option = recordOption || fixedOption || options?.find(o => o.entryId === entryId) || null

  // One record per shift: choosing a shift that has one opens it.
  useEffect(() => {
    if (mode === 'record' || !option?.entryId) return undefined
    let cancelled = false
    fetchLateArrivalForEntry(option.entryId)
      .then(existing => {
        if (cancelled) return
        setRecord(existing)
        setArrivedAt(existing ? String(existing.arrived_at).slice(0, 5) : '')
        setReason(existing?.reason_given || '')
      })
      .catch(() => { if (!cancelled) setRecord(null) })
    return () => { cancelled = true }
  }, [mode, option?.entryId])

  const minutes = option ? minutesLate(option.shiftStart, arrivedAt) : null
  const lateText = minutes == null ? '—' : minutes > MAX_MINUTES_LATE ? 'Check the time' : lateByLabel(minutes)

  async function save(e) {
    e.preventDefault()
    const problem = validateLateArrival({ option, arrivedAt })
    if (problem) { setError(problem); return }
    setBusy(true)
    setError('')
    try {
      await saveLateArrival({ id: record?.id ?? null, option, arrivedAt, reason })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await deleteLateArrival(record.id)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const readOnly = 'rounded-lg bg-canvas-sunken px-3 py-2 text-sm text-ink'
  const selectOptions = (options || []).map(o => ({
    value: o.entryId,
    label: mode === 'person' ? `${formatWeekdayDateShort(o.date)} · ${shiftStartLabel(o.shiftStart)}` : o.label,
  }))

  return (
    <Modal title={record ? 'Late arrival' : 'Log late arrival'} onClose={onClose} centered>
      <form onSubmit={save} className="space-y-4" data-testid="late-arrival-form">
        {mode === 'date' && (
          <div>
            <label htmlFor="late-date" className="label-text">Date</label>
            <input id="late-date" type="date" value={date} max={today} onChange={e => { if (e.target.value) setDate(e.target.value) }} className="input-field" />
          </div>
        )}
        {mode !== 'date' && mode !== 'person' && (
          <div>
            <p className="label-text">Date</p>
            <p className={readOnly}>{formatWeekdayDateShort(option.date)}</p>
          </div>
        )}

        {mode === 'date' && (
          <div>
            <label htmlFor="late-who" className="label-text">Who</label>
            {options && options.length === 0 ? (
              <p className={`${readOnly} text-ink-muted`}>Nobody is rostered on a published roster for this date{date === today ? ' yet today' : ''}.</p>
            ) : (
              <SelectMenu id="late-who" value={entryId} onChange={setEntryId} options={selectOptions} placeholder={options ? 'Choose who arrived late…' : 'Loading…'} disabled={!options} />
            )}
          </div>
        )}
        {mode === 'person' && (
          <>
            <div>
              <p className="label-text">Who</p>
              <p className={readOnly}>{personName}</p>
            </div>
            <div>
              <label htmlFor="late-shift" className="label-text">Date</label>
              {options && options.length === 0 ? (
                <p className={`${readOnly} text-ink-muted`}>No rostered shifts on a published roster in {year}.</p>
              ) : (
                <SelectMenu id="late-shift" value={entryId} onChange={setEntryId} options={selectOptions} placeholder={options ? 'Choose a date they were rostered…' : 'Loading…'} disabled={!options} />
              )}
            </div>
          </>
        )}
        {(mode === 'shift' || mode === 'record') && (
          <div>
            <p className="label-text">Who</p>
            <p className={readOnly}>{option.label || option.name}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="label-text">Shift start</p>
            <p className={readOnly} data-testid="late-shift-start">{option ? shiftStartLabel(option.shiftStart) : '—'}</p>
          </div>
          <div>
            <label htmlFor="late-arrived" className="label-text">Arrived at</label>
            <input id="late-arrived" type="time" value={arrivedAt} onChange={e => { setArrivedAt(e.target.value); setError('') }} className="input-field" required />
          </div>
          <div>
            <p className="label-text">Late by</p>
            <p className={readOnly} data-testid="late-by" aria-live="polite">{lateText}</p>
          </div>
        </div>

        <div>
          <label htmlFor="late-reason" className="label-text">Reason given (optional)</label>
          <textarea id="late-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Their own reason, in their words" className="input-field" />
        </div>

        <p className="text-xs text-ink-muted">
          The person can see this record, including the reason. Your name is recorded but not shown to them.
        </p>
        {error && <p className="text-sm text-flagRed" role="alert">{error}</p>}

        {confirmDelete ? (
          <div className="space-y-3 rounded-lg border border-slate-line p-3">
            <p className="text-sm text-ink">Delete this late arrival record? It is removed from their record and from the roster.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-secondary min-h-[44px] flex-1 md:min-h-0">Keep it</button>
              <button type="button" onClick={remove} disabled={busy} className="btn-danger min-h-[44px] flex-1 md:min-h-0">Delete record</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {record && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="btn-danger-outline min-h-[44px] md:min-h-0">Delete record</button>
            )}
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="btn-secondary min-h-[44px] md:min-h-0">Cancel</button>
            <button type="submit" disabled={busy || !option} className="btn-primary min-h-[44px] md:min-h-0">Save</button>
          </div>
        )}
      </form>
    </Modal>
  )
}
