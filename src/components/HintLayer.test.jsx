import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import HintLayer from './HintLayer'

function pointer(type, el, pointerType) {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  act(() => { el.dispatchEvent(event) })
}

afterEach(() => vi.useRealTimers())

describe('HintLayer', () => {
  it('shows a titled element\'s label after a mouse hover, and hides the browser\'s own while it does', () => {
    vi.useFakeTimers()
    render(<><button title="Legend">L</button><span>elsewhere</span><HintLayer /></>)
    const button = screen.getByRole('button')
    pointer('pointerover', button, 'mouse')
    expect(button).not.toHaveAttribute('title')
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Legend')

    pointer('pointerover', screen.getByText('elsewhere'), 'mouse')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(button).toHaveAttribute('title', 'Legend')
  })

  it('shows the label for a moment after a tap', () => {
    vi.useFakeTimers()
    render(<><button title="More actions">⋮</button><HintLayer /></>)
    const button = screen.getByRole('button')
    pointer('pointerup', button, 'touch')
    expect(screen.getByRole('tooltip')).toHaveTextContent('More actions')
    act(() => { vi.advanceTimersByTime(1600) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(button).toHaveAttribute('title', 'More actions')
  })

  it('finds the title on an ancestor of what the pointer is over', () => {
    vi.useFakeTimers()
    render(<><span title="Font size"><button>Aa</button></span><HintLayer /></>)
    pointer('pointerover', screen.getByRole('button'), 'mouse')
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Font size')
  })
})
