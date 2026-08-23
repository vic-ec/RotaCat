import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LeavePlannerPage from './LeavePlannerPage'

function renderPage() {
  return render(<LeavePlannerPage />, { wrapper: MemoryRouter })
}

// LeavePlannerPage is a routing/gating hub for the Leave area's tabs —
// these tests verify which tabs each role sees, which one they land on by
// default, and that Planners' nested sub-tabs are gated correctly. Each
// tab's own content is covered by its own component's tests; child
// components are stubbed here so this stays focused on the orchestration
// logic rather than re-testing everything underneath it.
let mockAuth = {}
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

// Only used for the top-level Requests tab's own pending-count badge — a
// plain thenable builder mock (same shape as AnnualLeavePlanner.test.jsx's)
// so that fetch resolves predictably instead of hitting the real client.
const { mockResponses } = vi.hoisted(() => ({ mockResponses: {} }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      const builder = {
        select() { if (!method) method = 'select'; return builder },
        eq() { return builder },
        in() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { count: 0, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

vi.mock('../components/LeaveDashboard', () => ({ default: () => <div>MyLeaveStub</div> }))
vi.mock('../components/LeaveApprovalQueue', () => ({
  default: ({ onBack, backLabel }) => (
    <div>
      ApprovalQueueStub
      {onBack && <button onClick={onBack}>QueueBackStub: {backLabel}</button>}
    </div>
  ),
}))
vi.mock('../components/MyRequestHistory', () => ({
  default: ({ onBack, backLabel }) => (
    <div>
      MyRequestHistoryStub
      {onBack && <button onClick={onBack}>HistoryBackStub: {backLabel}</button>}
    </div>
  ),
}))
vi.mock('../components/LeaveListView', () => ({ default: () => <div>TeamLeaveStub</div> }))
vi.mock('../components/AnnualLeavePlanner', () => ({
  default: ({ deepLinkMonth, deepLinkHighlightDate }) => (
    <div>
      AnnualStub
      {deepLinkMonth && <p>deepLinkMonth: {deepLinkMonth}</p>}
      {deepLinkHighlightDate && <p>deepLinkHighlightDate: {deepLinkHighlightDate}</p>}
    </div>
  ),
}))
vi.mock('../components/SpecialLeavePlanner', () => ({ default: () => <div>SpecialStub</div> }))
vi.mock('../components/WeekendPlanner', () => ({ default: () => <div>WeekendsStub</div> }))
vi.mock('../components/LeaveAuditReport', () => ({ default: () => <div>AuditStub</div> }))
vi.mock('../components/InternRotationsPlanner', () => ({ default: () => <div>InternRotationsStub</div> }))
vi.mock('../components/LeaveRulesPage', () => ({ default: () => <div>RulesStub</div> }))

describe('LeavePlannerPage', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockResponses)) delete mockResponses[key]
  })

  it('locum: redirected away, nothing rendered', () => {
    mockAuth = { isLocum: true, isAdmin: false, canSubmitLeave: false }
    const { container } = renderPage()
    expect(container).not.toHaveTextContent(/Leave/)
  })

  it('doctor: defaults to My leave, does not see the redundant Team Leave tab, and Requests is a top-level tab (their own history)', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    renderPage()
    expect(screen.getByText('MyLeaveStub')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My leave' })).toBeInTheDocument()
    // A doctor already gets the "who's off" picture from the Annual/Special
    // planners' All view, so Team Leave is redundant and hidden for them.
    expect(screen.queryByRole('button', { name: 'Team Leave' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Planners' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Requests' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rules' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Planners' }))
    expect(screen.getByText('AnnualStub')).toBeInTheDocument() // doctor's planner default is Annual

    // Requests is a top-level tab now — reachable directly, no need to
    // enter Planners first.
    await userEvent.click(screen.getByRole('button', { name: 'Requests' }))
    expect(screen.getByText('MyRequestHistoryStub')).toBeInTheDocument()
  })

  it('admin: with no pending requests, defaults to Team Leave (not an empty queue)', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    mockResponses['leave_requests:select'] = { count: 0, error: null }
    renderPage()
    expect(await screen.findByText('TeamLeaveStub')).toBeInTheDocument()
    expect(screen.queryByText('ApprovalQueueStub')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Team Leave' })).toBeInTheDocument()
  })

  it('admin: with pending requests, defaults to Requests (approval queue)', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    mockResponses['leave_requests:select'] = { count: 3, error: null }
    renderPage()
    expect(await screen.findByText('ApprovalQueueStub')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Planners' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))
    expect(screen.getByText('AnnualStub')).toBeInTheDocument()
  })

  it('admin: Team Leave has its own Current & Upcoming Leave / All Leave sub-tabs, defaulting to Current & Upcoming', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    mockResponses['leave_requests:select'] = { count: 0, error: null }
    renderPage()
    expect(await screen.findByText('TeamLeaveStub')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'All Leave' }))
    expect(screen.getByText('AuditStub')).toBeInTheDocument()
    expect(screen.queryByText('TeamLeaveStub')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Current & Upcoming Leave' }))
    expect(screen.getByText('TeamLeaveStub')).toBeInTheDocument()
  })

  it('non-admin viewer of Team Leave does not see the admin-only All Leave sub-tab', async () => {
    // A viewer who isn't an admin, can't submit their own leave, and isn't a
    // clerk still sees the Team Leave tab itself (showTeamLeaveTab), but
    // All Leave stays admin-only.
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: false, isClerk: false }
    renderPage()
    expect(screen.getByText('TeamLeaveStub')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All Leave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Current & Upcoming Leave' })).not.toBeInTheDocument() // only sub-tab — no sub-nav shown
  })

  it('admin: the top-level Requests tab shows a red badge with the pending-leave-request count', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    mockResponses['leave_requests:select'] = { count: 4, error: null }
    renderPage()

    const requestsTab = await screen.findByRole('button', { name: /Requests/ })
    expect(within(requestsTab).getByText('4')).toBeInTheDocument()
    expect(within(requestsTab).getByText('4')).toHaveClass('bg-flagRed')
  })

  it('doctor: the Requests tab (their own history, not the approval queue) never shows the admin badge', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    mockResponses['leave_requests:select'] = { count: 4, error: null }
    renderPage()

    const requestsTab = screen.getByRole('button', { name: 'Requests' })
    expect(within(requestsTab).queryByText('4')).not.toBeInTheDocument()
  })

  it('Planners never shows an Audit tab — it lives under Team Leave as All Leave now', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Planners' }))
    expect(screen.queryByRole('button', { name: 'Audit' })).not.toBeInTheDocument()
  })

  it('clerk: defaults to Planners > Annual, no My leave/Team Leave/Requests', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: false, isClerk: true }
    renderPage()
    expect(screen.getByText('AnnualStub')).toBeInTheDocument() // clerk's Planner nav link lands here, not Team Leave
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()
    // Clerks get the same All-view visibility into Annual/Special/Weekends
    // a plain doctor gets from those tabs, so Team Leave is redundant and
    // hidden for them too — same as it already is for doctors.
    expect(screen.queryByRole('button', { name: 'Team Leave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Requests' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Special' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weekends' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Weekends' }))
    expect(screen.getByText('WeekendsStub')).toBeInTheDocument()
  })

  it('Rules tab renders the full in-app policy page', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Rules' }))
    expect(screen.getByText('RulesStub')).toBeInTheDocument()
  })

  it('top-level tabs render in order: My leave, Team Leave, Planners, Requests, Rules', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: true }
    renderPage()
    const nav = screen.getByRole('navigation', { name: 'Leave' })
    const labels = within(nav).getAllByRole('button').map(b => b.textContent.replace(/\d+$/, '').trim())
    expect(labels).toEqual(['My leave', 'Team Leave', 'Planners', 'Requests', 'Rules'])
  })

  // A page reload (e.g. a backgrounded mobile browser/PWA getting killed
  // and reloaded by the OS) remounts this component fresh — the tab must
  // come back from the URL, not silently reset to the role's default. An
  // admin who's also a doctor (e.g. an admin Consultant) is exactly the
  // case that surfaced this: their role default depends on the pending-
  // request count, which would otherwise clobber "My leave" on every reload.
  it('resumes the tab requested via the URL instead of the role default', () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: true }
    render(<LeavePlannerPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/leave?tab=my-leave']}>{children}</MemoryRouter> })
    expect(screen.getByText('MyLeaveStub')).toBeInTheDocument()
    expect(screen.queryByText('ApprovalQueueStub')).not.toBeInTheDocument()
  })

  it('resumes the requested Planners sub-tab from the URL', () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    render(<LeavePlannerPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/leave?tab=planners&sub=weekends']}>{children}</MemoryRouter> })
    expect(screen.getByText('WeekendsStub')).toBeInTheDocument()
    expect(screen.queryByText('AnnualStub')).not.toBeInTheDocument()
  })

  it('resumes the requested Team Leave sub-tab from the URL', () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    render(<LeavePlannerPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/leave?tab=team&sub=all']}>{children}</MemoryRouter> })
    expect(screen.getByText('AuditStub')).toBeInTheDocument()
    expect(screen.queryByText('TeamLeaveStub')).not.toBeInTheDocument()
  })

  it('admin Requests view: narrows/centres the queue, with no back link now that it is a top-level tab', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    mockResponses['leave_requests:select'] = { count: 2, error: null } // lands on Requests by default
    renderPage()
    expect(await screen.findByText('ApprovalQueueStub')).toBeInTheDocument()
    expect(screen.getByText('ApprovalQueueStub').closest('.mx-auto.md\\:max-w-2xl')).toBeInTheDocument()
    expect(screen.queryByText(/QueueBackStub/)).not.toBeInTheDocument()
  })

  it('admin Requests view arriving via a planner\'s "View requests" link (?from=annual) shows a back link naming that planner', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    render(<LeavePlannerPage />, {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/leave?tab=requests&from=annual']}>{children}</MemoryRouter>,
    })
    expect(await screen.findByText(/QueueBackStub: Annual planner/)).toBeInTheDocument()
  })

  it('clicking the back link returns to that planner\'s sub-tab and clears ?from', async () => {
    const user = userEvent.setup()
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    render(<LeavePlannerPage />, {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/leave?tab=requests&from=weekends']}>{children}</MemoryRouter>,
    })
    await user.click(await screen.findByRole('button', { name: /QueueBackStub/ }))
    expect(await screen.findByText('WeekendsStub')).toBeInTheDocument()
  })

  it('non-admin Requests view arriving via ?from also gets a back link, on MyRequestHistory', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    render(<LeavePlannerPage />, {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/leave?tab=requests&from=weekends']}>{children}</MemoryRouter>,
    })
    expect(await screen.findByText(/HistoryBackStub: Weekend planner/)).toBeInTheDocument()
  })

  it('picking Requests from the top nav directly never carries a stale ?from — no back link', async () => {
    const user = userEvent.setup()
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    render(<LeavePlannerPage />, {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/leave?tab=planners&sub=annual&from=weekends']}>{children}</MemoryRouter>,
    })
    expect(await screen.findByText('AnnualStub')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Requests' }))
    expect(await screen.findByText('ApprovalQueueStub')).toBeInTheDocument()
    expect(screen.queryByText(/QueueBackStub/)).not.toBeInTheDocument()
  })

  // This page only reads the two params and hands them down. Clearing them
  // afterwards is deliberately NOT done here: it has to share the same
  // setSearchParams call that seeds ayear/aview/amonth, or the second
  // writer's stale `prev` wipes the first writer's params and the admin
  // lands on the current month. See AnnualLeavePlanner.jsx's mount effect
  // and its own deep-link tests.
  it('passes the month/highlight deep-link query params through to AnnualLeavePlanner', () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    render(<LeavePlannerPage />, {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/leave?tab=planners&sub=annual&month=2026-08&highlight=2026-08-12']}>{children}</MemoryRouter>
      ),
    })
    expect(screen.getByText('deepLinkMonth: 2026-08')).toBeInTheDocument()
    expect(screen.getByText('deepLinkHighlightDate: 2026-08-12')).toBeInTheDocument()
  })

  it('falls back to the role default when the URL requests a tab not valid for this role', () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: false, isClerk: true } // clerk — no My leave tab
    render(<LeavePlannerPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/leave?tab=my-leave']}>{children}</MemoryRouter> })
    expect(screen.getByText('AnnualStub')).toBeInTheDocument() // clerk's role default is Planners > Annual
  })
})
