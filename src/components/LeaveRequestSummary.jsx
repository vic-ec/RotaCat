import ProfileAvatar from './ProfileAvatar'
import Tag from './Tag'
import SectionLabel from './SectionLabel'
import { LeaveDateRange } from './DateCard'
import { naturalLeavePeriodLabel } from '../lib/leaveRequests'
import { parseLocalDate } from '../lib/dateRange'

// Identity + requested-period summary for the leave-request review drawer —
// the top of the content hierarchy, per the redesign's "who is requesting,
// what leave and dates" priority. Leads with a natural-language sentence
// ("3–11 October 2026 · 9 calendar days") rather than the compact start/end
// DateCards; those only earn their place back when the range actually
// crosses a month or year boundary, where the plain sentence alone reads
// ambiguously (see naturalLeavePeriodLabel's own comment).
export default function LeaveRequestSummary({
  request, fullName, categoryLabel, totalDays, annualLeaveDays,
  publicHolidayFrom, publicHolidayTo,
}) {
  const from = parseLocalDate(request.date_from)
  const to = parseLocalDate(request.date_to)
  const crossesMonth = from.getMonth() !== to.getMonth() || from.getFullYear() !== to.getFullYear()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ProfileAvatar profile={{ id: request.profile_id, ...request.profiles }} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{fullName}</p>
          {categoryLabel && <Tag variant="role" className="mt-1">{categoryLabel}</Tag>}
        </div>
      </div>

      <div>
        <SectionLabel>Requested period</SectionLabel>
        <p className="text-sm text-ink">
          {naturalLeavePeriodLabel(request.date_from, request.date_to)} · {totalDays} calendar day{totalDays === 1 ? '' : 's'}
        </p>
        {annualLeaveDays != null && (
          <p className="mt-0.5 text-xs text-ink-muted">{annualLeaveDays} annual-leave day{annualLeaveDays === 1 ? '' : 's'}</p>
        )}
        {crossesMonth && (
          <div className="mt-3">
            <LeaveDateRange
              dateFrom={request.date_from}
              dateTo={request.date_to}
              publicHolidayFrom={publicHolidayFrom}
              publicHolidayTo={publicHolidayTo}
            />
          </div>
        )}
      </div>
    </div>
  )
}
