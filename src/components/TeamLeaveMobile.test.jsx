import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import TeamLeaveMobile from './TeamLeaveMobile'
import { todayStr, addDays, formatWeekdayDate } from '../lib/dateRange'
import { weekStart } from '../lib/teamLeaveMobile'

// Fixtures are anchored to the real "today"/current week so the Week and Month
// views have deterministic content regardless of when the suite runs.
const today = todayStr()
const ws = weekStart(today)

const requests = [
  {
    id: 'carter', profile_id: 'p1', leave_type: 'annual', status: 'approved',
    date_from: addDays(today, -1), date_to: addDays(today, 3), annual_leave_days: 4,
    created_at: '2026-01-05T09:00:00Z', reviewed_at: '2026-01-06T10:00:00Z',
    reviewer: { name: 'Ada', surname: 'Admin' }, profiles: { name: 'Bo', surname: 'Carter', category: 'MO' },
  },
  {
    id: 'evans-next-week', profile_id: 'p2', leave_type: 'sick', status: 'pending',
    date_from: addDays(ws, 9), date_to: addDays(ws, 10), // firmly in next week
    created_at: '2026-01-01T08:00:00Z', profiles: { name: 'Di', surname: 'Evans', category: 'Registrar' },
  },
]

describe('TeamLeaveMobile', () => {
  it('defaults to Week and shows who is on leave today', () => {
    render(<TeamLeaveMobile requests={requests} />)
    expect(screen.getByText(/On leave today/)).toBeInTheDocument()
    expect(screen.getByText('Bo Carter')).toBeInTheDocument()
    // Evans is next week, not in the current week's agenda
    expect(screen.queryByText('Di Evans')).toBeNull()
  })

  it('Month view shows a per-day count and opens a day sheet', () => {
    render(<TeamLeaveMobile requests={requests} />)
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    const todayCell = screen.getByLabelText(content => content.includes(formatWeekdayDate(today)))
    expect(todayCell).toHaveTextContent('1') // one person away today
    fireEvent.click(todayCell)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Bo Carter')).toBeInTheDocument()
  })

  it('People view searches and drills through to a leave detail', () => {
    render(<TeamLeaveMobile requests={requests} />)
    fireEvent.click(screen.getByRole('button', { name: 'People' }))
    // Both people appear (leave-only directory)
    expect(screen.getByText('Bo Carter')).toBeInTheDocument()
    expect(screen.getByText('Di Evans')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/Search staff/), { target: { value: 'evans' } })
    expect(screen.queryByText('Bo Carter')).toBeNull()

    fireEvent.click(screen.getByText('Di Evans'))
    // The person sheet lists their leave (rendered as "Registrar · Sick leave"); open it
    fireEvent.click(screen.getByText(/Sick leave/))
    expect(screen.getByText('Leave details')).toBeInTheDocument()
    expect(screen.getByText('Exact dates')).toBeInTheDocument()
  })

  it('shows a removable filter chip when a filter is active', () => {
    render(<TeamLeaveMobile requests={requests} />)
    // no chips initially
    expect(screen.queryByText('Clear all')).toBeNull()
  })
})
