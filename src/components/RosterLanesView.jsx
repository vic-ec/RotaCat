import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { bandForCode, SHIFT_STARTS, SHIFT_BAND } from '../lib/shiftBands'
import { rosterTextSize, rosterTextScale } from '../lib/rosterTextSize'
import { labelForShiftCode } from '../lib/shiftLabels'
import { labelForLeaveCategory } from '../lib/leaveYearGrid'
import { entryAbsence, absenceSummary } from '../lib/rosterVacancy'
import { todayStr, dayOfWeek } from '../lib/dateRange'
import { useFillToViewport } from '../lib/useFillToViewport'
import PublicHolidayBadge from './PublicHolidayBadge'
import { adjustedTimesLabel } from '../lib/shiftTimes'

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Doctors before consultants, and within each the order the category list
// gives — so a lane's neighbours are the people it makes sense to compare
// it with. Anything without a recognised category falls to the end under
// its own raw value rather than being dropped.
const CATEGORY_ORDER = ['Consultant', 'EC', 'MO', 'Registrar', 'EC Intern', 'OT Intern', 'Locum']

// Each day column gets at least this much room before the table starts
// scrolling sideways. A full month (31 of them) always scrolls; a padded
// week (7) never does, so its columns share the width instead.
const DAY_COL_MIN = 30

// A week (seven columns, once padded) always has room to spare on a
// desktop panel, where a month never does. Given the spare width, every
// column grows into it rather than the table stopping short and leaving
// the panel half empty — so below this many columns the name column is
// sized as a share of the table instead of a flat width.
const FILLS_PANEL_UPTO = 7

// How much wider the name column is than a day column once they are
// sharing the table. Holds it clearly the widest without giving a column
// of surnames a third of the grid.
const NAME_TO_DAY = 1.35

// Row labels and the "Doctor" header are drawn a step below the table's base
// size, as `text-[0.917em]` (11px when the base is the original 12). Only the
// legend needs the number in JS — it sits outside the table and so has no base
// size to take an em from.
const NAME_EM = 11 / 12

// The name column is sized off the longest name actually in the table
// rather than a flat width, so "Van Schalkwyk" is not the one lane nobody
// can read.
//
// The width that actually ships is *measured* — an off-screen copy of the
// longest name, in the column's own font and size, read back with
// getBoundingClientRect (see useNameColumnWidth). Counting characters can
// only ever approximate a proportional face: at ~7.7px a character it ran
// 50% wide for a lowercase surname, which is where the phone's over-wide
// Doctor column came from. The estimate below stays as the first-paint
// value and the fallback wherever there is nothing to measure against
// (jsdom, a hidden tab), and it deliberately overestimates, since the
// header truncates and a column that is too narrow loses the name
// altogether. The ceiling stops one double-barrelled name taking the
// table over.
const NAME_CH_PX = 7.7
// The floor only has to keep "Doctor" and a short surname off the truncation
// point — it used to sit at 128, which was the real reason the column looked
// so much wider than the names in it: at a larger text size the floor scaled
// up with everything else and a 13-character surname never got near it.
const NAME_COL_MIN = 88
const NAME_COL_MAX = 200

// Side padding (px-2 twice) plus the column's right border, plus a pixel of
// slack so a sub-pixel measurement never clips the last glyph.
const NAME_COL_CHROME = 19

// Plain pixels, deliberately. A `max(<px>, <%>)` here would say all of
// this in one value, but Chromium rejects a percentage inside a math
// function on a <col> and silently falls back to the even column share.
// So the two live as separate custom properties and a media query in
// index.css picks between them — pixels on a phone, where the table is at
// its minimum and the column needs every one of them; a share from md up,
// where there is width to go round.
function nameColumnWidth(maxNameLength) {
  return Math.round(Math.min(Math.max(maxNameLength * NAME_CH_PX + 16, NAME_COL_MIN), NAME_COL_MAX))
}

function nameColumnShare(dayColumnCount) {
  if (dayColumnCount > FILLS_PANEL_UPTO) return null
  return `${((NAME_TO_DAY / (dayColumnCount + NAME_TO_DAY)) * 100).toFixed(2)}%`
}

