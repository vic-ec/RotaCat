import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaveCard from './LeaveCard'

describe('LeaveCard', () => {
  it('shows the leave type, status pill, date range and both day counts for annual leave', () => {
    render(<LeaveCard request={{
      id: 'lr1', leave_type: 'annual', date_from: '2026-08-24', date_to: '2026-08-28',
      status: 'approved', annual_leave_days: 3,
    }} />)

    expect(screen.getByText('Annual leave')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Mon 24 Aug')).toBeInTheDocument()
    expect(screen.getByText('Fri 28 Aug')).toBeInTheDocument()
    expect(screen.getByText('5 calendar days · 3 leave days')).toBeInTheDocument()
  })

  it('shows calendar days only for a non-annual type', () => {
    render(<LeaveCard request={{
      id: 'lr2', leave_type: 'study', date_from: '2026-09-01', date_to: '2026-09-03', status: 'pending',
    }} />)

    expect(screen.getByText('Study leave')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('3 calendar days')).toBeInTheDocument()
  })

  it('renders a single-day request as one date, with no arrow', () => {
    const { container } = render(<LeaveCard request={{
      id: 'lr3', leave_type: 'single_day', date_from: '2026-09-01', date_to: '2026-09-01', status: 'approved',
    }} />)

    expect(screen.getByText('Tue 1 Sep')).toBeInTheDocument()
    expect(screen.getByText('1 calendar day')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })
})
