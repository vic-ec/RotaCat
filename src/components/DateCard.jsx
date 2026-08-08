import { Calendar, ArrowRight } from 'lucide-react'
import { parseLocalDate, dayOfWeek, datesInRange } from '../lib/dateRange'
import Tag from './Tag'

// Tone precedence: an actual roster conflict always wins (rarest, most
// urgent), then a public holiday (can land on either a weekday or a
// weekend, so it has to be able to override either), then the plain
// weekday/weekend split. Each tone pairs a tinted background with text
// verified >=4.5:1 against that specific background — see the contrast
// check run for this component; every DEFAULT-shade accent/rose color
// failed on its own tint (~3.1-4.4:1) and needed the one-shade-darker
// variant to clear 4.5:1, so the label/icon colors below are deliberately
// the `dark` shades, not the plain brand colors used elsewhere.
// `divider` (shift cards only, between the month row and the time row)
// reuses each tone's own already-contrast-verified `label` color at low
// opacity, rather than one generic grey — a faint line that still reads
// as "this tone's own divider" instead of a neutral rule dropped on top.
const TONE = {
  weekday: { bg: 'bg-accent-tint', label: 'text-accent-dark', divider: 'bg-accent-dark/20' },
  weekend: { bg: 'bg-dateWeekend-tint', label: 'text-dateWeekend-ink', divider: 'bg-dateWeekend-ink/20' },
  publicHoliday: { bg: 'bg-rose-tint', label: 'text-rose-dark', divider: 'bg-rose-dark/20' },
  flagged: { bg: 'bg-flagRed-bg', label: 'text-flagRed', divider: 'bg-flagRed/20' },
}

function hourOnly(time) {
  if (!time) return ''
  return String(Number(time.slice(0, 2)))
}
function hourMinute(time) {
  if (!time) return ''
  return time.slice(0, 5)
}

// One date's card — day abbreviation, a large bold date number (the
// visual anchor), and an optional start-end time. Desktop shows the full
// "13:00 - 23:00" range; mobile shows hour-only "13-23" (every shift in
// the scheduling rules starts on the hour, so minutes are always :00) in
// a narrower card, since there's less to show.
//
// `publicHoliday`/`flagged` are independent overrides on top of the plain
// weekday/weekend tone (see TONE's own comment for precedence) — pass
// `publicHoliday` as the holiday's name (or `true` if the name isn't
// available) to also show the small calendar icon next to the day label.
export default function DateCard({ date, startTime, endTime, publicHoliday, flagged, className = '' }) {
  const parsed = parseLocalDate(date)
  const dayAbbr = parsed.toLocaleDateString('en-GB', { weekday: 'short' })
  const dateNum = parsed.getDate()
  const monthAbbr = parsed.toLocaleDateString('en-GB', { month: 'short' })
  const isWeekend = [0, 6].includes(dayOfWeek(date))

  const toneKey = flagged ? 'flagged' : publicHoliday ? 'publicHoliday' : isWeekend ? 'weekend' : 'weekday'
  const tone = TONE[toneKey]
  const hasTime = Boolean(startTime && endTime)
  const holidayName = typeof publicHoliday === 'string' ? publicHoliday : 'Public holiday'

  return (
    <div className={`flex w-16 flex-shrink-0 flex-col items-center gap-0.5 rounded-lg py-2 md:w-20 ${tone.bg} ${className}`}>
      <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${tone.label}`}>
        {publicHoliday && <Calendar className="h-3 w-3 flex-shrink-0" title={holidayName} />}
        {dayAbbr}
      </span>
      <span className="font-display text-2xl font-bold leading-none text-ink">{dateNum}</span>
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${tone.label}`}>{monthAbbr}</span>
      {hasTime && (
        <>
          <div className={`h-px w-8 ${tone.divider}`} />
          <span className="text-[11px] font-semibold text-ink-light">
            <span className="md:hidden">{hourOnly(startTime)}-{hourOnly(endTime)}</span>
            <span className="hidden md:inline">{hourMinute(startTime)} - {hourMinute(endTime)}</span>
          </span>
        </>
      )}
    </div>
  )
}

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' }

// A leave request's date range — two DateCards (no start/end time, leave
// has none) bridged by an arrow, with a days-count label and the shared
// status Tag (Phase 1) alongside. `publicHolidayFrom`/`publicHolidayTo`
// and `flaggedFrom`/`flaggedTo` pass straight through to each card, since
// a public holiday or conflict can land on the start date, the end date,
// both, or neither independently.
export function LeaveDateRange({
  dateFrom, dateTo, status, statusLabel,
  publicHolidayFrom, publicHolidayTo, flaggedFrom, flaggedTo,
}) {
  const dayCount = datesInRange(dateFrom, dateTo).length
  return (
    <div className="flex items-center gap-2.5">
      <DateCard date={dateFrom} publicHoliday={publicHolidayFrom} flagged={flaggedFrom} />
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-ink-muted" />
      <DateCard date={dateTo} publicHoliday={publicHolidayTo} flagged={flaggedTo} />
      <div className="ml-1 min-w-0">
        <p className="text-sm text-ink">{dayCount} day{dayCount === 1 ? '' : 's'}</p>
        {status && (
          <Tag variant="status" tone={STATUS_TONE[status] || 'neutral'} className="mt-1">
            {statusLabel || (status.charAt(0).toUpperCase() + status.slice(1))}
          </Tag>
        )}
      </div>
    </div>
  )
}