// Measure the longest name as the column will actually draw it, and return
// the width to give the column — or null before the first measurement, and
// wherever measuring is not possible, so the caller falls back to its
// character estimate. Re-measures when the name or the text size changes;
// the font itself can land late (Figtree is a webfont), so it waits on
// document.fonts too rather than sizing the column to the fallback face.
function useNameColumnWidth(probeRef, longestName, base, scale) {
  const [measured, setMeasured] = useState(null)

  useLayoutEffect(() => {
    let live = true
    function measure() {
      const width = probeRef.current?.getBoundingClientRect().width ?? 0
      if (!live || width <= 0) return
      const min = NAME_COL_MIN * scale
      const max = NAME_COL_MAX * scale
      setMeasured(Math.round(Math.min(Math.max(width + NAME_COL_CHROME, min), max)))
    }
    measure()
    document.fonts?.ready?.then(measure)
    return () => { live = false }
  }, [probeRef, longestName, base, scale])

  return measured
}

// Today's column, boxed top to bottom like the current-month box on the
// Rotations and Team Leave planners. Two pieces, so the box stays whole
// while both the header and the name column are pinned: the sticky day
// header draws its own top and sides (it scrolls with nothing), and an
// overlay inside the scroll box draws the sides and bottom down the full
// height of the table. The overlay sits above the day cells (z-5) but
// under the pinned name column (z-10) and header (z-20), so it slides
// beneath them like the cells do. In the ink colour, so it reads on both
// the light and the night theme.
const TODAY_EDGE = 'rgb(var(--color-ink))'
const TODAY_HEAD_SHADOW = `inset 2px 0 0 ${TODAY_EDGE}, inset -2px 0 0 ${TODAY_EDGE}, inset 0 2px 0 ${TODAY_EDGE}`
const TODAY_BODY_SHADOW = `inset 2px 0 0 ${TODAY_EDGE}, inset -2px 0 0 ${TODAY_EDGE}, inset 0 -2px 0 ${TODAY_EDGE}`

function useTodayBox(scrollRef, todayHeadRef, deps) {
  const [box, setBox] = useState(null)
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const head = todayHeadRef.current
    const table = scroller?.querySelector('table')
    if (!scroller || !head || !table) { setBox(null); return undefined }
    function measure() {
      const s = scroller.getBoundingClientRect()
      const h = head.getBoundingClientRect()
      if (h.width <= 0) { setBox(null); return }
      // The overlay is positioned from the scroll box's padding edge, the
      // rects from its border edge — so its own border (clientLeft) comes
      // off, or the body of the box sits a pixel right of the header's.
      setBox({ left: h.left - s.left - scroller.clientLeft + scroller.scrollLeft, width: h.width, height: table.offsetHeight })
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(table)
    return () => observer?.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measure whenever the grid's shape changes
  }, deps)
  return box
}

function categoryRank(category) {
  const i = CATEGORY_ORDER.indexOf(category)
  return i === -1 ? CATEGORY_ORDER.length : i
}

