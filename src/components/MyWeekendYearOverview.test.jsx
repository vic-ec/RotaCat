import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyWeekendYearOverview from './MyWeekendYearOverview'

// The request panel reads canSubmitLeave, and its form talks to Supabase —
// both stubbed here so this suite stays about the year overview itself.
let mockAuth = { canSubmitLeave: true, profile: { id: 'p1' } }
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))
vi.mock('./LeaveRequestForm', () => ({
  default: ({ initialLeaveType, initialDateFrom, initialDateTo }) => (
    <p>LeaveRequestFormStub: {initialLeaveType} {initialDateFrom} to {initialDateTo}</p>
  ),
}))
import { groupEntriesByWeekend, saturdaysInMonth } from '../lib/weekendPlanner'
import { addDays } from '../lib/dateRange'

// The clock is pinned to 1 Aug 2026 (see beforeEach), so August 2026 is
// always the default-selected month.
const YEAR = 2026
const [aug1, aug8, aug15] = saturdaysInMonth(YEAR, 8)
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

// jsdom applies no breakpoints, so the mobile month finder and the desktop
// dashboard (toolbar + month grid + inspector) are both in the DOM. Toolbar
// controls exist once in each, so scope those queries to one of them.
const dashboard = () => within(screen.getByTestId('my-weekend-dashboard'))
const finder = () => within(screen.getByTestId('my-weekend-month-finder'))

