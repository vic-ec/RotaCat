import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import LeaveApprovalQueue from './LeaveApprovalQueue'

function renderQueue(props) {
  return render(<LeaveApprovalQueue {...props} />, { wrapper: MemoryRouter })
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location-probe">{location.pathname}{location.search}</p>
}

function renderQueueWithLocationProbe(props) {
  return render(
    <MemoryRouter initialEntries={['/leave?tab=planners&sub=requests']}>
      <Routes>
        <Route path="/leave" element={<><LeaveApprovalQueue {...props} /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  )
}

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
    mockResponses['public_holidays:select'] = { data: [], error: null }
  })

  it('renders Approve/Reject as bare icons (no background box) and View Calendar as a bordered icon button, all the same size', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    renderQueue()

    const approveBtn = await screen.findByRole('button', { name: 'Approve' })
    const rejectBtn = screen.getByRole('button', { name: 'Reject' })
    const viewCalendarBtn = screen.getByRole('button', { name: 'View Calendar' })

    expect(approveBtn.className).not.toMatch(/\bbg-|\bborder\b/)
    expect(rejectBtn.className).not.toMatch(/\bbg-|\bborder\b/)
    expect(viewCalendarBtn).toHaveClass('border', 'bg-success-bg')

    for (const btn of [approveBtn, rejectBtn, viewCalendarBtn]) {
      expect(btn.querySelector('svg')).toHaveClass('h-5', 'w-5')
    }
  })

  it('clean case: no warnings shows a single-click Approve button', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    renderQueue()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument())
    expect(screen.queryByText(/drop supervision/i)).not.toBeInTheDocument()
  })

  it('formats the row as "{leave type} - DDD dd MMM YYYY to DDD dd MMM YYYY", with no weekend/Sat/Sun/PH count', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    mockResponses['public_holidays:select'] = { data: [{ date: '2026-08-12' }], error: null }
    renderQueue()

    // 2026-08-10 is a Monday, 2026-08-14 a Friday — a plain working week
    // except for the one public holiday on the 12th, which no longer gets
    // its own summary line.
    expect(await screen.findByText('Annual leave - Mon 10 Aug 2026 to Fri 14 Aug 2026')).toBeInTheDocument()
    expect(screen.queryByText(/included$/)).not.toBeInTheDocument()
  })

  it('does not show a summary line for a plain range with no weekend days or public holidays', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    renderQueue()

    await screen.findByText('Annual leave - Mon 10 Aug 2026 to Fri 14 Aug 2026')
    expect(screen.queryByText(/included$/)).not.toBeInTheDocument()
  })

  it('renders a back link that calls onBack when provided, and omits it otherwise', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const onBack = vi.fn()
    const user = userEvent.setup()
    renderQueue({ onBack })

    // Wait for the queue to finish loading first — the back link also
    // renders during the loading state, but as a different DOM node (the
    // loading/loaded branches return different root elements), so querying
    // it before the swap risks clicking a node about to be unmounted.
    await screen.findByRole('button', { name: 'Approve' })
    await user.click(screen.getByRole('button', { name: /Back to Annual planner/ }))
    expect(onBack).toHaveBeenCalled()
  })

  it('omits the back link when onBack is not provided', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    renderQueue()

    await screen.findByRole('button', { name: 'Approve' })
    expect(screen.queryByRole('button', { name: /Back to Annual planner/ })).not.toBeInTheDocument()
  })

  it('flags a supervision-floor breach and requires a second click to approve', async () => {
    getApprovalWarnings.mockResolvedValue({
      supervisionBreaches: [{ date: '2026-08-10', shiftTypeId: 'wd08', remainingSupervisors: 0 }],
      balanceWarnings: [],
      hourCeilingWarning: null,
    })
    const user = userEvent.setup()
    renderQueue()

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
    renderQueue()

    expect(await screen.findByText(/2026 annual leave balance would go negative/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Approve anyway' })).toBeInTheDocument()
  })

  it('flags a five_eighths doctor already at their hour ceiling', async () => {
    getApprovalWarnings.mockResolvedValue({
      supervisionBreaches: [],
      balanceWarnings: [],
      hourCeilingWarning: { year: 2026, month: 8, alreadyRosteredHours: 122, maxHours: 118 },
    })
    renderQueue()

    expect(await screen.findByText(/already has 122h rostered this month/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Approve anyway' })).toBeInTheDocument()
  })

  it('"View Calendar" on an annual leave request navigates to the Annual month workspace with a highlight', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueueWithLocationProbe()

    await user.click(await screen.findByRole('button', { name: 'View Calendar' }))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/leave?tab=planners&sub=annual&month=2026-08&highlight=2026-08-10')
  })

  it('"View Calendar" on a non-annual request navigates to the Special tab instead', async () => {
    mockResponses['leave_requests:select'] = {
      data: [{ ...PENDING_REQUEST, leave_type: 'sick' }],
      error: null,
    }
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueueWithLocationProbe()

    await user.click(await screen.findByRole('button', { name: 'View Calendar' }))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/leave?tab=planners&sub=special')
  })

  it('rejecting only updates leave_requests, never touches roster_entries (availability)', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm reject' }))

    await waitFor(() => expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'leave_rejected' })))
    expect(fromCalls).not.toContain('roster_entries')
  })
})
