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

vi.mock('../lib/adminAttention', () => ({
  fetchAdminAttention: vi.fn().mockResolvedValue([]),
}))
import { fetchAdminAttention } from '../lib/adminAttention'

// `select(cols, { head: true, count: 'exact' })` is keyed separately from a
// plain select — the admin view issues both against leave_requests (one for
// the pending *count*, one for the approved rows), so a single
// "leave_requests:select" fixture couldn't answer both.
const { mockResponses, eqCalls, updateCalls } = vi.hoisted(() => ({ mockResponses: {}, eqCalls: [], updateCalls: [] }))
vi.mock('../components/LateArrivalModal', () => ({ default: ({ option, profileId }) => <div role="dialog" aria-label="Log late arrival">{option || profileId ? 'prefilled' : 'today, anyone rostered'}</div> }))

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
    expect(screen.getByText('Next leave')).toBeInTheDocument()
    // Balance comes from the same approved annual row: 3 of 22 booked
    expect(screen.getByText('19')).toBeInTheDocument()
    expect(screen.getByText('3 of 22 booked · 0 pending')).toBeInTheDocument()
    expect(screen.queryByText(/more upcoming/)).not.toBeInTheDocument()
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

  it('doctor: keeps the shifts heading and roster link with nothing rostered, message inside the panel', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }

    renderDashboard()

    // Heading and link stay put even with an empty week — only the panel's
    // contents change
    expect(await screen.findByText('Upcoming shifts')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View roster/ })).toHaveAttribute('href', '/roster')
    const empty = screen.getByText('No shifts in the next 7 days')
    expect(empty).toHaveClass('card')
    // The link isn't duplicated inside the panel now the heading carries it
    expect(within(empty).queryByRole('link')).toBeNull()
  })

  it('doctor: with nothing booked the leave card shows the full balance and "None booked"', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }

    renderDashboard()

    expect(await screen.findByText('None booked')).toBeInTheDocument()
    expect(screen.getByText('Annual leave · 2026')).toBeInTheDocument()
    expect(screen.getByText('22')).toBeInTheDocument()
    expect(screen.getByText('days left')).toBeInTheDocument()
    expect(screen.getByText('0 of 22 booked · 0 pending')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View all leave/ })).toHaveAttribute('href', '/leave?tab=my-leave')
    expect(screen.getByRole('link', { name: 'Request leave' })).toHaveAttribute('href', '/leave?tab=my-leave')
    expect(screen.getByRole('link', { name: 'Request swap' })).toHaveAttribute('href', '/swaps')
  })

  it('doctor: lists the week ahead as rows — date cell, shift and hour, co-workers, time chip', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }
    const today = todayStr()
    mockResponses['roster_entries:select'] = {
      data: [
        { date: today, profile_id: 'doctor-1', shift_type: { code: 'WD_08', label: 'Day shift', start_time: '08:00:00', end_time: '18:00:00', day_type: 'weekday', is_night_shift: false } },
        { date: today, profile_id: 'doctor-2', shift_type: { code: 'WD_08' }, profile: { surname: 'Landes' } },
        { date: addDays(today, 1), profile_id: 'doctor-1', shift_type: { code: 'WD_22', label: 'Night shift', start_time: '22:00:00', end_time: '08:00:00', day_type: 'weekday', is_night_shift: true } },
      ],
      error: null,
    }

    renderDashboard()

    expect(await screen.findByText('Day shift · 08h')).toBeInTheDocument()
    expect(screen.getByText('with Landes')).toBeInTheDocument()
    expect(screen.getByText('08–18')).toHaveClass('chip-mint')
    expect(screen.getByText('22–08')).toHaveClass('chip-night')
  })

  it('doctor: shows only the next leave, with a link to the rest', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }
    mockResponses['leave_requests:select'] = {
      data: [
        { id: 'lr2', leave_type: 'annual', date_from: '2026-09-07', date_to: '2026-09-07', status: 'pending', annual_leave_days: 1 },
        { id: 'lr1', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved', annual_leave_days: 3 },
      ],
      error: null,
    }

    renderDashboard()

    // Soonest first, and only that one
    expect(await screen.findByText('Mon 10 Aug')).toBeInTheDocument()
    expect(screen.queryByText('Mon 7 Sep')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\+1 more upcoming/ })).toHaveAttribute('href', '/leave?tab=my-leave')
    // Pending counts the request, booked counts only approved days
    expect(screen.getByText('3 of 22 booked · 1 pending')).toBeInTheDocument()
  })

  it('doctor: omits the swap section entirely when nothing is waiting on them', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }

    renderDashboard()

    await screen.findByText('None booked')
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

    const hoursRow = screen.getByRole('link', { name: /over their contracted hours this month/ })
    expect(hoursRow).toHaveAttribute('href', '/roster?view=summary&hours=over')
    expect(within(hoursRow).getByText('1')).toBeInTheDocument()
  })

  it('admin: lists the other attention rows, each a link, with a dot where a row has no count', async () => {
    mockAuth = { profile: { id: 'admin-1', name: 'Admin' }, isAdmin: true }
    getDashboardHoursWarnings.mockResolvedValue([])
    fetchAdminAttention.mockResolvedValueOnce([
      { key: 'signups', count: 2, to: '/staff?tab=pending', label: 'sign-ups awaiting approval' },
      { key: 'next-roster-draft', to: '/roster/dec', label: "December's roster is still a draft" },
    ])

    renderDashboard()

    const signups = await screen.findByRole('link', { name: /sign-ups awaiting approval/ })
    expect(signups).toHaveAttribute('href', '/staff?tab=pending')
    expect(within(signups).getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /December's roster is still a draft/ })).toHaveAttribute('href', '/roster/dec')
    expect(screen.queryByText('Nothing needs your attention')).not.toBeInTheDocument()
  })

  it('admin: summarises team leave now and in the next 7 days, ignoring leave further out', async () => {
    mockAuth = { profile: { id: 'admin-1', name: 'Admin' }, isAdmin: true }
    const today = todayStr()
    mockResponses['leave_requests:select'] = {
      data: [
        { id: 'now-1', leave_type: 'annual', date_from: today, date_to: today, profiles: { name: 'On', surname: 'Leave' } },
        { id: 'sick-1', leave_type: 'sick', date_from: today, date_to: today, profiles: { name: 'Off', surname: 'Sick' } },
        { id: 'sick-2', leave_type: 'sick', date_from: addDays(today, -3), date_to: addDays(today, -2), profiles: { name: 'Back', surname: 'Now' } },
        { id: 'soon-1', leave_type: 'annual', date_from: addDays(today, 3), date_to: addDays(today, 5), profiles: { name: 'Soon', surname: 'Doctor' } },
        { id: 'far-1', leave_type: 'annual', date_from: '2099-01-01', date_to: '2099-01-05', profiles: { name: 'Later', surname: 'Doctor' } },
      ],
      error: null,
    }
    getDashboardHoursWarnings.mockResolvedValue([])

    renderDashboard()

    // One Team leave section: heading on the page with its link, a card
    // split into today and the week ahead.
    expect(await screen.findByText('On Leave')).toBeInTheDocument()
    const heading = screen.getByText('Team leave').closest('div')
    expect(within(heading).getByRole('link', { name: /View team leave/ })).toHaveAttribute('href', '/leave?tab=team')
    const today_ = screen.getByText('Away today').closest('div')
    // Each name carries its leave type — "away" alone never said what for.
    expect(within(today_).getByText('On Leave')).toBeInTheDocument()
    expect(within(today_).getByText(/^Annual · /)).toBeInTheDocument()
    // Sick leave is not planned leave: it has its own panel, today and the last week
    expect(within(today_).queryByText('Off Sick')).not.toBeInTheDocument()
    expect(within(screen.getByText('Off sick today').closest('div')).getByText('Off Sick')).toBeInTheDocument()
    expect(within(screen.getByText('Last 7 days').closest('div')).getByText('Back Now')).toBeInTheDocument()
    const next = screen.getByText('Next 7 days').closest('div')
    expect(within(next).getByText('Soon Doctor')).toBeInTheDocument()
    expect(within(next).getByText(/^Annual · /)).toBeInTheDocument()
    // Every name carries its avatar, the same one the Staff list shows.
    expect(within(today_).getByText('OL')).toBeInTheDocument()
    expect(within(next).getByText('SD')).toBeInTheDocument()
    expect(screen.queryByText(/Later Doctor/)).not.toBeInTheDocument()
    // No client-side profile_id scoping for the admin's team-wide widgets
    expect(eqCalls.some(([table, col]) => table === 'leave_requests' && col === 'profile_id')).toBe(false)
  })

  it('admin: keeps both headings, with the empty messages inside their cards', async () => {
    mockAuth = { profile: { id: 'admin-1', name: 'Admin' }, isAdmin: true }
    getDashboardHoursWarnings.mockResolvedValue([])

    renderDashboard()

    expect(await screen.findByText('Nothing needs your attention')).toBeInTheDocument()
    expect(screen.getByText('Nobody away today')).toBeInTheDocument()
    expect(screen.getByText('Nobody starting leave')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    // rows carry their own links; the heading has none to point the wrong way
    expect(screen.queryByRole('link', { name: /View requests/ })).not.toBeInTheDocument()
  })

  it('locum: shows own upcoming shifts, no leave widget', async () => {
    mockAuth = { profile: { id: 'locum-1', name: 'Loc' }, isAdmin: false, isClerk: false, isLocum: true }
    const today = todayStr()
    mockResponses['roster_entries:select'] = {
      data: [{ date: today, shift_type: { code: 'WD_08', label: 'Day shift', start_time: '08:00:00', end_time: '18:00:00', day_type: 'weekday', is_night_shift: false } }],
      error: null,
    }

    renderDashboard()

    expect(await screen.findByText('Day shift · 08h')).toBeInTheDocument()
    expect(screen.getByText('08–18')).toBeInTheDocument()
    expect(screen.queryByText('Annual leave balance')).not.toBeInTheDocument()
    expect(screen.queryByText('Request leave')).not.toBeInTheDocument()
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

describe('DashboardPage — Log late arrival', () => {
  it('admin: a button on the Needs attention heading opens the form with nothing but today filled in', async () => {
    mockAuth = { profile: { id: 'admin-1', name: 'Admin' }, isAdmin: true }
    getDashboardHoursWarnings.mockResolvedValue([])
    renderDashboard()
    const button = await screen.findByRole('button', { name: 'Log late arrival' })
    expect(button.closest('section').textContent).toMatch(/Needs attention/)
    expect(screen.queryByRole('dialog', { name: 'Log late arrival' })).not.toBeInTheDocument()
    await userEvent.click(button)
    expect(screen.getByRole('dialog', { name: 'Log late arrival' })).toHaveTextContent('today, anyone rostered')
  })

  it('is not shown to a doctor', async () => {
    mockAuth = { profile: { id: 'doc-1', name: 'Doc' }, isAdmin: false }
    renderDashboard()
    await screen.findAllByText(/./)
    expect(screen.queryByRole('button', { name: 'Log late arrival' })).not.toBeInTheDocument()
  })
})
