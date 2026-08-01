import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

vi.mock('../components/LeaveDashboard', () => ({ default: () => <div>MyLeaveStub</div> }))
vi.mock('../components/LeaveApprovalQueue', () => ({ default: () => <div>ApprovalQueueStub</div> }))
vi.mock('../components/MyRequestHistory', () => ({ default: () => <div>MyRequestHistoryStub</div> }))
vi.mock('../components/LeaveListView', () => ({ default: () => <div>TeamLeaveStub</div> }))
vi.mock('../components/AnnualLeavePlanner', () => ({ default: () => <div>AnnualStub</div> }))
vi.mock('../components/SpecialLeavePlanner', () => ({ default: () => <div>SpecialStub</div> }))
vi.mock('../components/WeekendPlannerView', () => ({ default: () => <div>WeekendsStub</div> }))
vi.mock('../components/LeaveAuditReport', () => ({ default: () => <div>AuditStub</div> }))
vi.mock('../components/LeaveRulesPage', () => ({ default: () => <div>RulesStub</div> }))

describe('LeavePlannerPage', () => {
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
    // planners' All view, so Team leave is redundant and hidden for them.
    expect(screen.queryByRole('button', { name: 'Team leave' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Planners' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rules' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Planners' }))
    expect(screen.getByText('AnnualStub')).toBeInTheDocument() // doctor's planner default is Annual
    expect(screen.getByRole('button', { name: 'Requests' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Requests' }))
    expect(screen.getByText('MyRequestHistoryStub')).toBeInTheDocument()
  })

  it('admin: defaults to Planners > Requests (approval queue), no My leave tab, keeps Team leave', async () => {
    mockAuth = { isLocum: false, isAdmin: true, canSubmitLeave: false }
    renderPage()
    expect(screen.getByText('ApprovalQueueStub')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Team leave' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))
    expect(screen.getByText('AnnualStub')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Audit' }))
    expect(screen.getByText('AuditStub')).toBeInTheDocument()
  })

  it('doctor: does not see the admin-only Audit tab', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Planners' }))
    expect(screen.queryByRole('button', { name: 'Audit' })).not.toBeInTheDocument()
  })

  it('clerk: only Team leave and Planners > Weekends — no Annual/Special/Requests', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: false }
    renderPage()
    expect(screen.getByText('TeamLeaveStub')).toBeInTheDocument() // clerk defaults to Team leave
    expect(screen.queryByRole('button', { name: 'My leave' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Planners' }))
    expect(screen.getByText('WeekendsStub')).toBeInTheDocument() // only option, tab selector row not even shown
    expect(screen.queryByRole('button', { name: 'Annual' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Requests' })).not.toBeInTheDocument()
  })

  it('Rules tab renders the full in-app policy page', async () => {
    mockAuth = { isLocum: false, isAdmin: false, canSubmitLeave: true }
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Rules' }))
    expect(screen.getByText('RulesStub')).toBeInTheDocument()
  })
})