// The colour key lives behind the Legend icon now (as on the Annual and
// Special planners), so reading it means opening the sheet.
async function openLegend(user, scopeRoot = dashboard) {
  await user.click(scopeRoot().getByRole('button', { name: 'Legend' }))
  return within(screen.getByTestId('weekend-year-legend'))
}

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
  // Pinned rather than leaning on the ambient clock happening to be August
  // 2026 — "which weekends are still ahead" is relative to today.
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0)) // 1 Aug 2026
    mockAuth = { canSubmitLeave: true, profile: { id: 'p1' } }
  })
  afterEach(() => vi.useRealTimers())

  it('renders the personal-read legend (Working/Weekend off pending/Off) behind the Legend icon', async () => {
    const user = userEvent.setup()
    renderOverview()
    const legend = await openLegend(user)
    expect(legend.getByText('Working')).toBeInTheDocument()
    expect(legend.getByText('Weekend off pending')).toBeInTheDocument()
    expect(legend.getByText('Off')).toBeInTheDocument()
  })

  it('defaults to the current month (August) and shows working/request counts for it', () => {
    renderOverview()
    const augustCard = screen.getByRole('button', { name: 'August' })
    expect(augustCard).toHaveAttribute('aria-pressed', 'true')

    const inspector = within(screen.getByTestId('my-weekend-year-inspector'))
    expect(inspector.getByText('August 2026')).toBeInTheDocument()
    expect(inspector.getByText('Weekends working').closest('div')).toHaveTextContent('1')
    // One request on file this month, pending — and an approved count that
    // reads 0 rather than being absent, so "nothing approved yet" is said
    // out loud instead of inferred from a missing line.
    expect(inspector.getByText('Weekend off requests').closest('div')).toHaveTextContent('1')
    expect(inspector.getByText('1 pending')).toBeInTheDocument()
    expect(inspector.getByText('0 approved')).toBeInTheDocument()
  })

  it('clicking an unselected month selects it without opening it', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({ onOpenMonth })

    await user.click(screen.getByRole('button', { name: 'January' }))
    expect(onOpenMonth).not.toHaveBeenCalled()
    expect(within(screen.getByTestId('my-weekend-year-inspector')).getByText('January 2026')).toBeInTheDocument()
  })

  it('clicking the already-selected month opens it directly', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({ onOpenMonth })

    await user.click(screen.getByRole('button', { name: 'August' }))
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

    await user.click(dashboard().getByRole('button', { name: 'Previous year' }))
    expect(onYearChange).toHaveBeenCalledWith(YEAR - 1)
    await user.click(dashboard().getByRole('button', { name: 'Next year' }))
    expect(onYearChange).toHaveBeenCalledWith(YEAR + 1)
  })

  it('Today calls onYearChange with the current year, once actually browsing a different one', async () => {
    // The page's own Today (DateStepper's built-in one is suppressed) —
    // seed a non-current year so it's there to click at all.
    const user = userEvent.setup()
    const onYearChange = vi.fn()
    renderOverview({ year: YEAR - 1, onYearChange })

    await user.click(dashboard().getByRole('button', { name: 'Today' }))
    expect(onYearChange).toHaveBeenCalledWith(YEAR)
  })

  // Today stays put rather than appearing only once you've browsed away —
  // same call DateStepper's own Today makes.
  it('Today resets a selected month within the current year, and stays in place', async () => {
    const user = userEvent.setup()
    renderOverview()
    expect(dashboard().getByRole('button', { name: 'Today' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'January' }))
    await user.click(dashboard().getByRole('button', { name: 'Today' }))
    expect(dashboard().getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'August' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Selected month panel has chevrons and a jump-to-month sheet', async () => {
    const user = userEvent.setup()
    renderOverview()
    const inspector = within(screen.getByTestId('my-weekend-year-inspector'))

    await user.click(inspector.getByRole('button', { name: 'Next month' }))
    expect(inspector.getByText('September 2026')).toBeInTheDocument()

    await user.click(inspector.getByRole('button', { name: 'September 2026' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Jump to month' }))
    await user.click(sheet.getByRole('button', { name: 'March' }))
    expect(inspector.getByText('March 2026')).toBeInTheDocument()
  })

  it('lists months as single lines of weekend blocks, current month first', () => {
    renderOverview()
    const headings = finder().getAllByText(/^(Current month|Coming months|Previous months)$/).map(n => n.textContent)
    expect(headings).toEqual(['Current month', 'Coming months', 'Previous months'])

    // August is the current month, so it leads — ahead of both the rest of
    // the year and January–July.
    const tiles = finder().getAllByRole('button').filter(b => /^(January|February|March|April|May|June|July|August|September|October|November|December)/.test(b.textContent))
    expect(tiles).toHaveLength(12)
    expect(tiles[0]).toHaveTextContent('August')
    expect(tiles[1]).toHaveTextContent('September')
    // Aug, then Sep–Dec, then Jan onwards.
    expect(tiles[5]).toHaveTextContent('January')
  })

  it('each month tile carries its own working and request counts, and opens the month', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({
      onOpenMonth,
      myRequests: [...MY_REQUESTS, { id: 'r2', date_from: aug15, status: 'approved' }],
    })

    const august = finder().getAllByRole('button').find(b => b.textContent.startsWith('August'))
    expect(august).toHaveTextContent('1 working')
    expect(august).toHaveTextContent('Weekend off requests: 1 pending, 1 approved')
    // A month with nothing on file says so rather than showing three zeroes.
    const march = finder().getAllByRole('button').find(b => b.textContent.startsWith('March'))
    expect(march).toHaveTextContent('No weekends')
    expect(march).toHaveTextContent('No weekend off requests')

    await user.click(august)
    expect(onOpenMonth).toHaveBeenCalledWith(8)
  })

  it('counts an approved weekend off separately from a pending one', () => {
    renderOverview({ myRequests: [...MY_REQUESTS, { id: 'r2', date_from: aug15, status: 'approved' }] })
    const inspector = within(screen.getByTestId('my-weekend-year-inspector'))
    expect(inspector.getByText('Weekend off requests').closest('div')).toHaveTextContent('2')
    expect(inspector.getByText('1 pending')).toBeInTheDocument()
    expect(inspector.getByText('1 approved')).toBeInTheDocument()
  })

  it('names the approved-weekend-off state in the legend', async () => {
    const user = userEvent.setup()
    renderOverview()
    expect((await openLegend(user)).getByText('Weekend off approved')).toBeInTheDocument()
  })

  it('the Showing picker switches the finder to the whole department\'s weekends', async () => {
    const user = userEvent.setup()
    renderOverview()
    const augustTile = () => finder().getAllByRole('button').find(b => b.textContent.startsWith('August'))
    expect(augustTile()).toHaveTextContent('1 working')

    // The trigger is named by its current value, the same as every other
    // SelectMenu in the app.
    await user.click(finder().getByRole('button', { name: 'Showing' }))
    await user.click(screen.getByRole('option', { name: 'All weekends' }))

    // Staffing read now: aug1 has an MO and a Registrar but not all four
    // rotation groups, so the month is short rather than fully planned.
    expect(augustTile()).toHaveTextContent('0 of 5 planned')
    expect(augustTile()).toHaveTextContent('open slots across the month')
    expect(augustTile()).not.toHaveTextContent('1 working')
    // The legend follows the scope: staffing states, not personal ones.
    expect((await openLegend(user, finder)).getByText('Fully planned')).toBeInTheDocument()
  })

  // Regression: the desktop cards read a `square` fill the staffing states
  // didn't have, so switching to All weekends left twelve blank cards.
  it('keeps the desktop month cards filled under All weekends', async () => {
    const user = userEvent.setup()
    renderOverview()
    const august = () => screen.getByRole('button', { name: 'August' })
    const blocks = card => [...card.querySelectorAll('span[class*="rounded-md"]')]
    expect(blocks(august()).length).toBeGreaterThan(0)

    // The desktop picker carries a real <label>, so it's named "Showing"
    // rather than by its current value the way the finder's is.
    await user.click(dashboard().getByRole('button', { name: 'Showing' }))
    await user.click(await screen.findByRole('option', { name: 'All weekends' }))

    const filled = blocks(august()).filter(b => /bg-(success|flagAmber|flagRed)-bg/.test(b.className))
    expect(filled).toHaveLength(blocks(august()).length)
  })

  // The year view had no request path at all: a doctor could see they were
  // on every weekend in September and had nowhere to say so.
  it('Request weekend off opens the form on the next weekend this doctor works', async () => {
    const user = userEvent.setup()
    renderOverview()
    await user.click(dashboard().getByRole('button', { name: 'Request weekend off' }))
    // p1 is rostered on aug1, which is today — the weekend they'd be asking
    // about, not merely the next Saturday on the calendar.
    expect(screen.getByText(`LeaveRequestFormStub: weekend_exception ${aug1} to ${addDays(aug1, 1)}`)).toBeInTheDocument()
  })

  it('hides the request action from a viewer who cannot submit leave, keeping the scope picker', () => {
    mockAuth = { canSubmitLeave: false, profile: { id: 'p1' } }
    renderOverview()
    expect(screen.queryByRole('button', { name: 'Request weekend off' })).not.toBeInTheDocument()
    expect(dashboard().getByLabelText('Showing')).toBeInTheDocument()
  })

  it('has no gap-count badges (this view is not a staffing-health read)', () => {
    renderOverview()
    const augustCard = screen.getByRole('button', { name: 'August' })
    // MyWeekendMonthCard never renders a corner badge at all — unlike
    // WeekendYearOverview's WeekendMonthCard, there's no gapCount concept
    // here (working/pending/off, not fully-planned/needs-staff/empty).
    expect(within(augustCard).queryByText(/^\d+$/)).not.toBeInTheDocument()
  })
})
