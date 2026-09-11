import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

const MAX_BY_COLUMN = { MO: 2, Registrar: 1, EC_Intern: 1, OT_Intern: 1 }

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
    maxFullTime: 2, // the EC full-time (MO+Registrar+EC_Intern) sub-cap — combined with OT_Intern's own cap of 1, the day's real ceiling is 3
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

// The day's capacity is carried by the category badges' fill, not by the
// cell background or the date number — so this is what "what colour is this
// day" means now.
function badgeFill(cell) {
  return cell.querySelector('svg circle')?.getAttribute('fill')
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
    // Fixtures below assume "today" is 6 Aug 2026 (the "Your leave" card
    // test prefills the leave-request form with todayStr()) — pin the
    // clock rather than relying on the real wall-clock date, which would
    // otherwise silently break this suite once the real date moves past
    // this fixed point.
    vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('legend: a non-admin full-time viewer sees only 3 states on the mobile legend; the desktop legend still lists the generic 4-state scale', async () => {
    const user = userEvent.setup()
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
    renderWorkspace()
    await user.click(screen.getByRole('button', { name: /Legend/ }))
    // "Near capacity" is never reachable within the full-time pool (only 2
    // slots, so 0/1/2 taken maps straight to available/limited/at capacity)
    // — it should appear just once, from the desktop-only legend block that
    // always lists the generic 4-state scale regardless of viewer.
    expect(screen.getAllByText('Near capacity')).toHaveLength(1)
    expect(screen.getAllByText('Available')).toHaveLength(2)
  })

  it('legend: an admin sees the generic 4-state scale on both the mobile and desktop legend blocks', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(screen.getByRole('button', { name: /Legend/ }))
    expect(screen.getAllByText('Near capacity')).toHaveLength(2)
  })

  it('mobile day cells: fill personalises to a non-admin viewer\'s own pool; an admin keeps the generic total-based read', async () => {
    // MO + Registrar fill the shared full-time pool (2 of 2) but the day's
    // generic cross-category total is also just 2 (of a 3-doctor ceiling).
    const countByColumnPerDate = new Map([
      ['2026-08-12', new Map([['MO', 1], ['Registrar', 1]])],
    ])

    const admin = renderWorkspace({ countByColumnPerDate })
    // Admin's generic read: total 2 of 3 -> "Near capacity" (orange), not yet "At capacity".
    const adminMobileCell = screen.getAllByText('12').map(el => el.closest('button')).find(b => b?.className.includes('min-h-[64px]'))
    expect(badgeFill(adminMobileCell)).toBe('rgb(var(--color-capNear))')
    admin.unmount()

    // A non-admin MO viewer's own shared pool is already full (2 of 2) -> "At capacity" (red).
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
    renderWorkspace({ countByColumnPerDate })
    const doctorMobileCell = screen.getAllByText('12').map(el => el.closest('button')).find(b => b?.className.includes('min-h-[64px]'))
    expect(badgeFill(doctorMobileCell)).toBe('rgb(var(--color-capAtCapacity))')
  })

  it('mobile day cells: the date number is pinned to a fixed top-left position via absolute positioning, not centred with the badge grid', () => {
    renderWorkspace()
    const cell12 = screen.getAllByText('12').map(el => el.closest('button')).find(b => b?.className.includes('min-h-[64px]'))
    const dateSpan = within(cell12).getByText('12')
    expect(dateSpan).toHaveClass('absolute', 'left-1.5', 'top-1')
  })

  it('mobile day cells: the date number is always bold, not just on public holidays', () => {
    renderWorkspace()
    const cell12 = screen.getAllByText('12').map(el => el.closest('button')).find(b => b?.className.includes('min-h-[64px]'))
    expect(within(cell12).getByText('12')).toHaveClass('font-bold')
  })

  it('toolbar: the stepper is one enclosed control, with Today/Legend as 30x30 squares beside it', () => {
    renderWorkspace({ month: 9 })
    const prevMonth = screen.getByRole('button', { name: 'Previous month' })
    const nextMonth = screen.getByRole('button', { name: 'Next month' })
    const todayButton = screen.getByRole('button', { name: 'Today' })
    const legendButton = screen.getByRole('button', { name: 'Legend' })

    // Chevrons and label share one bordered container rather than carrying
    // a border each — three actions, one control to look at.
    const stepper = prevMonth.parentElement
    expect(stepper).toHaveClass('border', 'rounded-lg')
    expect(stepper).toContainElement(nextMonth)
    expect(stepper).toContainElement(screen.getByRole('button', { name: 'September 2026' }))
    for (const chevron of [prevMonth, nextMonth]) {
      expect(chevron.className).not.toContain('btn-secondary')
      expect(chevron).toHaveClass('h-[30px]')
    }

    // Today/Legend stay standalone squares outside it, same height.
    for (const button of [todayButton, legendButton]) {
      expect(button).toHaveClass('btn-secondary', 'h-[30px]', 'w-[30px]')
      expect(stepper).not.toContainElement(button)
    }
    expect(legendButton.className).not.toContain('bg-accent-tint')
    expect(legendButton).toHaveTextContent('')
    expect(legendButton.querySelector('svg')).toBeInTheDocument()
    expect(todayButton.querySelector('svg')).toBeInTheDocument()
  })

  it('mobile day cells: the badge grid is top-anchored under the date number at a fixed position, not centred within the cell', () => {
    // 16 Aug carries all 4 capacity columns at once (2 badge rows) — 12 Aug
    // (from baseProps) carries just 1 (a single row). Both should anchor
    // their badge grid to the same fixed spot right under the date number
    // (pt-[23px] reserves that space; no `justify-center` means flex-col's
    // default flex-start keeps the grid pinned there) rather than each
    // being centred somewhere different depending on its own row count.
    const fourColumns = {
      approvedByDate: new Map([
        ['2026-08-12', [{ profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved', dateFrom: '2026-08-12', dateTo: '2026-08-12' }]],
        ['2026-08-16', [
          { profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved', dateFrom: '2026-08-16', dateTo: '2026-08-16' },
          { profileId: 'p2', surname: 'Botha', category: 'Registrar', status: 'approved', dateFrom: '2026-08-16', dateTo: '2026-08-16' },
          { profileId: 'p3', surname: 'Cronje', category: 'COSMO', status: 'approved', dateFrom: '2026-08-16', dateTo: '2026-08-16' },
          { profileId: 'p4', surname: 'Davis', category: 'COSMOPsych', status: 'approved', dateFrom: '2026-08-16', dateTo: '2026-08-16' },
        ]],
      ]),
      pendingByDate: new Map(),
    }
    renderWorkspace(fourColumns)
    const cell12 = screen.getAllByText('12').map(el => el.closest('button')).find(b => b?.className.includes('min-h-[64px]'))
    const cell16 = screen.getAllByText('16').map(el => el.closest('button')).find(b => b?.className.includes('min-h-[64px]'))
    for (const cell of [cell12, cell16]) {
      expect(cell).toHaveClass('pt-[23px]')
      expect(cell.className).not.toContain('justify-center')
    }
  })

  it('mobile day cells: shows one badge per person, not one per category — 2 EC Interns on the same day get 2 EC badges', () => {
    renderWorkspace({
      approvedByDate: new Map([
        ['2026-08-12', [
          { profileId: 'p1', surname: 'Anderson', category: 'EC_Intern', status: 'approved', dateFrom: '2026-08-12', dateTo: '2026-08-12' },
          { profileId: 'p2', surname: 'Botha', category: 'EC_Intern', status: 'approved', dateFrom: '2026-08-12', dateTo: '2026-08-12' },
        ]],
      ]),
      pendingByDate: new Map(),
    })
    const cell12 = screen.getAllByText('12').map(el => el.closest('button')).find(b => b?.className.includes('min-h-[64px]'))
    expect(within(cell12).getAllByText('EC')).toHaveLength(2)
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
    expect(within(adminHeading.closest('[role="dialog"]')).getByText('Smith')).toBeInTheDocument()
    admin.unmount()

    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true }
    renderWorkspace(withConsultant)
    await user.click(screen.getByText('Anderson'))
    const nonAdminHeading = await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })
    expect(within(nonAdminHeading.closest('[role="dialog"]')).queryByText('Smith')).not.toBeInTheDocument()
  })

  it('reading surnames: shows approved plainly and pending in italics directly on the grid', () => {
    renderWorkspace()
    expect(screen.getByText('Anderson')).toBeInTheDocument()
    const botha = screen.getByText('Botha')
    expect(botha).toHaveClass('italic')
  })

  it('checking capacity: the day panel reports the combined total, and no per-category quotas', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
    // The old top-right pill is gone; its number now lives in the top banner,
    // which reports every capacity state rather than only the full one. This
    // mock admin has no `profile` in mockAuth and so no personal category,
    // which is exactly the viewer the generic banner is for.
    expect(screen.getByText('2 of 3 slots taken')).toBeInTheDocument()
    expect(screen.getByText('1 annual leave slot available across all doctor categories.')).toBeInTheDocument()
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
    // No personal category on this mock admin, so it's the generic fallback banner.
    expect(screen.getByText('Full — 3 of 3 slots taken')).toBeInTheDocument()
    expect(screen.queryByText('1/2')).not.toBeInTheDocument()
    expect(screen.queryByText('1/1')).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('personalises the top banner to the viewer\'s own category — shared full-time pool, not their own column alone', async () => {
    const user = userEvent.setup()
    mockAuth = { user: { id: 'doctor-1' }, profile: { category: 'MO' }, isAdmin: false, canSubmitLeave: true }
    // 1 MO + 1 Registrar already fills the shared full-time pool (cap 2),
    // even though MO's own count (1) is under its own old individual cap.
    renderWorkspace()
    await user.click(screen.getByText('Anderson'))

    expect(await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })).toBeInTheDocument()
    expect(screen.getByText('2 of 2 slots taken')).toBeInTheDocument()
    expect(screen.getByText('0 leave slots available in the shared pool: MO, Registrar, EC Intern')).toBeInTheDocument()
    expect(screen.queryByText(/available for MO/)).not.toBeInTheDocument() // pooled wording, not the column-alone read
    expect(screen.queryByText(/Full —/)).not.toBeInTheDocument() // personalised banner replaces the generic one, not both
    mockAuth = { user: { id: 'admin-auth-1' }, isAdmin: true, canSubmitLeave: false }
  })

  it('shows each surname as plain text, never coloured by that request\'s status', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    await user.click(screen.getByText('Anderson'))
    const heading = await screen.findByRole('heading', { name: 'Wednesday, 12 Aug 2026' })
    const modal = within(heading.closest('[role="dialog"]'))

    expect(modal.getByText('Anderson')).not.toHaveClass('bg-success-bg', 'text-success')
    expect(modal.getByText('Botha')).not.toHaveClass('bg-flagAmber-bg', 'text-flagAmber')
    expect(modal.getByText('Anderson')).toHaveClass('text-ink')
    expect(modal.getByText('Botha')).toHaveClass('text-ink')
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
    expect(screen.getByText('Pending review')).toBeInTheDocument()
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

  it('"Your leave" card: shows a personalised days-with-room stat, and Request leave opens the same in-context form as the day view', async () => {
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
    const user = userEvent.setup()
    renderWorkspace()

    // One panel per viewport (jsdom renders both the phone card and the
    // desktop one) — both read the same numbers.
    expect((await screen.findAllByText('For Medical Officer · August'))).toHaveLength(2)
    expect(screen.getAllByText(/of 31 days have room for your category/)).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: 'Request annual leave' })[0])
    expect(screen.getByText(/LeaveRequestFormStub: 2026-08-06 to 2026-08-06/)).toBeInTheDocument()
  })

  // The desktop grid had no request path at all until this panel — the
  // phone card was lg:hidden and this page has no rail to hang one in.
  it('"Your leave" card: renders on desktop too, as a 320px card over the grid', () => {
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'MO' } }
    const { container } = renderWorkspace()
    const desktopSlot = container.querySelector('.lg\\:flex.justify-end, .justify-end.lg\\:flex')
    expect(desktopSlot).not.toBeNull()
    expect(within(desktopSlot).getByText('For Medical Officer · August')).toBeInTheDocument()
    expect(desktopSlot.querySelector('.w-80')).not.toBeNull()
  })

  it('"Your leave" card: no action for a viewer who cannot submit leave', () => {
    mockAuth = { user: { id: 'admin-auth-1' }, isAdmin: true, canSubmitLeave: false, profile: { category: 'MO' } }
    renderWorkspace()
    expect(screen.getAllByText(/of 31 days have room/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Request annual leave' })).not.toBeInTheDocument()
  })

  it('"Your leave" card: renders nothing for a category with no capacity column (e.g. Consultant)', () => {
    mockAuth = { user: { id: 'doctor-1' }, isAdmin: false, canSubmitLeave: true, profile: { category: 'Consultant' } }
    renderWorkspace()
    expect(screen.queryByText(/days have room for your category/)).not.toBeInTheDocument()
  })

  it('back button: matches the plain text-link style used elsewhere (e.g. Account), not a bordered/backgrounded chip', () => {
    renderWorkspace()
    const backButton = screen.getByRole('button', { name: 'Overview' })
    expect(backButton.className).not.toContain('border')
    expect(backButton.className).not.toContain('btn-secondary')
    expect(backButton).toHaveClass('text-ink-light')
  })

  it('month navigation and back button call their callbacks', async () => {
    const user = userEvent.setup()
    const onMonthChange = vi.fn()
    const onBack = vi.fn()
    renderWorkspace({ onMonthChange, onBack })

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 9)

    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(onBack).toHaveBeenCalled()
  })
})
