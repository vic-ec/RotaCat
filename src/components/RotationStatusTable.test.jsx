import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RotationStatusTable from './RotationStatusTable'

// Pinned so "today" (the default reactivation date, and which rotation
// counts as upcoming) doesn't drift with the real clock.
beforeEach(() => { vi.setSystemTime(new Date(2026, 10, 15)) }) // 15 Nov 2026
afterEach(() => vi.useRealTimers())

const DOCTORS = [
  { id: 'reg-1', name: 'Thandi', surname: 'Mokoena', category: 'Registrar', scheduled_active_date: '2027-01-01' },
  { id: 'int-1', name: 'Sipho', surname: 'Dlamini', category: 'Intern', scheduled_active_date: '2027-02-01' },
]
const ROTATIONS = [
  { id: 'r1', doctor_id: 'reg-1', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-03-31' },
  { id: 'r0', doctor_id: 'int-1', rotation_type: 'OT', subtype: 'PSYCH', start_date: '2026-01-01', end_date: '2026-06-30' },
]

function renderTable(props = {}) {
  const handlers = {
    onUpdateDate: vi.fn().mockResolvedValue(undefined),
    onActivateNow: vi.fn().mockResolvedValue(undefined),
    onReactivate: vi.fn().mockResolvedValue(undefined),
    onEditRotation: vi.fn(),
  }
  render(
    <MemoryRouter>
      <RotationStatusTable variant="upcoming" doctors={DOCTORS} rotations={ROTATIONS} {...handlers} {...props} />
    </MemoryRouter>
  )
  return handlers
}

describe('RotationStatusTable', () => {
  it('upcoming: columns, Registrar and Intern sections, start date and upcoming rotation', () => {
    renderTable()
    for (const heading of ['Doctor', 'Category', 'Status', 'Due to start', 'Upcoming rotation']) {
      expect(screen.getByRole('columnheader', { name: heading })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /Registrar 1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Intern 1/ })).toBeInTheDocument()
    const row = screen.getByRole('button', { name: 'Mokoena' }).closest('tr')
    expect(within(row).getByText('1 Jan 2027')).toBeInTheDocument()
    expect(within(row).getByText('EC · 1 Jan 2027 – 31 Mar 2027')).toBeInTheDocument()
  })

  it('folds a section from its header', async () => {
    const user = userEvent.setup()
    renderTable()
    await user.click(screen.getByRole('button', { name: /Registrar 1/ }))
    expect(screen.queryByRole('button', { name: 'Mokoena' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dlamini' })).toBeInTheDocument()
  })

  it('upcoming: selecting a row fills the panel, with Edit rotation, Change start date and Activate now', async () => {
    const user = userEvent.setup()
    const handlers = renderTable()
    expect(screen.getByText('Select a doctor to see their details and actions.')).toBeInTheDocument()

    // anywhere on the row selects it
    await user.click(screen.getByRole('button', { name: 'Mokoena' }).closest('tr').lastElementChild)
    expect(screen.getByRole('button', { name: 'Mokoena' }).closest('tr')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Thandi Mokoena')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit rotation' }))
    expect(handlers.onEditRotation).toHaveBeenCalledWith('reg-1')

    await user.click(screen.getByRole('button', { name: 'Activate now' }))
    expect(handlers.onActivateNow).toHaveBeenCalledWith('reg-1')

    await user.click(screen.getByRole('button', { name: 'Change start date' }))
    await user.click(screen.getByRole('button', { name: 'Save start date' }))
    expect(handlers.onUpdateDate).toHaveBeenCalledWith('reg-1', '2027-01-01')
  })

  it('completed: last active comes from the last rotation, and Reactivate defaults to today', async () => {
    const user = userEvent.setup()
    const completed = [{ id: 'int-1', name: 'Sipho', surname: 'Dlamini', category: 'Intern', scheduled_active_date: null }]
    const handlers = renderTable({ variant: 'completed', doctors: completed })
    expect(screen.getByRole('columnheader', { name: 'Last active' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Last rotation' })).toBeInTheDocument()
    const row = screen.getByRole('button', { name: 'Dlamini' }).closest('tr')
    expect(within(row).getByText('30 Jun 2026')).toBeInTheDocument()
    expect(within(row).getByText('OT · Psych · 1 Jan 2026 – 30 Jun 2026')).toBeInTheDocument()

    await user.click(row)
    await user.click(screen.getByRole('button', { name: 'Reactivate' }))
    await user.click(screen.getByRole('button', { name: 'Activate now' }))
    expect(handlers.onReactivate).toHaveBeenCalledWith('int-1', '2026-11-15')
  })

  it('shows a failed action in the panel and keeps the selection', async () => {
    const user = userEvent.setup()
    renderTable({ onActivateNow: vi.fn().mockRejectedValue(new Error('Could not activate')) })
    await user.click(screen.getByRole('button', { name: 'Mokoena' }))
    await user.click(screen.getByRole('button', { name: 'Activate now' }))
    expect(await screen.findByText('Could not activate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mokoena' }).closest('tr')).toHaveAttribute('aria-selected', 'true')
  })

  it('says so when there is nobody to list', () => {
    renderTable({ doctors: [] })
    expect(screen.getByText('No doctors with a scheduled start date.')).toBeInTheDocument()
  })
})
