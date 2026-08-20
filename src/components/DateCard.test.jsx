import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DateCard from './DateCard'

// The time panel of a night shift is a darker step of whatever tone the
// date itself carries — never one flat "night" colour, which would erase
// the weekday/weekend/public-holiday signal the card exists to show. These
// assert the class pairing directly because that pairing *is* the rule.
function timePanel() {
  return screen.getByText('22:00 - 08:00').closest('div')
}

describe('DateCard night shift', () => {
  it('darkens the time panel in the weekday tone for a week night', () => {
    render(<DateCard date="2026-08-12" startTime="22:00:00" endTime="08:00:00" night />) // Wednesday
    expect(timePanel().className).toContain('bg-accent-night')
  })

  it('darkens the time panel in the weekend tone for a weekend night', () => {
    render(<DateCard date="2026-08-15" startTime="22:00:00" endTime="08:00:00" night />) // Saturday
    expect(timePanel().className).toContain('bg-dateWeekend-night')
  })

  it('darkens the time panel in the public-holiday tone for a PH night', () => {
    render(<DateCard date="2026-08-12" startTime="22:00:00" endTime="08:00:00" night publicHoliday="Women's Day" />)
    expect(timePanel().className).toContain('bg-rose-night')
  })

  it('leaves the day-shift time panel on the lighter step of the same tone', () => {
    render(<DateCard date="2026-08-12" startTime="22:00:00" endTime="08:00:00" />)
    expect(timePanel().className).toContain('bg-accent-light')
    expect(timePanel().className).not.toContain('night')
  })
})
