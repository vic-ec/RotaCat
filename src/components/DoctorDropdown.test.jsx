import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DoctorDropdown from './DoctorDropdown'

const PROFILES = [
  { id: 'p1', name: 'Ada', surname: 'Landers', category: 'MO', color_code: '#111111' },
  { id: 'p2', name: 'Bo', surname: 'Venter', category: 'Registrar', color_code: '#222222' },
]

function renderPicker(props = {}) {
  const onClose = vi.fn()
  const onSelect = vi.fn()
  render(
    <DoctorDropdown
      profiles={PROFILES}
      displayNames={new Map()}
      search=""
      onSearchChange={() => {}}
      onSelect={onSelect}
      onClose={onClose}
      date="2026-08-03"
      shiftCode="WD_22"
      {...props}
    />
  )
  return { onClose, onSelect }
}

describe('DoctorDropdown', () => {
  it('is a labelled dialog, so it can be found and scoped by role', () => {
    renderPicker()
    expect(screen.getByRole('dialog', { name: 'Assign doctor — WD_22 on 2026-08-03' })).toBeInTheDocument()
  })

  it('closes on the explicit × — the backdrop beside a max-w-xs card is a thin strip on a phone', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPicker()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closing does not pick anybody', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still assigns when a doctor is picked', async () => {
    const user = userEvent.setup()
    const { onSelect, onClose } = renderPicker()

    await user.click(screen.getByRole('button', { name: /Landers/ }))
    expect(onSelect).toHaveBeenCalledWith('p1')
    expect(onClose).not.toHaveBeenCalled()  // the caller decides what happens next
  })
})
