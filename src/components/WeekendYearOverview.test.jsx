import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeekendYearOverview from './WeekendYearOverview'
import { groupEntriesByWeekend, saturdaysInMonth } from '../lib/weekendPlanner'
import { yearWeekendTotals } from '../lib/weekendYearOverview'

// Sandbox clock is 2026-08-0x throughout this session, so August 2026 is
// always the default-selected month here regardless of which day it lands
// on within August (see WeekendPlannerView.test.jsx's own comment for why
// pinning to an exact day, rather than just the month, is the fragile part).
const YEAR = 2026
const [aug1, aug8] = saturdaysInMonth(YEAR, 8)

// aug1: all 4 groups filled (green/fully planned). aug8: only MO filled
// (amber/needs staff, 3 gaps). aug15/22/29 and every other weekend of the
// year: nothing planned (red/empty, 4 gaps).
const ENTRIES = [
  { id: 'e1', weekend_saturday: aug1, profile_id: 'p1', category: 'MO' },
  { id: 'e2', weekend_saturday: aug1, profile_id: 'p2', category: 'Registrar' },
  { id: 'e3', weekend_saturday: aug1, profile_id: 'p3', category: 'COSMO' },
  { id: 'e4', weekend_saturday: aug1, profile_id: 'p4', category: 'COSMOPsych' },
  { id: 'e5', weekend_saturday: aug8, profile_id: 'p1', category: 'MO' },
]
const BY_WEEKEND = groupEntriesByWeekend(ENTRIES)

function renderOverview(overrides = {}) {
  return render(
    <WeekendYearOverview year={YEAR} onYearChange={vi.fn()} byWeekend={BY_WEEKEND} onOpenMonth={vi.fn()} {...overrides} />
  )
}

// Scopes month-card queries to the grid, excluding the inspector's own
// DateStepper (its label is also "<Month> <year>", and a card's own
// accessible name isn't just the bare month either — its gap-count badges'
// digit text is part of it too, e.g. "August 3444").
function grid() {
  return within(screen.getByTestId('weekend-year-grid'))
}

describe('WeekendYearOverview', () => {
  it('defaults the inspector/selection to the current month (August) and shows its per-health counts', () => {
    renderOverview()
    const augustCard = grid().getByRole('button', { name: /^August/ })
    expect(augustCard).toHaveAttribute('aria-pressed', 'true')

    const inspector = within(screen.getByTestId('weekend-year-inspector'))
    expect(inspector.getByText('August 2026')).toBeInTheDocument()
    // aug1 fully planned, aug8 needs staff, aug15/22/29 empty — the inspector
    // only shows the selected month's own stats now, so each label is unique.
    expect(inspector.getByText('Fully staffed').closest('div')).toHaveTextContent('1')
    expect(inspector.getByText('Need staff').closest('div')).toHaveTextContent('1')
    expect(inspector.getByText('No staff').closest('div')).toHaveTextContent('3')
  })

  it('shows whole-year totals via yearWeekendTotals, matching the lib function directly', () => {
    renderOverview()
    const totals = yearWeekendTotals(YEAR, BY_WEEKEND)
    const yearPanel = within(screen.getByTestId('weekend-year-stats'))
    expect(yearPanel.getByText('Fully staffed').closest('div')).toHaveTextContent(String(totals.fullyPlanned))
    expect(yearPanel.getByText('Need staff').closest('div')).toHaveTextContent(String(totals.partial))
    expect(yearPanel.getByText('No staff').closest('div')).toHaveTextContent(String(totals.empty))
  })

  it('clicking an unselected month selects it (updating the inspector) without opening it', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({ onOpenMonth })

    await user.click(grid().getByRole('button', { name: /^January/ }))
    expect(onOpenMonth).not.toHaveBeenCalled()
    const inspector = within(screen.getByTestId('weekend-year-inspector'))
    expect(inspector.getByText('January 2026')).toBeInTheDocument()
    expect(grid().getByRole('button', { name: /^January/ })).toHaveAttribute('aria-pressed', 'true')
    expect(grid().getByRole('button', { name: /^August/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking the already-selected month opens it directly', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({ onOpenMonth })

    // August is already selected by default (current month) — one click opens it.
    await user.click(grid().getByRole('button', { name: /^August/ }))
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

  it('Selected month panel has chevrons and a jump-to-month sheet, independent of the year selector above', async () => {
    const user = userEvent.setup()
    renderOverview()
    const inspector = within(screen.getByTestId('weekend-year-inspector'))

    await user.click(inspector.getByRole('button', { name: 'Next month' }))
    expect(inspector.getByText('September 2026')).toBeInTheDocument()

    await user.click(inspector.getByRole('button', { name: 'September 2026' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Jump to month' }))
    await user.click(sheet.getByRole('button', { name: 'March' }))
    expect(inspector.getByText('March 2026')).toBeInTheDocument()
  })

  it('shows a gap-count badge for a needs-staff/empty weekend, omitted for a fully-planned one', () => {
    renderOverview()
    const augustCard = grid().getByRole('button', { name: /^August/ })
    // aug1 (fully planned) has no badge; aug8 (needs staff, 3 gaps) does.
    expect(within(augustCard).getByText('3')).toBeInTheDocument()
    expect(within(augustCard).getAllByText('4').length).toBeGreaterThan(0) // aug15/22/29, each 4 gaps
  })

  describe('"Next weekend needing staff" panel', () => {
    it('shows the nearest open weekend (today or later), and "Plan now" hands it off via onPlanWeekend', async () => {
      vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0)) // Aug 1 2026
      const user = userEvent.setup()
      const onPlanWeekend = vi.fn()
      renderOverview({ onPlanWeekend })

      // aug1 is fully planned, so aug8 (only MO filled, 3 groups still open)
      // is the nearest one actually needing staff.
      const panel = screen.getByText('Next weekend needing staff').closest('.card')
      expect(within(panel).getByText('Sat 8 - Sun 9 Aug 2026')).toBeInTheDocument()
      expect(within(panel).getByText('1 of 4 groups staffed')).toBeInTheDocument()
      // Amber, not red — some groups are filled, matching the legend's "amber = partial" fill.
      expect(panel).toHaveClass('bg-flagAmber-bg')

      await user.click(within(panel).getByRole('button', { name: 'Plan now' }))
      expect(onPlanWeekend).toHaveBeenCalledWith(aug8)
      vi.useRealTimers()
    })

    it('is omitted once nothing in the browsed year is on/after today', () => {
      vi.setSystemTime(new Date(2027, 0, 1, 9, 0, 0)) // past every 2026 Saturday
      renderOverview()
      expect(screen.queryByText('Next weekend needing staff')).not.toBeInTheDocument()
      vi.useRealTimers()
    })
  })
})
