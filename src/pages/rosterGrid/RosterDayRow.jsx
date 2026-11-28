import { Fragment } from 'react'
import { TriangleAlert } from 'lucide-react'
import PublicHolidayBadge from '../../components/PublicHolidayBadge'
import { LeaveTypePill } from '../../components/LeaveTypeIcon'
import { awaySummary } from '../../lib/rosterLeaveColumn'
import { editHint } from '../../lib/rosterEditHint'
import { getShiftsForDay, isUnfilled, DAY_NAMES } from './rosterGridHelpers'
import DoctorChip from './DoctorChip'
import ConsultantCell from './ConsultantCell'

// One day of the Rows grid: the gap row above it and the day's own row
// (date rail, consultant, shift cells, and the Leave / Course columns).
// Moved out of RosterGridPage as it was.
export default function RosterDayRow({
  day, dayIdx, visibleDays, markedDate, awayByDate, id, entryMap, consultantProfiles, displayNames, canEdit,
  refreshEntries, wideGrid, leaveCols, showOnly, handleDrop, profileMap, chipFilterActive, matchesFilter,
  glowEntryId, absenceFor, isAdmin, setCancelLeaveFor, latestChanges, nameById, vacatedLeaveType,
  handleCellClick, lateOptionFor, setLatePrompt, lateByEntryId, handleDragStart, rosterMonth,
}) {
  const shifts = getShiftsForDay(day.dayType)
  const isWeekend = day.dayType === 'weekend' || day.dayType === 'PH' || day.dayType === 'PH_weekday'
  const todayStr = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
  })()
  const isToday = day.dateStr === todayStr
  // Show column header when day type changes (first row of a
  // new block of weekday/weekend/PH days)
  const prevDay = visibleDays[dayIdx - 1]
  const showHeader = !prevDay || prevDay.dayType !== day.dayType
  // Parse date parts directly to avoid UTC timezone shift
  const [y, m, d] = day.dateStr.split('-').map(Number)
  const localDate = new Date(y, m - 1, d)
  const isMonday = localDate.getDay() === 1
  // Three day types, three fills: weekdays on white, weekends
  // on the accent tint, public holidays (either kind) on
  // rose-light. The date rail and the shift-time header band
  // share one tone per type, a step darker than the row body
  // (neutral day-rail / accent-light / rose-night), so each
  // day has a left anchor and a header that read as chrome.
  const isPH = day.dayType === 'PH' || day.dayType === 'PH_weekday'
  const chromeBg = isPH
    ? 'bg-rose-night text-rose-dark'
    : isWeekend ? 'bg-accent-light text-accent-dark' : 'bg-day-rail text-ink'
  const rowBg = isPH ? 'bg-rose-light' : isWeekend ? 'bg-accent-tint' : 'bg-canvas-raised'
  const dateInk = isPH ? 'text-rose-dark' : isWeekend ? 'text-accent-dark' : 'text-ink'
  // The block's own 1px border; today's is 2px in the accent, and
  // its date rail is filled solid accent with "Today" under the
  // date, so the day stands out from its neighbours at a glance
  // (a 1px accent line alone read as just another row).
  // A day opened from My year (not today) gets the same 2px
  // frame and solid rail in dark grey instead.
  const isMarked = !isToday && day.dateStr === markedDate
  const away = awayByDate[day.dateStr] || { leave: [], course: [] }
  const awayCount = away.leave.length + away.course.length
  const strong = isToday || isMarked
  const line = isToday ? 'border-accent' : isMarked ? 'border-ink-light' : 'border-slate-line'
  const cellFrame = strong ? `border-y-2 ${line}` : `border-y ${line}`
  const headerBand = `whitespace-nowrap border-b ${line} px-1 py-1 text-center text-[0.917em] font-semibold ${chromeBg}`

  const consultantCell = (
    <ConsultantCell
      date={day.dateStr}
      rosterMonthId={id}
      existing={entryMap[`${day.dateStr}|CONSULTANT`]?.[0]}
      consultantProfiles={consultantProfiles}
      displayNames={displayNames}
      isAdmin={canEdit}
      onRefresh={refreshEntries}
    />
  )

  return (
    <Fragment key={day.dateStr}>
      {dayIdx > 0 && (
        <tr aria-hidden="true" data-testid="day-gap" className={isMonday ? 'h-[14px]' : 'h-[6px]'}>
          <td colSpan={(wideGrid ? 6 : 5) + (leaveCols ? 3 : 0)} className="p-0" />
        </tr>
      )}
      <tr data-testid="day-row" data-date={day.dateStr} data-marked={isMarked || undefined} className={rowBg}>
      {/* Date rail: pinned left on a phone with an opaque fill so
          the shift columns scroll beneath it. */}
      <td
        className={`${cellFrame} ${isToday ? 'border-l-2 border-r bg-accent text-on-fill' : isMarked ? 'border-l-2 border-r bg-ink-light text-canvas' : `border-l border-r ${chromeBg} ${dateInk}`} rounded-l-md px-2 py-1.5 align-top font-medium ${wideGrid ? '' : 'sticky left-0 z-10'}`}
        aria-current={isToday ? 'date' : undefined}
      >
        <span className={`block text-[0.834em] ${isToday ? 'text-on-fill/80' : isMarked ? 'text-canvas/80' : 'text-ink-muted'}`}>{DAY_NAMES[localDate.getDay()]}</span>
        <span>{d}</span>
        {isToday && <span data-testid="today-tag" className="mt-0.5 block text-[0.75em] font-bold uppercase tracking-wide">Today</span>}
        {!leaveCols && awayCount > 0 && (
          // Who: on a tap or hover (the app's hint), since the
          // Leave and Course columns don't fit here.
          <span
            data-testid="rail-away"
            title={awaySummary(away)}
            className={`mt-0.5 block cursor-help text-[0.75em] font-semibold ${isToday ? 'text-on-fill/80' : isMarked ? 'text-canvas/80' : 'text-ink-muted'}`}
          >
            {awayCount} away
          </span>
        )}
        {day.phName && (
          <span className="mt-0.5 block">
            <PublicHolidayBadge name={day.phName} />
          </span>
        )}
        {!wideGrid && (
          <div data-testid="rail-consultant" className={`mt-1 overflow-hidden text-[0.834em] ${isToday ? 'text-on-fill/80' : isMarked ? 'text-canvas/80' : 'text-ink-muted'}`}>
            {consultantCell}
          </div>
        )}
      </td>

      {/* Consultant column (md and up) */}
      {wideGrid && (
        <td data-testid="consultant-cell" className={`${cellFrame} border-r align-top p-0`}>
          {showHeader && <div className={headerBand}>Consultant</div>}
          <div className="px-1.5 py-1">{consultantCell}</div>
        </td>
      )}

      {/* Shift columns */}
      {shifts.map(({ code, label }, colIdx) => {
        const cellEntries = entryMap[`${day.dateStr}|${code}`] || []
        const flags = cellEntries.filter(isUnfilled)
        const hasShortfall = flags.length > 0
        const shortBy = flags.filter(e => e.flag_type !== 'psych_coverage').length
        const flagTab = shortBy > 0 ? `Short by ${shortBy}` : 'No psych cover'
        const flagReason = [...new Set(flags.map(e => e.flag_reason).filter(Boolean))].join(' · ') || flagTab
        const shown = showOnly.size === 0 || cellEntries.some(e =>
          (showOnly.has('flagged') && isUnfilled(e)) || (showOnly.has('locum') && e.is_locum && !isUnfilled(e)))
        const last = colIdx === shifts.length - 1

        return (
          <td
            key={code}
            className={`${cellFrame} align-top p-0 ${last ? `${strong ? 'border-r-2' : 'border-r'} rounded-r-md` : ''}`}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(day.dateStr, code)}
          >
            {/* Column header when day type starts */}
            {showHeader && <div className={headerBand}>{label}</div>}
            {/* The flag fill sits on this inner block, inset
                from the cell edges, so flagged cells on
                consecutive days stay two separate marks and
                the header above is never tinted. */}
            {/* A flagged slot — one the scheduler couldn't fill —
                gets a solid red frame and a tab saying why
                (full reason on hover/tap). A cell with locum
                placeholders takes no fill: its dashed amber
                chips already say "locum", which leaves red the
                only framed cell on the page. */}
            <div
              data-testid="shift-cell"
              className={`m-[3px] min-h-[36px] rounded p-1 space-y-0.5 transition-opacity ${
                hasShortfall ? 'bg-canvas-raised ring-2 ring-inset ring-flagRed' : ''
              } ${shown ? '' : 'opacity-25'}`}
            >
              {hasShortfall && (
                <span className="-mx-1 -mt-1 mb-1 flex">
                  <span
                    data-testid="flag-tab"
                    title={flagReason}
                    className="flex w-full items-center gap-1 rounded-t bg-flagRed px-1.5 py-0.5 text-[0.75em] font-bold text-on-fill"
                  >
                    <TriangleAlert className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                    {flagTab}
                  </span>
                </span>
              )}
              {cellEntries.map(entry => (
                <DoctorChip
                  key={entry.id}
                  entry={entry}
                  profile={profileMap[entry.profile_id]}
                  dimmed={chipFilterActive && !matchesFilter(profileMap[entry.profile_id])}
                  glow={glowEntryId === entry.id}
                  displayNames={displayNames}
                  absence={absenceFor(entry)}
                  onCancelLeave={isAdmin ? setCancelLeaveFor : null}
                  editHint={editHint({ entry, change: latestChanges.get(entry.id), nameOf: nameById, leaveType: vacatedLeaveType(entry) })}
                  onClick={e => canEdit && handleCellClick(day.dateStr, code, entry, e)}
                  onLate={!canEdit && lateOptionFor(entry) ? () => setLatePrompt(lateOptionFor(entry)) : undefined}
                  late={lateByEntryId.has(entry.id)}
                  onDragStart={() => handleDragStart(entry, code)}
                  isAdmin={canEdit}
                  canDrag={rosterMonth.status !== 'published'}
                />
              ))}
              {/* Add slot while editing */}
              {canEdit && (
                <button
                  onClick={e => handleCellClick(day.dateStr, code, null, e)}
                  className="flex w-full items-center justify-center rounded border border-dashed border-accent/70 bg-canvas-raised/70 py-0.5 text-[0.834em] font-bold text-accent-dark hover:border-accent hover:bg-accent-light"
                  title="Add doctor"
                >
                  +
                </button>
              )}
            </div>
          </td>
        )
      })}
      {leaveCols && (
        <>
          {/* Page background across a weekend's missing fourth
              column and the gap, so the Leave block stands
              apart from the shifts. */}
          <td aria-hidden="true" colSpan={4 - shifts.length + 1} className="bg-canvas p-0" />
          {[['leave', 'Leave'], ['course', 'Course']].map(([key, label]) => (
            <td
              key={key}
              data-testid={`${key}-cell`}
              className={`${cellFrame} align-top p-0 ${key === 'leave' ? `${strong ? 'border-l-2' : 'border-l'} border-r rounded-l-md` : `${strong ? 'border-r-2' : 'border-r'} rounded-r-md`}`}
            >
              {showHeader && <div className={headerBand}>{label}</div>}
              <div className="space-y-0.5 px-1.5 py-1 text-[0.834em]">
                {away[key].map(p => (
                  // The type as a filled pill (icon and code) first, so
                  // a long surname truncates and the type never does.
                  <div key={p.profileId} className="flex min-w-0 items-center gap-1 text-ink-light">
                    {p.type && <LeaveTypePill leaveType={p.type} />}
                    <span className="truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </td>
          ))}
        </>
      )}
      </tr>
    </Fragment>
  )
}
