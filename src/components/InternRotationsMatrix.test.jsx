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
    // Row labels use the disambiguated display name, not a bare surname assumption
    expect(screen.getByRole('button', { name: 'Intern' })).toBeInTheDocument()
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
    await userEvent.setup().click(screen.getByRole('button', { name: 'Intern' }))
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
})
