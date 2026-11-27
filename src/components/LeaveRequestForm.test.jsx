import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
const fetchLeaveCaptureCandidates = vi.fn()
const fetchRosterOverlapShifts = vi.fn()
const fetchActiveLeaveForProfile = vi.fn()
vi.mock('../lib/leaveRequests', async () => {
  const actual = await vi.importActual('../lib/leaveRequests')
  return {
    ...actual,
    submitLeaveRequest: (...args) => submitLeaveRequest(...args),
    fetchAnnualCapacityPreview: (...args) => fetchAnnualCapacityPreview(...args),
    fetchSpecialLeavePressure: (...args) => fetchSpecialLeavePressure(...args),
    fetchWeekendExceptionPreview: (...args) => fetchWeekendExceptionPreview(...args),
    fetchLeaveCaptureCandidates: (...args) => fetchLeaveCaptureCandidates(...args),
    fetchRosterOverlapShifts: (...args) => fetchRosterOverlapShifts(...args),
    fetchActiveLeaveForProfile: (...args) => fetchActiveLeaveForProfile(...args),
  }
})

describe('LeaveRequestForm', () => {
  beforeEach(() => {
    mockAuth = { profile: { id: 'doctor-1' }, isAdmin: false }
    submitLeaveRequest.mockReset()
    fetchAnnualCapacityPreview.mockReset().mockResolvedValue(null)
    fetchSpecialLeavePressure.mockReset().mockResolvedValue(null)
    fetchWeekendExceptionPreview.mockReset().mockResolvedValue(null)
    fetchLeaveCaptureCandidates.mockReset().mockResolvedValue([
      { id: 'doctor-2', name: 'Sam', surname: 'Rivers', category: 'MO', is_active: true, scheduled_active_date: null },
    ])
    fetchRosterOverlapShifts.mockReset().mockResolvedValue([])
    fetchActiveLeaveForProfile.mockReset().mockResolvedValue([])
  })

  it('a doctor gets no "Leave for" picker', () => {
    render(<LeaveRequestForm />)
    expect(screen.queryByLabelText('Leave for')).not.toBeInTheDocument()
    expect(fetchLeaveCaptureCandidates).not.toHaveBeenCalled()
  })

  it('Cancel sits to the right of Submit when the form can be closed', async () => {
    const onCancel = vi.fn()
    render(<LeaveRequestForm onCancel={onCancel} />)
    const buttons = screen.getAllByRole('button').filter(b => ['Submit request', 'Cancel'].includes(b.textContent))
    expect(buttons.map(b => b.textContent)).toEqual(['Submit request', 'Cancel'])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('no Cancel without somewhere to close to', () => {
    render(<LeaveRequestForm />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('an admin defaults to themself and files an ordinary request', async () => {
    mockAuth = { profile: { id: 'admin-1' }, isAdmin: true, canSubmitLeave: true }
    render(<LeaveRequestForm />)
    expect(await screen.findByLabelText('Leave for')).toHaveTextContent('Myself')
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeInTheDocument()
  })

  it('an admin captures sick leave for another doctor: warned about the roster, filed under the doctor with capturedBy', async () => {
    mockAuth = { profile: { id: 'admin-1' }, isAdmin: true, canSubmitLeave: true }
    fetchRosterOverlapShifts.mockResolvedValue([{ date: '2026-11-20', rosterMonthId: 'rm-nov' }])
    submitLeaveRequest.mockResolvedValue({ overCapacity: false, captured: true, rosterOverlapDates: ['2026-11-20'] })
    const user = userEvent.setup()
    render(<LeaveRequestForm captureOnly initialLeaveType="sick" />)

    // Opened as a capture: nobody chosen yet, so nothing can be filed.
    const picker = await screen.findByLabelText('Leave for')
    expect(picker).toHaveTextContent('Choose a doctor…')
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeDisabled()

    await user.click(picker)
    expect(screen.queryByRole('option', { name: 'Myself' })).not.toBeInTheDocument()
    await user.click(await screen.findByText('Rivers, Sam'))

    await user.type(screen.getByLabelText('From'), '2026-11-20')
    await user.type(screen.getByLabelText('To'), '2026-11-20')
    expect(await screen.findByTestId('roster-overlap-note')).toHaveTextContent('Rostered on 20 Nov — capturing leave will not remove the shift.')
    // The warning links to that day on the roster, in a new tab.
    const rosterLink = screen.getByRole('link', { name: 'Arrange cover: 20 Nov' })
    expect(rosterLink).toHaveAttribute('href', '/roster/rm-nov?date=2026-11-20&doctor=doctor-2&mode=edit&cover=1')
    expect(rosterLink).toHaveAttribute('target', '_blank')

    await user.click(screen.getByRole('button', { name: 'Capture leave' }))
    await waitFor(() => expect(submitLeaveRequest).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'doctor-2', capturedBy: 'admin-1', leaveType: 'sick', dateFrom: '2026-11-20', dateTo: '2026-11-20',
    })))
    expect(await screen.findByText(/Leave captured for Sam Rivers and approved\./)).toBeInTheDocument()
    // The link survives the form reset, so the shift can still be reached.
    expect(screen.getByRole('link', { name: 'Arrange cover: 20 Nov' })).toHaveAttribute('href', '/roster/rm-nov?date=2026-11-20&doctor=doctor-2&mode=edit&cover=1')
  })

  it('the doctor picker filters as the admin types a name, and Enter picks the first match', async () => {
    mockAuth = { profile: { id: 'admin-1' }, isAdmin: true, canSubmitLeave: true }
    fetchLeaveCaptureCandidates.mockResolvedValue([
      { id: 'doctor-2', name: 'Sam', surname: 'Rivers', category: 'MO', is_active: true },
      { id: 'doctor-3', name: 'Omar', surname: 'Khan', category: 'MO', is_active: true },
    ])
    const user = userEvent.setup()
    render(<LeaveRequestForm captureOnly initialLeaveType="sick" />)
    const picker = await screen.findByLabelText('Leave for')
    await user.click(picker)
    await user.type(await screen.findByPlaceholderText('Type a name…'), 'oma')
    expect(screen.getByRole('option', { name: 'Khan, Omar' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Rivers, Sam' })).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(picker).toHaveTextContent('Khan, Omar')
  })

  it('a capture shows the leave already on record once the doctor is chosen, and stops a duplicate before it is submitted', async () => {
    mockAuth = { profile: { id: 'admin-1' }, isAdmin: true, canSubmitLeave: true }
    fetchActiveLeaveForProfile.mockResolvedValue([
      { id: 'lr-1', leave_type: 'sick', date_from: '2099-11-20', date_to: '2099-11-20', status: 'approved', submitted_by: 'admin-2' },
    ])
    const user = userEvent.setup()
    render(<LeaveRequestForm captureOnly initialLeaveType="sick" />)
    await user.click(await screen.findByLabelText('Leave for'))
    await user.click(await screen.findByText('Rivers, Sam'))

    // Visible before any date is entered.
    expect(await screen.findByTestId('leave-on-record')).toHaveTextContent('Sick leave, 20 Nov (approved)')
    expect(fetchActiveLeaveForProfile).toHaveBeenCalledWith('doctor-2')
    expect(screen.queryByTestId('leave-overlap-note')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('From'), '2099-11-20')
    await user.type(screen.getByLabelText('To'), '2099-11-21')
    expect(await screen.findByTestId('leave-overlap-note')).toHaveTextContent('Already captured: Sick leave, 20 Nov (approved).')
    expect(screen.getByRole('button', { name: 'Capture leave' })).toBeDisabled()
    expect(submitLeaveRequest).not.toHaveBeenCalled()
  })

  it('a capture dated before the current leave year needs an explicit tick', async () => {
    mockAuth = { profile: { id: 'admin-1' }, isAdmin: true, canSubmitLeave: true }
    const user = userEvent.setup()
    render(<LeaveRequestForm captureOnly initialLeaveType="sick" />)
    await user.click(await screen.findByLabelText('Leave for'))
    await user.click(await screen.findByText('Rivers, Sam'))
    await user.type(screen.getByLabelText('From'), '2020-03-02')
    expect(await screen.findByRole('checkbox', { name: /before the current leave year/ })).toBeRequired()
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
    await user.click(await screen.findByRole('option', { name: 'Weekend off' }))

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
    // The server resolves the category; the form only names the doctor and the range.
    expect(fetchAnnualCapacityPreview).toHaveBeenCalledWith({ dateFrom: '2026-08-10', dateTo: '2026-08-14', profileId: 'doctor-1', columnKeyOverride: undefined })
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Motivations/)).not.toBeRequired()
  })

  it('annual leave at capacity: is not blocked — explains the overbooked path, requires a motivation, and submits "for admin approval"', async () => {
    mockAuth = { profile: { id: 'doctor-1', category: 'MO' }, isAdmin: false }
    fetchAnnualCapacityPreview.mockResolvedValue({
      date: '2026-08-12', taken: 2, max: 2, atCapacity: true, pooled: true, columnKey: 'MO', columnLabel: 'MO',
      breach: 'fulltime', breachDates: ['2026-08-12'], breachDate: '2026-08-12', overCapacity: true,
    })
    submitLeaveRequest.mockResolvedValue({ overCapacity: true })
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.type(screen.getByLabelText('From'), '2026-08-10')
    await user.type(screen.getByLabelText('To'), '2026-08-14')

    expect(await screen.findByText('2 of 2 slots taken')).toBeInTheDocument()
    expect(screen.getByTestId('over-capacity-note')).toHaveTextContent('No slot is free on 12 Aug. You can still submit for an emergency; an admin must approve it as overbooked leave.')
    const submit = screen.getByRole('button', { name: 'Submit for admin approval' })
    expect(submit).not.toBeDisabled()
    const notes = screen.getByLabelText(/Motivations \(required for an overbooked request\)/)
    expect(notes).toBeRequired()

    await user.type(screen.getByLabelText('How many days will be taken as annual leave?'), '5')
    await user.type(notes, 'Family emergency')
    await user.click(submit)

    await waitFor(() => expect(submitLeaveRequest).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: '2026-08-10', notes: 'Family emergency' })))
    expect(await screen.findByText(/Flagged as overbooked for the admin to decide/)).toBeInTheDocument()
  })

  it('annual leave: previewing another category never flags the submission', async () => {
    mockAuth = { profile: { id: 'doctor-1', category: 'MO' }, isAdmin: false }
    // The previewed column (Registrar) is full; the doctor's own (MO) is
    // what submission checks, and the override reading says so.
    fetchAnnualCapacityPreview.mockResolvedValue({
      date: '2026-08-12', taken: 2, max: 2, atCapacity: true, pooled: false, columnKey: 'Registrar', columnLabel: 'Registrar',
      breach: 'column', breachDates: ['2026-08-12'], breachDate: '2026-08-12', overCapacity: true,
    })
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.type(screen.getByLabelText('From'), '2026-08-10')
    await user.type(screen.getByLabelText('To'), '2026-08-14')
    await user.click(await screen.findByText('MO', { selector: 'button *' }))
    await user.click(await screen.findByRole('option', { name: 'Registrar' }))

    expect(await screen.findByText(/this previews Registrar/)).toBeInTheDocument()
    expect(screen.queryByTestId('over-capacity-note')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeInTheDocument()
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
    await user.click(await screen.findByRole('option', { name: 'Weekend off' }))
    await user.type(screen.getByLabelText('Saturday'), '2026-08-01')

    expect(await screen.findByText(/taken out of the alternating weekend pattern/)).toBeInTheDocument()
    expect(fetchWeekendExceptionPreview).toHaveBeenCalledWith({ saturday: '2026-08-01' })
    expect(screen.queryByText(/groups planned/)).not.toBeInTheDocument()
  })

  it('weekend exception: adds the live coverage read once it resolves, and never disables submission', async () => {
    fetchWeekendExceptionPreview.mockResolvedValue({ health: 'amber', filledGroups: 3, totalGroups: 4 })
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.click(screen.getByText('Annual leave'))
    await user.click(await screen.findByRole('option', { name: 'Weekend off' }))
    await user.type(screen.getByLabelText('Saturday'), '2026-08-01')

    expect(await screen.findByText('This weekend is currently 3 of 4 groups planned.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit request/i })).not.toBeDisabled()
  })

  it('weekend exception: shows no advisory before a Saturday is picked', async () => {
    const user = userEvent.setup()
    render(<LeaveRequestForm />)

    await user.click(screen.getByText('Annual leave'))
    await user.click(await screen.findByRole('option', { name: 'Weekend off' }))

    expect(screen.queryByText(/taken out of the alternating weekend pattern/)).not.toBeInTheDocument()
    expect(fetchWeekendExceptionPreview).not.toHaveBeenCalled()
  })
})
