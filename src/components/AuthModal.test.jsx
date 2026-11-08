import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import AuthModal from './AuthModal'

function Harness({ open = true, onClose = () => {}, footer = null, size = 'small' }) {
  const firstRef = useRef(null)
  return (
    <>
      <button type="button">Opener</button>
      <AuthModal open={open} size={size} title="Reset your password" titleId="t" onClose={onClose} initialFocusRef={firstRef} footer={footer}>
        <input ref={firstRef} aria-label="Email" />
        <button type="button">Second</button>
      </AuthModal>
    </>
  )
}

describe('AuthModal', () => {
  it('is a labelled dialog that focuses its first control on open', () => {
    render(<Harness />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Reset your password')
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('traps Tab inside the panel, header close button included', async () => {
    const user = userEvent.setup()
    render(<Harness footer={<button type="button">Primary</button>} />)
    const order = ['Email', 'Second', 'Primary', 'Close']
    for (let i = 1; i < order.length; i++) {
      await user.tab()
      expect(screen.queryByLabelText(order[i]) ?? screen.getByRole('button', { name: order[i] })).toHaveFocus()
    }
    await user.tab()
    expect(screen.getByLabelText('Email')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('closes on Escape, on the close button, and on a backdrop press — not on a click inside', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('returns focus to the opener when it closes, and is inert while closed', () => {
    const { rerender } = render(<Harness open={false} />)
    const wrapper = screen.getByRole('dialog', { hidden: true }).parentElement
    expect(wrapper).toHaveAttribute('inert')
    screen.getByRole('button', { name: 'Opener', hidden: true }).focus()
    rerender(<Harness open />)
    expect(wrapper).not.toHaveAttribute('inert')
    expect(screen.getByLabelText('Email')).toHaveFocus()
    rerender(<Harness open={false} />)
    expect(screen.getByRole('button', { name: 'Opener', hidden: true })).toHaveFocus()
  })

  it('takes the medium width for the registration forms', () => {
    render(<Harness size="medium" />)
    expect(screen.getByRole('dialog').className).toContain('max-w-[560px]')
  })
})
