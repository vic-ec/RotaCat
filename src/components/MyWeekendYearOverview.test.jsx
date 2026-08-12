import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyWeekendYearOverview from './MyWeekendYearOverview'
import { groupEntriesByWeekend, saturdaysInMonth } from '../lib/weekendPlanner'

// Sandbox clock is 2026-08-0x throughout this session, so August 2026 is
// always the default-selected month.
const YEAR = 2026
const [aug1, aug8] = saturdaysInMonth(YEAR, 8)
const MY_PROFILE_ID = 'p1'

// p1 (the signed-in doctor) is rostered on aug1 (working), has a pending
// weekend-exception request on file for aug8 but isn't assigned there yet
// (pending), and has nothing at all for the rest of the year (off).
const ENTRIES = [
  { id: 'e1', weekend_saturday: aug1, profile_id: MY_PROFILE_ID, category: 'MO' },
  { id: 'e2', weekend_saturday: aug1, profile_id: 'p2', category: 'Registrar' },
]
const BY_WEEKEND = groupEntriesByWeekend(ENTRIES)
const MY_REQUESTS = [{ id: 'r1', date_from: aug8, status: 'pending' }]

function renderOverview(overrides = {}) {
  return render(
    <MyWeekendYearOverview
      year={YEAR}
      onYearChange={vi.fn()}
      byWeekend={BY_WEEKEND}
      myRequests={MY_REQUESTS}
      myProfileId={MY_PROFILE_ID}
      onOpenMonth={vi.fn()}
      {...overrides}
    />
  )
}

describe('MyWeekendYearOverview', () => {
  it('renders the personal-read legend (Working/Exception pending/Off)', () => {
    renderOverview()
    const legend = within(screen.getByTestId('weekend-year-legend'))
    expect(legend.getByText('Working')).toBeInTheDocument()
    expect(legend.getByText('Exception pending')).toBeInTheDocument()
    expect(legend.getByText('Off')).toBeInTheDocument()
  })

  it('defaults to the current month (August) and shows working/pending counts for it', () => {
    renderOverview()
    const augustCard = screen.getByRole('button', { name: /August/ })
    expect(augustCard).toHaveAttribute('aria-pressed', 'true')

    const inspector = within(screen.getByTestId('my-weekend-year-inspector'))
    expect(inspector.getByText('August 2026')).toBeInTheDocument()
    expect(inspector.getByText('Working').closest('div')).toHaveTextContent('1')
    expect(inspector.getByText('Exception pending').closest('div')).toHaveTextContent('1')
  })

  it('clicking an unselected month selects it without opening it', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({ onOpenMonth })

    await user.click(screen.getByRole('button', { name: /January/ }))
    expect(onOpenMonth).not.toHaveBeenCalled()
    expect(within(screen.getByTestId('my-weekend-year-inspector')).getByText('January 2026')).toBeInTheDocument()
  })

  it('clicking the already-selected month opens it directly', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({ onOpenMonth })

    await user.click(screen.getByRole('button', { name: /August/ }))
    expect(onOpenMonth).toHaveBeenCalledWith(8)
  })

  it('the inspector\'s "Open month" button opens the selected month', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({ onOpenMonth })

    await user.click(screen.getByRole('button', { name: 'Open month' }))
    expect(onOpenMonth).toHaveBeenCalledWith(8)
  })

  it('year nav buttons call onYearChange with prev/next year', async () => {
    const user = userEvent.setup()
    const onYearChange = vi.fn()
    renderOverview({ onYearChange })

    await user.click(screen.getByRole('button', { name: 'Previous year' }))
    expect(onYearChange).toHaveBeenCalledWith(YEAR - 1)
    await user.click(screen.getByRole('button', { name: 'Next year' }))
    expect(onYearChange).toHaveBeenCalledWith(YEAR + 1)
  })

  it('Today calls onYearChange with the current year, once actually browsing a different one', async () => {
    // DateStepper hides Today while already on the current period — seed a
    // non-current year so it's there to click at all.
    const user = userEvent.setup()
    const onYearChange = vi.fn()
    renderOverview({ year: YEAR - 1, onYearChange })

    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(onYearChange).toHaveBeenCalledWith(YEAR)
  })

  it('has no gap-count badges (this view is not a staffing-health read)', () => {
    renderOverview()
    const augustCard = screen.getByRole('button', { name: /August/ })
    // MyWeekendMonthCard never renders a corner badge at all — unlike
    // WeekendYearOverview's WeekendMonthCard, there's no gapCount concept
    // here (working/pending/off, not fully-planned/needs-staff/empty).
    expect(within(augustCard).queryByText(/^\d+$/)).not.toBeInTheDocument()
  })
})
