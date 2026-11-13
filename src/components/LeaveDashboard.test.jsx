import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LeaveDashboard from './LeaveDashboard'

// The tracker's "View request" link is a router Link (a tab switch on this
// same page), so every render needs a router around it.
const render = ui => rtlRender(ui, { wrapper: MemoryRouter })

let mockAuth = { profile: { id: 'doctor-1' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const { mockQueues, fromCalls } = vi.hoisted(() => ({ mockQueues: {}, fromCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      fromCalls.push(table)
      const callIndex = fromCalls.filter(t => t === table).length - 1
      const builder = {
        select() { return builder },
        eq() { return builder },
        order() { return builder },
        maybeSingle() { return builder },
        then(resolve, reject) {
          const queue = mockQueues[table] || []
          const result = queue[callIndex] || { data: [], error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

// LeaveDashboard reads the real clock twice — todayStr() to split upcoming
// from past requests, and new Date().getFullYear() for the year the trackers
// count against. Both fixtures below are dated 2026, so without pinning the
// clock this suite silently rots: the "upcoming" assertions started failing
// once the wall-clock passed 2026-08-14, and the tracker assertions would
// follow on 2027-01-01. Pinned to 1 Aug 2026 — before every fixture date and
// inside their year — using the same vi.setSystemTime-without-useFakeTimers
// convention as DateStepper.test.jsx (fake timers + userEvent is a known hang
// risk).
describe('LeaveDashboard ("My leave" tab — doctor only, gated by the caller)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0)) // 1 Aug 2026
    fromCalls.length = 0
    for (const key of Object.keys(mockQueues)) delete mockQueues[key]
    mockAuth = { profile: { id: 'doctor-1' } }
  })
  afterEach(() => vi.useRealTimers())

  it('shows the annual balance, upcoming requests, and the request form', async () => {
    mockQueues.leave_requests = [
      { data: [
        { id: 'up1', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved', annual_leave_days: 5 },
        { id: 'up2', leave_type: 'annual', date_from: '2026-09-01', date_to: '2026-09-01', status: 'pending', annual_leave_days: 1 },
      ], error: null },
    ]

    render(<LeaveDashboard />)

    const balanceSection = (await screen.findByText('Annual leave · 2026')).closest('section')
    // Days left leads; booked counts approved days only; pending counts requests
    expect(balanceSection.textContent).toMatch(/Days left\s*17.*Days booked\s*5.*Pending requests\s*1/s)
    expect(balanceSection.textContent).toMatch(/22 days a year · resets on 1 January/)
    // Request leave sits on the section heading
    expect(within(balanceSection).getByRole('button', { name: 'Request leave' })).toBeInTheDocument()

    const upcomingSection = screen.getByText('Upcoming').closest('section')
    expect(upcomingSection.textContent).toMatch(/Annual leave/)
    expect(upcomingSection.textContent).toMatch(/Mon 10 Aug/)
    expect(upcomingSection.textContent).toMatch(/5 calendar days · 5 leave days/)
    expect(upcomingSection.textContent).toMatch(/Approved/)
    expect(upcomingSection.textContent).toMatch(/Pending/)
    // Upcoming is one card with a row per request, not a card each
    expect(upcomingSection.querySelectorAll('.card')).toHaveLength(1)
    expect(upcomingSection.querySelectorAll('li')).toHaveLength(2)

    // No other leave types used, so no "Other leave" section
    expect(screen.queryByText(/Other leave/)).not.toBeInTheDocument()

    // The form is collapsed behind a button until requested
    expect(screen.queryByRole('button', { name: 'Submit request' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Request leave' }))
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeInTheDocument()
  })

  it('opens the request form in a dialog, closable without submitting', async () => {
    mockQueues.leave_requests = [{ data: [], error: null }]
    const user = userEvent.setup()
    render(<LeaveDashboard />)
    await screen.findByText('Days left')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Request leave' }))
    const dialog = screen.getByRole('dialog', { name: 'Request leave' })
    expect(within(dialog).getByRole('button', { name: 'Submit request' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The trigger is still there to reopen it — it isn't consumed by opening.
    expect(screen.getByRole('button', { name: 'Request leave' })).toBeInTheDocument()
  })

  it('links pending requests through to the Requests tab, and omits the link with none pending', async () => {
    mockQueues.leave_requests = [
      { data: [
        { id: 'up1', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved', annual_leave_days: 5 },
        { id: 'up2', leave_type: 'annual', date_from: '2026-09-01', date_to: '2026-09-01', status: 'pending', annual_leave_days: 1 },
        { id: 'k1', leave_type: 'sick', date_from: '2026-03-01', date_to: '2026-03-01', status: 'approved' },
      ], error: null },
    ]

    render(<LeaveDashboard />)

    const link = await screen.findByRole('link', { name: /View request ›/ })
    expect(link).toHaveAttribute('href', '/leave?tab=requests')
    // The link belongs to the annual balance, which has something pending
    expect(link.closest('section').textContent).toMatch(/Annual leave · 2026/)
    // Sick leave has nothing pending, so it gets no link
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('pluralises the link when more than one request is pending', async () => {
    mockQueues.leave_requests = [
      { data: [
        { id: 'up1', leave_type: 'annual', date_from: '2026-09-01', date_to: '2026-09-01', status: 'pending', annual_leave_days: 1 },
        { id: 'up2', leave_type: 'annual', date_from: '2026-10-01', date_to: '2026-10-02', status: 'pending', annual_leave_days: 2 },
      ], error: null },
    ]

    render(<LeaveDashboard />)

    expect(await screen.findByRole('link', { name: /View requests ›/ })).toBeInTheDocument()
  })

  it('lists every other leave type used this year, counting requests where no day figure exists', async () => {
    mockQueues.leave_requests = [
      { data: [
        { id: 's1', leave_type: 'special_leave', date_from: '2026-02-01', date_to: '2026-02-03', status: 'approved' },
        { id: 'k1', leave_type: 'sick', date_from: '2026-03-01', date_to: '2026-03-01', status: 'approved' },
      ], error: null },
    ]

    render(<LeaveDashboard />)

    const otherSection = (await screen.findByText('Other leave · 2026')).closest('section')
    expect(otherSection.textContent).toMatch(/Sick leave.*1 request booked.*0 pending/s)
    expect(otherSection.textContent).toMatch(/Special leave.*1 request booked/s)
    // No invented day figure for types with no deducted-days column
    expect(otherSection.textContent).not.toMatch(/days/)
    expect(otherSection.textContent).not.toMatch(/Annual leave/)
    // The annual balance still shows, untouched
    expect(screen.getByText('Annual leave · 2026').closest('section').textContent).toMatch(/Days left\s*22/)
  })

  it('shows the full balance and an empty Upcoming with no requests at all', async () => {
    mockQueues.leave_requests = [{ data: [], error: null }]
    render(<LeaveDashboard />)
    const balanceSection = (await screen.findByText('Annual leave · 2026')).closest('section')
    expect(balanceSection.textContent).toMatch(/Days left\s*22.*Days booked\s*0.*Pending requests\s*0/s)
    expect(screen.getByText('Nothing upcoming.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request leave' })).toBeInTheDocument()
  })
})
