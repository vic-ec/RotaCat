import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LeaveShiftsChoice from './LeaveShiftsChoice'

const shift = { entry: { id: 'c1', date: '2026-11-23' }, shiftCode: 'WD_12', cover: 'Alli (locum)', blocker: null }

describe('LeaveShiftsChoice', () => {
  it('lists the shifts the leave opened and asks what happens to them, picking nothing', () => {
    const onChange = vi.fn()
    render(<LeaveShiftsChoice doctorName="Cara Landes" shifts={[shift]} value="" onChange={onChange} />)
    expect(screen.getByText(/This leave took Cara Landes off a shift/)).toBeInTheDocument()
    expect(screen.getByText(/Mon 23 Nov · WD 12h-22h — Alli \(locum\)/)).toBeInTheDocument()
    expect(screen.getAllByRole('radio').every(r => !r.checked)).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Leave them as they are/ }))
    expect(onChange).toHaveBeenCalledWith('keep')
  })

  it('cannot put the doctor back when she has another shift that day', () => {
    render(<LeaveShiftsChoice doctorName="Cara Landes" shifts={[{ ...shift, blocker: 'Cara Landes has another shift on Mon 23 Nov' }]} value="" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: /Put Cara Landes back on it/ })).toBeDisabled()
    expect(screen.getByText('Cara Landes has another shift on Mon 23 Nov')).toBeInTheDocument()
  })
})
