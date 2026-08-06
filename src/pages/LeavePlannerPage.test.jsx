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

// Only used for the Requests tab's own pending-count badge — a plain
// thenable builder mock (same shape as AnnualLeavePlanner.test.jsx's) so
// that fetch resolves predictably instead of hitting the real client.
const { mockResponses } = vi.hoisted(() => ({ mockResponses: {} }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      const builder = {
        select() { if (!method) method = 'select'; return builder },
        eq() { return builder },
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
  default: ({ onBack }) => (
    <div>
      ApprovalQueueStub
      {onBack && <button onClick={onBack}>QueueBackStub</button>}
    </div>
  ),
}))
vi.mock('../components/MyRequestHistory', () => ({ default: () => <div>MyRequestHistoryStub</div> }))
vi.mock('../components/LeaveListView', () => ({ default: () => <div>TeamLeaveStub</div> }))
vi.mock('../components/AnnualLeavePlanner', () => ({
  default: ({ deepLinkMonth, deepLinkHighlightDate, onDeepLinkConsumed }) => (
    <div>
      AnnualStub
      {deepLinkMonth && <p>deepLinkMonth: {deepLinkMonth}</p>}
      {deepLinkHighlightDate && <p>deepLinkHighlightDate: {deepLinkHighlightDate}</p>}
      {onDeepLinkConsumed && <button onClick={onDeepLinkConsumed}>ConsumeDeepLinkStub</button>}
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

  it('doctor: defaults to My leave, does not see Approval-queue-only Requests view or the redundant Team leave tab', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    renderPage()
    expect(screen.getByText('MyLeaveStub')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My leave' })).toBeInTheDocument()
    // A doctor already gets the "who's off" picture from the Annual/Special
    // planners' All view, so Team is redundant and hidden for them.
    expect(screen.queryByRole('button', { name: 'Team' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Planners' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rules' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Planners' }))
    expect(screen.getByText('AnnualStub')).toBeInTheDocument() // doctor's planner default is Annual
    expect(screen.getByRole('button', { name: 'Requests' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Requests' }))
    expect(screen.getByText('MyRequestHistoryStub')).toBeInTheDocument()
  })

  it('admin: defaults to Planners > Requests (approval queue), no My leave tab, keeps Team', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    renderPage()
    expect(screen.getByText('ApprovalQueueStub')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Team' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))
    expect(screen.getByText('AnnualStub')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Audit' }))
    expect(screen.getByText('AuditStub')).toBeInTheDocument()
  })

  it('admin: the Requests sub-tab shows a red badge with the pending-leave-request count', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    mockResponses['leave_requests:select'] = { count: 4, error: null }
    renderPage()

    const requestsTab = await screen.findByRole('button', { name: /Requests/ })
    expect(within(requestsTab).getByText('4')).toBeInTheDocument()
    expect(within(requestsTab).getByText('4')).toHaveClass('bg-flagRed')
  })

  it('doctor: the Requests sub-tab (their own history, not the approval queue) never shows the admin badge', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    mockResponses['leave_requests:select'] = { count: 4, error: null }
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Planners' }))
    const requestsTab = screen.getByRole('button', { name: 'Requests' })
    expect(within(requestsTab).queryByText('4')).not.toBeInTheDocument()
  })

  it('doctor: does not see the admin-only Audit tab', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Planners' }))
    expect(screen.queryByRole('button', { name: 'Audit' })).not.toBeInTheDocument()
  })

  it('clerk: defaults to Planners > Annual, no My leave/Team leave/Requests/Audit', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: false, isClerk: true }
    renderPage()
    expect(screen.getByText('AnnualStub')).toBeInTheDocument() // clerk's Planner nav link lands here, not Team leave
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()
    // Clerks get the same All-view visibility into Annual/Special/Weekends
    // a plain doctor gets from those tabs, so Team is redundant and
    // hidden for them too — same as it already is for doctors.
    expect(screen.queryByRole('button', { name: 'Team' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Special' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weekends' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Requests' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Audit' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Weekends' }))
    expect(screen.getByText('WeekendsStub')).toBeInTheDocument()
  })

  it('Rules tab renders the full in-app policy page', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Rules' }))
    expect(screen.getByText('RulesStub')).toBeInTheDocument()
  })

  // A page reload (e.g. a backgrounded mobile browser/PWA getting killed
  // and reloaded by the OS) remounts this component fresh — the tab must
  // come back from the URL, not silently reset to the role's default. An
  // admin who's also a doctor (e.g. an admin Consultant) is exactly the
  // case that surfaced this: their role default is Planners > Requests,
  // which would otherwise clobber "My leave" on every reload.
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

  it('admin Requests view: narrows/centres the queue and its back link returns to Annual', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    renderPage()
    expect(screen.getByText('ApprovalQueueStub').closest('.mx-auto.md\\:max-w-2xl')).toBeInTheDocument()

    await userEvent.click(screen.getByText('QueueBackStub'))
    expect(screen.getByText('AnnualStub')).toBeInTheDocument()
  })

  it('passes the month/highlight deep-link query params through to AnnualLeavePlanner and clears them once consumed', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    render(<LeavePlannerPage />, {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/leave?tab=planners&sub=annual&month=2026-08&highlight=2026-08-12']}>{children}</MemoryRouter>
      ),
    })
    expect(screen.getByText('deepLinkMonth: 2026-08')).toBeInTheDocument()
    expect(screen.getByText('deepLinkHighlightDate: 2026-08-12')).toBeInTheDocument()

    await userEvent.click(screen.getByText('ConsumeDeepLinkStub'))
    expect(screen.queryByText('deepLinkMonth: 2026-08')).not.toBeInTheDocument()
    expect(screen.queryByText('deepLinkHighlightDate: 2026-08-12')).not.toBeInTheDocument()
  })

  it('falls back to the role default when the URL requests a tab not valid for this role', () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: false, isClerk: true } // clerk — no My leave tab
    render(<LeavePlannerPage />, { wrapper: ({ children }) => <MemoryRouter initialEntries={['/leave?tab=my-leave']}>{children}</MemoryRouter> })
    expect(screen.getByText('AnnualStub')).toBeInTheDocument() // clerk's role default is Planners > Annual
  })
})
