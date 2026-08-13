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
  { id: 'cosmo-1', name: 'Cara', surname: 'Cosmo', category: 'COSMO', color_code: '#333333' },
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
  it('renders month headers and groups rows by category (Intern / Registrar / COSMO)', () => {
    renderMatrix()
    expect(screen.getByText('Jan')).toBeInTheDocument()
    expect(screen.getByText('Dec')).toBeInTheDocument()
    expect(screen.getAllByText(/Intern/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Registrar/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/COSMO/).length).toBeGreaterThan(0)
    // Row labels use the disambiguated display name as their title, even
    // though the visible text truncates to the surname
    expect(screen.getByTitle('Ivy Intern')).toBeInTheDocument()
  })

  it('shows the 5-state legend', () => {
    renderMatrix()
    expect(screen.getAllByText('EC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OT · LRCHC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OT · DPM/BCH').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OT · Psych').length).toBeGreaterThan(0)
  })

  it('with nothing selected, the side panel groups current-month doctors by type', () => {
    // 15 Jun 2027 falls in intern-1's OT·LRCHC block and registrar-1's EC block
    renderMatrix()
    expect(screen.getByText(/right now/)).toBeInTheDocument()
    expect(screen.getAllByText('OT · LRCHC').length).toBeGreaterThan(0)
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
    expect(screen.getByText('2027-01-01 – 2027-03-31')).toBeInTheDocument()
    expect(screen.getByText('2027-04-01 – ongoing')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit rotations' }))
    expect(screen.getAllByText('From').length).toBeGreaterThan(0)
    expect(screen.getAllByText('To').length).toBeGreaterThan(0)
  })

  it('Registrar type dropdown only offers EC (no OT option)', async () => {
    const user = userEvent.setup()
    renderMatrix({ selectedDoctorId: 'registrar-1' })
    await user.click(screen.getByRole('button', { name: 'Edit rotations' }))
    // The combined type SelectMenu's trigger shows the current value ("EC")
    // — opening it must not offer any OT variant for a Registrar.
    const triggers = screen.getAllByRole('button', { expanded: false })
    const typeTrigger = triggers.find(b => within(b).queryByText('EC'))
    await user.click(typeTrigger)
    expect(screen.queryByRole('option', { name: /OT/ })).not.toBeInTheDocument()
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

  it('clicking a doctor chip in the no-selection panel selects them', async () => {
    const onSelectDoctor = vi.fn()
    const user = userEvent.setup()
    renderMatrix({ onSelectDoctor })
    const panel = screen.getByText(/right now/).closest('div')
    await user.click(within(panel).getByRole('button', { name: 'Intern' }))
    expect(onSelectDoctor).toHaveBeenCalledWith('intern-1')
  })

  it('category filter narrows the visible rows to the chosen category', async () => {
    const user = userEvent.setup()
    renderMatrix()
    // Toolbar mounts both its desktop and mobile rows in the DOM at once
    // (CSS, not JS, picks which one is visible) — jsdom applies no layout,
    // so both "Category" buttons exist; either fires the same onChange.
    await user.click(screen.getAllByRole('button', { name: 'Category' })[0])
    await user.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Intern' }))
    expect(screen.getByTitle('Ivy Intern')).toBeInTheDocument()
    expect(screen.queryByTitle('Rae Registrar')).not.toBeInTheDocument()
  })

  it('add-doctor flow: picking an unassigned doctor creates a first EC block, selects them, and opens edit mode', async () => {
    const onCreateRotation = vi.fn().mockResolvedValue(undefined)
    const onSelectDoctor = vi.fn()
    const user = userEvent.setup()
    renderMatrix({ onCreateRotation, onSelectDoctor })
    const cosmoHeading = screen.getByRole('button', { name: /COSMO/ })
    await user.click(within(cosmoHeading.parentElement).getByRole('button', { name: '+ Add doctor' }))
    const picker = screen.getByText(/Assign doctor/).closest('div').parentElement
    await user.click(within(picker).getByRole('button', { name: /Cosmo/ }))
    expect(onCreateRotation).toHaveBeenCalledWith(expect.objectContaining({
      doctorId: 'cosmo-1', rotationType: 'EC', subtype: null, startDate: '2027-06-15', endDate: null, createdBy: 'admin-1',
    }))
    expect(onSelectDoctor).toHaveBeenCalledWith('cosmo-1')
  })

  it('Today is hidden while already browsing the current year', () => {
    renderMatrix() // year: 2027, matches the pinned system date (15 Jun 2027)
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('Today appears once browsing a different year, and jumps back to the current one', async () => {
    const user = userEvent.setup()
    const onYearChange = vi.fn()
    renderMatrix({ year: 2026, onYearChange })
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

describe('InternRotationsMatrix — mobile layout', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }))
  })
  afterEach(() => { delete window.matchMedia })

  it('renders per-doctor cards instead of the 12-column grid', () => {
    renderMatrix()
    expect(screen.queryByText('Jan')).not.toBeInTheDocument()
    const internCard = screen.getByText('Intern', { selector: 'p' }).closest('button')
    expect(within(internCard).getByText('Jan – Dec 2027')).toBeInTheDocument()
  })

  it('tapping a card calls onSelectDoctor', async () => {
    const onSelectDoctor = vi.fn()
    const user = userEvent.setup()
    renderMatrix({ onSelectDoctor })
    const internCard = screen.getByText('Intern', { selector: 'p' }).closest('button')
    await user.click(internCard)
    expect(onSelectDoctor).toHaveBeenCalledWith('intern-1')
  })

  it('a selected doctor shows the bottom-sheet modal with their block list (no duplicate header chrome)', () => {
    renderMatrix({ selectedDoctorId: 'intern-1' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit rotations' })).toBeInTheDocument()
    // Modal supplies its own title + Close — the panel must not repeat them.
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
  })

  it('the FAB opens the add-doctor picker', async () => {
    const user = userEvent.setup()
    renderMatrix()
    await user.click(screen.getByRole('button', { name: 'Add doctor' }))
    expect(screen.getByText(/Assign doctor/)).toBeInTheDocument()
  })

  it('the year selector gets its own row below the search+filter/Legend/kebab row, left-aligned', () => {
    renderMatrix()
    // Toolbar mounts both its own internal desktop/mobile rows regardless
    // of viewport (jsdom applies no layout) — same reasoning as the
    // category filter test above; either instance proves the same DOM order.
    const search = screen.getAllByPlaceholderText('Search name…')[0]
    const legend = screen.getAllByRole('button', { name: 'Legend' })[0]
    const yearLabel = screen.getByText('2027')

    // Search comes before Legend (search left, filter/Legend/kebab right).
    // eslint-disable-next-line no-bitwise -- compareDocumentPosition is a bitmask API
    expect(search.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The year selector follows the whole toolbar row, on its own line below.
    // eslint-disable-next-line no-bitwise -- compareDocumentPosition is a bitmask API
    expect(legend.compareDocumentPosition(yearLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const sticky = yearLabel.closest('.sticky')
    expect(sticky.contains(search)).toBe(true)
    expect(sticky.contains(legend)).toBe(true)
    // Year selector isn't inside the same Toolbar component instance as
    // search/filter — it's a sibling row underneath, not nested within it.
    const toolbarRow = search.closest('.md\\:hidden, .md\\:flex')
    expect(toolbarRow.contains(yearLabel)).toBe(false)
  })
})
