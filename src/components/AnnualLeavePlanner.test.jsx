import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AnnualLeavePlanner from './AnnualLeavePlanner'

// The clock is pinned to 1 Aug 2026 (see beforeEach) so August is the
// default-selected month and 2026 the default-viewed year. This used to
// lean on the ambient sandbox clock happening to be August 2026, which
// silently turned the whole file red the moment real time rolled into
// September.
let mockAuth = { profile: { id: 'p1' }, isAdmin: true }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

// Fixture tuned so August reproduces the reference mockup's own example
// text ("… pressure days · 1 pending"):
//  - p1 (Anderson, MO) approved 11–15 Aug (5 days) — no MO pressure since
//    the default MO cap is 2 and there's only one MO doctor off.
//  - p2 (Botha, Registrar) and p4 (Dlamini, Registrar) approved 12–13 Aug
//    (2 days) — the default Registrar cap is 2, so both those days are "at
//    cap" (and the shared full-time pool of 2 is full too).
//  - p3 (Cosmo, EC COSMO/Intern via the 'COSMO' category) has one pending
//    request on 20 Aug — pending counts toward the cap too (the real
//    concurrency rule checks pending+approved together, see
//    checkAnnualLeaveCapacity in leaveRequests.js), but the default EC
//    COSMO/Intern cap is 2, so that single pending request alone doesn't
//    reach it. Total: 2 pressure days (12, 13).
// January has nothing at all, for the "Quiet" empty state.
const LEAVE_REQUESTS = [
  {
    id: 'req-1', profile_id: 'p1', date_from: '2026-08-11', date_to: '2026-08-15', leave_type: 'annual',
    status: 'approved', annual_leave_days: 5, profiles: { name: 'Alice', surname: 'Anderson', category: 'MO' },
  },
  {
    id: 'req-2', profile_id: 'p2', date_from: '2026-08-12', date_to: '2026-08-13', leave_type: 'annual',
    status: 'approved', annual_leave_days: 2, profiles: { name: 'Bob', surname: 'Botha', category: 'Registrar' },
  },
  {
    id: 'req-3', profile_id: 'p3', date_from: '2026-08-20', date_to: '2026-08-20', leave_type: 'annual',
    status: 'pending', annual_leave_days: 1, profiles: { name: 'Carol', surname: 'Cosmo', category: 'COSMO' },
  },
  {
    id: 'req-4', profile_id: 'p4', date_from: '2026-08-12', date_to: '2026-08-13', leave_type: 'annual',
    status: 'approved', annual_leave_days: 2, profiles: { name: 'Dan', surname: 'Dlamini', category: 'Registrar' },
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

// Reports the live query string, so the deep-link tests can assert what
// AnnualLeavePlanner actually left in the URL rather than only what it
// rendered.
function LocationProbe() {
  const { search } = useLocation()
  return <span data-testid="location-probe">{search}</span>
}

function renderPage(initialEntries = ['/'], props = {}) {
  return render(
    <>
      <LocationProbe />
      <AnnualLeavePlanner {...props} />
    </>,
    { wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter> }
  )
}

// Scopes month-card queries to the grid, excluding the inspector's own
// DateStepper (its label is also "<Month> <year>", and a card's own
// accessible name isn't just the bare month either — its summary line
// ("2 pressure days · 1 pending", "Quiet", …) is part of it too). Async
// (findByTestId, not getByTestId) so it doubles as the "wait for the async
// fetch to resolve and the grid to mount" step every test already needed.
async function grid() {
  return within(await screen.findByTestId('annual-year-grid'))
}

describe('AnnualLeavePlanner', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0)) // 1 Aug 2026
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['leave_requests:select'] = { data: LEAVE_REQUESTS, error: null }
    mockResponses['public_holidays:select'] = { data: [], error: null }
    mockResponses['constraints:select'] = { data: [], error: null } // falls back to defaults: MO 2, Registrar 2, EC_Intern 2, OT_Intern 1, EC full-time 2
    mockResponses['profiles:select'] = { data: null, count: 20, error: null }
    mockAuth = { profile: { id: 'p1' }, isAdmin: true }
  })
  afterEach(() => vi.useRealTimers())

  it('renders all 12 months and defaults the selection to the current month (August)', async () => {
    renderPage()
    const g = await grid()
    expect(g.getByRole('button', { name: /^January/ })).toBeInTheDocument()
    expect(g.getByRole('button', { name: /^December/ })).toBeInTheDocument()

    const augustCard = g.getByRole('button', { name: /^August/ })
    expect(augustCard).toHaveAttribute('aria-pressed', 'true')
    expect(g.getByRole('button', { name: /^January/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the pressure/pending summary line on the affected month card', async () => {
    renderPage()
    const g = await grid()
    const augustCard = g.getByRole('button', { name: /^August/ })
    expect(within(augustCard).getByText('2 pressure days · 1 pending')).toBeInTheDocument()

    const januaryCard = g.getByRole('button', { name: /^January/ })
    expect(within(januaryCard).getByText('Quiet')).toBeInTheDocument()
  })

  it('the Selected month card defaults to August and lists everyone on leave that month', async () => {
    renderPage()
    await grid()

    const card = within(screen.getByTestId('annual-inspector'))
    expect(card.getByText('Selected month')).toBeInTheDocument()
    expect(card.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument()
    expect(card.getByText('On leave')).toBeInTheDocument()
    expect(card.getByText('Anderson')).toBeInTheDocument()
    expect(card.getByText('Botha')).toBeInTheDocument()
    expect(card.getByText('Dlamini')).toBeInTheDocument()
    expect(card.getByText('Cosmo')).toBeInTheDocument() // pending, listed after the approved
    // Stat row: 3 approved requests (9 annual days), 1 pending (1 day).
    expect(card.getByText('9 days')).toBeInTheDocument()
    expect(card.getByText('3 requests')).toBeInTheDocument()
    expect(card.getByText('1 day')).toBeInTheDocument()
    expect(card.getByText('1 request')).toBeInTheDocument()
  })

  it('shows the month\'s capacity bar — every level, with the day counts — instead of the old "N of 3 slots taken" tiles', async () => {
    renderPage()
    await grid()
    const card = within(screen.getByTestId('annual-inspector'))
    expect(screen.queryByText('Leave Slot Utilization')).not.toBeInTheDocument()
    expect(card.getByText('Leave slots · 31 days')).toBeInTheDocument()
    // 11, 14, 15 Aug: Anderson alone; 20 Aug: Cosmo's pending alone — 1 of 3.
    // 12-13 Aug: Anderson + Botha + Dlamini — full. Nothing is ever 2 of 3.
    expect(card.getByText('0/3 slots used · 25 days')).toBeInTheDocument()
    expect(card.getByText('1/3 slots used · 4 days')).toBeInTheDocument()
    expect(card.getByText('2/3 slots used · 0 days')).toBeInTheDocument()
    expect(card.getByText('3/3 slots used · 2 days')).toBeInTheDocument()
    expect(card.getByText('2 days full')).toBeInTheDocument()
  })

  it('shows a right-aligned Approved/Pending status pill for each name in the On leave list', async () => {
    renderPage()
    await grid()
    const card = within(screen.getByTestId('annual-inspector'))
    // Anderson, Botha and Dlamini approved; Cosmo pending.
    expect(card.getAllByText('Approved', { selector: 'span' })).toHaveLength(3)
    expect(card.getAllByText('Pending review')).toHaveLength(1)
  })

  it("shows a public holiday's name on hover in the year grid", async () => {
    mockResponses['public_holidays:select'] = { data: [{ date: '2026-08-10', name: "Women's Day" }], error: null }
    renderPage()
    await grid()

    expect(screen.getByTitle("Women's Day")).toBeInTheDocument()
  })

  it('no longer shows a surname search input or a Year/Month toggle in the toolbar', async () => {
    renderPage()
    await grid()
    expect(screen.queryByLabelText('Search by surname')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Year' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
  })

  it('clicking a quiet month updates the inspector accordingly', async () => {
    const user = userEvent.setup()
    renderPage()
    const g = await grid()

    await user.click(g.getByRole('button', { name: /^January/ }))
    expect(screen.getByText('January 2026')).toBeInTheDocument()
    expect(screen.getByText('No leave this month.')).toBeInTheDocument()
  })

  it('shows a pending request in the On leave list even when it never creates capacity pressure', async () => {
    // A lone MO request nowhere near the default cap of 2 — no day in
    // September ever reaches pressure; a pending request an admin still
    // needs to see and act on is listed all the same.
    mockResponses['leave_requests:select'] = {
      data: [...LEAVE_REQUESTS, {
        id: 'req-5', profile_id: 'p5', date_from: '2026-09-05', date_to: '2026-09-07', leave_type: 'annual',
        status: 'pending', annual_leave_days: 3, profiles: { name: 'Dana', surname: 'Farrow', category: 'MO' },
      }],
      error: null,
    }
    const user = userEvent.setup()
    renderPage()
    const g = await grid()

    await user.click(g.getByRole('button', { name: /^September/ }))
    const card = within(screen.getByTestId('annual-inspector'))
    expect(card.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
    expect(card.getByText('Farrow')).toBeInTheDocument()
    expect(card.getByText('Pending review')).toBeInTheDocument()
  })

  it('"Requests" links to the Requests tab from the Selected month card (admin wording)', async () => {
    renderPage()
    await grid()
    expect(within(screen.getByTestId('annual-inspector')).getByRole('link', { name: 'Requests' })).toHaveAttribute('href', '/leave?tab=requests&from=annual')
  })

  it('"Open month" switches to the month calendar (for the selected month), and Back returns to the overview', async () => {
    const user = userEvent.setup()
    renderPage()
    await grid()

    await user.click(screen.getByRole('button', { name: 'Open month' }))
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('Monday')).toBeInTheDocument() // full weekday name column header, week starts Monday
    expect(screen.getAllByText('August 2026').length).toBeGreaterThan(0)
    expect(screen.queryByText('Selected month')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(await screen.findByText('Selected month')).toBeInTheDocument()
  })

  it('restores the month workspace straight from the URL — surviving a background-triggered reload without a deep link', async () => {
    // No deepLinkMonth prop involved here — this is the ongoing ayear/aview/
    // amonth persistence, seeded purely by the URL a remount reads on mount
    // (see AnnualLeavePlanner.jsx's header comment for why plain useState
    // can't survive an OS-killed-and-reloaded PWA).
    renderPage(['/?ayear=2026&aview=workspace&amonth=8'])
    expect(await screen.findByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getAllByText('August 2026').length).toBeGreaterThan(0)
  })

  // The Requests queue's "View Calendar" deep link, exercised the way it
  // actually arrives: `?month=&highlight=` on the URL, with the parent
  // (LeavePlannerPage) stripping those two params once consumed. The seed
  // write and the strip used to be two separate setSearchParams calls, and
  // the second computed its `next` from a stale `prev` — so it silently
  // wiped the ayear/aview/amonth the first had just written, dropping the
  // admin on the *current* month's overview instead of the request's month.
  it('a deep link opens the workspace on the request\'s own month, not the current one', async () => {
    renderPage(['/?month=2026-10&highlight=2026-10-03'], { deepLinkMonth: '2026-10', deepLinkHighlightDate: '2026-10-03' })
    expect(await screen.findByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getAllByText('October 2026').length).toBeGreaterThan(0)
    expect(screen.queryByText('August 2026')).not.toBeInTheDocument()
  })

  it('a deep link leaves the URL holding the request\'s month, with the one-shot params stripped', async () => {
    renderPage(['/?month=2026-10&highlight=2026-10-03'], { deepLinkMonth: '2026-10', deepLinkHighlightDate: '2026-10-03' })
    await screen.findByRole('button', { name: 'Overview' })
    const search = screen.getByTestId('location-probe').textContent
    expect(search).toContain('aview=workspace')
    expect(search).toContain('amonth=10')
    expect(search).toContain('ayear=2026')
    expect(search).not.toContain('month=2026-10')   // the one-shot deep link is consumed
    expect(search).not.toContain('highlight=')
  })

  it('the Legend sheet\'s "How it works" footer shows the concurrency-cap detail, closable via the × button', async () => {
    const user = userEvent.setup()
    renderPage()
    await grid()

    expect(screen.queryByText(/Never more than 3 doctors on leave at a time/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Legend' }))
    expect(screen.getByText(/Never more than 3 doctors on leave at a time/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText(/Never more than 3 doctors on leave at a time/)).not.toBeInTheDocument()
  })
})
