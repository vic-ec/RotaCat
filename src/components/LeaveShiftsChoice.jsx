import { labelForShiftCode } from '../lib/shiftLabels'
import { shortDate } from '../lib/reviewLog'

// Inside "Cancel this leave?" on the roster: the shifts the doctor was taken
// off for this leave, and what happens to them now the leave goes —
// "Put <name> back" (the cover is removed) or "Leave them as they are"
// (the cover works them; e.g. Landes was sick, moved to a night instead,
// and Alli did her shift). Nothing is picked for the admin.
//
// `shifts` = [{ entry, shiftCode, cover, blocker }]; `value` 'undo' | 'keep' | ''.
export default function LeaveShiftsChoice({ doctorName, shifts, value, onChange }) {
  const blocked = shifts.some(s => s.blocker)
  const options = [
    { value: 'keep', label: 'Leave them as they are', hint: 'Whoever covers them works them' },
    {
      value: 'undo',
      label: `Put ${doctorName} back on ${shifts.length === 1 ? 'it' : 'them'}`,
      hint: blocked ? 'Not possible: see the shift marked above' : 'The cover is removed and any advert stopped',
      disabled: blocked,
    },
  ]
  return (
    <fieldset className="mt-4 rounded-lg border border-slate-line p-3" data-testid="leave-shifts-choice">
      <legend className="px-1 text-sm font-medium text-ink">
        This leave took {doctorName} off {shifts.length === 1 ? 'a shift' : `${shifts.length} shifts`}
      </legend>
      <ul className="mb-3 space-y-1 text-xs text-ink-light">
        {shifts.map(({ entry, shiftCode, cover, blocker }) => (
          <li key={entry.id}>
            {shortDate(entry.date)} · {labelForShiftCode(shiftCode)} — {cover || 'no cover'}
            {blocker && <span className="block text-flagRed">{blocker}</span>}
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        {options.map(o => (
          <label key={o.value} className={`flex min-h-[44px] items-start gap-2 text-sm md:min-h-0 ${o.disabled ? 'text-ink-muted' : 'text-ink'}`}>
            <input type="radio" name="leave-shifts" className="mt-1" value={o.value} disabled={o.disabled} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="flex flex-col">
              <span>{o.label}</span>
              <span className="text-xs text-ink-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
