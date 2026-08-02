import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeaveApprovalQueue from './LeaveApprovalQueue'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1' } }),
}))

const getApprovalWarnings = vi.fn()
vi.mock('../lib/leaveApprovals', async () => {
  const actual = await vi.importActual('../lib/leaveApprovals')
  return { ...actual, getApprovalWarnings: (...args) => getApprovalWarnings(...args) }
})

const createNotification = vi.fn().mockResolvedValue({ error: null })
vi.mock('../lib/notifications', () => ({
  createNotification: (...args) => createNotification(...args),
}))

const { mockResponses, fromCalls } = vi.hoisted(() => ({ mockResponses: {}, fromCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      fromCalls.push(table)
      let method = null
      const builder = {
        select() { method = 'select'; return builder },
        update() { method = 'update'; return builder },
        insert() { method = 'insert'; return builder },
        eq() { return builder },
        gte() { return builder },
        lte() { return builder },
        not() { return builder },
        order() { return builder },
        single() { return builder },
        maybeSingle() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { data: null, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

const PENDING_REQUEST = {
  id: 'req-1',
  profile_id: 'doctor-1',
  leave_type: 'annual',
  date_from: '2026-08-10',
  date_to: '2026-08-14',
  notes: null,
  status: 'pending',
  profiles: { name: 'Jane', surname: 'Doe', category: 'MO', contract_type: 'full' },
}

describe('LeaveApprovalQueue', () => {
  beforeEach(() => {
    getApprovalWarnings.mockReset()
    createNotification.mockClear()
    fromCalls.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['leave_requests:select'] = { data: [PENDING_REQUEST], error: null }
    mockResponses['leave_requests:update'] = { data: null, error: null }
    mockResponses['notifications:insert'] = { data: null, error: null }
  })

  it('clean case: no warnings shows a single-click Approve button', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    render(<LeaveApprovalQueue />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument())
    expect(screen.queryByText(/⚠/)).not.toBeInTheDocument()
  })

  it('flags a supervision-floor breach and requires a second click to approve', async () => {
    getApprovalWarnings.mockResolvedValue({
      supervisionBreaches: [{ date: '2026-08-10', shiftTypeId: 'wd08', remainingSupervisors: 0 }],
      balanceWarnings: [],
      hourCeilingWarning: null,
    })
    const user = userEvent.setup()
    render(<LeaveApprovalQueue />)

    expect(await screen.findByText(/drop supervision below the required minimum/i)).toBeInTheDocument()
    const approveBtn = await screen.findByRole('button', { name: 'Approve anyway' })
    await user.click(approveBtn)
    expect(await screen.findByRole('button', { name: 'Confirm approval' })).toBeInTheDocument()
  })

  it('flags a negative annual leave balance', async () => {
    getApprovalWarnings.mockResolvedValue({
      supervisionBreaches: [],
      balanceWarnings: [{ year: 2026, remainingAfter: -3, daysAllotted: 22, daysAlreadyApproved: 20, daysRequested: 5 }],
      hourCeilingWarning: null,
    })
    render(<LeaveApprovalQueue />)

    expect(await screen.findByText(/2026 annual leave balance would go negative/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Approve anyway' })).toBeInTheDocument()
  })

  it('flags a five_eighths doctor already at their hour ceiling', async () => {
    getApprovalWarnings.mockResolvedValue({
      supervisionBreaches: [],
      balanceWarnings: [],
      hourCeilingWarning: { year: 2026, month: 8, alreadyRosteredHours: 122, maxHours: 118 },
    })
    render(<LeaveApprovalQueue />)

    expect(await screen.findByText(/already has 122h rostered this month/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Approve anyway' })).toBeInTheDocument()
  })

  it('rejecting only updates leave_requests, never touches roster_entries (availability)', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    render(<LeaveApprovalQueue />)

    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm reject' }))

    await waitFor(() => expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'leave_rejected' })))
    expect(fromCalls).not.toContain('roster_entries')
  })
})
