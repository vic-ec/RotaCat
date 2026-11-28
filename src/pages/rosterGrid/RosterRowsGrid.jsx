import RosterDayRow from './RosterDayRow'

// The Rows layout's table: the column plan and one RosterDayRow per day
// on screen (see the comment where RosterGridPage renders it). `row`
// carries the props every RosterDayRow shares. Moved out of RosterGridPage
// as it was.
export default function RosterRowsGrid({ rosterBase, wideGrid, leaveCols, rosterScale, visibleDays, row }) {
  return (
    <div className="-mx-4 overflow-x-auto md:mx-0" style={{ fontSize: `${rosterBase}px` }}>
      <table
        className="w-full table-fixed border-separate border-spacing-0"
        style={{ minWidth: Math.round(((wideGrid ? 580 : 495) + (leaveCols ? 6 + 2 * 107 : 0)) * rosterScale) }}
      >
        {/* Date rail 44px, Consultant + up to 4 shift columns 107px each.
            Below md the Consultant column is gone and the rail widens to
            64px to carry the consultant under the date. */}
        <colgroup>
          <col style={{ width: Math.round((wideGrid ? 44 : 64) * rosterScale) }} />
          {wideGrid && <col style={{ width: Math.round(107 * rosterScale) }} />}
          <col style={{ width: Math.round(107 * rosterScale) }} />
          <col style={{ width: Math.round(107 * rosterScale) }} />
          <col style={{ width: Math.round(107 * rosterScale) }} />
          <col style={{ width: Math.round(107 * rosterScale) }} />
          {leaveCols && (
            <>
              <col style={{ width: 6 }} />
              <col style={{ width: Math.round(107 * rosterScale) }} />
              <col style={{ width: Math.round(107 * rosterScale) }} />
            </>
          )}
        </colgroup>
        <tbody>
            {visibleDays.map((day, dayIdx) => (
              <RosterDayRow key={day.dateStr} day={day} dayIdx={dayIdx} wideGrid={wideGrid} leaveCols={leaveCols} visibleDays={visibleDays} {...row} />
            ))}
        </tbody>
      </table>
    </div>
  )
}
