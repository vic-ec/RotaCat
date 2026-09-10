import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import RosterLanesView from './RosterLanesView'
import { startForCode, bandForCode, SHIFT_START } from '../lib/shiftBands'

// A short month: a Friday, its weekend, and a Monday public holiday — the
// four day types the roster issues, so every shift pattern appears.
const DAYS = [
  { dateStr: '2026-08-07', dayType: 'weekday', phName: null },
  { dateStr: '2026-08-08', dayType: 'weekend', phName: null },
  { dateStr: '2026-08-09', dayType: 'PH', phName: "National Women's Day" },
  { dateStr: '2026-08-10', dayType: 'PH_weekday', phName: 'Observed' },
]

const PROFILES = [
  { id: 'c1', name: 'Ada', surname: 'Sathi', category: 'Consultant', is_active: true },
  { id: 'd1', name: 'Bo', surname: 'Landers', category: 'MO', is_active: true },
  { id: 'd2', name: 'Cy', surname: 'Venter', category: 'Registrar', is_active: true },
]

const SHIFT_TYPES = { s1: 'WD_08', s2: 'WE_20', s3: 'PH_13', s4: 'PHW_22' }

const ENTRIES = [
  { id: 'e1', profile_id: 'd1', shift_type_id: 's1', date: '2026-08-07', is_locum: false },
  { id: 'e2', profile_id: 'd1', shift_type_id: 's2', date: '2026-08-08', is_locum: false },
  { id: 'e3', profile_id: 'd2', shift_type_id: 's3', date: '2026-08-09', is_locum: false },
  { id: 'e4', profile_id: 'd2', shift_type_id: 's4', date: '2026-08-10', is_locum: false },
  // A locum placeholder has no doctor behind it, so it belongs to no lane.
  { id: 'e5', profile_id: null, shift_type_id: 's1', date: '2026-08-08', is_locum: true },
]

const ENTRY_MAP = {
  '2026-08-07|CONSULTANT': [{ id: 'x1', consultant_profile_id: 'c1' }],
}

function renderLanes(props = {}) {
  return render(
    <RosterLanesView
      days={DAYS}
      profiles={PROFILES}
      entries={ENTRIES}
      shiftTypes={SHIFT_TYPES}
      displayNames={new Map()}
      entryMap={ENTRY_MAP}
      {...props}
    />
  )
}

function laneFor(surname) {
  return screen.getByRole('rowheader', { name: surname }).closest('tr')
}

describe('shiftBands', () => {
  it('maps every shift code the roster issues to its start hour', () => {
    // Guards against a code being added to shift_types without a band: an
    // unmapped code renders an empty lane cell, which reads as "not
    // working" — a wrong answer, not a missing one.
    expect(Object.keys(SHIFT_START).sort()).toEqual([
      'PHW_08', 'PHW_12', 'PHW_15', 'PHW_22',
      'PH_08', 'PH_13', 'PH_20',
      'WD_08', 'WD_12', 'WD_15', 'WD_22',
      'WE_08', 'WE_13', 'WE_20',
    ].sort())
  })

  it('gives the weekday and weekend clocks their own starts', () => {
    expect(startForCode('WD_12')).toBe('12')
    expect(startForCode('WE_13')).toBe('13')
    expect(startForCode('WD_22')).toBe('22')
    expect(startForCode('WE_20')).toBe('20')
  })

  it('returns null for a code it has not been taught, rather than throwing', () => {
    expect(startForCode('WD_99')).toBeNull()
    expect(bandForCode('WD_99')).toBeNull()
    expect(bandForCode(undefined)).toBeNull()
  })
})

