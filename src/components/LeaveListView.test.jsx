import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react'
import { todayStr, addDays } from '../lib/dateRange'
import { MemoryRouter, useLocation } from 'react-router-dom'
import LeaveListView from './LeaveListView'

// LeaveListView reads Team Leave's deep-link params (?ldoctor=…).
function LocationProbe() {
  const { search } = useLocation()
  return <span data-testid="location-probe">{search}</span>
}
function renderList(url = '/leave?tab=team') {
  return render(<MemoryRouter initialEntries={[url]}><LeaveListView /><LocationProbe /></MemoryRouter>)
}

// useAuth only gates the admin "Cancel" action (see the cancel tests at the
// bottom); the query contract below stays role-blind regardless.
const mockAuth = vi.hoisted(() => ({ isAdmin: false }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))

// Who's away is the only view (the Matrix's timeline is All Leave's now).
async function switchToList() {}

// This is the most security-sensitive part of the feature. LeaveListView is
// deliberately a "dumb" renderer with zero role-conditional logic — the
// leave_select RLS policy is what actually enforces the visibility matrix
// (requester sees own always; other doctors see others' only once approved;
// clerk sees all approved leave year-round (not date-scoped — the Team
// leave tab itself is hidden for clerks as redundant with that, but the
// query-level contract still holds if this ever renders for one); locum
// sees nothing, enforced by the route being locum-blocked before this ever
// mounts; admin sees all).
// These tests do two things per role: (1) assert the component renders
// exactly the rows the (mocked) RLS-filtered query returned, with nothing
// dropped or added, and (2) assert the query itself carries no extra
// .eq()/.match() filter that would amount to client-side filtering
// standing in for RLS.
const { mockData, methodCalls } = vi.hoisted(() => ({ mockData: { rows: [] }, methodCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      const builder = {
        select(...args) { methodCalls.push(['select', table, ...args]); return builder },
        eq(...args) { methodCalls.push(['eq', table, ...args]); return builder },
        match(...args) { methodCalls.push(['match', table, ...args]); return builder },
        order(...args) { methodCalls.push(['order', table, ...args]); return builder },
        then(resolve, reject) {
          return Promise.resolve({ data: mockData.rows, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

function row(id, overrides) {
  return {
    id,
    profile_id: overrides.own ? 'me' : 'someone-else',
    leave_type: 'annual',
    date_from: '2026-01-01',
    date_to: '2026-01-05',
    status: 'pending',
    profiles: { name: 'Doc', surname: id },
    ...overrides,
  }
}

const TODAY = todayStr()
const inDays = n => addDays(TODAY, n)

describe('LeaveListView — query contract', () => {
  beforeEach(() => {
    methodCalls.length = 0
    mockData.rows = []
    localStorage.clear()
  })
  afterEach(() => { cleanup(); mockAuth.isAdmin = false })

  it('never issues a role-conditional filter on the query (no client-side substitute for RLS)', async () => {
    mockData.rows = [row('a', { status: 'approved', date_from: TODAY, date_to: TODAY })]
    renderList()
    await switchToList()
    await waitFor(() => expect(screen.getByText(/Doc a/)).toBeInTheDocument())
    expect(methodCalls.some(c => c[0] === 'eq' || c[0] === 'match')).toBe(false)
  })

  it('shows Who\'s away only: no Matrix switch', async () => {
    renderList()
    expect(await screen.findByRole('region', { name: 'Away today' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Matrix' })).not.toBeInTheDocument()
  })

  it('an old Matrix link (?ldoctor=&lyear=&lrequest=) is sent to All Leave on that year, with the request', async () => {
    renderList('/leave?tab=team&sub=current&ldoctor=doc-1&lyear=2025&lrequest=r1')
    await waitFor(() => expect(screen.getByTestId('location-probe').textContent).toMatch(/sub=all/))
    const search = screen.getByTestId('location-probe').textContent
    expect(search).toMatch(/lyear=2025/)
    expect(search).toMatch(/lrequest=r1/)
    expect(search).not.toMatch(/ldoctor/)
  })

  it('treats a remembered Table choice as Who\'s away', async () => {
    localStorage.setItem('rotacat:leaveTeamDesktopView', 'table')
    renderList()
    expect(await screen.findByRole('region', { name: 'Away today' })).toBeInTheDocument()
  })
})

describe("LeaveListView — Who's away", () => {
  beforeEach(() => {
    methodCalls.length = 0
    localStorage.setItem('rotacat:leaveTeamDesktopView', 'away')
  })
  afterEach(() => { cleanup(); mockAuth.isAdmin = false; localStorage.clear() })

  it('groups approved leave that has not ended; pending, rejected and past leave stay out', async () => {
    mockData.rows = [
      row('now', { status: 'approved', date_from: inDays(-2), date_to: inDays(1) }),
      row('soon', { status: 'approved', date_from: inDays(3), date_to: inDays(4) }),
      row('fortnight', { status: 'approved', date_from: inDays(10), date_to: inDays(11) }),
      row('pending', { status: 'pending', date_from: inDays(2), date_to: inDays(3) }),
      row('rejected', { status: 'rejected', date_from: inDays(2), date_to: inDays(3) }),
      row('past', { status: 'approved', date_from: inDays(-9), date_to: inDays(-5) }),
    ]
    renderList()
    const today = await screen.findByRole('region', { name: 'Away today' })
    expect(within(today).getByText(/Doc now/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Next 7 days' })).getByText(/Doc soon/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Next 2 weeks' })).getByText(/Doc fortnight/)).toBeInTheDocument()
    for (const id of ['pending', 'rejected', 'past']) expect(screen.queryByText(new RegExp(`Doc ${id}`))).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Table' })).not.toBeInTheDocument()
  })

  it('starts Later collapsed', async () => {
    mockData.rows = [row('far', { status: 'approved', date_from: inDays(40), date_to: inDays(41) })]
    renderList()
    const later = await screen.findByRole('region', { name: 'Later' })
    expect(within(later).queryByText(/Doc far/)).not.toBeInTheDocument()
    fireEvent.click(within(later).getByRole('button', { expanded: false }))
    expect(within(later).getByText(/Doc far/)).toBeInTheDocument()
  })

  it('has no Collapse all: each section folds on its own bar', async () => {
    mockData.rows = [row('now', { status: 'approved', date_from: TODAY, date_to: inDays(1) })]
    renderList()
    await screen.findByRole('region', { name: 'Away today' })
    expect(screen.queryByRole('button', { name: /Collapse all|Expand all/ })).not.toBeInTheDocument()
  })

  it('opens the leave details on a tap, with Cancel leave for admins only', async () => {
    mockAuth.isAdmin = true
    mockData.rows = [row('live', { status: 'approved', date_from: TODAY, date_to: inDays(2) })]
    renderList()
    fireEvent.click(await screen.findByText(/Doc live/))
    expect(await screen.findByRole('button', { name: /Cancel leave/ })).toBeInTheDocument()
  })

  it('shows no Cancel leave to non-admins', async () => {
    mockData.rows = [row('live', { status: 'approved', date_from: TODAY, date_to: inDays(2) })]
    renderList()
    fireEvent.click(await screen.findByText(/Doc live/))
    // A wide screen shows the leave in the side panel; a narrow one in a window.
    await waitFor(() => expect(screen.queryByRole('dialog') || screen.queryByText('Select a row to see its leave.') === null).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Cancel leave/ })).not.toBeInTheDocument()
  })

  it('on a wide screen a row opens the leave in the side panel, with columns for category and leave', async () => {
    mockAuth.isAdmin = true
    mockData.rows = [row('live', { status: 'approved', date_from: TODAY, date_to: inDays(2) })]
    renderList()
    const panel = await screen.findByTestId('away-panel')
    expect(panel).toHaveTextContent('Select a row to see its leave.')
    fireEvent.click(await screen.findByText(/Doc live/))
    expect(within(panel).getByRole('button', { name: /Cancel leave/ })).toBeInTheDocument()
    expect(screen.getAllByTestId('leave-type-pill').length).toBeGreaterThan(0)
  })
})
