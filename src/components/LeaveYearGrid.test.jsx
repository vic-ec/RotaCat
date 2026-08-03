import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeaveYearGrid from './LeaveYearGrid'

let mockAuth = { isAdmin: true }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

// jsdom doesn't apply the `lg:` breakpoint media query, so both the
// desktop (hidden lg:block) and mobile (lg:hidden) layouts are present in
// the DOM simultaneously here — tests scope into the mobile calendar via
// its grid-cols-7 day grid (a structure the desktop table doesn't share)
// rather than relying on visibility.
function mobileDayGrid(container) {
  return container.querySelector('.grid-cols-7')?.parentElement
}

const LEAVE_BY_DATE = new Map([
  ['2026-08-10', [
    { profileId: 'doc-1', surname: 'Exford', category: 'MO', status: 'approved' },
    { profileId: 'doc-2', surname: 'Smit', category: 'Registrar', status: 'pending' },
  ]],
])
const PH_BY_DATE = new Map([['2026-08-09', "National Woman's Day"]])

describe('LeaveYearGrid', () => {
  it('renders the desktop year grid and mobile month calendar without crashing', () => {
    const { container } = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={LEAVE_BY_DATE} publicHolidaysByDate={PH_BY_DATE} />
    )
    expect(screen.getByText('2026')).toBeInTheDocument() // desktop year header
    expect(mobileDayGrid(container)).toBeTruthy()
  })

  it('mobile: defaults to the current month and navigates with prev/next', async () => {
    const onYearChange = vi.fn()
    render(<LeaveYearGrid year={2026} onYearChange={onYearChange} leaveByDate={new Map()} publicHolidaysByDate={new Map()} />)

    await userEvent.click(screen.getByLabelText('Next month'))
    await userEvent.click(screen.getByLabelText('Previous month'))
    await userEvent.click(screen.getByLabelText('Previous month'))
    // Two steps back from the starting month should not touch the year unless it crossed January
    expect(onYearChange).not.toHaveBeenCalled()
  })

  it('mobile: crossing a year boundary calls onYearChange', async () => {
    const onYearChange = vi.fn()
    // Render pinned to December so one "next month" click crosses into January of the next year
    const December2026 = new Date('2026-12-15T00:00:00')
    vi.setSystemTime(December2026)
    render(<LeaveYearGrid year={2026} onYearChange={onYearChange} leaveByDate={new Map()} publicHolidaysByDate={new Map()} />)

    await userEvent.click(screen.getByLabelText('Next month'))
    expect(onYearChange).toHaveBeenCalledWith(2027)
    vi.useRealTimers()
  })

  it('tapping a day with entries opens the detail sheet with the right names', async () => {
    vi.setSystemTime(new Date('2026-08-01T00:00:00'))
    const { container } = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={LEAVE_BY_DATE} publicHolidaysByDate={PH_BY_DATE} />
    )
    const grid = mobileDayGrid(container)
    const dayButton = within(grid).getByText('10').closest('button')
    await userEvent.click(dayButton)

    const heading = await screen.findByText(/Monday, 2026-08-10/)
    const sheet = heading.closest('.card') // scoped: "Exford"/"Smit" also appear in the desktop table rendered alongside
    expect(within(sheet).getByText('Exford')).toBeInTheDocument()
    expect(within(sheet).getByText('Smit')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByText(/Monday, 2026-08-10/)).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('day-detail sheet shows the total-vs-annual days summary when a padding weekend is involved', async () => {
    vi.setSystemTime(new Date('2026-08-01T00:00:00'))
    const leaveByDate = new Map([
      ['2026-08-10', [{
        profileId: 'doc-1', surname: 'Exford', category: 'MO', status: 'approved',
        dateFrom: '2026-08-08', dateTo: '2026-08-14', leaveType: 'annual', annualLeaveDays: 5,
      }]],
    ])
    const { container } = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={leaveByDate} publicHolidaysByDate={new Map()} />
    )
    const grid = mobileDayGrid(container)
    await userEvent.click(within(grid).getByText('10').closest('button'))

    const heading = await screen.findByText(/Monday, 2026-08-10/)
    const sheet = heading.closest('.card')
    expect(within(sheet).getByText('7 total days (5 annual leave)')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('"My leave" filter hides entries for other profiles', async () => {
    vi.setSystemTime(new Date('2026-08-01T00:00:00'))
    const { container } = render(
      <LeaveYearGrid
        year={2026} onYearChange={vi.fn()} leaveByDate={LEAVE_BY_DATE} publicHolidaysByDate={new Map()} myProfileId="doc-1"
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'My leave' }))

    const grid = mobileDayGrid(container)
    const dayButton = within(grid).getByText('10').closest('button')
    await userEvent.click(dayButton)

    const heading = await screen.findByText(/Monday, 2026-08-10/)
    const sheet = heading.closest('.card')
    expect(within(sheet).getByText('Exford')).toBeInTheDocument()
    expect(screen.queryByText('Smit')).not.toBeInTheDocument() // filtered out of both views entirely, not just this sheet
    vi.useRealTimers()
  })

  it('mobile legend: hides Consultant for a non-admin viewer, shows it for an admin', () => {
    const { container, rerender } = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={new Map()} publicHolidaysByDate={new Map()} />
    )
    const mobileLegend = container.querySelector('.lg\\:hidden')
    expect(within(mobileLegend).getByText('Consultant')).toBeInTheDocument()

    mockAuth = { isAdmin: false }
    rerender(<LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={new Map()} publicHolidaysByDate={new Map()} />)
    expect(within(container.querySelector('.lg\\:hidden')).queryByText('Consultant')).not.toBeInTheDocument()
    mockAuth = { isAdmin: true }
  })

  it('day-detail sheet: shows the Consultant section for an admin, hides it for a non-admin', async () => {
    vi.setSystemTime(new Date('2026-08-01T00:00:00'))
    const admin = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={LEAVE_BY_DATE} publicHolidaysByDate={new Map()} />
    )
    await userEvent.click(within(mobileDayGrid(admin.container)).getByText('10').closest('button'))
    const adminHeading = await screen.findByText(/Monday, 2026-08-10/)
    expect(within(adminHeading.closest('.card')).getByText('Consultant')).toBeInTheDocument()
    admin.unmount()

    mockAuth = { isAdmin: false }
    const nonAdmin = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={LEAVE_BY_DATE} publicHolidaysByDate={new Map()} />
    )
    await userEvent.click(within(mobileDayGrid(nonAdmin.container)).getByText('10').closest('button'))
    const nonAdminHeading = await screen.findByText(/Monday, 2026-08-10/)
    expect(within(nonAdminHeading.closest('.card')).queryByText('Consultant')).not.toBeInTheDocument()

    mockAuth = { isAdmin: true }
    vi.useRealTimers()
  })
})
