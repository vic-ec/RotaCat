import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import LeaveMatrix from './LeaveMatrix'

// todayStr() resolves to the real system date; these fixtures put an approved
// leave across "today" so the "On leave now" panel has something to show, and
// default the grid to the current year.
const currentYear = new Date().getFullYear()

function onLeaveNowRange() {
  // A range guaranteed to cover today within the current year.
  return { date_from: `${currentYear}-01-01`, date_to: `${currentYear}-12-31` }
}

const requests = [
  {
    id: 'a', profile_id: 'p1', leave_type: 'annual', status: 'approved', ...onLeaveNowRange(),
    annual_leave_days: 7, created_at: `${currentYear}-01-05T09:00:00Z`, reviewed_at: `${currentYear}-01-06T10:00:00Z`,
    reviewer: { name: 'Ada', surname: 'Admin' }, profiles: { name: 'Bo', surname: 'Carter', category: 'MO' },
  },
  {
    id: 'b', profile_id: 'p2', leave_type: 'sick', status: 'pending',
    date_from: `${currentYear}-03-02`, date_to: `${currentYear}-03-04`,
    created_at: `${currentYear}-02-01T08:00:00Z`, profiles: { name: 'Di', surname: 'Evans', category: 'Registrar' },
  },
]

describe('LeaveMatrix', () => {
  it('renders the legend, category groups and doctor rows', () => {
    render(<LeaveMatrix requests={requests} />)
    expect(screen.getByText('Family / Special')).toBeInTheDocument() // a legend-only label
    expect(screen.getByText('Bo Carter')).toBeInTheDocument()
    expect(screen.getByText('Di Evans')).toBeInTheDocument()
    // grouped by capacity column
    expect(screen.getByText('MO')).toBeInTheDocument()
    expect(screen.getByText('Registrar')).toBeInTheDocument()
    // each doctor's non-empty track is labelled
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pending review').length).toBeGreaterThan(0)
  })

  it('shows who is on leave right now by default', () => {
    render(<LeaveMatrix requests={requests} />)
    expect(screen.getAllByText('On leave now').length).toBeGreaterThan(0)
    // Carter's approved leave covers today -> a chip; Evans' pending leave does not.
    expect(screen.getAllByText('Carter').length).toBeGreaterThan(0)
    expect(screen.queryByText('Evans')).toBeNull()
  })

  it('drills from a doctor to a block’s full details', () => {
    render(<LeaveMatrix requests={requests} />)
    fireEvent.click(screen.getByText('Bo Carter'))
    expect(screen.getByText('Tap a leave block for full details.')).toBeInTheDocument()

    // Open the annual block from the doctor's list.
    fireEvent.click(screen.getByText('Annual leave'))
    expect(screen.getByText('Exact dates')).toBeInTheDocument()
    expect(screen.getByText('Calendar days')).toBeInTheDocument()
    expect(screen.getByText('Approved by')).toBeInTheDocument()
    // reviewer surfaces
    const submitted = screen.getByText('Submitted').closest('div')
    expect(within(submitted).getByText(/05-01-/)).toBeInTheDocument()
  })

  it('navigates years', () => {
    render(<LeaveMatrix requests={requests} />)
    expect(screen.getByText(String(currentYear))).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Next year'))
    expect(screen.getByText(String(currentYear + 1))).toBeInTheDocument()
    // no leave in the next year -> empty grid message
    expect(screen.getByText(new RegExp(`No approved or pending leave in ${currentYear + 1}`))).toBeInTheDocument()
  })
})
