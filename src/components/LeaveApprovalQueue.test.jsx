import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
    <MemoryRouter initialEntries={['/leave?tab=requests']}>
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

// fetchAnnualCapacityPreview/fetchAffectedLeaveForRequest are both thin
// Supabase-querying wrappers (unit-tested on their pure halves in
// leaveRequests.test.js — capacityAssessmentState, naturalLeavePeriodLabel)
// — mocked directly here, same pattern LeaveRequestForm.test.jsx already
// uses for fetchAnnualCapacityPreview, rather than threading fixture rows
// through the generic supabase mock below and hoping its non-filtering
// eq/neq/gte/lte stand-ins happen to produce the right shape.
const fetchAnnualCapacityPreview = vi.fn()
const fetchAffectedLeaveForRequest = vi.fn()
vi.mock('../lib/leaveRequests', async () => {
  const actual = await vi.importActual('../lib/leaveRequests')
  return {
    ...actual,
    fetchAnnualCapacityPreview: (...args) => fetchAnnualCapacityPreview(...args),
    fetchAffectedLeaveForRequest: (...args) => fetchAffectedLeaveForRequest(...args),
  }
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

// 2026-08-10 is a Monday, 2026-08-14 a Friday — 5 calendar days, all within
// August (same-month range, so the drawer's compact DateCards stay hidden —
// see the "crosses a month" test below for when they reappear).
const PENDING_REQUEST = {
  id: 'req-1',
  profile_id: 'doctor-1',
  leave_type: 'annual',
  date_from: '2026-08-10',
  date_to: '2026-08-14',
  annual_leave_days: 5,
  notes: null,
  status: 'pending',
  created_at: '2026-08-05T14:32:00.000Z',
  profiles: { name: 'Jane', surname: 'Doe', category: 'MO', contract_type: 'full' },
}

// Opens the row's detail drawer — approve/reject/period/warnings all live
// there rather than inline on the row (see LeaveApprovalQueue.jsx).
// Clicking the visible name text bubbles up to the row's own onClick.
// Returns the drawer's dialog element, since once it's open the row stays
// visible behind it — name/category text exists twice in the document, so
// callers should scope further queries with `within(dialog)` rather than
// plain `screen` queries wherever the row could also match.
async function openPanel(user, name = 'Jane Doe') {
  await user.click(await screen.findByText(name))
  return screen.getByRole('dialog')
}

describe('LeaveApprovalQueue', () => {
  beforeEach(() => {
    getApprovalWarnings.mockReset()
    fetchAnnualCapacityPreview.mockReset().mockResolvedValue(null)
    fetchAffectedLeaveForRequest.mockReset().mockResolvedValue([])
    createNotification.mockClear()
    fromCalls.length = 0
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
    mockResponses['leave_requests:select'] = { data: [PENDING_REQUEST], error: null }
    mockResponses['leave_requests:update'] = { data: null, error: null }
    mockResponses['notifications:insert'] = { data: null, error: null }
    mockResponses['public_holidays:select'] = { data: [], error: null }
  })

  it('row shows name, category, "<type> request, submitted <date>", and a circular View Calendar icon button', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    renderQueue()

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Medical Officer')).toBeInTheDocument()
    expect(screen.getByText('Annual leave request, submitted 05-08-2026 · 14:32')).toBeInTheDocument()

    const viewCalendarBtn = screen.getByRole('button', { name: 'View Calendar' })
    expect(viewCalendarBtn).toHaveClass('rounded-full', 'border', 'h-8', 'w-8')
    expect(viewCalendarBtn.className).toMatch(/text-accent/)
  })

  it('clicking a row opens a review drawer with status-led identity, the natural-language period, and a wide primary Approve action', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    const dialog = await openPanel(user)

    // Header: dynamic "{leave type} request" title, a "Pending" status
    // pill (not "New"), and a "Submitted DD-MM-YYYY · HH:MM" meta line —
    // no separate "Back to Requests" breadcrumb (the corner × is the only
    // way out, per the drawer/modal "close, don't also breadcrumb" rule).
    expect(within(dialog).getByRole('heading', { name: 'Annual leave request' })).toBeInTheDocument()
    expect(within(dialog).getByText('Pending')).toBeInTheDocument()
    expect(within(dialog).getByText('Submitted 05-08-2026 · 14:32')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Back to Requests/)).not.toBeInTheDocument()

    // Requested period: a natural-language sentence instead of decorative
    // date boxes (same month, so the compact DateCards stay hidden).
    expect(within(dialog).getByText('10–14 August 2026 · 5 calendar days')).toBeInTheDocument()
    expect(within(dialog).getByText('5 annual-leave days')).toBeInTheDocument()

    // Approve (wide, primary) + Decline… (narrower, outlined) — not an
    // equal-width pair, per the "not equally prominent" design rule.
    const approveBtn = within(dialog).getByRole('button', { name: 'Approve request' })
    const declineBtn = within(dialog).getByRole('button', { name: 'Decline…' })
    expect(approveBtn.className).toMatch(/btn-success/)
    expect(approveBtn).toHaveClass('flex-1')
    expect(declineBtn.className).toMatch(/btn-danger-outline/)
    expect(declineBtn).not.toHaveClass('flex-1')
    expect(within(dialog).queryByText(/drop supervision/i)).not.toBeInTheDocument()
  })

  it('shows compact start/end DateCards only when the range crosses a month boundary', async () => {
    mockResponses['leave_requests:select'] = {
      data: [{ ...PENDING_REQUEST, date_from: '2026-08-28', date_to: '2026-09-03', annual_leave_days: 7 }],
      error: null,
    }
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    const dialog = await openPanel(user)
    // en-GB's short month for September renders as "Sept", not "Sep".
    expect(within(dialog).getByText('28 Aug – 3 Sept 2026 · 7 calendar days')).toBeInTheDocument()
    // DateCard renders each end's weekday abbreviation and date number.
    expect(within(dialog).getByText('Fri')).toBeInTheDocument() // 28 Aug 2026
    expect(within(dialog).getByText('Thu')).toBeInTheDocument() // 3 Sep 2026
  })

  it('closes the drawer via the corner × without approving or rejecting', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    const dialog = await openPanel(user)
    await within(dialog).findByRole('button', { name: 'Approve request' })
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fromCalls).not.toContain('roster_entries')
  })

  it('the footer carries no separate Cancel button in the main (non-declining) state', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    const dialog = await openPanel(user)
    await within(dialog).findByRole('button', { name: 'Approve request' })
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('the drawer\'s "View calendar" action is a subtle link beside the Capacity assessment heading, not a full-width button', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    const dialog = await openPanel(user)
    const link = within(dialog).getByRole('button', { name: /View calendar/ })
    expect(link.className).not.toMatch(/btn-secondary/)
    expect(link).not.toHaveClass('w-full')
    expect(link.className).toMatch(/text-accent/)
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

  describe('Capacity assessment', () => {
    it('shows "Capacity available" with at most half the pool taken', async () => {
      fetchAnnualCapacityPreview.mockResolvedValue({ taken: 1, max: 2, pooled: true, columnLabel: 'MO', atCapacity: false })
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText('Capacity available')).toBeInTheDocument()
      expect(within(dialog).getByText('1 of 2 shared leave slots taken')).toBeInTheDocument()
      expect(within(dialog).getByText(/1 slot remains · Shared pool:/)).toBeInTheDocument()
    })

    it('shows "Limited capacity" once more than half the pool is taken', async () => {
      fetchAnnualCapacityPreview.mockResolvedValue({ taken: 2, max: 3, pooled: false, columnLabel: 'OT Intern', atCapacity: false })
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText('Limited capacity')).toBeInTheDocument()
      expect(within(dialog).getByText(/1 slot remains · For OT Intern/)).toBeInTheDocument()
    })

    it('shows "At capacity" once every slot is taken, and folds it into the approve confirmation gate', async () => {
      fetchAnnualCapacityPreview.mockResolvedValue({ taken: 2, max: 2, pooled: true, columnLabel: 'MO', atCapacity: true })
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText('At capacity')).toBeInTheDocument()
      expect(within(dialog).getByText('No leave slots remain in this shared pool.')).toBeInTheDocument()

      // At-capacity requires the same second-click confirmation a Tier-2
      // warning would, even though no warning fired.
      const approveBtn = await within(dialog).findByRole('button', { name: 'Approve anyway' })
      await user.click(approveBtn)
      expect(await within(dialog).findByRole('button', { name: 'Confirm approval' })).toBeInTheDocument()
    })

    it('shows a neutral message, not a colored card, when no capacity column applies', async () => {
      fetchAnnualCapacityPreview.mockResolvedValue(null)
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText('No leave-slot limit applies to this category/leave type.')).toBeInTheDocument()
      expect(within(dialog).queryByText('Capacity available')).not.toBeInTheDocument()
    })

    it('shows Tier-2 warnings as a red "Requires review" block, not amber', async () => {
      getApprovalWarnings.mockResolvedValue({
        supervisionBreaches: [{ date: '2026-08-10', shiftTypeId: 'wd08', remainingSupervisors: 0 }],
        balanceWarnings: [],
        hourCeilingWarning: null,
      })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText('Requires review')).toBeInTheDocument()
      expect(within(dialog).getByText('Requires review').className).toMatch(/text-danger/)
      expect(within(dialog).getByText(/drop supervision below the required minimum/i)).toBeInTheDocument()
      const approveBtn = await within(dialog).findByRole('button', { name: 'Approve anyway' })
      await user.click(approveBtn)
      expect(await within(dialog).findByRole('button', { name: 'Confirm approval' })).toBeInTheDocument()
    })

    it('flags a negative annual leave balance', async () => {
      getApprovalWarnings.mockResolvedValue({
        supervisionBreaches: [],
        balanceWarnings: [{ year: 2026, remainingAfter: -3, daysAllotted: 22, daysAlreadyApproved: 20, daysRequested: 5 }],
        hourCeilingWarning: null,
      })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText(/2026 annual leave balance would go negative/i)).toBeInTheDocument()
      expect(await within(dialog).findByRole('button', { name: 'Approve anyway' })).toBeInTheDocument()
    })

    it('flags a five_eighths doctor already at their hour ceiling', async () => {
      getApprovalWarnings.mockResolvedValue({
        supervisionBreaches: [],
        balanceWarnings: [],
        hourCeilingWarning: { year: 2026, month: 8, alreadyRosteredHours: 122, maxHours: 118 },
      })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText(/already has 122h rostered this month/i)).toBeInTheDocument()
      expect(await within(dialog).findByRole('button', { name: 'Approve anyway' })).toBeInTheDocument()
    })
  })

  describe('Who is already away', () => {
    it('lists overlapping approved/pending leave with a status pill and a summary count', async () => {
      fetchAffectedLeaveForRequest.mockResolvedValue([
        { id: 'lr-2', profileId: 'doctor-2', name: 'Sam Moodley', category: 'MO', status: 'approved', dateFrom: '2026-08-08', dateTo: '2026-08-16' },
        { id: 'lr-3', profileId: 'doctor-3', name: 'Priya Naidoo', category: 'Registrar', status: 'pending', dateFrom: '2026-08-05', dateTo: '2026-08-10' },
      ])
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText('Who is already away')).toBeInTheDocument()
      expect(within(dialog).getByText('1 approved · 1 pending')).toBeInTheDocument()
      expect(within(dialog).getByText('Moodley · Approved')).toBeInTheDocument()
      expect(within(dialog).getByText(/MO · 8–16 Aug/)).toBeInTheDocument()
      expect(within(dialog).getByText('Naidoo · Pending')).toBeInTheDocument()
    })

    it('shows a positive empty state when nobody else is away', async () => {
      fetchAnnualCapacityPreview.mockResolvedValue({ taken: 0, max: 2, pooled: true, columnLabel: 'MO', atCapacity: false })
      fetchAffectedLeaveForRequest.mockResolvedValue([])
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText('No overlapping leave in this pool.')).toBeInTheDocument()
    })

    it('phrases the empty state generically when no capacity pool is being scoped against', async () => {
      fetchAffectedLeaveForRequest.mockResolvedValue([])
      getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
      const user = userEvent.setup()
      renderQueue()

      const dialog = await openPanel(user)
      expect(await within(dialog).findByText('No overlapping leave in this period.')).toBeInTheDocument()
    })
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

  it('declining requires a non-empty reason before the confirm button is enabled', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    const dialog = await openPanel(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Decline…' }))

    const confirmBtn = within(dialog).getByRole('button', { name: 'Confirm decline' })
    expect(confirmBtn).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Reason for declining'), 'Overlaps a staffing gap')
    expect(confirmBtn).toBeEnabled()
  })

  it('declining only updates leave_requests, never touches roster_entries (availability)', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderQueue()

    const dialog = await openPanel(user)
    await user.click(await within(dialog).findByRole('button', { name: 'Decline…' }))
    await user.type(within(dialog).getByLabelText('Reason for declining'), 'Overlaps a staffing gap')
    await user.click(within(dialog).getByRole('button', { name: 'Confirm decline' }))

    await waitFor(() => expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'leave_rejected' })))
    expect(fromCalls).not.toContain('roster_entries')
  })
})
