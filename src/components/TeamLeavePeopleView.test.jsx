import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TeamLeavePeopleView from './TeamLeavePeopleView'
import { todayStr, addDays } from '../lib/dateRange'

vi.mock('./ProfileAvatar', () => ({
  default: () => <span />,
  StatusBadge: () => <span />,
}))

const today = todayStr()

// One person away right now, one due to go — the two states the row label
// distinguishes ("On …" vs "Upcoming …").
const REQUESTS = [
  {
    id: 'r1', profile_id: 'p1', status: 'approved', leave_type: 'maternity',
    date_from: addDays(today, -2), date_to: addDays(today, 5),
    profiles: { id: 'p1', name: 'Ada', surname: 'Nolan', category: 'MO' },
  },
  {
    id: 'r2', profile_id: 'p2', status: 'approved', leave_type: 'course',
    date_from: addDays(today, 4), date_to: addDays(today, 6),
    profiles: { id: 'p2', name: 'Bo', surname: 'Reddy', category: 'Registrar' },
  },
]

describe('TeamLeavePeopleView', () => {
  // "On leave"/"Next" said only THAT someone is away, never what for — the
  // first thing an admin scanning this list actually wants.
  it('names the leave type for both current and upcoming leave', () => {
    render(<TeamLeavePeopleView requests={REQUESTS} onSelectLeave={vi.fn()} />)

    // Lower-cased and shortened: the label sits mid-sentence and the
    // surrounding copy already carries the word "leave".
    expect(screen.getByText(/^On maternity · /)).toBeInTheDocument()
    expect(screen.getByText(/^Upcoming course \/ cpd · /)).toBeInTheDocument()

    expect(screen.queryByText(/^On leave · /)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Next · /)).not.toBeInTheDocument()
  })

  it('still says so plainly when someone has nothing current or upcoming', () => {
    render(<TeamLeavePeopleView requests={[]} onSelectLeave={vi.fn()} />)
    expect(screen.queryByText(/^On /)).not.toBeInTheDocument()
  })
})
