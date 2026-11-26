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

  it('keeps a tap\'s label open — through the finger lifting — until the next tap', () => {
    vi.useFakeTimers()
    render(<><button title="More actions">⋮</button><span>elsewhere</span><HintLayer /></>)
    const button = screen.getByRole('button')
    pointer('pointerup', button, 'touch')
    expect(screen.getByRole('tooltip')).toHaveTextContent('More actions')
    // A lifted finger "leaves" with no relatedTarget; that is not leaving the window.
    pointer('pointerout', button, 'touch')
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByRole('tooltip')).toHaveTextContent('More actions')

    pointer('pointerdown', screen.getByText('elsewhere'), 'touch')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(button).toHaveAttribute('title', 'More actions')
  })

  it('a mouse leaving the window clears its label', () => {
    vi.useFakeTimers()
    render(<><button title="Legend">L</button><HintLayer /></>)
    const button = screen.getByRole('button')
    pointer('pointerover', button, 'mouse')
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    pointer('pointerout', button, 'mouse')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('finds the title on an ancestor of what the pointer is over', () => {
    vi.useFakeTimers()
    render(<><span title="Font size"><button>Aa</button></span><HintLayer /></>)
    pointer('pointerover', screen.getByRole('button'), 'mouse')
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Font size')
  })
})
