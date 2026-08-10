import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EndOfRotationQueue from './EndOfRotationQueue'
import { buildDoctorDisplayNames } from '../lib/doctorNames'

beforeEach(() => {
  vi.setSystemTime(new Date(2027, 6, 15)) // 15 Jul 2027
})
afterEach(() => vi.useRealTimers())

const FLAGGED_INTERN = { id: 'intern-1', name: 'Ivy', surname: 'Intern', category: 'Intern' }
const OK_REGISTRAR = { id: 'registrar-1', name: 'Rae', surname: 'Registrar', category: 'Registrar' }
const COSMO_DOCTOR = { id: 'cosmo-1', name: 'Cara', surname: 'Cosmo', category: 'COSMO' }

const ROTATIONS = [
  // Ended 30 Jun 2027, nothing after it, today (15 Jul) is past the 1st of the ending month -> flagged
  { doctor_id: 'intern-1', rotation_type: 'OT', subtype: 'PSYCH', start_date: '2027-04-01', end_date: '2027-06-30' },
  // Ongoing (null end_date) -> never flagged
  { doctor_id: 'registrar-1', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: null },
  // Also ended, but COSMO is out of scope entirely
  { doctor_id: 'cosmo-1', rotation_type: 'OT', subtype: 'LRCHC', start_date: '2027-01-01', end_date: '2027-06-30' },
]
const displayNames = buildDoctorDisplayNames([FLAGGED_INTERN, OK_REGISTRAR, COSMO_DOCTOR])

function renderQueue(overrides = {}) {
  const props = {
    doctors: [FLAGGED_INTERN, OK_REGISTRAR, COSMO_DOCTOR],
    rotations: ROTATIONS,
    displayNames,
    onScheduleDeactivation: vi.fn().mockResolvedValue(undefined),
    onViewInMatrix: vi.fn(),
    ...overrides,
  }
  return { ...render(<EndOfRotationQueue {...props} />), props }
}

describe('EndOfRotationQueue', () => {
  it('renders nothing when no doctor is flagged', () => {
    const { container } = renderQueue({ rotations: [ROTATIONS[1]] }) // only the ongoing Registrar block
    expect(container).toBeEmptyDOMElement()
  })

  it('lists only the flagged Intern — not the ongoing Registrar or the out-of-scope COSMO', () => {
    renderQueue()
    expect(screen.getByText('Intern')).toBeInTheDocument()
    expect(screen.queryByText('Registrar')).not.toBeInTheDocument()
    expect(screen.queryByText('Cosmo')).not.toBeInTheDocument()
    expect(screen.getByText(/ended 30 Jun/)).toBeInTheDocument()
  })

  it('View in Matrix calls onViewInMatrix with the doctor id', async () => {
    const onViewInMatrix = vi.fn()
    renderQueue({ onViewInMatrix })
    await userEvent.setup().click(screen.getByRole('button', { name: 'View in Matrix' }))
    expect(onViewInMatrix).toHaveBeenCalledWith('intern-1')
  })

  it('Schedule deactivation defaults the date to the day after the block ended, and Confirm calls onScheduleDeactivation', async () => {
    const onScheduleDeactivation = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderQueue({ onScheduleDeactivation })
    await user.click(screen.getByRole('button', { name: 'Schedule deactivation' }))
    expect(screen.getByLabelText(/Inactive from/)).toHaveValue('2027-07-01')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onScheduleDeactivation).toHaveBeenCalledWith('intern-1', '2027-07-01')
  })

  it('Cancel closes the date picker without calling onScheduleDeactivation', async () => {
    const onScheduleDeactivation = vi.fn()
    const user = userEvent.setup()
    renderQueue({ onScheduleDeactivation })
    await user.click(screen.getByRole('button', { name: 'Schedule deactivation' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onScheduleDeactivation).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/Inactive from/)).not.toBeInTheDocument()
  })

  it('excludes a doctor who already has a scheduled deactivation', () => {
    renderQueue({
      doctors: [{ ...FLAGGED_INTERN, scheduled_inactive_date: '2027-07-01' }, OK_REGISTRAR, COSMO_DOCTOR],
    })
    expect(screen.queryByText('Intern')).not.toBeInTheDocument()
  })
})