describe('RosterLanesView', () => {
  it('labels a worked day with the shift start time, not a letter', () => {
    // D/L/N was the first attempt and L read as "leave" in a grid that also
    // shows leave. The time says which shift without a key.
    renderLanes()
    const lane = within(laneFor('Landers'))
    expect(lane.getByText('08h')).toBeInTheDocument()
    expect(lane.getByText('20h')).toBeInTheDocument()
  })

  it('reads the weekend and public-holiday clocks correctly', () => {
    renderLanes()
    const lane = within(laneFor('Venter'))
    expect(lane.getByText('13h')).toBeInTheDocument()  // PH_13, a Sunday holiday
    expect(lane.getByText('22h')).toBeInTheDocument()  // PHW_22, a Monday holiday
  })

  it('colours a cell by its start time', () => {
    renderLanes()
    const lane = within(laneFor('Landers'))
    expect(lane.getByText('08h').className).toContain('bg-shift-08')
    expect(lane.getByText('20h').className).toContain('bg-shift-20')
  })

  it('marks a day off with a dot rather than leaving the cell blank', () => {
    renderLanes()
    // Venter works only the last two days of this fixture.
    expect(within(laneFor('Venter')).getAllByText('·')).toHaveLength(2)
  })

  it('shows a consultant as on call, not as a shift they do not hold', () => {
    renderLanes()
    const lane = within(laneFor('Sathi'))
    expect(lane.getByText('C')).toBeInTheDocument()
    expect(lane.queryByText('08h')).not.toBeInTheDocument()
  })

  it('gives no lane to a locum placeholder — it belongs to no doctor', () => {
    renderLanes()
    expect(screen.queryByRole('rowheader', { name: /\[ \]/ })).not.toBeInTheDocument()
    // ...and the real assignment on that same day is still drawn.
    expect(within(laneFor('Landers')).getByText('20h')).toBeInTheDocument()
  })

  it('groups lanes by category, consultants first', () => {
    renderLanes()
    const headings = screen.getAllByRole('columnheader')
      .filter(th => th.getAttribute('scope') === 'colgroup')
      .map(th => th.textContent)
    expect(headings[0]).toBe('Consultant')
  })

  it('renders only the profiles it is given, so a filter can narrow it', () => {
    renderLanes({ profiles: PROFILES.filter(p => p.category === 'MO') })
    expect(screen.getByRole('rowheader', { name: 'Landers' })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'Venter' })).not.toBeInTheDocument()
  })

  it('says so when a filter leaves nothing, instead of an empty table', () => {
    renderLanes({ profiles: [] })
    expect(screen.getByText('No doctors match this search.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('prefers the disambiguated display name over the bare surname', () => {
    renderLanes({ displayNames: new Map([['d1', 'B. Landers']]) })
    expect(screen.getByRole('rowheader', { name: 'B. Landers' })).toBeInTheDocument()
  })

  it('names a cell with the shift, not the database code, on hover', () => {
    renderLanes()
    expect(within(laneFor('Landers')).getByTitle('2026-08-07 — WD 08h-18h')).toBeInTheDocument()
    // Stored PHW_22, shown as PH — see shiftLabels.js.
    expect(within(laneFor('Venter')).getByTitle('2026-08-10 — PH 22h-10h')).toBeInTheDocument()
  })

  it('draws a weekend column lighter than the header row it sits under', () => {
    // The complaint that prompted this: weekend/PH cells were canvas.sunken,
    // the same fill as the header cells, so the two blocks merged.
    renderLanes()
    const off = within(laneFor('Sathi')).getAllByText('·')
    expect(off.some(td => td.className.includes('bg-canvas-cool'))).toBe(true)
    expect(off.some(td => td.className.includes('bg-canvas-sunken'))).toBe(false)
  })
})

// A month's first and last weeks are short. Left alone, a two-day week gave
// its two days a third of the table each and let the name column take the
// rest — the week read nothing like the five full weeks beside it.
describe('RosterLanesView — a short week padded to seven columns', () => {
  // Sat 1 and Sun 2 August 2026: the tail of a Monday-start week, so five
  // blanks belong in front of them.
  const SHORT_WEEK = [
    { dateStr: '2026-08-01', dayType: 'weekend', phName: null },
    { dateStr: '2026-08-02', dayType: 'weekend', phName: null },
  ]

  function dayCells(surname) {
    return within(laneFor(surname)).getAllByRole('cell')
  }

  it('pads a short week out to seven day columns', () => {
    renderLanes({ days: SHORT_WEEK, padToWeek: true })
    expect(dayCells('Landers')).toHaveLength(7)
  })

  it('puts the blanks on the side the month boundary cut', () => {
    renderLanes({ days: SHORT_WEEK, padToWeek: true })
    const headers = screen.getAllByRole('columnheader').filter(th => th.getAttribute('scope') === 'col')
    // Doctor, then five blanks, then the 1st and the 2nd.
    expect(headers.map(th => th.textContent)).toEqual(['Doctor', '1S', '2S'])
    expect(dayCells('Landers').slice(0, 5).every(td => td.textContent === '')).toBe(true)
  })

  it('leaves a full week alone', () => {
    const fullWeek = ['03', '04', '05', '06', '07', '08', '09']
      .map(d => ({ dateStr: `2026-08-${d}`, dayType: 'weekday', phName: null }))
    renderLanes({ days: fullWeek, padToWeek: true })
    expect(dayCells('Landers')).toHaveLength(7)
  })

  it('does not pad the month view, where a short run is the whole month', () => {
    renderLanes({ days: SHORT_WEEK })
    expect(dayCells('Landers')).toHaveLength(2)
  })

  it('stretches the category heading across the padded columns too', () => {
    renderLanes({ days: SHORT_WEEK, padToWeek: true })
    const heading = screen.getAllByRole('columnheader').find(th => th.getAttribute('scope') === 'colgroup')
    expect(heading).toHaveAttribute('colspan', '8')
  })
})
