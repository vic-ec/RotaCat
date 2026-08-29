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
    { profileId: 'doc-1', surname: 'Ellis', category: 'MO', status: 'approved' },
    { profileId: 'doc-2', surname: 'Stone', category: 'Registrar', status: 'pending' },
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

  it('mobile month glance: shows one badge per person, not one per category — 2 MOs on the same day get 2 MO badges', () => {
    vi.setSystemTime(new Date('2026-08-01T00:00:00'))
    const twoMOs = new Map([
      ['2026-08-10', [
        { profileId: 'doc-1', surname: 'Ellis', category: 'MO', status: 'approved' },
        { profileId: 'doc-2', surname: 'Fry', category: 'MO', status: 'approved' },
      ]],
    ])
    const { container } = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={twoMOs} publicHolidaysByDate={new Map()} />
    )
    const grid = mobileDayGrid(container)
    const dayButton = within(grid).getByText('10').closest('button')
    expect(within(dayButton).getAllByText('MO')).toHaveLength(2)
    vi.useRealTimers()
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
    const sheet = heading.closest('.card') // scoped: "Ellis"/"Stone" also appear in the desktop table rendered alongside
    expect(within(sheet).getByText('Ellis')).toBeInTheDocument()
    expect(within(sheet).getByText('Stone')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByText(/Monday, 2026-08-10/)).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  // Matches the Annual planner's own day review (MonthWorkspace): one flat
  // row per person carrying category, leave type and the full leave period,
  // rather than a section per capacity column with the annual-days summary.
  it('day-detail sheet rows carry category, shortened leave type, period and status', async () => {
    vi.setSystemTime(new Date('2026-08-01T00:00:00'))
    const leaveByDate = new Map([
      ['2026-08-10', [{
        profileId: 'doc-1', surname: 'Ellis', category: 'MO', status: 'pending',
        dateFrom: '2026-08-08', dateTo: '2026-08-14', leaveType: 'maternity',
      }]],
    ])
    const { container } = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={leaveByDate} publicHolidaysByDate={new Map()} />
    )
    const grid = mobileDayGrid(container)
    await userEvent.click(within(grid).getByText('10').closest('button'))

    const heading = await screen.findByText(/Monday, 2026-08-10/)
    const sheet = heading.closest('.card')
    expect(within(sheet).getByText('Ellis')).toBeInTheDocument()
    // "Maternity", not "Maternity leave" — the surrounding screen already
    // says leave. Period is the full request, not just the tapped day.
    expect(within(sheet).getByText(/MO · Maternity · /)).toBeInTheDocument()
    expect(within(sheet).getByText('Pending review')).toBeInTheDocument()
    vi.useRealTimers()
  })

  // The My leave / All toggle was removed: this grid always shows everyone.
  // "My leave" duplicated the My leave tab, and defaulting a planner to one
  // person's leave hid the overlap the planner exists to show.
  it('mobile legend: collapsed by default, hides Consultant for a non-admin viewer, shows it for an admin once expanded', async () => {
    const { container, rerender } = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={new Map()} publicHolidaysByDate={new Map()} />
    )
    // "Consultant" also appears in the desktop table's column header
    // (always in the DOM alongside the mobile view in jsdom, per this
    // file's own mobileDayGrid() comment) — scope to the mobile container
    // specifically rather than a global query.
    expect(within(container.querySelector('.lg\\:hidden')).queryByText('Consultant')).not.toBeInTheDocument()
    // Both viewports carry a Legend trigger now (desktop gained one when the
    // rules card was folded into the sheet), so scope to the mobile one.
    await userEvent.click(within(container.querySelector('.lg\\:hidden')).getByRole('button', { name: /Legend/ }))
    const mobileLegend = container.querySelector('.lg\\:hidden')
    expect(within(mobileLegend).getByText('Consultant')).toBeInTheDocument()

    // Same component instance — legendOpen state survives the rerender, so
    // the legend stays expanded here without needing another click.
    mockAuth = { isAdmin: false }
    rerender(<LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={new Map()} publicHolidaysByDate={new Map()} />)
    expect(within(container.querySelector('.lg\\:hidden')).queryByText('Consultant')).not.toBeInTheDocument()
    mockAuth = { isAdmin: true }
  })

  // The sheet no longer renders a section per capacity column, so this is
  // now about the Consultant's ENTRY rather than a header — but the rule it
  // guards is the same one, and the more important one: a non-admin must
  // not see Consultant leave at all.
  it("day-detail sheet: a Consultant's leave shows for an admin and is hidden from a non-admin", async () => {
    vi.setSystemTime(new Date('2026-08-01T00:00:00'))
    const withConsultant = new Map([
      ['2026-08-10', [
        { profileId: 'doc-1', surname: 'Ellis', category: 'MO', status: 'approved', dateFrom: '2026-08-10', dateTo: '2026-08-10', leaveType: 'study' },
        { profileId: 'doc-3', surname: 'Vance', category: 'Consultant', status: 'approved', dateFrom: '2026-08-10', dateTo: '2026-08-10', leaveType: 'conference' },
      ]],
    ])
    const admin = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={withConsultant} publicHolidaysByDate={new Map()} />
    )
    await userEvent.click(within(mobileDayGrid(admin.container)).getByText('10').closest('button'))
    const adminHeading = await screen.findByText(/Monday, 2026-08-10/)
    expect(within(adminHeading.closest('.card')).getByText('Vance')).toBeInTheDocument()
    admin.unmount()

    mockAuth = { isAdmin: false }
    const nonAdmin = render(
      <LeaveYearGrid year={2026} onYearChange={vi.fn()} leaveByDate={withConsultant} publicHolidaysByDate={new Map()} />
    )
    await userEvent.click(within(mobileDayGrid(nonAdmin.container)).getByText('10').closest('button'))
    const nonAdminHeading = await screen.findByText(/Monday, 2026-08-10/)
    const nonAdminSheet = nonAdminHeading.closest('.card')
    expect(within(nonAdminSheet).getByText('Ellis')).toBeInTheDocument()
    expect(within(nonAdminSheet).queryByText('Vance')).not.toBeInTheDocument()

    mockAuth = { isAdmin: true }
    vi.useRealTimers()
  })
})
