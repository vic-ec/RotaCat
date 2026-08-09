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

describe('WeekendYearOverview', () => {
  it('renders the 3-state legend inside its sheet, opened via the live-count trigger', async () => {
    const user = userEvent.setup()
    renderOverview()
    await user.click(screen.getByTestId('weekend-year-legend'))
    const sheet = within(screen.getByRole('dialog'))
    expect(sheet.getByText('Fully planned')).toBeInTheDocument()
    expect(sheet.getByText('Needs staff')).toBeInTheDocument()
    expect(sheet.getByText('Empty')).toBeInTheDocument()
  })

  it('defaults the inspector/selection to the current month (August) and shows its per-health counts', () => {
    renderOverview()
    const augustCard = screen.getByRole('button', { name: /August/ })
    expect(augustCard).toHaveAttribute('aria-pressed', 'true')

    const inspector = within(screen.getByTestId('weekend-year-inspector'))
    expect(inspector.getByText('August 2026')).toBeInTheDocument()
    // aug1 fully planned, aug8 needs staff, aug15/22/29 empty — the first
    // (selected-month) occurrence of each label, not the "This year" block's.
    expect(inspector.getAllByText('Fully planned')[0].closest('div')).toHaveTextContent('1')
    expect(inspector.getAllByText('Needs staff')[0].closest('div')).toHaveTextContent('1')
    expect(inspector.getAllByText('Empty')[0].closest('div')).toHaveTextContent('3')
  })

  it('shows whole-year totals via yearWeekendTotals, matching the lib function directly', () => {
    renderOverview()
    const totals = yearWeekendTotals(YEAR, BY_WEEKEND)
    const inspector = within(screen.getByTestId('weekend-year-inspector'))
    const yearBlock = inspector.getByText('This year').closest('div')
    expect(within(yearBlock).getByText('Fully planned').closest('div')).toHaveTextContent(String(totals.fullyPlanned))
    expect(within(yearBlock).getByText('Needs staff').closest('div')).toHaveTextContent(String(totals.partial))
    expect(within(yearBlock).getByText('Empty').closest('div')).toHaveTextContent(String(totals.empty))
  })

  it('clicking an unselected month selects it (updating the inspector) without opening it', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({ onOpenMonth })

    await user.click(screen.getByRole('button', { name: /January/ }))
    expect(onOpenMonth).not.toHaveBeenCalled()
    const inspector = within(screen.getByTestId('weekend-year-inspector'))
    expect(inspector.getByText('January 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /January/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /August/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking the already-selected month opens it directly', async () => {
    const user = userEvent.setup()
    const onOpenMonth = vi.fn()
    renderOverview({ onOpenMonth })

    // August is already selected by default (current month) — one click opens it.
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

  it('year nav buttons call onYearChange with prev/next/current year', async () => {
    const user = userEvent.setup()
    const onYearChange = vi.fn()
    renderOverview({ onYearChange })

    await user.click(screen.getByRole('button', { name: 'Previous year' }))
    expect(onYearChange).toHaveBeenCalledWith(YEAR - 1)
    await user.click(screen.getByRole('button', { name: 'Next year' }))
    expect(onYearChange).toHaveBeenCalledWith(YEAR + 1)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(onYearChange).toHaveBeenCalledWith(YEAR)
  })

  it('shows a gap-count badge for a needs-staff/empty weekend, omitted for a fully-planned one', () => {
    renderOverview()
    const augustCard = screen.getByRole('button', { name: /August/ })
    // aug1 (fully planned) has no badge; aug8 (needs staff, 3 gaps) does.
    expect(within(augustCard).getByText('3')).toBeInTheDocument()
    expect(within(augustCard).getAllByText('4').length).toBeGreaterThan(0) // aug15/22/29, each 4 gaps
  })
})
