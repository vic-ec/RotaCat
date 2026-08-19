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
// `bgDeep` (shift cards only, the bottom "time" panel) is one step more
// saturated than `bg`, within the same tone family — reuses accent.light/
// rose.light where those already exist; dateWeekend/flagRed each needed a
// new `deep` token added to tailwind.config.js since neither had an
// intermediate shade. This is what lets the two panels read as visually
// distinct without a divider line between them.
const TONE = {
  weekday: { bg: 'bg-accent-tint', bgDeep: 'bg-accent-light', label: 'text-accent-dark' },
  weekend: { bg: 'bg-dateWeekend-tint', bgDeep: 'bg-dateWeekend-deep', label: 'text-dateWeekend-ink' },
  publicHoliday: { bg: 'bg-rose-tint', bgDeep: 'bg-rose-light', label: 'text-rose-dark' },
  flagged: { bg: 'bg-flagRed-bg', bgDeep: 'bg-flagRed-deep', label: 'text-flagRed' },
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
//
// `night` (shift cards only) recolors just the bottom time panel to the
// deep `shiftNight` teal — a night shift is a property of the shift, not of
// the date, so it can't take over the date panel's weekday/weekend/PH tone
// without losing that signal. Callers pass shift_types.is_night_shift
// straight through; nothing here infers it from the code or start hour.
export default function DateCard({ date, startTime, endTime, publicHoliday, flagged, night = false, className = '' }) {
  const parsed = parseLocalDate(date)
  const dayAbbr = parsed.toLocaleDateString('en-GB', { weekday: 'short' })
  const dateNum = parsed.getDate()
  const monthAbbr = parsed.toLocaleDateString('en-GB', { month: 'short' })
  const isWeekend = [0, 6].includes(dayOfWeek(date))

  const toneKey = flagged ? 'flagged' : publicHoliday ? 'publicHoliday' : isWeekend ? 'weekend' : 'weekday'
  const tone = TONE[toneKey]
  const hasTime = Boolean(startTime && endTime)
  const holidayName = typeof publicHoliday === 'string' ? publicHoliday : 'Public holiday'

  // Shift cards (hasTime): two flush panels, no divider — date+month on
  // top (tone.bg), time on its own panel below (tone.bgDeep). Leave cards
  // (LeaveDateRange, never passes startTime/endTime) keep the original
  // single-panel three-row layout below untouched.
  if (hasTime) {
    return (
      <div className={`flex w-16 flex-shrink-0 flex-col overflow-hidden rounded-lg md:w-20 ${className}`}>
        <div className={`flex flex-col items-center gap-0.5 py-2 ${tone.bg}`}>
          <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${tone.label}`}>
            {publicHoliday && <Calendar className="h-3 w-3 flex-shrink-0" title={holidayName} />}
            {dayAbbr}
          </span>
          <span className="flex items-baseline gap-0.5">
            <span className="font-display text-2xl font-bold leading-none text-ink">{dateNum}</span>
            <span className="font-display text-sm font-bold leading-none text-ink">{monthAbbr}</span>
          </span>
        </div>
        <div className={`flex items-center justify-center py-1.5 ${night ? 'bg-shiftNight' : tone.bgDeep}`}>
          <span className={`text-[11px] font-semibold ${night ? 'text-shiftNight-ink' : 'text-ink-light'}`}>
            <span className="md:hidden">{hourOnly(startTime)}-{hourOnly(endTime)}</span>
            <span className="hidden md:inline">{hourMinute(startTime)} - {hourMinute(endTime)}</span>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex w-16 flex-shrink-0 flex-col items-center gap-0.5 rounded-lg py-2 md:w-20 ${tone.bg} ${className}`}>
      <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${tone.label}`}>
        {publicHoliday && <Calendar className="h-3 w-3 flex-shrink-0" title={holidayName} />}
        {dayAbbr}
      </span>
      <span className="font-display text-2xl font-bold leading-none text-ink">{dateNum}</span>
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${tone.label}`}>{monthAbbr}</span>
    </div>
  )
}

// One date, one row — day abbreviation, date number, month abbreviation, all
// inline on one baseline, plus the public-holiday calendar icon inline too
// when applicable. Same TONE map and icon-color-inheritance structure as
// DateCard's own plain (no start/end time) layout above — a layout change
// for contexts too dense for the full-height card, not a new color
// treatment.
export function DateCardOneLine({ date, publicHoliday, flagged, className = '' }) {
  const parsed = parseLocalDate(date)
  const dayAbbr = parsed.toLocaleDateString('en-GB', { weekday: 'short' })
  const dateNum = parsed.getDate()
  const monthAbbr = parsed.toLocaleDateString('en-GB', { month: 'short' })
  const isWeekend = [0, 6].includes(dayOfWeek(date))

  const toneKey = flagged ? 'flagged' : publicHoliday ? 'publicHoliday' : isWeekend ? 'weekend' : 'weekday'
  const tone = TONE[toneKey]
  const holidayName = typeof publicHoliday === 'string' ? publicHoliday : 'Public holiday'

  return (
    <div className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 ${tone.bg} ${className}`}>
      <span className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${tone.label}`}>
        {publicHoliday && <Calendar className="h-3 w-3 flex-shrink-0" title={holidayName} />}
        {dayAbbr}
      </span>
      <span className="text-sm font-bold leading-none text-ink">{dateNum}</span>
      <span className={`text-[11px] font-bold uppercase tracking-wide ${tone.label}`}>{monthAbbr}</span>
    </div>
  )
}

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' }

// A leave request's date range — two DateCards (no start/end time, leave
// has none) bridged by an arrow, with a days-count label alongside.
// `publicHolidayFrom`/`publicHolidayTo` and `flaggedFrom`/`flaggedTo` pass
// straight through to each card, since a public holiday or conflict can
// land on the start date, the end date, both, or neither independently.
// `compact` (default false, so every existing caller is unaffected) swaps
// in the one-row DateCardOneLine for contexts with many rows at once (e.g.
// the admin dashboard's "On leave now"/"On leave next" lists) — same
// arrow/day-count layout either way.
//
// `label` (e.g. the leave type, or a person's name) and the shared status
// Tag render together in a header row above the dates, `label` on the left
// and the Tag on the right — the leave type and its status read as one
// fact ("Annual leave — Pending"), not a type up top with a status
// dangling off the day-count underneath the dates. Either can be omitted;
// the row itself only renders when at least one of them is passed.
export function LeaveDateRange({
  dateFrom, dateTo, status, statusLabel, label,
  publicHolidayFrom, publicHolidayTo, flaggedFrom, flaggedTo, compact = false,
}) {
  const dayCount = datesInRange(dateFrom, dateTo).length
  const Card = compact ? DateCardOneLine : DateCard
  return (
    <div>
      {(label || status) && (
        <div className="mb-1 flex items-center justify-between gap-2">
          {label && <p className="text-xs font-medium text-ink-muted">{label}</p>}
          {status && (
            <Tag variant="status" tone={STATUS_TONE[status] || 'neutral'}>
              {statusLabel || (status.charAt(0).toUpperCase() + status.slice(1))}
            </Tag>
          )}
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <Card date={dateFrom} publicHoliday={publicHolidayFrom} flagged={flaggedFrom} />
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-ink-muted" />
        <Card date={dateTo} publicHoliday={publicHolidayTo} flagged={flaggedTo} />
        <div className="ml-1 min-w-0">
          <p className="text-sm text-ink">{dayCount} day{dayCount === 1 ? '' : 's'}</p>
        </div>
      </div>
    </div>
  )
}
