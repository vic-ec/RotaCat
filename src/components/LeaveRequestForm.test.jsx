import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeaveRequestForm from './LeaveRequestForm'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'doctor-1' }, isAdmin: false }),
}))

const submitLeaveRequest = vi.fn()
vi.mock('../lib/leaveRequests', async () => {
  const actual = await vi.importActual('../lib/leaveRequests')
  return { ...actual, submitLeaveRequest: (...args) => submitLeaveRequest(...args) }
})

describe('LeaveRequestForm', () => {
  beforeEach(() => {
    submitLeaveRequest.mockReset()
  })

  it('submits a normal annual leave request with the entered date range', async () => {
    submitLeaveRequest.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.type(screen.getByLabelText('From'), '2026-08-10')
    await user.type(screen.getByLabelText('To'), '2026-08-14')
    await user.type(screen.getByLabelText('How many days will be taken as annual leave?'), '5')
    await user.click(screen.getByRole('button', { name: /submit request/i }))

    await waitFor(() => expect(submitLeaveRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'doctor-1',
        isAdmin: false,
        leaveType: 'annual',
        dateFrom: '2026-08-10',
        dateTo: '2026-08-14',
        annualLeaveDays: 5,
      })
    ))
    expect(await screen.findByText(/5 total days \(5 annual leave\)/i)).toBeInTheDocument()
  })

  it('shows the block error inline when submission is rejected (e.g. double-booking)', async () => {
    submitLeaveRequest.mockRejectedValue(new Error('This date range overlaps an existing leave request.'))
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.type(screen.getByLabelText('From'), '2026-08-10')
    await user.type(screen.getByLabelText('To'), '2026-08-14')
    await user.type(screen.getByLabelText('How many days will be taken as annual leave?'), '5')
    await user.click(screen.getByRole('button', { name: /submit request/i }))

    expect(await screen.findByText(/overlaps an existing leave request/i)).toBeInTheDocument()
  })

  it('auto-fills Sunday when a Saturday is picked for a weekend exception', async () => {
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    // Switch leave type via the app's own SelectMenu (button + listbox, not a native <select>)
    await user.click(screen.getByText('Annual leave'))
    await user.click(await screen.findByRole('option', { name: 'Weekend exception' }))

    const saturdayInput = screen.getByLabelText('Saturday')
    await user.type(saturdayInput, '2026-08-01') // a Saturday

    submitLeaveRequest.mockResolvedValue(undefined)
    await user.click(screen.getByRole('button', { name: /submit request/i }))

    await waitFor(() => expect(submitLeaveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ leaveType: 'weekend_exception', dateFrom: '2026-08-01', dateTo: '2026-08-02' })
    ))
  })
})
