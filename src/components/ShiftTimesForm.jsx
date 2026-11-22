import { useState } from 'react'
import { hourLabel, validateTimes } from '../lib/shiftTimes'

// "Change times" for the doctor or locum on a shift: an actual start and
// end when they differ from the shift's standard ones. Both cleared puts
// the shift back on standard times. Renders inside the shift menu's body.
export default function ShiftTimesForm({ entry, shiftType, holder, onSave, onBack }) {
  const toInput = t => (t ? t.slice(0, 5) : '')
  const [start, setStart] = useState(toInput(entry.start_time_override))
  const [end, setEnd] = useState(toInput(entry.end_time_override))
  const [error, setError] = useState('')
  const standard = shiftType?.start_time && shiftType?.end_time ? `${hourLabel(shiftType.start_time)}–${hourLabel(shiftType.end_time)}` : null

  function submit(e) {
    e.preventDefault()
    const problem = validateTimes(start, end)
    if (problem) { setError(problem); return }
    onSave({ start, end })
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-3" data-testid="shift-times-form">
      <p className="text-sm text-ink">
        When did {holder} actually work this shift?
        {standard && <span className="block text-xs text-ink-muted">Standard times are {standard}. Leave both empty to return to them.</span>}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label-text">Start</span>
          <input id="shift-times-start" type="time" step="900" value={start} onChange={e => setStart(e.target.value)} className="input-field w-full" />
        </label>
        <label className="block">
          <span className="label-text">End</span>
          <input id="shift-times-end" type="time" step="900" value={end} onChange={e => setEnd(e.target.value)} className="input-field w-full" />
        </label>
      </div>
      <p className="text-xs text-ink-muted">An end before the start means the next morning. Hours pages count the adjusted length; the shift stays in its column.</p>
      {error && <p role="alert" className="text-xs text-flagRed">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="btn-secondary min-h-[44px] flex-1 text-sm md:min-h-0">Back</button>
        <button type="submit" className="btn-primary min-h-[44px] flex-1 text-sm md:min-h-0">Save times</button>
      </div>
    </form>
  )
}
