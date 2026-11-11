import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlannerToolbar from './PlannerToolbar'
import PlannerDetailsCard from './PlannerDetailsCard'
import PlannerCalendarGrid from './PlannerCalendarGrid'

describe('PlannerToolbar', () => {
  it('one row: the Overview back link, a search field, the legend trigger, the middle slot, and the toggle slot', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    const onChange = vi.fn()
    render(
      <PlannerToolbar
        onBack={onBack}
        search={{ value: '', onChange }}
        legend={<button type="button">Legend</button>}
        middle={<span>2 staffed · 2 need staff</span>}
        viewToggle={<button type="button">Calendar</button>}
      />
    )
    expect(screen.getAllByRole('button', { name: 'Overview' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Legend' })).toHaveLength(1)
    expect(screen.getByText('2 staffed · 2 need staff')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search name' }), 'a')
    expect(onChange).toHaveBeenCalledWith('a')
    await user.click(screen.getByRole('button', { name: 'Overview' }))
    expect(onBack).toHaveBeenCalled()
    // The row is a fixed 44px, and the toggle slot keeps its desktop width
    // whether or not a toggle is given.
    expect(screen.getByTestId('planner-toolbar').firstElementChild).toHaveClass('h-11')
    expect(screen.getByRole('button', { name: 'Calendar' }).parentElement).toHaveClass('lg:w-[132px]')
  })

  it('keeps the toggle slot (empty) when there is no second view', () => {
    render(<PlannerToolbar onBack={vi.fn()} />)
    const row = screen.getByTestId('planner-toolbar').firstElementChild
    expect(row.lastElementChild).toHaveClass('lg:w-[132px]')
    expect(row.lastElementChild).toBeEmptyDOMElement()
  })

  it('below lg the search collapses behind an icon that opens a field on a second row', async () => {
    const user = userEvent.setup()
    render(<PlannerToolbar onBack={vi.fn()} search={{ value: '', onChange: vi.fn() }} />)
    const icon = screen.getByRole('button', { name: 'Search' })
    expect(icon).toHaveClass('lg:hidden')
    expect(icon).toHaveAttribute('aria-expanded', 'false')
    await user.click(icon)
    expect(screen.getByRole('button', { name: 'Close search' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('searchbox', { name: 'Search name' })).toHaveLength(2)
  })
})

describe('PlannerDetailsCard', () => {
  it('on a desktop: a card with the eyebrow, resting on the empty message until it has content', () => {
    const { rerender } = render(<PlannerDetailsCard eyebrow="Selected day" emptyMessage="Select a day to see details." />)
    expect(screen.getByText('Selected day')).toBeInTheDocument()
    expect(screen.getByText('Select a day to see details.')).toBeInTheDocument()
    rerender(<PlannerDetailsCard eyebrow="Selected day" emptyMessage="Select a day to see details." title="Wednesday"><p>Body</p></PlannerDetailsCard>)
    expect(screen.queryByText('Select a day to see details.')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Wednesday' })).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('below lg: nothing inline; the same content opens in a bottom sheet when `open`', async () => {
    const mql = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    window.matchMedia = vi.fn().mockReturnValue(mql)
    try {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const { rerender } = render(<PlannerDetailsCard eyebrow="Selected weekend" emptyMessage="Select a weekend to see details." open={false} onClose={onClose}><p>Body</p></PlannerDetailsCard>)
      expect(screen.queryByText('Body')).not.toBeInTheDocument()
      expect(screen.queryByText('Select a weekend to see details.')).not.toBeInTheDocument()
      rerender(<PlannerDetailsCard eyebrow="Selected weekend" emptyMessage="Select a weekend to see details." open onClose={onClose}><p>Body</p></PlannerDetailsCard>)
      const sheet = screen.getByRole('dialog', { name: 'Selected weekend' })
      expect(sheet).toHaveTextContent('Body')
      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).toHaveBeenCalled()
    } finally {
      delete window.matchMedia
    }
  })
})

describe('PlannerCalendarGrid', () => {
  it('every day is a keyboard-reachable button with a visible focus ring, pressed when selected', () => {
    const onSelect = vi.fn()
    render(<PlannerCalendarGrid year={2026} month={8} selectedDate="2026-08-12" today="2026-08-06" onSelect={onSelect} />)
    const desktop = screen.getByTestId('planner-calendar-grid').querySelector('.hidden.lg\\:block')
    const buttons = desktop.querySelectorAll('button')
    expect(buttons).toHaveLength(31)
    for (const b of buttons) expect(b.className).toContain('focus-visible:ring-2')
    expect(desktop.querySelector('[aria-label="2026-08-12"]')).toHaveAttribute('aria-pressed', 'true')
    expect(desktop.querySelector('[aria-label="2026-08-11"]')).toHaveAttribute('aria-pressed', 'false')
  })

  it('lets a caller word the pips differently', () => {
    render(<PlannerCalendarGrid year={2026} month={8} onSelect={vi.fn()} cells={new Map([['2026-08-03', { used: 2, names: [] }]])} pipLabel={used => `${used} of 3 on special leave`} />)
    expect(screen.getAllByRole('img', { name: '2 of 3 on special leave' })).toHaveLength(2) // desktop + phone cell
  })
})
