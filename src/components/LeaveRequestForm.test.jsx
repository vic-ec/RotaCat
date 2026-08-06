import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeaveRequestForm from './LeaveRequestForm'

let mockAuth = { profile: { id: 'doctor-1' }, isAdmin: false }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const submitLeaveRequest = vi.fn()
const fetchAnnualCapacityPreview = vi.fn()
const fetchSpecialLeavePressure = vi.fn()
const fetchWeekendExceptionPreview = vi.fn()
vi.mock('../lib/leaveRequests', async () => {
  const actual = await vi.importActual('../lib/leaveRequests')
  return {
    ...actual,
    submitLeaveRequest: (...args) => submitLeaveRequest(...args),
    fetchAnnualCapacityPreview: (...args) => fetchAnnualCapacityPreview(...args),
    fetchSpecialLeavePressure: (...args) => fetchSpecialLeavePressure(...args),
    fetchWeekendExceptionPreview: (...args) => fetchWeekendExceptionPreview(...args),
  }
})

describe('LeaveRequestForm', () => {
  beforeEach(() => {
    mockAuth = { profile: { id: 'doctor-1' }, isAdmin: false }
    submitLeaveRequest.mockReset()
    fetchAnnualCapacityPreview.mockReset().mockResolvedValue(null)
    fetchSpecialLeavePressure.mockReset().mockResolvedValue(null)
    fetchWeekendExceptionPreview.mockReset().mockResolvedValue(null)
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

  it('annual leave: shows the shared capacity banner once both dates are picked, reusing LeaveCapacityBanner\'s own wording', async () => {
    mockAuth = { profile: { id: 'doctor-1', category: 'MO' }, isAdmin: false }
    fetchAnnualCapacityPreview.mockResolvedValue({ date: '2026-08-12', taken: 1, max: 2, atCapacity: false, columnLabel: 'MO' })
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.type(screen.getByLabelText('From'), '2026-08-10')
    await user.type(screen.getByLabelText('To'), '2026-08-14')

    expect(await screen.findByText('1 of 2 slots taken')).toBeInTheDocument()
    expect(screen.getByText('1 leave slot available for MO')).toBeInTheDocument()
    expect(fetchAnnualCapacityPreview).toHaveBeenCalledWith({ dateFrom: '2026-08-10', dateTo: '2026-08-14', category: 'MO', profileId: 'doctor-1' })
  })

  it('annual leave: shows no banner once the preview resolves null (e.g. a category with no capacity column)', async () => {
    fetchAnnualCapacityPreview.mockResolvedValue(null)
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.type(screen.getByLabelText('From'), '2026-08-10')
    await user.type(screen.getByLabelText('To'), '2026-08-14')

    await waitFor(() => expect(fetchAnnualCapacityPreview).toHaveBeenCalled())
    expect(screen.queryByText(/slots taken/)).not.toBeInTheDocument()
  })

  it('special leave: shows an amber advisory once pressure is over the soft cap, without disabling submission', async () => {
    fetchSpecialLeavePressure.mockResolvedValue({ date: '2026-08-12', count: 4, softCap: 3, overSoftCap: true })
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.click(screen.getByText('Annual leave'))
    await user.click(await screen.findByRole('option', { name: 'Special leave' }))
    await user.type(screen.getByLabelText('From'), '2026-08-10')
    await user.type(screen.getByLabelText('To'), '2026-08-14')

    expect(await screen.findByText(/4 doctors already have special leave requests/)).toBeInTheDocument()
    expect(screen.getByText(/above the informal guideline of 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit request/i })).not.toBeDisabled()
  })

  it('special leave: shows no advisory when pressure is under the soft cap', async () => {
    fetchSpecialLeavePressure.mockResolvedValue({ date: '2026-08-12', count: 1, softCap: 3, overSoftCap: false })
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.click(screen.getByText('Annual leave'))
    await user.click(await screen.findByRole('option', { name: 'Special leave' }))
    await user.type(screen.getByLabelText('From'), '2026-08-10')
    await user.type(screen.getByLabelText('To'), '2026-08-14')

    await waitFor(() => expect(fetchSpecialLeavePressure).toHaveBeenCalled())
    expect(screen.queryByText(/already have special leave requests/)).not.toBeInTheDocument()
  })

  it('weekend exception: shows the static alternation-pattern note as soon as a Saturday is picked, before the coverage read resolves', async () => {
    fetchWeekendExceptionPreview.mockReturnValue(new Promise(() => {})) // never resolves
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.click(screen.getByText('Annual leave'))
    await user.click(await screen.findByRole('option', { name: 'Weekend exception' }))
    await user.type(screen.getByLabelText('Saturday'), '2026-08-01')

    expect(await screen.findByText(/pulls the doctor out of the strict day\/night alternation pattern/)).toBeInTheDocument()
    expect(fetchWeekendExceptionPreview).toHaveBeenCalledWith({ saturday: '2026-08-01' })
    expect(screen.queryByText(/groups planned/)).not.toBeInTheDocument()
  })

  it('weekend exception: adds the live coverage read once it resolves, and never disables submission', async () => {
    fetchWeekendExceptionPreview.mockResolvedValue({ health: 'amber', filledGroups: 3, totalGroups: 4 })
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.click(screen.getByText('Annual leave'))
    await user.click(await screen.findByRole('option', { name: 'Weekend exception' }))
    await user.type(screen.getByLabelText('Saturday'), '2026-08-01')

    expect(await screen.findByText('This weekend is currently 3 of 4 groups planned.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit request/i })).not.toBeDisabled()
  })

  it('weekend exception: shows no advisory before a Saturday is picked', async () => {
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.click(screen.getByText('Annual leave'))
    await user.click(await screen.findByRole('option', { name: 'Weekend exception' }))

    expect(screen.queryByText(/pulls the doctor out of the strict day\/night alternation pattern/)).not.toBeInTheDocument()
    expect(fetchWeekendExceptionPreview).not.toHaveBeenCalled()
  })
})
