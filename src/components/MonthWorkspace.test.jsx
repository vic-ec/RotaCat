import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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
    ['2026-08-12', [{ profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved', dateFrom: '2026-08-12', dateTo: '2026-08-12' }]],
  ])
  const pendingByDate = new Map([
    ['2026-08-12', [{ profileId: 'p2', surname: 'Botha', category: 'Registrar', status: 'pending', dateFrom: '2026-08-12', dateTo: '2026-08-12' }]],
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
    maxFullTime: 2, // the EC full-time (MO+Registrar+EC_COSMO) sub-cap — combined with OT_COSMO's own cap of 1, the day's real ceiling is 3
    onDataChanged: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
}

// MonthWorkspace reads/writes the open day-review sheet via
// useSearchParams (see leaveYearGrid.jsx's comment on why), so it needs a
// Router in the tree even outside AnnualLeavePlanner's own MemoryRouter.
function renderWorkspace(overrides, initialEntries = ['/']) {
  return render(<MonthWorkspace {...baseProps(overrides)} />, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>,
  })
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
    renderWorkspace()
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.getByText('Saturday')).toBeInTheDocument()
    expect(screen.getByText('August 2026')).toBeInTheDocument()
  })

  it('legend: collapsed by default, shows Consultant for an admin once expanded, hides it for a non-admin', async () => {
    const user = userEvent.setup()
    const admin = renderWorkspace()
    expect(screen.queryByText('Consultant')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Legend/ }))
    expect(screen.getByText('Consultant')).toBeInTheDocument()
    admin.unmount()

    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true }
    renderWorkspace()
    await user.click(screen.getByRole('button', { name: /Legend/ }))
    expect(screen.queryByText('Consultant')).not.toBeInTheDocument()
  })

  it('day view: shows a Consultant entry for an admin, hides it for a non-admin', async () => {
    // The consolidated list omits empty categories entirely now, so a
    // Consultant entry must actually exist on this date to prove the
    // privacy filter (not just the absence of an always-rendered heading).
    const withConsultant = {
      approvedByDate: new Map([
        ['2026-08-12', [
          { profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved', dateFrom: '2026-08-12', dateTo: '2026-08-12' },
          { profileId: 'p5', surname: 'Smith', category: 'Consultant', status: 'approved', dateFrom: '2026-08-12', dateTo: '2026-08-12' },
        ]],
      ]),
    }
    const user = userEvent.setup()
    const admin = renderWorkspace(withConsultant)
    await user.click(screen.getByText('Anderson'))
    const adminHeading = await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })
    expect(within(adminHeading.closest('.card')).getByText('Smith')).toBeInTheDocument()
    admin.unmount()

    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true }
    renderWorkspace(withConsultant)
    await user.click(screen.getByText('Anderson'))
    const nonAdminHeading = await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })
    expect(within(nonAdminHeading.closest('.card')).queryByText('Smith')).not.toBeInTheDocument()
  })

  it('reading surnames: shows approved plainly and pending in italics directly on the grid', () => {
    renderWorkspace()
    expect(screen.getByText('Anderson')).toBeInTheDocument()
    const botha = screen.getByText('Botha')
    expect(botha).toHaveClass('italic')
  })

  it('checking capacity: clicking a day shows only the combined "N of 3 slots taken" pill, no per-category quotas', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
    // 2 total (MO + Registrar) of the 3-slot combined ceiling (full-time cap 2 + OT COSMO/Intern cap 1).
    expect(screen.getByText('2 of 3 slots taken')).toBeInTheDocument()
    expect(screen.queryByText('1/2')).not.toBeInTheDocument()
    expect(screen.queryByText('1/1')).not.toBeInTheDocument()
  })

  it('shows a "Full" verdict banner once the combined cap is reached, with no per-category counts anywhere', async () => {
    const user = userEvent.setup()
    // 2 MO + 1 Registrar = 3, exactly the combined ceiling (full-time cap 2 +
    // OT COSMO/Intern cap 1) — no more of ANY category can go on leave that
    // day even though e.g. MO's own cap (2) isn't full.
    const countByColumnPerDate = new Map([
      ['2026-08-12', new Map([['MO', 2], ['Registrar', 1]])],
    ])
    renderWorkspace({ countByColumnPerDate })
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
    expect(screen.getByText('Full — 3 of 3 slots taken')).toBeInTheDocument() // the verdict banner
    expect(screen.getByText('3 of 3 slots taken')).toBeInTheDocument() // the header pill
    expect(screen.queryByText('1/2')).not.toBeInTheDocument()
    expect(screen.queryByText('1/1')).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('shows each surname in a pillbox coloured by that request\'s status', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(screen.getByText('Anderson'))
    const heading = await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })
    const modal = within(heading.closest('.card'))

    expect(modal.getByText('Anderson')).toHaveClass('bg-success-bg', 'text-success')
    expect(modal.getByText('Botha')).toHaveClass('bg-flagAmber-bg', 'text-flagAmber')
  })

  it('reviewing pending requests: admin sees the pending request detail with its note', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByText('Bob Botha')).toBeInTheDocument()
    expect(screen.getByText('"Family event"')).toBeInTheDocument()
  })

  it('non-admin: pending entries are read-only, no approve/reject controls', async () => {
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true }
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(screen.getByText('Anderson'))

    await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('approving leave: a clean pending request (no warnings) approves in one click', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    const onDataChanged = vi.fn()
    renderWorkspace({ onDataChanged })
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
    renderWorkspace()
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByText(/drop supervision below the required minimum/i)).toBeInTheDocument()
    const approveBtn = await screen.findByRole('button', { name: 'Approve anyway' })
    await user.click(approveBtn)
    expect(await screen.findByRole('button', { name: 'Confirm approval' })).toBeInTheDocument()
  })

  it('seeing rule impacts: flags a Registrar-column breach in isolation from the full-time aggregate', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    // A second, already-approved Registrar on the same day means approving
    // Botha's pending request would push the Registrar column (cap 1) to 2.
    // maxFullTime is bumped to 3 for this test alone so the (unrelated)
    // full-time aggregate cap doesn't also breach here — Anderson (MO) +
    // Davis (Registrar) already sit at the real default of 2, which would
    // otherwise mask the column-specific message this test is checking for.
    const otherApproved = {
      id: 'req-3', profile_id: 'p4', date_from: '2026-08-12', date_to: '2026-08-12',
      leave_type: 'annual', status: 'approved', annual_leave_days: 1, notes: null,
      profiles: { name: 'Dana', surname: 'Davis', category: 'Registrar' },
    }
    const user = userEvent.setup()
    renderWorkspace({ approvedRows: [APPROVED_ROW, otherApproved], maxFullTime: 3 })
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByText(/Approving would breach the Registrar cap/)).toBeInTheDocument()
  })

  it('seeing rule impacts: flags a capacity breach when approving would push the EC full-time group over its cap', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    // Anderson (MO) is already approved on 12 Aug (baseProps), and this adds
    // a second EC full-time doctor (Davis, Registrar) — with the EC
    // full-time cap at its real default of 2, MO + Registrar already fills
    // it, so approving Botha's pending Registrar request would add a 3rd EC
    // full-time doctor, breaching the full-time cap (on top of Registrar's
    // own column cap of 1 — see the previous test for that message in
    // isolation).
    const otherApproved = {
      id: 'req-3', profile_id: 'p4', date_from: '2026-08-12', date_to: '2026-08-12',
      leave_type: 'annual', status: 'approved', annual_leave_days: 1, notes: null,
      profiles: { name: 'Dana', surname: 'Davis', category: 'Registrar' },
    }
    const user = userEvent.setup()
    renderWorkspace({ approvedRows: [APPROVED_ROW, otherApproved] })
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByText(/Approving would breach the full-time doctor cap/)).toBeInTheDocument()
  })

  it('rejecting leave: requires a reason field and a confirm step', async () => {
    getApprovalWarnings.mockResolvedValue({ supervisionBreaches: [], balanceWarnings: [], hourCeilingWarning: null })
    const user = userEvent.setup()
    const onDataChanged = vi.fn()
    renderWorkspace({ onDataChanged })
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
    renderWorkspace({ onDataChanged })
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
    renderWorkspace({ publicHolidaysByDate })
    await user.click(screen.getByRole('button', { name: /Legend/ }))
    expect(screen.getByText('Public holiday')).toBeInTheDocument() // legend entry
    await user.click(screen.getByText('Anderson'))
    // Shown once on the grid cell and again in the opened review modal.
    expect(await screen.findAllByText('Some Holiday')).toHaveLength(2)
  })

  it('marks an approved surname with an Approved indicator, alongside the existing Pending one', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(screen.getByText('Anderson'))

    await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })
    expect(screen.getByText('Approved')).toHaveClass('text-success')
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('opens the review modal for highlightDate on mount (a deep link from the Requests queue) and reports it consumed', () => {
    const onHighlightConsumed = vi.fn()
    renderWorkspace({ highlightDate: '2026-08-12', onHighlightConsumed })
    expect(screen.getByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
    expect(onHighlightConsumed).toHaveBeenCalled()
  })

  it('does not report a highlight consumed when no highlightDate was given', () => {
    const onHighlightConsumed = vi.fn()
    renderWorkspace({ onHighlightConsumed })
    expect(onHighlightConsumed).not.toHaveBeenCalled()
  })

  it('reopens the day sheet straight from the URL — surviving a background-triggered reload with no highlightDate prop', () => {
    // No highlightDate here either — this is the ongoing `day` persistence,
    // seeded purely by the URL a remount reads on mount.
    renderWorkspace({}, ['/?day=2026-08-12'])
    expect(screen.getByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
  })

  it('"Your leave" card: shows a personalised days-with-room stat and a Request leave link for the viewer\'s own category', async () => {
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
    renderWorkspace()

    expect(await screen.findByText('MO · August')).toBeInTheDocument()
    expect(screen.getByText(/of 31 days have room for your category/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request leave' })).toHaveAttribute('href', '/leave?tab=my-leave')
  })

  it('"Your leave" card: renders nothing for a category with no capacity column (e.g. Consultant)', () => {
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'Consultant' } }
    renderWorkspace()
    expect(screen.queryByText(/days have room for your category/)).not.toBeInTheDocument()
  })

  it('month navigation and back button call their callbacks', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    const onBack = vi.fn()
    renderWorkspace({ onMonthChange, onBack })

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 9)

    await user.click(screen.getByRole('button', { name: '← Back to overview' }))
    expect(onBack).toHaveBeenCalled()
  })
})
