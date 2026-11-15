import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyRequestHistory from './MyRequestHistory'

let mockAuth = { profile: { id: 'doctor-1' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const { mockData, eqCalls } = vi.hoisted(() => ({ mockData: { rows: [] }, eqCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      const builder = {
        select() { return builder },
        eq(...args) { eqCalls.push([table, ...args]); return builder },
        order() { return builder },
        then(resolve, reject) {
          return Promise.resolve({ data: mockData.rows, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

describe('MyRequestHistory', () => {
  beforeEach(() => {
    eqCalls.length = 0
    mockData.rows = []
  })

  it('explicitly scopes the query to the signed-in profile', async () => {
    mockData.rows = [{ id: 'r1', leave_type: 'annual', date_from: '2026-01-01', date_to: '2026-01-05', status: 'pending' }]
    render(<MyRequestHistory />)
    await screen.findByText(/Annual leave/)
    expect(eqCalls).toContainEqual(['leave_requests', 'profile_id', 'doctor-1'])
  })

  it('shows both past and future requests, including rejected ones with the reviewer note', async () => {
    mockData.rows = [
      {
        id: 'r1', leave_type: 'sick', date_from: '2025-03-01', date_to: '2025-03-02', status: 'rejected',
        reviewed_at: '2025-02-28T00:00:00Z', admin_notes: 'No cover available', reviewer: { name: 'Ada', surname: 'Admin' },
      },
    ]
    render(<MyRequestHistory />)
    // A rejected request gets its own section below Pending/Approved rather
    // than disappearing — heading plus the row's own status pill
    expect(await screen.findAllByText('Rejected')).toHaveLength(2)
    // Dates read in the app's standard formats, never the raw columns or a
    // device-locale date: the period as "1–2 March 2025", the review
    // timestamp as "28 Feb 2025".
    expect(screen.getByText(/Sick leave — 1–2 March 2025/)).toBeInTheDocument()
    expect(screen.getByText(/Rejected by Ada Admin on 28 Feb 2025/)).toBeInTheDocument()
    expect(screen.getByText(/No cover available/)).toBeInTheDocument()
  })

  it('shows the total-vs-annual days summary for an annual leave row with a padding weekend', async () => {
    mockData.rows = [{
      id: 'r1', leave_type: 'annual', date_from: '2026-08-08', date_to: '2026-08-14', status: 'approved', annual_leave_days: 5,
    }]
    render(<MyRequestHistory />)
    expect(await screen.findByText('7 total days (5 annual leave)')).toBeInTheDocument()
  })

  it('splits the page into a Pending section above an Approved section', async () => {
    mockData.rows = [
      { id: 'r1', leave_type: 'annual', date_from: '2026-08-24', date_to: '2026-08-28', status: 'pending' },
      { id: 'r2', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-16', status: 'approved' },
    ]
    render(<MyRequestHistory />)

    const sections = await screen.findAllByRole('region')
    // The divider carries the count after the title ("Pending review · 1").
    expect(sections.map(s => s.querySelector('h2').textContent.trim())).toEqual(['Pending review · 1', 'Approved · 1'])
    expect(sections[0].textContent).toMatch(/24–28 August 2026/)
    expect(sections[1].textContent).toMatch(/10–16 August 2026/)
  })

  it('collapses an empty section to a single row instead of an empty panel', async () => {
    mockData.rows = [{ id: 'r1', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-16', status: 'approved' }]
    render(<MyRequestHistory />)

    const pending = (await screen.findByText('Pending review')).closest('section')
    expect(pending.textContent).toMatch('No requests pending review')
    // One muted row, not a panel of rows.
    expect(pending.querySelector('.divide-y')).toBeNull()
  })

  it('shows an empty state for both sections with no requests at all', async () => {
    render(<MyRequestHistory />)
    expect(await screen.findByText('No requests pending review')).toBeInTheDocument()
    expect(screen.getByText('No requests approved')).toBeInTheDocument()
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument()
  })
})

describe('MyRequestHistory — cancelling', () => {
  beforeEach(() => {
    eqCalls.length = 0
    mockAuth = { profile: { id: 'doctor-1' }, isAdmin: false }
  })

  it('offers Cancel on future pending/approved requests but not on past or decided ones', async () => {
    const future = '2999-01-10'
    mockData.rows = [
      { id: 'f1', profile_id: 'doctor-1', leave_type: 'annual', date_from: future, date_to: future, status: 'approved' },
      { id: 'f2', profile_id: 'doctor-1', leave_type: 'study', date_from: future, date_to: future, status: 'pending' },
      { id: 'p1', profile_id: 'doctor-1', leave_type: 'annual', date_from: '2020-01-01', date_to: '2020-01-02', status: 'approved' },
      { id: 'r1', profile_id: 'doctor-1', leave_type: 'annual', date_from: future, date_to: future, status: 'rejected' },
    ]
    render(<MyRequestHistory />)
    await screen.findByText(/Study leave/)
    const cancelButtons = screen.getAllByRole('button', { name: /^Cancel .* request$/ })
    expect(cancelButtons).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Cancel Annual leave request' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Study leave request' })).toBeInTheDocument()
  })

  it('lists cancelled requests in their own section with who cancelled and why', async () => {
    mockData.rows = [
      {
        id: 'c1', profile_id: 'doctor-1', leave_type: 'annual', date_from: '2026-03-02', date_to: '2026-03-04', status: 'cancelled',
        cancelled_by: 'doctor-1', cancelled_at: '2026-02-01T09:00:00Z', cancel_reason: 'Plans changed',
      },
      {
        id: 'c2', profile_id: 'doctor-1', leave_type: 'study', date_from: '2026-04-02', date_to: '2026-04-02', status: 'cancelled',
        cancelled_by: 'admin-9', cancelled_at: '2026-02-02T09:00:00Z', cancel_reason: 'Course withdrawn', canceller: { name: 'Ada', surname: 'Admin' },
      },
    ]
    render(<MyRequestHistory />)
    expect(await screen.findByRole('region', { name: 'Cancelled' })).toBeInTheDocument()
    expect(screen.getByText(/Cancelled by you on .* — "Plans changed"/)).toBeInTheDocument()
    expect(screen.getByText(/Cancelled by Ada Admin on .* — "Course withdrawn"/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cancel / })).not.toBeInTheDocument()
  })
})
