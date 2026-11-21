import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RowActionIcon from './RowActionIcon'

describe('RowActionIcon', () => {
  it('is an icon-only button whose title is the hover/tap label, with a fuller name for screen readers', () => {
    render(<RowActionIcon icon={<svg />} title="Edit" label="Edit October 2026" onClick={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Edit October 2026' })
    expect(button).toHaveAttribute('title', 'Edit')
    expect(button).toHaveTextContent('')
  })

  it('runs its action without the click reaching the row behind it', async () => {
    const onRow = vi.fn()
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<div onClick={onRow}><RowActionIcon icon={<svg />} title="View" onClick={onClick} /></div>)
    await user.click(screen.getByRole('button', { name: 'View' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onRow).not.toHaveBeenCalled()
  })

  it('is a real link when given somewhere to go', () => {
    render(<RowActionIcon icon={<svg />} title="Mail" href="mailto:someone@example.test" />)
    expect(screen.getByRole('link', { name: 'Mail' })).toHaveAttribute('href', 'mailto:someone@example.test')
  })

  it('with nowhere to go and no action, reports the missing detail', async () => {
    const onMissing = vi.fn()
    const user = userEvent.setup()
    render(<RowActionIcon icon={<svg />} title="Call" onMissing={onMissing} />)
    await user.click(screen.getByRole('button', { name: 'Call' }))
    expect(onMissing).toHaveBeenCalledTimes(1)
  })

  it('the row\'s forward action is filled, a removing one is red', () => {
    render(
      <>
        <RowActionIcon icon={<svg />} title="Publish" tone="primary" onClick={vi.fn()} />
        <RowActionIcon icon={<svg />} title="Cancel leave" tone="danger" onClick={vi.fn()} />
      </>
    )
    expect(screen.getByRole('button', { name: 'Publish' })).toHaveClass('bg-accent')
    expect(screen.getByRole('button', { name: 'Cancel leave' })).toHaveClass('text-danger')
  })
})
