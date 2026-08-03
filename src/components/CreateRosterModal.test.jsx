import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateRosterModal from './CreateRosterModal'

describe('CreateRosterModal', () => {
  it('shows both options and calls the matching handler when clicked', async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()
    const onBuild = vi.fn()
    const onClose = vi.fn()
    render(<CreateRosterModal onClose={onClose} onGenerate={onGenerate} onBuild={onBuild} />)

    expect(screen.getByText('Which roster do you want to create?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Generate one for me' }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onBuild).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Build my own' }))
    expect(onBuild).toHaveBeenCalledTimes(1)
  })

  it('closes on clicking the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CreateRosterModal onClose={onClose} onGenerate={vi.fn()} onBuild={vi.fn()} />)

    // The heading's parent card stops propagation; click the outer backdrop directly.
    await user.click(screen.getByText('Which roster do you want to create?').closest('.fixed'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when clicking inside the card', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CreateRosterModal onClose={onClose} onGenerate={vi.fn()} onBuild={vi.fn()} />)

    await user.click(screen.getByText('Which roster do you want to create?'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on clicking Cancel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CreateRosterModal onClose={onClose} onGenerate={vi.fn()} onBuild={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows each option’s tooltip text', () => {
    render(<CreateRosterModal onClose={vi.fn()} onGenerate={vi.fn()} onBuild={vi.fn()} />)
    expect(screen.getByText('A complete roster will be created')).toBeInTheDocument()
    expect(screen.getByText('A blank roster will be created')).toBeInTheDocument()
  })
})
