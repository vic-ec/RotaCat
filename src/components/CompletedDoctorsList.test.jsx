import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CompletedDoctorsList from './CompletedDoctorsList'
import { buildDoctorDisplayNames } from '../lib/doctorNames'

beforeEach(() => {
  vi.setSystemTime(new Date(2027, 6, 15)) // 15 Jul 2027
})
afterEach(() => vi.useRealTimers())

const INTERN = { id: 'intern-1', name: 'Ivy', surname: 'Intern', category: 'Intern', color_code: '#111' }
const REGISTRAR = { id: 'registrar-1', name: 'Rae', surname: 'Registrar', category: 'Registrar', color_code: '#222' }
const displayNames = buildDoctorDisplayNames([INTERN, REGISTRAR])

function renderList(overrides = {}) {
  const props = {
    doctors: [REGISTRAR, INTERN], // deliberately unsorted — sorted alphabetically by name
    displayNames,
    onReactivate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return { ...render(<CompletedDoctorsList {...props} />, { wrapper: MemoryRouter }), props }
}

describe('CompletedDoctorsList', () => {
  it('shows an empty state with no doctors', () => {
    renderList({ doctors: [] })
    expect(screen.getByText(/No completed doctors/)).toBeInTheDocument()
  })

  it('lists doctors sorted by name', () => {
    renderList()
    const names = screen.getAllByText(/Intern|Registrar/, { selector: 'span.font-medium' }).map(el => el.textContent)
    expect(names).toEqual(['Intern', 'Registrar'])
  })

  it('Reactivate defaults the date to today, and a today-or-earlier date labels the button "Activate now"', async () => {
    const user = userEvent.setup()
    renderList()
    const row = screen.getByText('Intern', { selector: 'span.font-medium' }).closest('div').parentElement.parentElement
    await user.click(within(row).getByRole('button', { name: 'Reactivate' }))
    expect(within(row).getByLabelText('Active from')).toHaveValue('2027-07-15')
    expect(within(row).getByRole('button', { name: 'Activate now' })).toBeInTheDocument()
  })

  it('confirming with a today-or-earlier date calls onReactivate with that date', async () => {
    const onReactivate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderList({ onReactivate })
    const row = screen.getByText('Intern', { selector: 'span.font-medium' }).closest('div').parentElement.parentElement
    await user.click(within(row).getByRole('button', { name: 'Reactivate' }))
    await user.click(within(row).getByRole('button', { name: 'Activate now' }))
    expect(onReactivate).toHaveBeenCalledWith('intern-1', '2027-07-15')
  })

  it('picking a future date relabels the button "Schedule" and calls onReactivate with that date', async () => {
    const onReactivate = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderList({ onReactivate })
    const row = screen.getByText('Intern', { selector: 'span.font-medium' }).closest('div').parentElement.parentElement
    await user.click(within(row).getByRole('button', { name: 'Reactivate' }))
    const dateInput = within(row).getByLabelText('Active from')
    await user.clear(dateInput)
    await user.type(dateInput, '2027-09-01')
    expect(within(row).getByRole('button', { name: 'Schedule' })).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Schedule' }))
    expect(onReactivate).toHaveBeenCalledWith('intern-1', '2027-09-01')
  })

  it('Cancel closes the reactivate form without calling onReactivate', async () => {
    const onReactivate = vi.fn()
    const user = userEvent.setup()
    renderList({ onReactivate })
    const row = screen.getByText('Intern', { selector: 'span.font-medium' }).closest('div').parentElement.parentElement
    await user.click(within(row).getByRole('button', { name: 'Reactivate' }))
    await user.click(within(row).getByRole('button', { name: 'Cancel' }))
    expect(onReactivate).not.toHaveBeenCalled()
    expect(within(row).queryByLabelText('Active from')).not.toBeInTheDocument()
  })

  it('tapping a row opens a detail sheet for that doctor, matching the Staff list page pattern', async () => {
    const user = userEvent.setup()
    renderList()
    const row = screen.getByText('Intern', { selector: 'span.font-medium' }).closest('div').parentElement.parentElement
    await user.click(row)
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Ivy Intern')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'View Account' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })

  it('the Reactivate button inside the row does not also open the detail sheet', async () => {
    const user = userEvent.setup()
    renderList()
    const row = screen.getByText('Intern', { selector: 'span.font-medium' }).closest('div').parentElement.parentElement
    await user.click(within(row).getByRole('button', { name: 'Reactivate' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Reactivate inside the detail sheet closes the sheet and opens the row\'s reactivate form', async () => {
    const user = userEvent.setup()
    renderList()
    const row = screen.getByText('Intern', { selector: 'span.font-medium' }).closest('div').parentElement.parentElement
    await user.click(row)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(row).getByLabelText('Active from')).toBeInTheDocument()
  })
})
