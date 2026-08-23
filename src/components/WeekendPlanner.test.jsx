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
  default: ({ initialYear, initialMonth, initialFocusSaturday, onBackToYear, clipboard, setClipboard }) => (
    <div>
      MonthViewStub: {initialYear}-{initialMonth}
      {initialFocusSaturday && <span>FocusStub: {initialFocusSaturday}</span>}
      {clipboard && <span>ClipboardStub: {clipboard}</span>}
      <button onClick={() => setClipboard(`copied-${initialMonth}`)}>SetClipboardStub</button>
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

// Scopes month-card queries to the year overview's grid, excluding the
// inspector's own DateStepper (its label is also "<Month> <year>", and a
// card's own accessible name isn't just the bare month either — its
// gap-count badges' digit text is part of it too, e.g. "August 3444").
function grid() {
  return within(screen.getByTestId('weekend-year-grid'))
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
    expect(within(screen.getByTestId('weekend-year-inspector')).getByText('Need staff')).toBeInTheDocument()
  })

  it('clerk: also lands on the staffing year overview', async () => {
    mockAuth = { isAdmin: false, isClerk: true, profile: { id: 'clerk-1' } }
    renderPlanner()
    expect(await screen.findByText('Weekend planner')).toBeInTheDocument()
    expect(within(screen.getByTestId('weekend-year-inspector')).getByText('Need staff')).toBeInTheDocument()
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
    await user.click(grid().getByRole('button', { name: /^August/ }))
    expect(await screen.findByText(/MonthViewStub: 2026-8/)).toBeInTheDocument()
  })

  it('"← Overview" from the month view switches back to the year overview', async () => {
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByText('Weekend planner')
    await user.click(grid().getByRole('button', { name: /^August/ }))
    await screen.findByText(/MonthViewStub/)

    await user.click(screen.getByRole('button', { name: 'BackToYearStub' }))
    expect(await screen.findByText('Weekend planner')).toBeInTheDocument()
  })

  it('year navigation persists in the URL and re-fetches for the new year', async () => {
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByText('Weekend planner')

    // No standalone year stepper anymore — jump to a year via the Selected
    // month panel's own jump sheet (label -> swap to year grid -> pick a
    // year -> pick a month, which is what actually fires onChange).
    const inspector = within(screen.getByTestId('weekend-year-inspector'))
    await user.click(inspector.getByRole('button', { name: /2026/ }))
    const sheet = within(screen.getByRole('dialog', { name: 'Jump to month' }))
    await user.click(sheet.getByRole('button', { name: '2026' }))
    await user.click(sheet.getByRole('button', { name: '2027' }))
    await user.click(sheet.getByRole('button', { name: 'January' }))
    expect(await within(screen.getByTestId('weekend-year-inspector')).findByText('January 2027')).toBeInTheDocument()
  })

  it('a direct ?wview=month URL opens straight into the month view', async () => {
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    renderPlanner(['/?wyear=2026&wview=month&wmonth=3'])
    expect(await screen.findByText(/MonthViewStub: 2026-3/)).toBeInTheDocument()
  })

  it('clipboard survives a round trip through the year overview into a different month', async () => {
    // Regression: copying in August, going back to the year overview, then
    // opening June used to lose the clipboard entirely — it was local state
    // inside WeekendPlannerView, which unmounts on that switch. It's now
    // owned by this orchestrator instead, so it should still be there.
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByText('Weekend planner')

    await user.click(grid().getByRole('button', { name: /^August/ }))
    await screen.findByText(/MonthViewStub: 2026-8/)
    await user.click(screen.getByRole('button', { name: 'SetClipboardStub' }))
    expect(await screen.findByText('ClipboardStub: copied-8')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'BackToYearStub' }))
    await screen.findByText('Weekend planner')

    await user.click(grid().getByRole('button', { name: /^June/ }))
    await user.click(screen.getByRole('button', { name: 'Open month' }))
    expect(await screen.findByText(/MonthViewStub: 2026-6/)).toBeInTheDocument()
    expect(screen.getByText('ClipboardStub: copied-8')).toBeInTheDocument()
  })

  it('"Plan now" on the year overview\'s "Next weekend needing staff" panel opens that weekend\'s month, focused on it', async () => {
    // Pinned so aug1 (2026-08-01) is "today or later" and thus the target —
    // ENTRIES' only open weekend, since nothing else in the year has any
    // entry at all (everything else fully empty, hence also "open", but
    // later in date order).
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0))
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByText('Weekend planner')

    await user.click(await screen.findByRole('button', { name: 'Plan now' }))
    expect(await screen.findByText(/MonthViewStub: 2026-8/)).toBeInTheDocument()
    expect(screen.getByText(`FocusStub: ${aug1}`)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('a plain "Open month" never carries a stale focus target from an earlier "Plan now"', async () => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0))
    mockAuth = { isAdmin: true, isClerk: false, profile: { id: 'admin-1' } }
    const user = userEvent.setup()
    renderPlanner()
    await screen.findByText('Weekend planner')

    await user.click(await screen.findByRole('button', { name: 'Plan now' }))
    expect(await screen.findByText(`FocusStub: ${aug1}`)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'BackToYearStub' }))
    await screen.findByText('Weekend planner')
    await user.click(grid().getByRole('button', { name: /^June/ }))
    await user.click(screen.getByRole('button', { name: 'Open month' }))

    expect(await screen.findByText(/MonthViewStub: 2026-6/)).toBeInTheDocument()
    expect(screen.queryByText(/FocusStub:/)).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
