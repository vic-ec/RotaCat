import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UpcomingDoctorsList from './UpcomingDoctorsList'
import { buildDoctorDisplayNames } from '../lib/doctorNames'

beforeEach(() => {
  vi.setSystemTime(new Date(2027, 6, 15)) // 15 Jul 2027
})
afterEach(() => vi.useRealTimers())

const INTERN = { id: 'intern-1', name: 'Ivy', surname: 'Intern', category: 'Intern', color_code: '#111', scheduled_active_date: '2027-08-01' }
const REGISTRAR = { id: 'registrar-1', name: 'Rae', surname: 'Registrar', category: 'Registrar', color_code: '#222', scheduled_active_date: '2027-09-01' }
const displayNames = buildDoctorDisplayNames([INTERN, REGISTRAR])

function renderList(overrides = {}) {
  const props = {
    doctors: [REGISTRAR, INTERN], // deliberately unsorted — sorted by scheduled_active_date
    displayNames,
    onUpdateDate: vi.fn().mockResolvedValue(undefined),
    onActivateNow: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return { ...render(<UpcomingDoctorsList {...props} />), props }
}

describe('UpcomingDoctorsList', () => {
  it('shows an empty state with no doctors', () => {
    renderList({ doctors: [] })
    expect(screen.getByText(/No doctors with a scheduled start date/)).toBeInTheDocument()
  })

  it('lists doctors sorted by scheduled start date, with the date shown', () => {
    renderList()
    const names = screen.getAllByText(/Intern|Registrar/, { selector: 'span.font-medium' }).map(el => el.textContent)
    expect(names).toEqual(['Intern', 'Registrar']) // Intern starts 1 Aug, before Registrar's 1 Sep
    expect(screen.getByText('Starts 2027-08-01')).toBeInTheDocument()
    expect(screen.getByText('Starts 2027-09-01')).toBeInTheDocument()
  })

  it('Activate now calls onActivateNow with the doctor id', async () => {
    const onActivateNow = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderList({ onActivateNow })
    const row = screen.getByText('Starts 2027-08-01').closest('div')
    await user.click(within(row).getByRole('button', { name: 'Activate now' }))
    expect(onActivateNow).toHaveBeenCalledWith('intern-1')
  })

  it('Edit date reveals a date input pre-filled with the current schedule, and Save calls onUpdateDate', async () => {
    const onUpdateDate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderList({ onUpdateDate })
    const editButtons = screen.getAllByRole('button', { name: 'Edit date' })
    await user.click(editButtons[0]) // Intern (sorted first)
    expect(screen.getByLabelText('Starts')).toHaveValue('2027-08-01')
    await user.clear(screen.getByLabelText('Starts'))
    await user.type(screen.getByLabelText('Starts'), '2027-08-15')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onUpdateDate).toHaveBeenCalledWith('intern-1', '2027-08-15')
  })

  it('Cancel closes the date editor without calling onUpdateDate', async () => {
    const onUpdateDate = vi.fn()
    const user = userEvent.setup()
    renderList({ onUpdateDate })
    await user.click(screen.getAllByRole('button', { name: 'Edit date' })[0])
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onUpdateDate).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Starts')).not.toBeInTheDocument()
  })
})
