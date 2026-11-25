import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RosterAbsenceNote from './RosterAbsenceNote'

const summary = { doctorName: 'Cara Landes', headline: 'Sick leave', lines: ['23 Nov', 'Covered by Alli (locum)'] }

describe('RosterAbsenceNote', () => {
  it('offers Cancel leave to admins, without the click reaching the chip behind it', () => {
    const onCancelLeave = vi.fn()
    const onChip = vi.fn()
    render(<div onClick={onChip}><RosterAbsenceNote name="Landes" summary={summary} onCancelLeave={onCancelLeave} /></div>)
    fireEvent.click(screen.getByRole('button', { name: /Show details/ }))
    fireEvent.click(screen.getByTestId('absence-cancel-leave'))
    expect(onCancelLeave).toHaveBeenCalled()
    expect(onChip).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has no Cancel leave without the handler', () => {
    render(<RosterAbsenceNote name="Landes" summary={summary} />)
    fireEvent.click(screen.getByRole('button', { name: /Show details/ }))
    expect(screen.queryByTestId('absence-cancel-leave')).not.toBeInTheDocument()
  })
})