// A short week — the first and last of a month — padded out to a full
// seven columns with blanks, so every week of the month is drawn at the
// same width with its days under the same column positions. Without this,
// a week 1 holding only a Saturday and a Sunday gave those two days a
// third of the table each and let the name column swallow the rest.
//
// Weeks run Monday to Sunday (buildWeeks in pages/rosterGrid/rosterCalendar.js), so Monday is
// column 0 and the blanks fall on whichever end the month boundary cut.
function buildDayColumns(days, padToWeek) {
  const columns = days.map(day => ({ key: day.dateStr, day }))
  if (!padToWeek || columns.length === 0 || columns.length >= 7) return columns
  const lead = (dayOfWeek(days[0].dateStr) + 6) % 7
  for (let i = lead - 1; i >= 0; i--) columns.unshift({ key: `pad-lead-${i}`, day: null })
  while (columns.length < 7) columns.push({ key: `pad-tail-${columns.length}`, day: null })
  return columns
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
  days, profiles, entries, shiftTypes, displayNames, entryMap, padToWeek = false, textSize = 'md', leaveByProfile = {},
  // Admins outside Edit mode: a tap on a worked shift (to log a late
  // arrival), and the entries that already have one (a small dot).
  onShiftClick, lateEntryIds = new Map(),
}) {
  const { base } = rosterTextSize(textSize)
  const scale = rosterTextScale(textSize)
  const nameFor = profile => displayNames?.get(profile.id) ?? profile.surname ?? ''
  // Hooks run before the empty-table early return below, so they stay
  // unconditional; the probe they read renders inside the table's own
  // wrapper, where it inherits the base font size.
  const nameProbeRef = useRef(null)
  const longestName = profiles.reduce((longest, p) => {
    const name = nameFor(p)
    return name.length > longest.length ? name : longest
  }, '')
  const measuredNameCol = useNameColumnWidth(nameProbeRef, longestName, base, scale)
  const today = todayStr()
  const scrollRef = useRef(null)
  // As tall as the window allows, like Hours Summary and the planners'
  // grids — it used to stop at 70% of the window and leave a band of empty
  // page under a long roster. The gap leaves room for the legend below.
  const [fillRef, fillStyle] = useFillToViewport(60, { fit: true })
  // One stable ref for both: a new function every render would detach and
  // re-attach, and fillRef sets state.
  const setScrollNode = useCallback(node => { scrollRef.current = node; fillRef(node) }, [fillRef])
  const todayHeadRef = useRef(null)
  const todayBox = useTodayBox(scrollRef, todayHeadRef, [days, profiles.length, base, padToWeek, measuredNameCol])

  // date -> profileId -> the shift code they hold that day. A doctor works
  // at most one shift a day (findSameDayConflict enforces it), so this is a
  // flat lookup rather than a list.
  const byProfileDate = new Map()
  // profileId -> date -> the roster entry itself, for onShiftClick.
  const entryOn = new Map()
  // profileId -> date -> "10h–20h" where the shift's hours were adjusted.
  const adjustedOn = new Map()
  entries.forEach(entry => {
    if (!entry.profile_id || entry.is_locum) return
    const code = shiftTypes[entry.shift_type_id]
    if (!code) return
    if (!byProfileDate.has(entry.profile_id)) byProfileDate.set(entry.profile_id, new Map())
    byProfileDate.get(entry.profile_id).set(entry.date, code)
    if (!entryOn.has(entry.profile_id)) entryOn.set(entry.profile_id, new Map())
    entryOn.get(entry.profile_id).set(entry.date, entry)
    const times = adjustedTimesLabel(entry)
    if (times) {
      if (!adjustedOn.has(entry.profile_id)) adjustedOn.set(entry.profile_id, new Map())
      adjustedOn.get(entry.profile_id).set(entry.date, times)
    }
  })

  // profileId -> date -> { code, headline }: a shift the doctor is NOT
  // working — taken off it, or still on it with approved leave over the
  // date (see entryAbsence). Drawn struck through in their lane. A shift
  // they still hold wins over one they were taken off the same day.
  const absentOn = new Map()
  entries.forEach(entry => {
    const absence = entryAbsence(entry, leaveByProfile)
    const code = shiftTypes[entry.shift_type_id]
    if (!absence || !code) return
    if (!absentOn.has(absence.profileId)) absentOn.set(absence.profileId, new Map())
    const summary = absenceSummary({ absence, leaveByProfile })
    absentOn.get(absence.profileId).set(entry.date, {
      code,
      headline: summary.headline,
      // For a doctor taken off the shift, what became of it ("Shift not
      // covered", "Covered by a locum"); nothing for one on leave who
      // still holds it.
      detail: absence.kind === 'vacated' ? summary.lines.find(l => /^(Shift|Covered)/.test(l)) ?? null : null,
    })
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

  const columns = buildDayColumns(days, padToWeek)
  const nameShare = nameColumnShare(columns.length)
  // Measured where we can, estimated until then. Either way the number is
  // already at the current text size — the estimate is drawn against the
  // original 12px, so it (and it alone) takes the scale factor.
  const nameColPx = measuredNameCol ?? Math.round(nameColumnWidth(longestName.length) * scale)

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
    /* max-h + overflow-auto, not just overflow-x-auto: the day header below
       is sticky, and a sticky element needs a real scrolling ancestor to
       stick against. With the page as the only scroller it would stick to
       the viewport instead — under the phone's own app header, and over
       whatever else is on screen. Capped and scrolling inside its own box is
       what the app's other wide grids already do. */
    <div
      ref={setScrollNode}
      className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-line"
      style={{ fontSize: `${base}px`, ...fillStyle }}
    >
      {todayBox && (
        <div
          aria-hidden="true"
          data-testid="today-box"
          className="pointer-events-none absolute top-0 z-[5]"
          style={{ left: todayBox.left, width: todayBox.width, height: todayBox.height, boxShadow: TODAY_BODY_SHADOW }}
        />
      )}
      {/* The off-screen copy the name column is sized from. Zero-sized and
          overflow-hidden so it can never widen the scroll box it sits in —
          clipping hides the paint, the span inside still lays out at its
          natural width, which is the whole point. Its classes have to match
          the row header's exactly, or it measures the wrong thing. */}
      <div aria-hidden="true" style={{ width: 0, height: 0, overflow: 'hidden' }}>
        <span ref={nameProbeRef} className="whitespace-nowrap text-[0.917em] font-medium">{longestName}</span>
      </div>

      {/* table-fixed with an explicit colgroup, so the day columns split the
          spare width evenly instead of the name column taking it all — the
          min-width below is what makes a long month scroll rather than
          crushing 31 columns into a phone. */}
      {/* border-separate with zero spacing rather than border-collapse: a
          collapsed border is shared between neighbouring cells and owned by
          the table, and both the day header and the name column now paint on
          their own compositing layers — their half of each shared line lands
          a device pixel off the rest of the grid while scrolling. Every
          border here is already declared on one side of each pair, so
          separating them draws the same lines, once each. Same reasoning as
          the Hours Summary grid. */}
      <table
        className="w-full table-fixed border-separate border-spacing-0"
        style={{
          // Column widths scale with the text, so a larger size widens the
          // grid (and scrolls) rather than cramming the same boxes.
          minWidth: nameColPx + Math.round(columns.length * DAY_COL_MIN * scale),
          '--lanes-name-w': `${nameColPx}px`,
          ...(nameShare ? { '--lanes-name-w-md': nameShare } : null),
        }}
      >
        <colgroup>
          <col className="lanes-name-col" />
          {columns.map(col => <col key={col.key} />)}
        </colgroup>
        <caption className="sr-only">
          One row per doctor, one column per day. Each cell shows the start time of the shift that
          doctor works that day.
        </caption>
        <thead>
          <tr>
            {/* The corner: sticky in both directions, and above both the
                header row it sits in and the name column it sits atop. */}
            <th
              scope="col"
              className="sticky left-0 top-0 z-30 border-b border-r border-slate-line bg-canvas-sunken px-2 py-1.5 text-left text-[0.917em] font-semibold text-ink-muted"
            >
              Doctor
            </th>
            {columns.map(({ key, day }) => {
              // A <td> rather than a <th>: filler heads no column, and a
              // scope-less header cell would leave a screen reader
              // announcing a column that isn't there.
              if (!day) {
                return <td key={key} data-pad="true" className="border-b border-slate-line bg-canvas-raised" />
              }
              const [, , d] = day.dateStr.split('-')
              const off = day.dayType !== 'weekday'
              // Date over weekday initial — two lines, the same two in every
              // column. A public holiday used to add a "PH" chip on a third
              // line, which pushed those two up and left the holiday columns
              // out of line with the rest of the row. The rose box now wraps
              // the date itself rather than sitting under it, so every
              // column is the same height and the marker is still the
              // unmistakable thing in the row.
              const stamp = (
                <>
                  <span className="block tabular-nums">{Number(d)}</span>
                  <span className="block text-[0.75em] font-normal">{DAY_INITIALS[dayOfWeek(day.dateStr)]}</span>
                </>
              )
              const isToday = day.dateStr === today
              return (
                <th
                  key={key}
                  ref={isToday ? todayHeadRef : undefined}
                  scope="col"
                  aria-current={isToday ? 'date' : undefined}
                  style={isToday ? { boxShadow: TODAY_HEAD_SHADOW } : undefined}
                  className={`sticky top-0 z-20 border-b border-slate-line px-0.5 py-1 text-center text-[0.834em] font-semibold ${
                    isToday ? 'bg-accent text-on-fill' : off ? 'bg-grid-head-weekend text-accent-dark' : 'bg-grid-head text-ink-muted'
                  }`}
                >
                  {day.phName
                    ? <PublicHolidayBadge name={day.phName}>{stamp}</PublicHolidayBadge>
                    : stamp}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {lanes.map(profile => {
            const worked = byProfileDate.get(profile.id)
            const rows = []
            const name = nameFor(profile)

            // A category heading whenever the group changes, so a
            // consultant's month and a registrar's read as separate blocks.
            if (profile.category !== lastCategory) {
              lastCategory = profile.category
              rows.push(
                <tr key={`grp-${profile.category ?? 'other'}`}>
                  {/* The label is stuck to the left edge by an inner span,
                      not by the cell: a `sticky` on a `th` that spans every
                      column is ignored in Chromium, which left this band
                      blank — its background scrolled with the table and the
                      word went off the left of the screen the moment you
                      scrolled sideways, exactly where you most need to know
                      whose block of lanes you are looking at. */}
                  <th
                    scope="colgroup"
                    colSpan={columns.length + 1}
                    className="border-b border-slate-line bg-canvas-raised p-1 text-left"
                  >
                    {/* Divider role (SPEC app-theme): a sheen bar across the
                        full grid width; the label itself still sticks to the
                        left edge while the grid is scrolled sideways. */}
                    <div className="sheen-divider block py-1.5">
                      <span className="sticky left-0 inline-block px-1">
                        {labelForLeaveCategory(profile.category) || profile.category || 'Other'}
                      </span>
                    </div>
                  </th>
                </tr>
              )
            }

            rows.push(
              <tr key={profile.id} className="border-b border-slate-hairline last:border-b-0">
                {/* Truncated rather than wrapped: a two-line name would set
                    the height of every cell in its row, and the column is
                    narrow on purpose so the days get the width. */}
                <th
                  scope="row"
                  title={name}
                  className="sticky left-0 z-10 truncate border-r border-slate-line bg-canvas-raised px-2 py-1 text-left text-[0.917em] font-medium text-ink"
                >
                  {name}
                </th>
                {columns.map(({ key, day }) => {
                  if (!day) {
                    return <td key={key} data-pad="true" className="border-r border-slate-hairline bg-canvas-raised" />
                  }
                  const absent = absentOn.get(profile.id)?.get(day.dateStr)
                  const stillHolds = worked?.get(day.dateStr)
                  // On leave over a shift they still hold, or taken off one
                  // with nothing else that day: the shift shows, struck out.
                  const struck = absent && (!stillHolds || stillHolds === absent.code) ? absent : null
                  if (struck) {
                    const struckBand = bandForCode(struck.code)
                    return (
                      <td key={key} className="border-r border-slate-hairline p-0">
                        <span
                          data-testid="lane-absent"
                          className="block px-0.5 py-1 text-center text-[0.834em] font-semibold tabular-nums text-ink-muted line-through"
                          title={`${day.dateStr} — ${labelForShiftCode(struck.code)} — ${struck.headline}${struck.detail ? ` · ${struck.detail}` : ''}`}
                        >
                          {struckBand ? struckBand.label : '·'}
                        </span>
                      </td>
                    )
                  }
                  const code = stillHolds
                  const band = code ? bandForCode(code) : null
                  const isConsultant = consultantOn.get(day.dateStr) === profile.id
                  const off = day.dayType !== 'weekday'

                  if (!band && !isConsultant) {
                    return (
                      <td
                        key={key}
                        className={`border-r border-slate-hairline text-center text-[0.834em] text-ink-muted ${
                          off ? 'bg-canvas-cool' : ''
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
                  const laneEntry = code ? entryOn.get(profile.id)?.get(day.dateStr) : null
                  const isLate = Boolean(laneEntry && lateEntryIds.has(laneEntry.id))
                  const cellTitle = `${day.dateStr} — ${code ? labelForShiftCode(code) : 'Consultant on call'}${adjustedOn.get(profile.id)?.get(day.dateStr) ? ` · worked ${adjustedOn.get(profile.id).get(day.dateStr)}` : ''}${isLate ? ' · late arrival recorded' : ''}`
                  const cellClass = `relative block w-full px-0.5 py-1 text-center text-[0.834em] font-semibold tabular-nums ${fill} ${text}`
                  const lateDot = isLate && <span data-testid="late-marker" aria-hidden="true" className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-ink print:hidden" />
                  return (
                    <td key={key} className="border-r border-slate-hairline p-0">
                      {onShiftClick && laneEntry ? (
                        <button type="button" onClick={() => onShiftClick(laneEntry)} className={cellClass} title={cellTitle}>
                          {band ? label : 'C'}{lateDot}
                        </button>
                      ) : (
                        <span className={cellClass} title={cellTitle}>
                          {band ? label : 'C'}{lateDot}
                        </span>
                      )}
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
export function LanesLegend({ textSize = 'md' }) {
  // Sits outside the table's own scroll box, so it needs the base size told
  // to it rather than inherited — otherwise the legend keeps its original
  // 11px while the grid it explains grows.
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-ink-muted"
      style={{ fontSize: `${Math.round(rosterTextSize(textSize).base * NAME_EM)}px` }}
    >
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
