import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RotationStatusTable from './RotationStatusTable'

// Pinned so "today" (the default reactivation date, and which rotation
// counts as upcoming) doesn't drift with the real clock.
beforeEach(() => { vi.setSystemTime(new Date(2026, 10, 15)) }) // 15 Nov 2026
afterEach(() => vi.useRealTimers())

const UPCOMING_DOCTORS = [
  { id: 'reg-1', name: 'Thandi', surname: 'Mokoena', category: 'Registrar', scheduled_active_date: '2027-01-01' },
  { id: 'int-1', name: 'Sipho', surname: 'Dlamini', category: 'Intern', scheduled_active_date: '2027-02-01' },
]
const UPCOMING_ROTATIONS = [
  { id: 'r1', doctor_id: 'reg-1', rotation_type: 'EC', subtype: null, start_date: '2027-01-01', end_date: '2027-03-31' },
]

function renderTable(props = {}) {
  const handlers = {
    onUpdateDate: vi.fn().mockResolvedValue(undefined),
    onActivateNow: vi.fn().mockResolvedValue(undefined),
    onReactivate: vi.fn().mockResolvedValue(undefined),
    onEditRotation: vi.fn(),
    onYearChange: vi.fn(),
  }
  const view = render(
    <MemoryRouter>
      <RotationStatusTable
        variant="upcoming"
        doctors={UPCOMING_DOCTORS}
        rotations={UPCOMING_ROTATIONS}
        year={2027}
        {...handlers}
        {...props}
      />
    </MemoryRouter>
  )
  return { ...handlers, ...view }
}

// The row's own name button shares its title with the panel's heading
// once that doctor is selected — [0] is always the row (it mounts first
// in document order).
function rowFor(name) {
  return screen.getAllByTitle(name)[0].closest('[aria-selected]')
}

describe('RotationStatusTable — upcoming', () => {
  it('groups by fixed category, shows the scheduled-start chip and the first block\'s position line', () => {
    renderTable()
    expect(screen.getByRole('button', { name: /Registrars 1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Interns 1/ })).toBeInTheDocument()
    const row = screen.getByTitle('Thandi Mokoena').closest('[aria-selected]')
    expect(within(row).getByText('Starts 1 Jan')).toBeInTheDocument()
    expect(within(row).getByText('EC for 3 months · ends 31 Mar')).toBeInTheDocument()
  })

  it('a doctor with no rotations yet shows the "not added" line', () => {
    renderTable()
    const row = screen.getByTitle('Sipho Dlamini').closest('[aria-selected]')
    expect(within(row).getByText('No rotations added yet')).toBeInTheDocument()
  })

  it('lists every upcoming doctor regardless of the displayed year', () => {
    renderTable({ year: 2030 }) // far from either doctor's own dates
    expect(screen.getByTitle('Thandi Mokoena')).toBeInTheDocument()
    expect(screen.getByTitle('Sipho Dlamini')).toBeInTheDocument()
  })

  it('folds a section from its header', async () => {
    const user = userEvent.setup()
    renderTable()
    await user.click(screen.getByRole('button', { name: /Registrars 1/ }))
    expect(screen.queryByTitle('Thandi Mokoena')).not.toBeInTheDocument()
    expect(screen.getByTitle('Sipho Dlamini')).toBeInTheDocument()
  })

  it('offers Expand all only once every section is folded, and reopens them', async () => {
    const user = userEvent.setup()
    renderTable()
    expect(screen.queryByRole('button', { name: /Expand all/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Registrars 1/ }))
    expect(screen.queryByRole('button', { name: /Expand all/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Interns 1/ }))

    await user.click(screen.getByRole('button', { name: /Expand all/ }))
    expect(screen.getByTitle('Thandi Mokoena')).toBeInTheDocument()
    expect(screen.getByTitle('Sipho Dlamini')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Expand all/ })).not.toBeInTheDocument()
  })

  it('selecting fills the panel, with Edit rotation, Change start date and Activate now', async () => {
    const user = userEvent.setup()
    const handlers = renderTable()
    expect(screen.getByText('Select a doctor to see their details and actions.')).toBeInTheDocument()

    await user.click(screen.getByTitle('Thandi Mokoena').closest('[aria-selected]'))
    expect(rowFor('Thandi Mokoena')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Thandi Mokoena')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit rotation' }))
    expect(handlers.onEditRotation).toHaveBeenCalledWith('reg-1')

    await user.click(screen.getByRole('button', { name: 'Activate now' }))
    expect(handlers.onActivateNow).toHaveBeenCalledWith('reg-1')

    await user.click(screen.getByRole('button', { name: 'Change start date' }))
    await user.click(screen.getByRole('button', { name: 'Save start date' }))
    expect(handlers.onUpdateDate).toHaveBeenCalledWith('reg-1', '2027-01-01')
  })

  it('shows a failed action in the panel and keeps the selection', async () => {
    const user = userEvent.setup()
    renderTable({ onActivateNow: vi.fn().mockRejectedValue(new Error('Could not activate')) })
    await user.click(screen.getByTitle('Thandi Mokoena').closest('[aria-selected]'))
    await user.click(screen.getByRole('button', { name: 'Activate now' }))
    expect(await screen.findByText('Could not activate')).toBeInTheDocument()
    expect(rowFor('Thandi Mokoena')).toHaveAttribute('aria-selected', 'true')
  })

  it('says so when there is nobody to list', () => {
    renderTable({ doctors: [] })
    expect(screen.getByText('No doctors with a scheduled start date.')).toBeInTheDocument()
  })

  it('Today is hidden on the current year and shown once browsing away from it', () => {
    const { rerender } = renderTable({ year: 2026 }) // matches the pinned system date
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <RotationStatusTable
          variant="upcoming" doctors={UPCOMING_DOCTORS} rotations={UPCOMING_ROTATIONS} year={2027}
          onUpdateDate={vi.fn()} onActivateNow={vi.fn()} onReactivate={vi.fn()} onEditRotation={vi.fn()} onYearChange={vi.fn()}
        />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
  })
})

