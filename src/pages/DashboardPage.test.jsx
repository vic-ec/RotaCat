import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

const { mockResponses, eqCalls } = vi.hoisted(() => ({ mockResponses: {}, eqCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      const builder = {
        select() { method = 'select'; return builder },
        eq(col, val) { eqCalls.push([table, col, val]); return builder },
        gte() { return builder },
        lte() { return builder },
        not() { return builder },
        neq() { return builder },
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

describe('DashboardPage', () => {
  beforeEach(() => {
    eqCalls.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    getDashboardHoursWarnings.mockReset()
  })

  it('doctor: shows only their own leave, explicitly scoped by profile_id', async () => {
    mockAuth = { profile: { id: 'doctor-1', name: 'Jane' }, isAdmin: false }
    mockResponses['leave_requests:select'] = {
      data: [{ id: 'lr1', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved' }],
      error: null,
    }

    render(<DashboardPage />)

    expect(await screen.findByText(/Annual leave — 2026-08-10/)).toBeInTheDocument()
    expect(eqCalls).toContainEqual(['leave_requests', 'profile_id', 'doctor-1'])
  })

  it('admin: shows on-leave-now, on-leave-next, and the live hours warning', async () => {
    mockAuth = { profile: { id: 'admin-1', name: 'Admin' }, isAdmin: true }
    const today = new Date().toISOString().slice(0, 10)
    mockResponses['leave_requests:select'] = {
      data: [
        { id: 'now-1', leave_type: 'sick', date_from: today, date_to: today, profiles: { name: 'On', surname: 'Leave' } },
        { id: 'next-1', leave_type: 'annual', date_from: '2099-01-01', date_to: '2099-01-05', profiles: { name: 'Later', surname: 'Doctor' } },
      ],
      error: null,
    }
    mockResponses['profiles:select'] = { data: [{ id: 'p1', name: 'Eveline', surname: 'Baerends', contract_type: 'five_eighths' }], error: null }
    getDashboardHoursWarnings.mockResolvedValue([{ profileId: 'p1', name: 'Eveline', surname: 'Baerends', hours: 122, ceiling: 118 }])

    render(<DashboardPage />)

    expect(await screen.findByText(/On Leave/)).toBeInTheDocument()
    expect(await screen.findByText(/Later Doctor/)).toBeInTheDocument()
    expect(await screen.findByText(/Eveline Baerends — 122h rostered \(ceiling: 118h\)/)).toBeInTheDocument()
    // No client-side profile_id scoping for the admin's team-wide widgets
    expect(eqCalls.some(([table, col]) => table === 'leave_requests' && col === 'profile_id')).toBe(false)
  })

  it('locum: shows own upcoming shifts, no leave widget', async () => {
    mockAuth = { profile: { id: 'locum-1', name: 'Loc' }, isAdmin: false, isClerk: false, isLocum: true }
    const today = todayStr()
    mockResponses['roster_entries:select'] = {
      data: [{ date: today, shift_type: { code: 'WD_08', label: 'Day shift', start_time: '08:00:00', end_time: '18:00:00' } }],
      error: null,
    }

    render(<DashboardPage />)

    expect(await screen.findByText(new RegExp(`${today} — Day shift`))).toBeInTheDocument()
    expect(screen.queryByText('Your leave')).not.toBeInTheDocument()
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

    render(<DashboardPage />, { wrapper: MemoryRouter })

    expect(await screen.findByText(/Onno Now — All day/)).toBeInTheDocument()
    expect(await screen.findByText(/Sona Soon — Early shift/)).toBeInTheDocument()
    expect(await screen.findByText(/Lea Vantly — until/)).toBeInTheDocument()
    expect(screen.queryByText('Your leave')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Roster' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Staff' })).toBeInTheDocument()
  })
})
