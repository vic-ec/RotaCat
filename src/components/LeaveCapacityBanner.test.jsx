import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaveCapacityBanner from './LeaveCapacityBanner'

describe('LeaveCapacityBanner', () => {
  it('personalised, available: 0 of N taken shows the open-slots read', () => {
    render(<LeaveCapacityBanner mySlots={{ taken: 0, max: 2 }} columnLabel="MO" />)
    expect(screen.getByText('0 of 2 slots taken')).toBeInTheDocument()
    expect(screen.getByText('2 leave slots available for MO')).toBeInTheDocument()
  })

  it('personalised, partial: some taken but room left shows "near capacity" wording', () => {
    render(<LeaveCapacityBanner mySlots={{ taken: 1, max: 2 }} columnLabel="MO" />)
    expect(screen.getByText('1 of 2 slots taken')).toBeInTheDocument()
    expect(screen.getByText('1 leave slot available for MO')).toBeInTheDocument()
  })

  it('personalised, full: taken meets max shows zero slots available', () => {
    render(<LeaveCapacityBanner mySlots={{ taken: 1, max: 1 }} columnLabel="OT COSMO / Intern" />)
    expect(screen.getByText('1 of 1 slot taken')).toBeInTheDocument()
    expect(screen.getByText('0 leave slots available for OT COSMO / Intern')).toBeInTheDocument()
  })

  it('falls back to the generic full-capacity banner when mySlots is absent and the day is full', () => {
    render(
      <LeaveCapacityBanner
        mySlots={null}
        atFullCapacity
        dayCapacityState={{ tint: 'bg-capAtCapacity-tint', dark: 'bg-capAtCapacity-dark', text: 'text-capAtCapacity-ink' }}
        totalSlots={3}
        totalCeiling={3}
      />
    )
    expect(screen.getByText('Full — 3 of 3 slots taken')).toBeInTheDocument()
    expect(screen.getByText('No annual leave slots available for any category today.')).toBeInTheDocument()
  })

  it('renders nothing when mySlots is absent and the day is not full', () => {
    const { container } = render(
      <LeaveCapacityBanner mySlots={null} atFullCapacity={false} totalSlots={1} totalCeiling={3} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
