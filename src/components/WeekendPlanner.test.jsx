import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import WeekendPlanner from './WeekendPlanner'
import { saturdaysInMonth } from '../lib/weekendPlanner'

// WeekendPlannerView has its own extensive test suite already — stubbed
// here so this file stays focused on the orchestration logic (role-based
// view switching, URL-driven year/month/view state, the year<->month
// hand-off) rather than re-testing everything underneath it, same reasoning
// as LeavePlannerPage.test.jsx stubbing its own tab content.
vi.mock('./WeekendPlannerView', () => ({
  default: ({ initialYear, initialMonth, onBackToYear }) => (
    <div>
      MonthViewStub: {initialYear}-{initialMonth}
      {onBackToYear && <button onClick={onBackToYear}>BackToYearStub</button>}
    </div>
  ),
}))

let mockAuth = { isAdmin: false, isClerk: false, profile: { id: 'p1' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const [aug1] = saturdaysInMonth(2026, 8)
const ENTRIES = [{ id: 'e1', weekend_saturday: aug1, profile_id: 'p1', category: 'MO' }]

const { mockResponses } = vi.hoisted(() => ({ mockResponses: {} }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      const builder = {
        select() { if (!method) method = 'select'; return builder },
        eq() { return builder },
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

function renderPlanner(initialEntries = ['/']) {
  return render(<WeekendPlanner />, { wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter> })
}

describe('WeekendPlanner', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['weekend_planner_entries:select'] = { data: ENTRIES, error: null }
    mockResponses['profiles:select'] = { data: [], error: null }
    mockResponses['leave_requests:select'] = { data: [], error: null }
    mockAuth = { isAdmin: false, isClerk: false, profile: { id: 'p1' } }
  })

  it('admin: lands on the staffing year overview (WeekendYearOverview)', async () => {
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    renderPlanner()
    expect(await screen.findByText('Weekend planner')).toBeInTheDocument()
    expect(within(screen.getByTestId('weekend-year-legend')).getByText('Fully planned')).toBeInTheDocument()
  })

  it('clerk: also lands on the staffing year overview', async () => {
    mockAuth = { isAdmin: false, isClerk: true, profile: { id: 'clerk-1' } }
    renderPlanner()
    expect(await screen.findByText('Weekend planner')).toBeInTheDocument()
    expect(within(screen.getByTestId('weekend-year-legend')).getByText('Fully planned')).toBeInTheDocument()
  })

  it('doctor: lands on the personal year overview (MyWeekendYearOverview) instead', async () => {
    renderPlanner()
    expect(await screen.findByText('My weekends')).toBeInTheDocument()
    const legend = within(screen.getByTestId('weekend-year-legend'))
    expect(legend.getByText('Working')).toBeInTheDocument() // personal-read legend
    expect(legend.queryByText('Fully planned')).not.toBeInTheDocument()
  })

  it('opening a month from the year overview switches to the month view, seeded with that year/month', async () => {
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByText('Weekend planner')

    // August is already selected by default (current month) — one click opens it.
    await user.click(screen.getByRole('button', { name: /August/ }))
    expect(await screen.findByText(/MonthViewStub: 2026-8/)).toBeInTheDocument()
  })

  it('"← Overview" from the month view switches back to the year overview', async () => {
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByText('Weekend planner')
    await user.click(screen.getByRole('button', { name: /August/ }))
    await screen.findByText(/MonthViewStub/)

    await user.click(screen.getByRole('button', { name: 'BackToYearStub' }))
    expect(await screen.findByText('Weekend planner')).toBeInTheDocument()
  })

  it('year navigation persists in the URL and re-fetches for the new year', async () => {
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByText('Weekend planner')

    await user.click(screen.getByRole('button', { name: 'Next year' }))
    expect(await screen.findByText('2027')).toBeInTheDocument()
  })

  it('a direct ?wview=month URL opens straight into the month view', async () => {
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    renderPlanner(['/?wyear=2026&wview=month&wmonth=3'])
    expect(await screen.findByText(/MonthViewStub: 2026-3/)).toBeInTheDocument()
  })
})
