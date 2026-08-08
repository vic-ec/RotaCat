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
        neq() { return builder },
        in() { return builder },
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

// Opens the row's detail panel — approve/reject/period/warnings all now
// live there rather than inline on the row (see LeaveApprovalQueue.jsx).
// Clicking the visible name text bubbles up to the row's own onClick.
async function openPanel(user, name = 'Jane Doe') {
  await user.click(await screen.findByText(name))
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

  it('row shows name, category, "Requesting <leave type>", and a circular View Calendar icon button', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    renderQueue()

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Medical Officer')).toBeInTheDocument()
    expect(screen.getByText('Requesting Annual leave')).toBeInTheDocument()

    const viewCalendarBtn = screen.getByRole('button', { name: 'View Calendar' })
    expect(viewCalendarBtn).toHaveClass('rounded-full', 'border', 'h-8', 'w-8')
    expect(viewCalendarBtn.className).toMatch(/text-accent/)
  })

  it('clicking a row opens the detail panel with the period, days total, and a single-click Approve button', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    await openPanel(user)

    // 2026-08-10 is a Monday, 2026-08-14 a Friday.
    expect(await screen.findByText('Mon 10 Aug 2026 to Fri 14 Aug 2026')).toBeInTheDocument()
    expect(screen.getByText('5 days total')).toBeInTheDocument()

    const approveBtn = screen.getByRole('button', { name: 'Approve' })
    expect(approveBtn).toHaveClass('btn-primary')
    expect(screen.queryByText(/drop supervision/i)).not.toBeInTheDocument()
  })

  it('closes the panel via the corner × without approving or rejecting', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    await openPanel(user)
    await screen.findByRole('button', { name: 'Approve' })
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(fromCalls).not.toContain('roster_entries')
  })

  it('renders a back link that calls onBack when provided, and omits it otherwise', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const onBack = vi.fn()
    const user = userEvent.setup()
    renderQueue({ onBack })

    await screen.findByText('Jane Doe')
    await user.click(screen.getByRole('button', { name: /Back to Annual planner/ }))
    expect(onBack).toHaveBeenCalled()
  })

  it('omits the back link when onBack is not provided', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    renderQueue()

    await screen.findByText('Jane Doe')
    expect(screen.queryByRole('button', { name: /Back to Annual planner/ })).not.toBeInTheDocument()
  })

  it('flags a supervision-floor breach in the panel and requires a second click to approve', async () => {
    getApprovalWarnings.mockResolvedValue({
      supervisionBreaches: [{ date: '2026-08-10', shiftTypeId: 'wd08', remainingSupervisors: 0 }],
      balanceWarnings: [],
      hourCeilingWarning: null,
    })
    const user = userEvent.setup()
    renderQueue()

    await openPanel(user)
    expect(await screen.findByText(/drop supervision below the required minimum/i)).toBeInTheDocument()
    const approveBtn = await screen.findByRole('button', { name: 'Approve anyway' })
    await user.click(approveBtn)
    expect(await screen.findByRole('button', { name: 'Confirm approval' })).toBeInTheDocument()
  })

  it('flags a negative annual leave balance in the panel', async () => {
    getApprovalWarnings.mockResolvedValue({
      supervisionBreaches: [],
      balanceWarnings: [{ year: 2026, remainingAfter: -3, daysAllotted: 22, daysAlreadyApproved: 20, daysRequested: 5 }],
      hourCeilingWarning: null,
    })
    const user = userEvent.setup()
    renderQueue()

    await openPanel(user)
    expect(await screen.findByText(/2026 annual leave balance would go negative/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Approve anyway' })).toBeInTheDocument()
  })

  it('flags a five_eighths doctor already at their hour ceiling in the panel', async () => {
    getApprovalWarnings.mockResolvedValue({
      supervisionBreaches: [],
      balanceWarnings: [],
      hourCeilingWarning: { year: 2026, month: 8, alreadyRosteredHours: 122, maxHours: 118 },
    })
    const user = userEvent.setup()
    renderQueue()

    await openPanel(user)
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

  it('rejecting requires a non-empty reason before the confirm button is enabled', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    await openPanel(user)
    await user.click(await screen.findByRole('button', { name: 'Reject' }))

    const confirmBtn = screen.getByRole('button', { name: 'Confirm reject' })
    expect(confirmBtn).toBeDisabled()

    await user.type(screen.getByLabelText('Reason for rejection'), 'Overlaps a staffing gap')
    expect(confirmBtn).toBeEnabled()
  })

  it('rejecting only updates leave_requests, never touches roster_entries (availability)', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    await openPanel(user)
    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    await user.type(screen.getByLabelText('Reason for rejection'), 'Overlaps a staffing gap')
    await user.click(screen.getByRole('button', { name: 'Confirm reject' }))

    await waitFor(() => expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'leave_rejected' })))
    expect(fromCalls).not.toContain('roster_entries')
  })
})
