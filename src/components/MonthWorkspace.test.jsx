import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MonthWorkspace from './MonthWorkspace'

let mockAuth = { user: { id: 'admin-auth-1' }, isAdmin: true, canSubmitLeave: false }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const getApprovalWarnings = vi.fn()
vi.mock('../lib/leaveApprovals', async () => {
  const actual = await vi.importActual('../lib/leaveApprovals')
  return { ...actual, getApprovalWarnings: (...args) => getApprovalWarnings(...args) }
})

const createNotification = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/notifications', () => ({
  createNotification: (...args) => createNotification(...args),
}))

vi.mock('./LeaveRequestForm', () => ({
  default: ({ initialDateFrom, initialDateTo, onSubmitted }) => (
    <div>
      <p>LeaveRequestFormStub: {initialDateFrom} to {initialDateTo}</p>
      <button onClick={onSubmitted}>Simulate submit</button>
    </div>
  ),
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
        single() { return builder },
        order() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { data: null, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

const MAX_BY_COLUMN = { MO: 2, Registrar: 1, EC_COSMO: 1, OT_COSMO: 1 }

// p1 (Anderson, MO) approved on 12 Aug; p2 (Botha, Registrar) pending on
// 12 Aug — Registrar's cap is 1, so that pending request alone already
// puts the column at capacity.
const APPROVED_ROW = {
  id: 'req-1', profile_id: 'p1', date_from: '2026-08-12', date_to: '2026-08-12',
  leave_type: 'annual', status: 'approved', annual_leave_days: 1, notes: null,
  profiles: { name: 'Alice', surname: 'Anderson', category: 'MO' },
}
const PENDING_ROW = {
  id: 'req-2', profile_id: 'p2', date_from: '2026-08-12', date_to: '2026-08-12',
  leave_type: 'annual', status: 'pending', annual_leave_days: 1, notes: 'Family event',
  profiles: { name: 'Bob', surname: 'Botha', category: 'Registrar' },
}

function baseProps(overrides = {}) {
  const approvedByDate = new Map([
    ['2026-08-12', [{ profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved' }]],
  ])
  const pendingByDate = new Map([
    ['2026-08-12', [{ profileId: 'p2', surname: 'Botha', category: 'Registrar', status: 'pending' }]],
  ])
  const countByColumnPerDate = new Map([
    ['2026-08-12', new Map([['MO', 1], ['Registrar', 1]])],
  ])

  return {
    year: 2026,
    month: 8,
    onMonthChange: vi.fn(),
    approvedByDate,
    pendingByDate,
    approvedRows: [APPROVED_ROW],
    pendingRows: [PENDING_ROW],
    countByColumnPerDate,
    publicHolidaysByDate: new Map(),
    maxByColumnKey: MAX_BY_COLUMN,
    maxFullTime: 3,
    onDataChanged: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
}

describe('MonthWorkspace', () => {
  beforeEach(() => {
    fromCalls.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['leave_requests:update'] = { data: null, error: null }
    mockResponses['notifications:insert'] = { data: null, error: null }
    getApprovalWarnings.mockReset()
    createNotification.mockClear()
    mockAuth = { user: { id: 'admin-auth-1' }, isAdmin: true, canSubmitLeave: false }
  })

  it('renders a full calendar grid with full weekday names and the month label', () => {
    render(<MonthWorkspace {...baseProps()} />)
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.getByText('Saturday')).toBeInTheDocument()
    expect(screen.getByText('August 2026')).toBeInTheDocument()
  })

  it('reading surnames: shows approved plainly and pending in italics directly on the grid', () => {
    render(<MonthWorkspace {...baseProps()} />)
    expect(screen.getByText('Anderson')).toBeInTheDocument()
    const botha = screen.getByText('Botha')
    expect(botha).toHaveClass('italic')
  })

  it('checking capacity: clicking a day shows count/max per category, flagging the at-cap column', async () => {
    const user = userEvent.setup()
    render(<MonthWorkspace {...baseProps()} />)
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument() // MO
    const registrarCount = screen.getByText('1/1') // Registrar, at cap
    expect(registrarCount).toHaveClass('text-flagAmber')
  })

  it('reviewing pending requests: admin sees the pending request detail with its note', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    render(<MonthWorkspace {...baseProps()} />)
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByText('Bob Botha')).toBeInTheDocument()
    expect(screen.getByText('"Family event"')).toBeInTheDocument()
  })

  it('non-admin: pending entries are read-only, no approve/reject controls', async () => {
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true }
    const user = userEvent.setup()
    render(<MonthWorkspace {...baseProps()} />)
    await user.click(screen.getByText('Anderson'))

    await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('approving leave: a clean pending request (no warnings) approves in one click', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    const onDataChanged = vi.fn()
    render(<MonthWorkspace {...baseProps({ onDataChanged })} />)
    await user.click(screen.getByText('Anderson'))

    const approveBtn = await screen.findByRole('button', { name: 'Approve' })
    await user.click(approveBtn)

    expect(onDataChanged).toHaveBeenCalled()
    expect(fromCalls).toContain('leave_requests')
  })

  it('seeing rule impacts: a Tier-2 warning requires a second click ("Approve anyway" → "Confirm approval")', async () => {
    getApprovalWarnings.mockResolvedValue({
      supervisionBreaches: [{ date: '2026-08-12', shiftTypeId: 'wd08', remainingSupervisors: 0 }],
      balanceWarnings: [],
      hourCeilingWarning: null,
    })
    const user = userEvent.setup()
    render(<MonthWorkspace {...baseProps()} />)
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByText(/drop supervision below the required minimum/i)).toBeInTheDocument()
    const approveBtn = await screen.findByRole('button', { name: 'Approve anyway' })
    await user.click(approveBtn)
    expect(await screen.findByRole('button', { name: 'Confirm approval' })).toBeInTheDocument()
  })

  it('seeing rule impacts: flags a capacity breach when approving would push another Registrar over the cap', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    // A second, already-approved Registrar on the same day means approving
    // Botha's pending request would push the Registrar column (cap 1) to 2.
    const otherApproved = {
      id: 'req-3', profile_id: 'p4', date_from: '2026-08-12', date_to: '2026-08-12',
      leave_type: 'annual', status: 'approved', annual_leave_days: 1, notes: null,
      profiles: { name: 'Dana', surname: 'Davis', category: 'Registrar' },
    }
    const user = userEvent.setup()
    render(<MonthWorkspace {...baseProps({ approvedRows: [APPROVED_ROW, otherApproved] })} />)
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByText(/Approving would breach the Registrar cap/)).toBeInTheDocument()
  })

  it('rejecting leave: requires a reason field and a confirm step', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    const onDataChanged = vi.fn()
    render(<MonthWorkspace {...baseProps({ onDataChanged })} />)
    await user.click(screen.getByText('Anderson'))

    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    await user.click(screen.getByRole('button', { name: 'Confirm reject' }))

    expect(onDataChanged).toHaveBeenCalled()
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'leave_rejected' }))
  })

  it('submitting leave: opens the request form prefilled with the clicked date, and returns to the review view on submit', async () => {
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true }
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    const onDataChanged = vi.fn()
    render(<MonthWorkspace {...baseProps({ onDataChanged })} />)
    await user.click(screen.getByText('Anderson'))

    await user.click(await screen.findByRole('button', { name: 'Request annual leave for this day' }))
    expect(screen.getByText('LeaveRequestFormStub: 2026-08-12 to 2026-08-12')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Simulate submit' }))
    expect(onDataChanged).toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument() // back to the review view
  })

  it('indicates a public holiday day with a distinct highlight and shows its name in the review modal', async () => {
    const user = userEvent.setup()
    const publicHolidaysByDate = new Map([['2026-08-12', 'Some Holiday']])
    render(<MonthWorkspace {...baseProps({ publicHolidaysByDate })} />)
    expect(screen.getByText('Public holiday')).toBeInTheDocument() // legend entry
    await user.click(screen.getByText('Anderson'))
    // Shown once on the grid cell and again in the opened review modal.
    expect(await screen.findAllByText('Some Holiday')).toHaveLength(2)
  })

  it('marks an approved surname with an Approved indicator, alongside the existing Pending one', async () => {
    const user = userEvent.setup()
    render(<MonthWorkspace {...baseProps()} />)
    await user.click(screen.getByText('Anderson'))

    await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })
    expect(screen.getByText('Approved')).toHaveClass('text-success')
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('opens the review modal for highlightDate on mount (a deep link from the Requests queue) and reports it consumed', () => {
    const onHighlightConsumed = vi.fn()
    render(<MonthWorkspace {...baseProps({ highlightDate: '2026-08-12', onHighlightConsumed })} />)
    expect(screen.getByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
    expect(onHighlightConsumed).toHaveBeenCalled()
  })

  it('does not report a highlight consumed when no highlightDate was given', () => {
    const onHighlightConsumed = vi.fn()
    render(<MonthWorkspace {...baseProps({ onHighlightConsumed })} />)
    expect(onHighlightConsumed).not.toHaveBeenCalled()
  })

  it('month navigation and back button call their callbacks', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    const onBack = vi.fn()
    render(<MonthWorkspace {...baseProps({ onMonthChange, onBack })} />)

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 9)

    await user.click(screen.getByRole('button', { name: '← Back to overview' }))
    expect(onBack).toHaveBeenCalled()
  })
})
