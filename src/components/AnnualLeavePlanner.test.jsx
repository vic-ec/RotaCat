import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AnnualLeavePlanner from './AnnualLeavePlanner'

// Sandbox clock is 2026-08-01 throughout this session, so August is the
// default-selected month and the default-viewed year is 2026.
let mockAuth = { profile: { id: 'p1' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

// Fixture tuned so August reproduces the reference mockup's own example
// text ("2 pressure days · 1 pending"):
//  - p1 (Anderson, MO) approved 11–15 Aug (5 days) — no MO pressure since
//    the default MO cap is 2 and there's only one MO doctor off.
//  - p2 (Botha, Registrar) approved 12–13 Aug (2 days) — the default
//    Registrar cap is 1, so both those days are immediately "at cap".
//  - p3 (Cosmo, EC COSMO/Intern via the 'COSMO' category) has one pending
//    request on 20 Aug.
// January has nothing at all, for the "Quiet" empty state.
const LEAVE_REQUESTS = [
  {
    profile_id: 'p1', date_from: '2026-08-11', date_to: '2026-08-15', leave_type: 'annual',
    status: 'approved', annual_leave_days: 5, profiles: { surname: 'Anderson', category: 'MO' },
  },
  {
    profile_id: 'p2', date_from: '2026-08-12', date_to: '2026-08-13', leave_type: 'annual',
    status: 'approved', annual_leave_days: 2, profiles: { surname: 'Botha', category: 'Registrar' },
  },
  {
    profile_id: 'p3', date_from: '2026-08-20', date_to: '2026-08-20', leave_type: 'annual',
    status: 'pending', annual_leave_days: 1, profiles: { surname: 'Cosmo', category: 'COSMO' },
  },
]

const { mockResponses } = vi.hoisted(() => ({ mockResponses: {} }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      const builder = {
        select() { if (!method) method = 'select'; return builder },
        eq() { return builder },
        in() { return builder },
        gte() { return builder },
        lte() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { data: null, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

function renderPage() {
  return render(<AnnualLeavePlanner />, { wrapper: MemoryRouter })
}

describe('AnnualLeavePlanner', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['leave_requests:select'] = { data: LEAVE_REQUESTS, error: null }
    mockResponses['public_holidays:select'] = { data: [], error: null }
    mockResponses['constraints:select'] = { data: [], error: null } // falls back to defaults: MO 2, Registrar 1, EC_COSMO 1, OT_COSMO 1, full-time 3
    mockResponses['profiles:select'] = { data: null, count: 20, error: null }
    mockAuth = { profile: { id: 'p1' } }
  })

  it('renders all 12 months and defaults the selection to the current month (August)', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: /January/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /December/ })).toBeInTheDocument()

    const augustCard = screen.getByRole('button', { name: /August/ })
    expect(augustCard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /January/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the pressure/pending summary line on the affected month card', async () => {
    renderPage()
    const augustCard = await screen.findByRole('button', { name: /August/ })
    expect(within(augustCard).getByText('2 pressure days · 1 pending')).toBeInTheDocument()

    const januaryCard = screen.getByRole('button', { name: /January/ })
    expect(within(januaryCard).getByText('Quiet')).toBeInTheDocument()
  })

  it('shows year-total stats in the toolbar strip', async () => {
    renderPage()
    await screen.findByRole('button', { name: /August/ })
    const stats = within(screen.getByTestId('annual-year-stats'))
    expect(stats.getByText('7 days')).toBeInTheDocument() // 5 (p1) + 2 (p2) approved annual days
    expect(stats.getByText('Max 3 doctors (15%)')).toBeInTheDocument() // the full-time aggregate cap, of a 20-person headcount
    expect(stats.getByText('2 pressure days')).toBeInTheDocument()
  })

  it('inspector defaults to August, showing the pressure date range and who is on it', async () => {
    renderPage()
    await screen.findByRole('button', { name: /August/ })

    expect(screen.getByText('Selected month')).toBeInTheDocument()
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(screen.getByText('12–13 Aug')).toBeInTheDocument() // the Registrar at-cap range
    expect(screen.getByText('Anderson')).toBeInTheDocument() // also on leave those days
    expect(screen.getByText('Botha')).toBeInTheDocument()
    expect(screen.getAllByText('Approved')).toHaveLength(2)
  })

  it('clicking a quiet month updates the inspector accordingly', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: /August/ })

    await user.click(screen.getByRole('button', { name: /January/ }))
    expect(screen.getByText('January 2026')).toBeInTheDocument()
    expect(screen.getByText('No capacity pressure this month.')).toBeInTheDocument()
  })

  it('"My leave" filter narrows the year stats to the signed-in doctor only', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: /August/ })

    await user.click(screen.getByRole('button', { name: 'My leave' }))
    expect(within(screen.getByTestId('annual-year-stats')).getByText('5 days')).toBeInTheDocument() // only p1's own 5 days
  })

  it('surname search narrows the month card markers and year stats', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: /August/ })

    await user.type(screen.getByLabelText('Search by surname'), 'Botha')
    expect(within(screen.getByTestId('annual-year-stats')).getByText('2 days')).toBeInTheDocument() // only p2's 2 days now count as "approved"
  })

  it('"View requests" links to the Requests planner tab', async () => {
    renderPage()
    await screen.findByRole('button', { name: /August/ })
    expect(screen.getByRole('link', { name: /View requests/ })).toHaveAttribute('href', '/leave?tab=planners&sub=requests')
  })

  it('"Open month workspace" switches to the detailed spreadsheet view, and Back returns to the overview', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: /August/ })

    await user.click(screen.getByRole('button', { name: /Open month workspace/ }))
    expect(screen.getByRole('button', { name: '← Back to overview' })).toBeInTheDocument()
    expect(screen.queryByText('Selected month')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '← Back to overview' }))
    expect(await screen.findByText('Selected month')).toBeInTheDocument()
  })

  it('"How it works" opens a popup with the concurrency-cap detail, closable via the × button', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('button', { name: /August/ })

    expect(screen.queryByText(/never more than 3 doctors on leave at a time/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'How it works' }))
    expect(screen.getByText(/never more than 3 doctors on leave at a time/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText(/never more than 3 doctors on leave at a time/)).not.toBeInTheDocument()
  })
})