describe('RotationStatusTable — completed', () => {
  const COMPLETED_DOCTORS = [
    { id: 'int-1', name: 'Sipho', surname: 'Dlamini', category: 'Intern', scheduled_active_date: null },
  ]
  const COMPLETED_ROTATIONS = [
    { id: 'r0', doctor_id: 'int-1', rotation_type: 'OT', subtype: 'PSYCH', start_date: '2026-01-01', end_date: '2026-06-30' },
  ]

  function renderCompleted(props = {}) {
    return renderTable({
      variant: 'completed', doctors: COMPLETED_DOCTORS, rotations: COMPLETED_ROTATIONS, year: 2026, ...props,
    })
  }

  it('shows the finished-date chip and the total time in post, and Reactivate defaults to today', async () => {
    const user = userEvent.setup()
    const handlers = renderCompleted()
    const row = screen.getByTitle('Sipho Dlamini').closest('[aria-selected]')
    expect(within(row).getByText('Finished 30 Jun')).toBeInTheDocument()
    expect(within(row).getByText('6 months in Psych')).toBeInTheDocument()

    await user.click(row)
    await user.click(screen.getByRole('button', { name: 'Reactivate' }))
    await user.click(screen.getByRole('button', { name: 'Activate now' }))
    expect(handlers.onReactivate).toHaveBeenCalledWith('int-1', '2026-11-15')
  })

  it('scopes the list to doctors whose last rotation ended in the displayed year', () => {
    renderCompleted({ year: 2025 }) // Dlamini's last rotation ended in 2026
    expect(screen.queryByTitle('Sipho Dlamini')).not.toBeInTheDocument()
  })

  it('a doctor with no rotation rows at all appears every year, in its own section', () => {
    const noRotations = [{ id: 'int-2', name: 'Lindiwe', surname: 'Zulu', category: 'Intern', scheduled_active_date: null }]
    renderCompleted({ doctors: [...COMPLETED_DOCTORS, ...noRotations], year: 2019 })
    expect(screen.getByRole('button', { name: /No rotations recorded 1/ })).toBeInTheDocument()
    expect(screen.getByTitle('Lindiwe Zulu')).toBeInTheDocument()
    expect(screen.queryByTitle('Sipho Dlamini')).not.toBeInTheDocument() // scoped out of 2019
    const row = rowFor('Lindiwe Zulu')
    expect(within(row).getByText('No rotations recorded')).toBeInTheDocument()
  })

  it('View account navigates to the account page', async () => {
    const user = userEvent.setup()
    renderCompleted()
    await user.click(screen.getByTitle('Sipho Dlamini').closest('[aria-selected]'))
    expect(screen.getByRole('button', { name: 'View account' })).toBeInTheDocument()
  })

  it('Edit rotation is available without reactivating', async () => {
    const user = userEvent.setup()
    const handlers = renderCompleted()
    await user.click(screen.getByTitle('Sipho Dlamini').closest('[aria-selected]'))
    await user.click(screen.getByRole('button', { name: 'Edit rotation' }))
    expect(handlers.onEditRotation).toHaveBeenCalledWith('int-1')
    expect(handlers.onReactivate).not.toHaveBeenCalled()
  })
})
