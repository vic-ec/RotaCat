import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import TeamLeaveMonthView from './TeamLeaveMonthView'

function req(id, name, surname, from, to) {
  return {
    id, profile_id: id, leave_type: 'annual', status: 'approved',
    date_from: from, date_to: to, profiles: { name, surname, category: 'MO' },
  }
}

// Deliberately out of order: Parina's leave starts after Jehnara's, so the
// start-date tie-break has to put Jehnara first.
const REQUESTS = [
  req('parina', 'Parina', 'Naidoo', '2026-07-18', '2026-07-18'),
  req('jehnara', 'Jehnara', 'Naidoo', '2026-07-17', '2026-07-20'),
  req('eveline', 'Eveline', 'Baerends', '2026-07-11', '2026-07-18'),
  req('aug', 'Ann', 'Zulu', '2026-08-01', '2026-08-01'),
]

// Holds the month the way TeamLeaveMobile does, so stepping across a month
// edge can move the grid.
function Harness({ onMonthChange = () => {} }) {
  const [ym, setYm] = useState([2026, 7])
  return (
    <TeamLeaveMonthView
      requests={REQUESTS}
      year={ym[0]}
      month={ym[1]}
      onMonthChange={(y, m) => { onMonthChange(y, m); setYm([y, m]) }}
      onSelectLeave={() => {}}
    />
  )
}

function openDay(date) {
  fireEvent.click(screen.getAllByRole('button', { name: date })[0])
  return screen.getByRole('dialog')
}

const names = dialog => [...dialog.querySelectorAll('.font-medium')].map(el => el.textContent)

describe('TeamLeaveMonthView day sheet', () => {
  it('lists the day by surname, start date as the tie-break', () => {
    render(<Harness />)
    const dialog = openDay('2026-07-18')
    expect(names(dialog)).toEqual(['Eveline Baerends', 'Jehnara Naidoo', 'Parina Naidoo'])
  })

  it('shows the number away beside the stepper', () => {
    render(<Harness />)
    const dialog = openDay('2026-07-18')
    expect(within(dialog).getByTitle('3 people away')).toBeInTheDocument()
  })

  it('steps a day at a time without closing, and shows 0 on an empty day', () => {
    render(<Harness />)
    openDay('2026-07-18')
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    let dialog = screen.getByRole('dialog', { name: 'Sunday, 19 Jul 2026' })
    expect(within(dialog).getByText('Sun, 19 Jul 2026')).toBeInTheDocument()
    expect(within(dialog).getByTitle('1 person away')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    dialog = screen.getByRole('dialog', { name: 'Tuesday, 21 Jul 2026' })
    expect(within(dialog).getByTitle('0 people away')).toBeInTheDocument()
    expect(within(dialog).getByText('No one is on leave this day.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(screen.getByRole('dialog', { name: 'Monday, 20 Jul 2026' })).toBeInTheDocument()
  })

  it('carries on into the next month, moving the grid with it', () => {
    const onMonthChange = vi.fn()
    render(<Harness onMonthChange={onMonthChange} />)
    openDay('2026-07-31')
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 8)
    const dialog = screen.getByRole('dialog', { name: 'Saturday, 1 Aug 2026' })
    expect(names(dialog)).toEqual(['Ann Zulu'])
  })

  it('steps back across a year edge too', () => {
    const onMonthChange = vi.fn()
    function JanHarness() {
      const [ym, setYm] = useState([2027, 1])
      return (
        <TeamLeaveMonthView
          requests={[]} year={ym[0]} month={ym[1]}
          onMonthChange={(y, m) => { onMonthChange(y, m); setYm([y, m]) }}
          onSelectLeave={() => {}}
        />
      )
    }
    render(<JanHarness />)
    openDay('2027-01-01')
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 12)
    expect(screen.getByRole('dialog', { name: 'Thursday, 31 Dec 2026' })).toBeInTheDocument()
  })
})
