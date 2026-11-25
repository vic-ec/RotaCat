import { useMemo, useState } from 'react'
import DateFieldButton from './DateFieldButton'
import { swapProblem } from '../lib/rosterEdits'
import { labelForShiftCode } from '../lib/shiftLabels'
import { shortDate } from '../lib/reviewLog'

// "Swap with another doctor" inside the shift menu: pick the shift the
// doctor exchanges theirs with — on the same day by default, or any other
// day of the month. Shifts that can't be swapped stay in the list, greyed,
// with the reason (another shift that day, leave), so the admin sees why
// rather than wondering where a name went.
const SHIFT_ORDER = ['08', '12', '13', '15', '20', '22']
const orderOf = code => {
  const i = SHIFT_ORDER.indexOf(String(code || '').split('_')[1])
  return i < 0 ? 99 : i
}

export default function SwapPicker({ entry, shiftCode, entries, shiftCodeOf, nameOf, isOnLeave, monthStart, monthEnd, onConfirm, onBack }) {
  const [date, setDate] = useState(entry.date)
  const [chosenId, setChosenId] = useState('')
  const holder = nameOf(entry.profile_id) || 'This doctor'

  const options = useMemo(() => entries
    .filter(e => e.date === date && e.id !== entry.id && e.profile_id && !e.is_locum)
    .map(e => ({ e, code: shiftCodeOf(e), problem: swapProblem({ a: entry, b: e, entries, nameOf, isOnLeave }) }))
    .sort((x, y) => orderOf(x.code) - orderOf(y.code) || (nameOf(x.e.profile_id) || '').localeCompare(nameOf(y.e.profile_id) || '')),
  [entries, date, entry, shiftCodeOf, nameOf, isOnLeave])
  const chosen = options.find(o => o.e.id === chosenId && !o.problem)

  return (
    <div className="space-y-3 p-3" data-testid="swap-picker">
      <p className="text-sm text-ink">
        Swap {holder}&apos;s {shortDate(entry.date)} {labelForShiftCode(shiftCode)} with:
      </p>
      <DateFieldButton
        id="swap-date"
        label="Day"
        fullWidth
        min={monthStart}
        max={monthEnd}
        value={date}
        onChange={v => { if (v) { setDate(v); setChosenId('') } }}
      />
      <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-slate-line" role="radiogroup" aria-label="Shift to swap with">
        {options.length === 0 && <p className="p-3 text-sm text-ink-muted">No other doctors on {shortDate(date)}.</p>}
        {options.map(({ e, code, problem }) => (
          <label
            key={e.id}
            className={`flex min-h-[44px] items-start gap-2 border-b border-slate-line px-3 py-2 text-sm last:border-b-0 md:min-h-0 ${problem ? 'text-ink-muted' : 'cursor-pointer text-ink hover:bg-canvas-sunken'}`}
          >
            <input
              type="radio"
              name="swap-with"
              className="mt-1"
              value={e.id}
              disabled={Boolean(problem)}
              checked={chosenId === e.id}
              onChange={() => setChosenId(e.id)}
            />
            <span className="min-w-0">
              <span className="block font-medium">{nameOf(e.profile_id) || 'Doctor'}</span>
              <span className="block text-xs text-ink-muted">{labelForShiftCode(code)}{problem ? ` · ${problem}` : ''}</span>
            </span>
          </label>
        ))}
      </div>
      {chosen && (
        <p className="text-xs text-ink-light" data-testid="swap-summary">
          {nameOf(chosen.e.profile_id)} works {shortDate(entry.date)} {labelForShiftCode(shiftCode)}; {holder} works {shortDate(chosen.e.date)} {labelForShiftCode(chosen.code)}.
        </p>
      )}
      <div className="flex flex-nowrap gap-2">
        <button type="button" onClick={onBack} className="btn-secondary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Back</button>
        <button type="button" disabled={!chosen} onClick={() => onConfirm(chosen.e, chosen.code)} className="btn-primary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Swap shifts</button>
      </div>
    </div>
  )
}
