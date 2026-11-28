import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InternRotationsMatrix from './InternRotationsMatrix'
import { buildDoctorDisplayNames } from '../lib/doctorNames'

// Pinned so "current month" (the marker + the side panel's default "right
// now" view) is deterministic rather than drifting with the real date —
// same vi.setSystemTime-without-useFakeTimers convention as
// WeekendPlannerView.test.jsx, which keeps userEvent's own internal timers
// real (fake timers + userEvent is a known hang risk).
beforeEach(() => {
  vi.setSystemTime(new Date(2027, 5, 15)) // 15 Jun 2027
})
afterEach(() => vi.useRealTimers())

const DOCTORS = [
  { id: 'intern-1', name: 'Ivy', surname: 'Intern', category: 'Intern', color_code: '#111111' },
  { id: 'registrar-1', name: 'Rae', surname: 'Registrar', category: 'Registrar', color_code: '#222222' },
  // An unassigned Intern — kept with no rotations so it's the add-doctor
  // flow's only candidate.
  { id: 'cosmo-1', name: 'Cara', surname: 'Cosmo', category: 'Intern', color_code: '#333333' },
]
const displayNames = buildDoctorDisplayNames(DOCTORS)

function baseRotations() {
  return [
    { id: 'r1', doctor_id: 'intern-1', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-03-31' },
    { id: 'r2', doctor_id: 'intern-1', rotation_type: 'OT', subtype: 'LRCHC', start_date: '2027-04-01', end_date: null },
    { id: 'r3', doctor_id: 'registrar-1', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-12-31' },
  ]
}

function renderMatrix(overrides = {}) {
  const props = {
    doctors: DOCTORS,
    rotations: baseRotations(),
    displayNames,
    currentUserId: 'admin-1',
    year: 2027,
    selectedDoctorId: null,
    onSelectDoctor: vi.fn(),
    onUpdateRotation: vi.fn().mockResolvedValue(undefined),
    onCreateRotation: vi.fn().mockResolvedValue(undefined),
    onDeleteRotation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  const view = render(<InternRotationsMatrix {...props} />)
  return { ...view, props }
}

describe('InternRotationsMatrix', () => {
  it('renders month headers and groups rows by fixed category (Interns / Registrars)', () => {
    renderMatrix()
    expect(screen.getByText('Jan')).toBeInTheDocument()
    expect(screen.getByText('Dec')).toBeInTheDocument()
    // "Registrars 1" also appears as the "right now" panel's own heading —
    // this just confirms the main table has its own, not that it's unique.
    expect(screen.getAllByRole('button', { name: /Interns 2/ }).length).toBeGreaterThan(0) // intern-1 + cosmo-1
    expect(screen.getAllByRole('button', { name: /Registrars 1/ }).length).toBeGreaterThan(0)
    // Row labels use the disambiguated display name as their title, even
    // though the visible text truncates to the surname
    expect(screen.getByTitle('Ivy Intern')).toBeInTheDocument()
  })

  it('shows the 4-state legend, with no standalone "OT" option', async () => {
    const user = userEvent.setup()
    renderMatrix()
    // Desktop now folds the legend behind its own icon, next to More actions.
    await user.click(screen.getByRole('button', { name: 'Legend' }))
    expect(screen.getAllByText('EC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OT · Day Hospital').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OT · TB Hospital').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OT · Psych').length).toBeGreaterThan(0)
    expect(screen.queryByText('OT · needs subtype')).not.toBeInTheDocument()
  })

  it('a doctor stays in their category section regardless of their current rotation', () => {
    // intern-1 is on OT today, but Interns is one fixed section — no more
    // splitting by current EC/OT the way the old sections used to.
    renderMatrix()
    const internsGroup = screen.getByRole('button', { name: /Interns 2/ }).closest('[data-section]')
    expect(within(internsGroup).getByTitle('Ivy Intern')).toBeInTheDocument()
    expect(within(internsGroup).getByTitle('Cara Cosmo')).toBeInTheDocument()
  })

  it('with nothing selected, the side panel still groups current doctors by EC/OT ("right now" is unchanged)', () => {
    // 15 Jun 2027 falls in intern-1's OT·Day Hospital block and registrar-1's EC block
    renderMatrix()
    const panel = screen.getByText('Right now').closest('div')
    expect(within(panel).getByText('June 2027')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /OT interns 1/ })).toBeInTheDocument()
    expect(within(panel).getByText('Day Hospital')).toBeInTheDocument()
    expect(within(panel).getByText('From 1 Apr 2027 · ongoing')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /EC interns/ })).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /Registrars 1/ })).toBeInTheDocument()
    expect(within(panel).getByText('From 1 Jan 2027 to 31 Dec 2027')).toBeInTheDocument()
  })

  it('right now panel: EC interns sort by surname, start date as the tie-break for a shared surname', () => {
    const doctors = [
      ...DOCTORS,
      { id: 'ec-2', name: 'Zara', surname: 'Zeta', category: 'Intern', color_code: '#444444' },
      { id: 'ec-3', name: 'Amy', surname: 'Zeta', category: 'Intern', color_code: '#555555' },
    ]
    const rotations = [
      ...baseRotations(),
      { id: 'r4', doctor_id: 'ec-2', rotation_type: 'EC', subtype: null, start_date: '2027-05-01', end_date: null },
      { id: 'r5', doctor_id: 'ec-3', rotation_type: 'EC', subtype: null, start_date: '2027-02-01', end_date: null },
    ]
    renderMatrix({ doctors, rotations, displayNames: buildDoctorDisplayNames(doctors) })
    const panel = screen.getByText('Right now').closest('div')
    const ecGroup = within(panel).getByRole('button', { name: /EC interns 2/ })
    const names = within(ecGroup.closest('div.mt-3')).getAllByRole('button').filter(b => b !== ecGroup).map(b => b.textContent)
    // Both share the surname Zeta — Amy's rotation started earlier (1 Feb
    // vs 1 May), so she sorts first despite "Zara" being alphabetically
    // earlier than "Amy".
    expect(names).toEqual(['A. Zeta', 'Z. Zeta'])
  })

  it('right now panel: Expand all appears once both its sections are folded', async () => {
    const user = userEvent.setup()
    renderMatrix()
    const panel = screen.getByText('Right now').closest('div')
    await user.click(within(panel).getByRole('button', { name: /OT interns 1/ }))
    expect(within(panel).queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: /Registrars 1/ }))
    await user.click(within(panel).getByRole('button', { name: 'Expand all' }))
    expect(within(panel).getByText('Day Hospital')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
  })

  it('grid: Expand all appears once every category section is folded', async () => {
    const user = userEvent.setup()
    renderMatrix()
    const sections = [...document.querySelectorAll('[data-section]')]
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      await user.click(within(section).getAllByRole('button', { expanded: true })[0])
    }
    expect(screen.queryByTitle('Ivy Intern')).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Expand all' })[0])
    expect(screen.getAllByTitle('Ivy Intern').length).toBeGreaterThan(0)
  })

  it('selecting a doctor shows their block list with type + date range', async () => {
    const onSelectDoctor = vi.fn()
    renderMatrix({ onSelectDoctor })
    await userEvent.setup().click(screen.getByTitle('Ivy Intern'))
    expect(onSelectDoctor).toHaveBeenCalledWith('intern-1')
  })

  it('doctor selected: lists blocks, and Edit rotations reveals the type dropdown + From/To inputs', async () => {
    const user = userEvent.setup()
    renderMatrix({ selectedDoctorId: 'intern-1' })
    expect(screen.getByText('1 Jan 2027 – 31 Mar 2027')).toBeInTheDocument()
    expect(screen.getByText('1 Apr 2027 – ongoing')).toBeInTheDocument()
    expect(screen.getByText('NOW')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Right now/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit rotations' }))
    expect(screen.getAllByText('From').length).toBeGreaterThan(0)
    expect(screen.getAllByText('To').length).toBeGreaterThan(0)
  })

  it('Registrar type dropdown only offers EC (no OT option)', async () => {
    const user = userEvent.setup()
    renderMatrix({ selectedDoctorId: 'registrar-1' })
    await user.click(screen.getByRole('button', { name: 'Edit rotations' }))
    const triggers = screen.getAllByRole('button', { expanded: false })
    const typeTrigger = triggers.find(b => within(b).queryByText('EC'))
    await user.click(typeTrigger)
    expect(screen.queryByRole('option', { name: /OT/ })).not.toBeInTheDocument()
  })

  it('the combined type dropdown never offers a standalone OT for anyone', async () => {
    const user = userEvent.setup()
    renderMatrix({ selectedDoctorId: 'intern-1' })
    await user.click(screen.getByRole('button', { name: 'Edit rotations' }))
    const triggers = screen.getAllByRole('button', { expanded: false })
    const ecTrigger = triggers.find(b => within(b).queryByText('EC'))
    await user.click(ecTrigger)
    expect(screen.queryByRole('option', { name: 'OT' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'OT · TB Hospital' })).toBeInTheDocument()
  })

  it('changing a block\'s combined type writes both rotation_type and subtype', async () => {
    const onUpdateRotation = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderMatrix({ selectedDoctorId: 'intern-1', onUpdateRotation })
    await user.click(screen.getByRole('button', { name: 'Edit rotations' }))
    const triggers = screen.getAllByRole('button', { expanded: false })
    const ecTrigger = triggers.find(b => within(b).queryByText('EC'))
    await user.click(ecTrigger)
    await user.click(screen.getByRole('option', { name: 'OT · Psych' }))
    expect(onUpdateRotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1' }),
      { rotationType: 'OT', subtype: 'PSYCH' }
    )
  })

  it('a bare-OT row (no subtype) shows its real state in the editor and warns, without offering it as a new pick', async () => {
    const user = userEvent.setup()
    const bareOt = [{ id: 'r1', doctor_id: 'intern-1', rotation_type: 'OT', subtype: null, start_date: '2027-01-01', end_date: null }]
    renderMatrix({ selectedDoctorId: 'intern-1', rotations: bareOt })
    expect(screen.getByLabelText('Needs a subtype')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit rotations' }))
    const panel = screen.getByRole('button', { name: /Add block/ }).closest('.card')
    expect(within(panel).getByText('OT · needs subtype')).toBeInTheDocument()
    const triggers = within(panel).getAllByRole('button', { expanded: false })
    const trigger = triggers.find(b => within(b).queryByText('OT · needs subtype'))
    await user.click(trigger)
    // It's shown (so the trigger can label itself) but not a real choice.
    const options = screen.getAllByRole('option')
    expect(options.filter(o => within(o).queryByText(/needs subtype/))).toHaveLength(1)
    expect(screen.getByRole('option', { name: 'EC' })).toBeInTheDocument()
  })

  it('shows the persistent overlap banner when two of a doctor\'s blocks overlap', () => {
    const overlapping = [
      { id: 'a', doctor_id: 'intern-1', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-06-30' },
      { id: 'b', doctor_id: 'intern-1', rotation_type: 'OT', subtype: 'PSYCH', start_date: '2027-06-01', end_date: '2027-08-31' },
    ]
    renderMatrix({ selectedDoctorId: 'intern-1', rotations: overlapping })
    expect(screen.getByText(/both cover/)).toBeInTheDocument()
  })

  it('does not show an overlap banner for calendar-adjacent (non-overlapping) blocks', () => {
    renderMatrix({ selectedDoctorId: 'intern-1' }) // r1 ends 2027-03-31, r2 starts 2027-04-01 — adjacent, not overlapping
    expect(screen.queryByText(/both cover/)).not.toBeInTheDocument()
  })

  it('Add block defaults a Registrar\'s new block to a 3-month span starting the day after their last block', async () => {
    const onCreateRotation = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderMatrix({ selectedDoctorId: 'registrar-1', onCreateRotation })
    await user.click(screen.getByRole('button', { name: 'Edit rotations' }))
    await user.click(screen.getByRole('button', { name: /Add block/ }))
    expect(onCreateRotation).toHaveBeenCalledWith(expect.objectContaining({
      doctorId: 'registrar-1',
      rotationType: 'EC',
      startDate: '2028-01-01',
      endDate: '2028-04-01',
    }))
  })

  it('clicking a name in the no-selection panel selects them', async () => {
    const onSelectDoctor = vi.fn()
    const user = userEvent.setup()
    renderMatrix({ onSelectDoctor })
    const panel = screen.getByText('Right now').closest('div')
    await user.click(within(panel).getByRole('button', { name: 'Intern' }))
    expect(onSelectDoctor).toHaveBeenCalledWith('intern-1')
  })

  // Toolbar mounts both its desktop and mobile rows in the DOM at once (CSS,
  // not JS, picks which one is visible) — jsdom applies no layout, so both
  // Filter buttons exist; either drives the same state.
  async function openFilter(user) {
    await user.click(screen.getAllByRole('button', { name: 'Filter' })[0])
    return screen.getByRole('menu')
  }

  it('the Filter opens straight onto the categories, with OT placements nested under OT intern', async () => {
    const user = userEvent.setup()
    renderMatrix()
    const menu = await openFilter(user)
    for (const name of ['EC intern', 'OT intern', 'TB Hospital', 'Psych', 'Day Hospital', 'Registrar']) {
      expect(within(menu).getByRole('checkbox', { name })).toBeInTheDocument()
    }
  })

  it('filtering to Registrar narrows the rows to registrars', async () => {
    const user = userEvent.setup()
    renderMatrix()
    const menu = await openFilter(user)
    await user.click(within(menu).getByRole('checkbox', { name: 'Registrar' }))
    expect(screen.getByTitle('Rae Registrar')).toBeInTheDocument()
    expect(screen.queryByTitle('Ivy Intern')).not.toBeInTheDocument()
  })

  it('an OT placement keeps interns who do it in the displayed year; ticking OT intern ticks every placement', async () => {
    const user = userEvent.setup()
    renderMatrix()
    const menu = await openFilter(user)
    await user.click(within(menu).getByRole('checkbox', { name: 'Day Hospital' }))
    expect(screen.getByTitle('Ivy Intern')).toBeInTheDocument() // Day Hospital from Apr 2027
    expect(screen.queryByTitle('Rae Registrar')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Cara Cosmo')).not.toBeInTheDocument() // no rotations at all

    await user.click(within(menu).getByRole('checkbox', { name: 'OT intern' }))
    for (const name of ['TB Hospital', 'Psych', 'Day Hospital']) {
      expect(within(menu).getByRole('checkbox', { name })).toBeChecked()
    }
  })

  it('the right-now panel filters on today\'s rotation, the grid on the displayed year\'s', async () => {
    // Ivy did EC in Jan–Mar 2027 but is on Day Hospital today (15 Jun 2027).
    const user = userEvent.setup()
    renderMatrix()
    const menu = await openFilter(user)
    await user.click(within(menu).getByRole('checkbox', { name: 'EC intern' }))
    expect(screen.getByTitle('Ivy Intern')).toBeInTheDocument()
    const panel = screen.getByText('Right now').closest('div')
    expect(within(panel).queryByRole('button', { name: 'Intern' })).not.toBeInTheDocument()
  })

  it('desktop: the year leads the side panel, and Legend/More sit right after Filter', () => {
    renderMatrix()
    const aside = screen.getByRole('complementary')
    const yearLabel = within(aside).getByText('2027')
    expect(yearLabel.compareDocumentPosition(within(aside).getByText('Right now')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const filter = screen.getAllByRole('button', { name: 'Filter' })[0]
    const legend = screen.getAllByRole('button', { name: 'Legend' })[0]
    const more = screen.getByRole('button', { name: 'More actions' })
    expect(filter.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(legend.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(legend.closest('aside')).toBeNull()
  })

  it('add-doctor flow: picking an unassigned doctor creates a first EC block, selects them, and opens edit mode', async () => {
    const onCreateRotation = vi.fn().mockResolvedValue(undefined)
    const onSelectDoctor = vi.fn()
    const user = userEvent.setup()
    renderMatrix({ onCreateRotation, onSelectDoctor })
    const internsHeading = screen.getAllByRole('button', { name: /Interns 2/ })[0]
    await user.click(within(internsHeading.closest('[data-section]')).getByRole('button', { name: '+ Add doctor' }))
    const picker = screen.getByRole('dialog', { name: /Assign doctor/ })
    await user.click(within(picker).getByRole('button', { name: /Cosmo/ }))
    expect(onCreateRotation).toHaveBeenCalledWith(expect.objectContaining({
      doctorId: 'cosmo-1', rotationType: 'EC', subtype: null, startDate: '2027-06-15', endDate: null, createdBy: 'admin-1',
    }))
    expect(onSelectDoctor).toHaveBeenCalledWith('cosmo-1')
  })

  it('Today is hidden while already browsing the current year, and shown once browsing away from it', async () => {
    const user = userEvent.setup()
    const { rerender, props } = renderMatrix() // year: 2027, matches the pinned system date
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()

    const onYearChange = vi.fn()
    rerender(<InternRotationsMatrix {...props} year={2026} onYearChange={onYearChange} />)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(onYearChange).toHaveBeenCalledWith(2027)
  })

  it('the More actions kebab uses standard bordered icon-button styling, with an active state while open', async () => {
    const user = userEvent.setup()
    renderMatrix()
    const kebab = screen.getByRole('button', { name: 'More actions' })
    expect(kebab).toHaveClass('icon-btn', 'icon-btn-idle')
    await user.click(kebab)
    expect(kebab).toHaveClass('icon-btn-active')
  })
})

describe('InternRotationsMatrix — table sections and rows', () => {
  it('shows each doctor\'s position line and chip, reflecting their actual situation', () => {
    renderMatrix()
    const internRow = screen.getByTitle('Ivy Intern').closest('[aria-selected]')
    expect(within(internRow).getByText('Ongoing')).toBeInTheDocument()
    expect(within(internRow).getByText('OT · Day Hospital')).toBeInTheDocument()

    const registrarRow = screen.getByTitle('Rae Registrar').closest('[aria-selected]')
    expect(within(registrarRow).getByText('Until 31 Dec · month 6 of 12')).toBeInTheDocument()

    const cosmoRow = screen.getByTitle('Cara Cosmo').closest('[aria-selected]')
    expect(within(cosmoRow).getByText('No rotation scheduled')).toBeInTheDocument()
    expect(within(cosmoRow).getByText('No rotation')).toBeInTheDocument()
  })

  it('selects from anywhere on the row, not just the name', async () => {
    const onSelectDoctor = vi.fn()
    const user = userEvent.setup()
    renderMatrix({ onSelectDoctor })
    const row = screen.getByTitle('Ivy Intern').closest('[aria-selected]')
    await user.click(row.lastElementChild)
    expect(onSelectDoctor).toHaveBeenCalledWith('intern-1')
  })

  it('marks the selected row', () => {
    renderMatrix({ selectedDoctorId: 'registrar-1' })
    expect(screen.getAllByTitle('Rae Registrar')[0].closest('[aria-selected]')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTitle('Ivy Intern').closest('[aria-selected]')).toHaveAttribute('aria-selected', 'false')
  })

  it('a between-blocks doctor shows the neutral chip and their next rotation', () => {
    const rotations = [{ id: 'r1', doctor_id: 'intern-1', rotation_type: 'OT', subtype: 'PSYCH', start_date: '2027-08-01', end_date: null }]
    renderMatrix({ rotations })
    const row = screen.getByTitle('Ivy Intern').closest('[aria-selected]')
    expect(within(row).getByText('Between blocks')).toBeInTheDocument()
    expect(within(row).getByText('Next: Psych from 1 Aug')).toBeInTheDocument()
  })

  it('a mid-block doctor shows what follows and when the whole block ends', () => {
    const rotations = [
      { id: 'r1', doctor_id: 'intern-1', rotation_type: 'EC', subtype: null, start_date: '2027-05-01', end_date: '2027-07-31' },
      { id: 'r2', doctor_id: 'intern-1', rotation_type: 'OT', subtype: 'DPM_BCH', start_date: '2027-08-01', end_date: '2028-01-31' },
    ]
    renderMatrix({ rotations })
    const row = screen.getByTitle('Ivy Intern').closest('[aria-selected]')
    expect(within(row).getByText('Until 31 Jul, then TB · block ends 31 Jan 2028')).toBeInTheDocument()
  })
})

describe('InternRotationsMatrix — mobile layout', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }))
  })
  afterEach(() => { delete window.matchMedia })

  it('renders flat rows with month cells instead of the 12-column grid', () => {
    renderMatrix()
    expect(screen.queryByText('Jan')).not.toBeInTheDocument()
    const row = screen.getByTitle('Ivy Intern').closest('button')
    expect(within(row).getAllByText('E').length).toBe(3)
    expect(within(row).getAllByText('DH').length).toBe(9)
    expect(within(row).getByText('Ongoing')).toBeInTheDocument()
  })

  it('shows the single-letter month header', () => {
    renderMatrix()
    expect(screen.getAllByText('J')).toHaveLength(3) // Jan, Jun, Jul
    expect(screen.getByText('D')).toBeInTheDocument() // Dec
  })

  it('tapping a row calls onSelectDoctor', async () => {
    const onSelectDoctor = vi.fn()
    const user = userEvent.setup()
    renderMatrix({ onSelectDoctor })
    await user.click(screen.getByTitle('Ivy Intern').closest('button'))
    expect(onSelectDoctor).toHaveBeenCalledWith('intern-1')
  })

  it('a selected doctor shows the bottom-sheet modal with their block list (no duplicate header chrome)', () => {
    renderMatrix({ selectedDoctorId: 'intern-1' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit rotations' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
  })

  it('the FAB opens the add-doctor picker', async () => {
    const user = userEvent.setup()
    renderMatrix()
    await user.click(screen.getByRole('button', { name: 'Add doctor' }))
    expect(screen.getByText(/Assign doctor/)).toBeInTheDocument()
  })

  it('the year selector shares one row with search/filter (left) and Legend/kebab (right)', () => {
    renderMatrix()
    const search = screen.getAllByPlaceholderText('Search name…')[0]
    const legend = screen.getAllByRole('button', { name: 'Legend' })[0]
    const yearLabel = screen.getByText('2027')

    expect(search.compareDocumentPosition(yearLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(yearLabel.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const sticky = yearLabel.closest('.sticky')
    expect(sticky.contains(search)).toBe(true)
    expect(sticky.contains(legend)).toBe(true)
    // Today is hidden while already on the current year, same as desktop.
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('the "Now" strip opens the right-now list in a sheet', async () => {
    const user = userEvent.setup()
    renderMatrix()
    await user.click(screen.getByRole('button', { name: /Now · Jun 2027/ }))
    const sheet = screen.getByRole('dialog', { name: /Right now · June 2027/ })
    expect(within(sheet).getByText('From 1 Apr 2027 · ongoing')).toBeInTheDocument()
  })
})
