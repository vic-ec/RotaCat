import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from './DashboardPage'
import { todayStr, addDays } from '../lib/dateRange'

let mockAuth = {}
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

vi.mock('../lib/monthlyHours', () => ({
  getDashboardHoursWarnings: vi.fn(),
}))
import { getDashboardHoursWarnings } from '../lib/monthlyHours'

// `select(cols, { head: true, count: 'exact' })` is keyed separately from a
// plain select — the admin view issues both against leave_requests (one for
// the pending *count*, one for the approved rows), so a single
// "leave_requests:select" fixture couldn't answer both.
const { mockResponses, eqCalls, updateCalls } = vi.hoisted(() => ({ mockResponses: {}, eqCalls: [], updateCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      const builder = {
        select(_cols, opts) { method = opts?.head ? 'count' : 'select'; return builder },
        update(payload) { method = 'update'; updateCalls.push([table, payload]); return builder },
        eq(col, val) { eqCalls.push([table, col, val]); return builder },
        gte() { return builder },
        lte() { return builder },
        not() { return builder },
        neq() { return builder },
        or() { return builder },
        in() { return builder },
        order() { return builder },
        limit() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { data: [], error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

function renderDashboard() {
  return render(<DashboardPage />, { wrapper: MemoryRouter })
}

// Pinned so the fixtures below (fixed 2026 dates) stay on the correct side
// of "upcoming" as real time passes — same convention as
// LeaveDashboard.test.jsx.
describe('DashboardPage', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 7, 1, 9, 0, 0)) // 1 Aug 2026
    eqCalls.length = 0
    updateCalls.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    getDashboardHoursWarnings.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('doctor: shows only their own upcoming leave, one card each, explicitly scoped by profile_id', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }
    mockResponses['leave_requests:select'] = {
      data: [{ id: 'lr1', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved', annual_leave_days: 3 }],
      error: null,
    }

    renderDashboard()

    expect(await screen.findByText('Annual leave')).toBeInTheDocument()
    expect(screen.getByText('Mon 10 Aug')).toBeInTheDocument()
    expect(screen.getByText('Fri 14 Aug')).toBeInTheDocument()
    expect(screen.getByText('5 calendar days · 3 leave days')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Upcoming leave')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View all leave/ })).toHaveAttribute('href', '/leave?tab=my-leave')
    expect(eqCalls).toContainEqual(['leave_requests', 'profile_id', 'doctor-1'])
  })

  it('doctor: heads the shifts panel with its own title and a right-aligned roster link', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }
    mockResponses['roster_entries:select'] = {
      data: [{ date: '2026-08-03', shift_type: { code: 'WD_08', label: 'Day', start_time: '08:00:00', end_time: '18:00:00', day_type: 'weekday', is_night_shift: false } }],
      error: null,
    }

    renderDashboard()

    // Title and link sit together above the panel, not inside it
    const heading = await screen.findByText('Upcoming shifts')
    const headingRow = heading.closest('div')
    expect(within(headingRow).getByRole('link', { name: /View roster/ })).toHaveAttribute('href', '/roster')
    expect(headingRow.querySelector('.card')).toBeNull()
  })

  it('doctor: collapses empty shifts and leave to one inline row each, not empty cards', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }

    renderDashboard()

    expect(await screen.findByText('No leave booked')).toBeInTheDocument()
    expect(screen.getByText('No shifts in the next 7 days')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View roster/ })).toHaveAttribute('href', '/roster')
    expect(screen.getByRole('link', { name: /View all leave/ })).toHaveAttribute('href', '/leave?tab=my-leave')
  })

  it('doctor: omits the swap section entirely when nothing is waiting on them', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }

    renderDashboard()

    await screen.findByText('No leave booked')
    expect(screen.queryByText('Swap requests for you')).not.toBeInTheDocument()
    expect(screen.queryByText(/No pending swap requests/)).not.toBeInTheDocument()
  })

  it('doctor: shows an incoming swap with both shifts, and accepting hands it to an admin', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }
    mockResponses['swap_requests:select'] = {
      data: [{
        id: 'sw1', status: 'pending', requester_id: 'doctor-2', target_id: 'doctor-1',
        requester: { name: 'Sam', surname: 'Swapper' },
        requester_entry: { date: '2026-08-12', shift_type: { label: 'Night', start_time: '22:00:00', end_time: '08:00:00', is_night_shift: true } },
        target_entry: { date: '2026-08-15', shift_type: { label: 'Day', start_time: '08:00:00', end_time: '18:00:00', is_night_shift: false } },
      }],
      error: null,
    }

    renderDashboard()

    expect(await screen.findByText('Sam Swapper wants to swap with you')).toBeInTheDocument()
    expect(screen.getByText('Their shift')).toBeInTheDocument()
    expect(screen.getByText('Your shift')).toBeInTheDocument()
    expect(screen.getByText('22:00 - 08:00')).toBeInTheDocument()
    expect(screen.getByText('08:00 - 18:00')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(updateCalls).toContainEqual(['swap_requests', { status: 'accepted' }])
    expect(screen.queryByText('Sam Swapper wants to swap with you')).not.toBeInTheDocument()
  })

  it('doctor: declining a swap rejects it', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }
    mockResponses['swap_requests:select'] = {
      data: [{
        id: 'sw1', status: 'pending', requester_id: 'doctor-2', target_id: 'doctor-1',
        requester: { name: 'Sam', surname: 'Swapper' },
        requester_entry: { date: '2026-08-12', shift_type: { label: 'Night', start_time: '22:00:00', end_time: '08:00:00', is_night_shift: true } },
        target_entry: { date: '2026-08-15', shift_type: { label: 'Day', start_time: '08:00:00', end_time: '18:00:00', is_night_shift: false } },
      }],
      error: null,
    }

    renderDashboard()

    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    expect(updateCalls).toContainEqual(['swap_requests', { status: 'rejected' }])
  })

  it('admin: needs-attention rows link to the approval queue and the hours summary', async () => {
    mockAuth = { profile: { id: 'admin-1', name: 'Admin' }, isAdmin: true }
    mockResponses['leave_requests:count'] = { count: 3, error: null }
    mockResponses['profiles:select'] = { data: [{ id: 'p1', name: 'Nadia', surname: 'Bennett', contract_type: 'five_eighths' }], error: null }
    getDashboardHoursWarnings.mockResolvedValue([{ profileId: 'p1', name: 'Nadia', surname: 'Bennett', hours: 122, ceiling: 118 }])

    renderDashboard()

    const pendingRow = await screen.findByRole('link', { name: /leave requests awaiting approval/ })
    expect(pendingRow).toHaveAttribute('href', '/leave?tab=requests')
    expect(within(pendingRow).getByText('3')).toBeInTheDocument()

    const hoursRow = screen.getByRole('link', { name: /at or over the hours ceiling this month/ })
    expect(hoursRow).toHaveAttribute('href', '/roster?view=summary')
    expect(within(hoursRow).getByText('1')).toBeInTheDocument()
  })

  it('admin: summarises team leave now and in the next 7 days, ignoring leave further out', async () => {
    mockAuth = { profile: { id: 'admin-1', name: 'Admin' }, isAdmin: true }
    const today = todayStr()
    mockResponses['leave_requests:select'] = {
      data: [
        { id: 'now-1', leave_type: 'sick', date_from: today, date_to: today, profiles: { name: 'On', surname: 'Leave' } },
        { id: 'soon-1', leave_type: 'annual', date_from: addDays(today, 3), date_to: addDays(today, 5), profiles: { name: 'Soon', surname: 'Doctor' } },
        { id: 'far-1', leave_type: 'annual', date_from: '2099-01-01', date_to: '2099-01-05', profiles: { name: 'Later', surname: 'Doctor' } },
      ],
      error: null,
    }
    getDashboardHoursWarnings.mockResolvedValue([])

    renderDashboard()

    expect(await screen.findByText('1 away today')).toBeInTheDocument()
    expect(screen.getByText('On Leave')).toBeInTheDocument()
    expect(screen.getByText('1 away in the next 7 days')).toBeInTheDocument()
    expect(screen.getByText(/Soon Doctor/)).toBeInTheDocument()
    expect(screen.queryByText(/Later Doctor/)).not.toBeInTheDocument()
    // No client-side profile_id scoping for the admin's team-wide widgets
    expect(eqCalls.some(([table, col]) => table === 'leave_requests' && col === 'profile_id')).toBe(false)
  })

  it('admin: shows a single inline row when nothing needs attention', async () => {
    mockAuth = { profile: { id: 'admin-1', name: 'Admin' }, isAdmin: true }
    getDashboardHoursWarnings.mockResolvedValue([])

    renderDashboard()

    expect(await screen.findByText('Nothing needs your attention')).toBeInTheDocument()
    expect(screen.getByText('Nobody away today')).toBeInTheDocument()
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument()
  })

  it('locum: shows own upcoming shifts, no leave widget', async () => {
    mockAuth = { profile: { id: 'locum-1', name: 'Loc' }, isAdmin: false, isClerk: false, isLocum: true }
    const today = todayStr()
    mockResponses['roster_entries:select'] = {
      data: [{ date: today, shift_type: { code: 'WD_08', label: 'Day shift', start_time: '08:00:00', end_time: '18:00:00', day_type: 'weekday', is_night_shift: false } }],
      error: null,
    }

    renderDashboard()

    expect(await screen.findByText('08:00 - 18:00')).toBeInTheDocument()
    expect(screen.queryByText('Your leave')).not.toBeInTheDocument()
    expect(screen.queryByText('No leave booked')).not.toBeInTheDocument()
    expect(eqCalls).toContainEqual(['roster_entries', 'profile_id', 'locum-1'])
  })

  it('clerk: shows live team status (on shift, next 24h, on leave), no personal-leave widget', async () => {
    mockAuth = { profile: { id: 'clerk-1', name: 'Clerky' }, isAdmin: false, isClerk: true }
    const today = todayStr()
    const tomorrow = addDays(today, 1)
    mockResponses['roster_entries:select'] = {
      data: [
        {
          date: today, profile_id: 'p1',
          shift_type: { code: 'ALL_DAY', label: 'All day', start_time: '00:00:00', end_time: '23:59:00' },
          profile: { name: 'Onno', surname: 'Now' },
        },
        {
          date: tomorrow, profile_id: 'p2',
          shift_type: { code: 'EARLY', label: 'Early shift', start_time: '00:00:01', end_time: '10:00:00' },
          profile: { name: 'Sona', surname: 'Soon' },
        },
      ],
      error: null,
    }
    mockResponses['leave_requests:select'] = {
      data: [{ id: 'lv1', date_from: today, date_to: today, profiles: { name: 'Lea', surname: 'Vantly' } }],
      error: null,
    }

    renderDashboard()

    expect(await screen.findByText(/Onno Now — All day/)).toBeInTheDocument()
    expect(await screen.findByText(/Sona Soon — Early shift/)).toBeInTheDocument()
    expect(await screen.findByText('Lea Vantly')).toBeInTheDocument()
    expect(screen.queryByText('Your leave')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Roster' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Staff' })).toBeInTheDocument()
  })
})
