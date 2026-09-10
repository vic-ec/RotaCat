import { bandForCode, SHIFT_STARTS, SHIFT_BAND } from '../lib/shiftBands'
import { labelForLeaveCategory } from '../lib/leaveYearGrid'
import PublicHolidayBadge from './PublicHolidayBadge'

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Doctors before consultants, and within each the order the category list
// gives — so a lane's neighbours are the people it makes sense to compare
// it with. Anything without a recognised category falls to the end under
// its own raw value rather than being dropped.
const CATEGORY_ORDER = ['Consultant', 'EC', 'MO', 'Registrar', 'EC Intern', 'OT Intern', 'Locum']

function categoryRank(category) {
  const i = CATEGORY_ORDER.indexOf(category)
  return i === -1 ? CATEGORY_ORDER.length : i
}

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

// The roster turned ninety degrees: a row per doctor, a column per day, one
// shift start per cell.
//
// It answers a different question from the day-rows view rather than the
// same one better — "when am I next on, and who is on with me" reads down a
// lane in one glance, where the day-rows view needs a scroll per week. The
// two are a toggle, not a replacement: a single day's full staffing is
// still far easier to read as a row.
//
// Colour here is the shift's own start time, never the doctor's — a lane
// already belongs to one person, so spending colour on identity would say
// something the row label already says. See src/lib/shiftBands.js.
export default function RosterLanesView({
  days, profiles, entries, shiftTypes, displayNames, entryMap,
}) {
  // date -> profileId -> the shift code they hold that day. A doctor works
  // at most one shift a day (findSameDayConflict enforces it), so this is a
  // flat lookup rather than a list.
  const byProfileDate = new Map()
  entries.forEach(entry => {
    if (!entry.profile_id || entry.is_locum) return
    const code = shiftTypes[entry.shift_type_id]
    if (!code) return
    if (!byProfileDate.has(entry.profile_id)) byProfileDate.set(entry.profile_id, new Map())
    byProfileDate.get(entry.profile_id).set(entry.date, code)
  })

  const lanes = [...profiles].sort((a, b) => {
    const rank = categoryRank(a.category) - categoryRank(b.category)
    if (rank !== 0) return rank
    return (a.surname || '').localeCompare(b.surname || '')
  })

  if (lanes.length === 0) {
    return (
      <div className="rounded-lg border border-slate-line bg-canvas-raised p-8 text-center">
        <p className="text-sm text-ink-muted">No doctors match this search.</p>
      </div>
    )
  }

  // A consultant's entry is keyed CONSULTANT rather than by shift code, so
  // it never reaches byProfileDate — read it off the same map the day-rows
  // view uses.
  const consultantOn = new Map()
  days.forEach(day => {
    const entry = entryMap[`${day.dateStr}|CONSULTANT`]?.[0]
    if (entry?.consultant_profile_id) consultantOn.set(day.dateStr, entry.consultant_profile_id)
  })

  let lastCategory = null

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-line">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">
          One row per doctor, one column per day. Each cell shows the start time of the shift that
          doctor works that day.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 border-b border-r border-slate-line bg-canvas-sunken px-2 py-1.5 text-left text-[11px] font-semibold text-ink-muted"
            >
              Doctor
            </th>
            {days.map(day => {
              const [, , d] = day.dateStr.split('-')
              const off = day.dayType !== 'weekday'
              return (
                <th
                  key={day.dateStr}
                  scope="col"
                  className={`min-w-[26px] border-b border-slate-line px-0 py-1 text-center text-[10px] font-semibold ${
                    off ? 'bg-canvas-sunken text-ink' : 'bg-canvas-raised text-ink-muted'
                  }`}
                >
                  <span className="block tabular-nums">{Number(d)}</span>
                  <span className="block text-[9px] font-normal">{DAY_INITIALS[dayOfWeek(day.dateStr)]}</span>
                  {day.phName && (
                    <span className="mt-0.5 block">
                      <PublicHolidayBadge name={day.phName} />
                    </span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {lanes.map(profile => {
            const worked = byProfileDate.get(profile.id)
            const rows = []

            // A category heading whenever the group changes, so a
            // consultant's month and a registrar's read as separate blocks.
            if (profile.category !== lastCategory) {
              lastCategory = profile.category
              rows.push(
                <tr key={`grp-${profile.category ?? 'other'}`}>
                  <th
                    scope="colgroup"
                    colSpan={days.length + 1}
                    className="sticky left-0 border-b border-slate-line bg-accent-tint px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-accent-dark"
                  >
                    {labelForLeaveCategory(profile.category) || profile.category || 'Other'}
                  </th>
                </tr>
              )
            }

            rows.push(
              <tr key={profile.id} className="border-b border-slate-hairline last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[112px] border-r border-slate-line bg-canvas-raised px-2 py-1 text-left text-[11px] font-medium text-ink"
                >
                  {displayNames?.get(profile.id) ?? profile.surname}
                </th>
                {days.map(day => {
                  const code = worked?.get(day.dateStr)
                  const band = code ? bandForCode(code) : null
                  const isConsultant = consultantOn.get(day.dateStr) === profile.id
                  const off = day.dayType !== 'weekday'

                  if (!band && !isConsultant) {
                    return (
                      <td
                        key={day.dateStr}
                        className={`border-r border-slate-hairline text-center text-[10px] text-ink-muted ${
                          off ? 'bg-canvas-sunken' : ''
                        }`}
                      >
                        ·
                      </td>
                    )
                  }

                  // A consultant is on call rather than on a shift, so it
                  // gets its own mark instead of a start time it does not
                  // have.
                  const fill = band ? band.fill : 'bg-accent-light'
                  const text = band ? band.text : 'text-accent-dark'
                  const label = band ? band.label : 'On call'
                  return (
                    <td key={day.dateStr} className="border-r border-slate-hairline p-0">
                      <span
                        className={`block px-0.5 py-1 text-center text-[10px] font-semibold tabular-nums ${fill} ${text}`}
                        title={`${day.dateStr} — ${code || 'Consultant on call'}`}
                      >
                        {band ? label : 'C'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
            return rows
          })}
        </tbody>
      </table>
    </div>
  )
}

// Rendered under the table rather than behind a Legend trigger: six starts
// is short enough to read in place, and the whole point of the view is that
// the colours mean something.
export function LanesLegend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-muted">
      {SHIFT_STARTS.map(start => (
        <span key={start} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-4 rounded-sm ${SHIFT_BAND[start].swatch}`} />
          {SHIFT_BAND[start].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm bg-accent-light" /> C — consultant on call
      </span>
      <span>· — not working</span>
    </div>
  )
}
