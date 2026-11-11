import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import CapacityBar from './CapacityBar'
import SlotPips from './SlotPips'

const REFERENCE = [{ level: 0, days: 7 }, { level: 1, days: 3 }, { level: 2, days: 14 }, { level: 3, days: 7 }]

describe('CapacityBar', () => {
  it('draws one segment per non-empty level, sized by days, in the capacity colours, with the whole bar described in words', () => {
    render(<CapacityBar buckets={REFERENCE} />)
    const bar = screen.getByRole('img', { name: '7 days 0 of 3 used, 3 days 1 of 3, 14 days 2 of 3, 7 days full' })
    const segments = [...bar.children]
    expect(segments).toHaveLength(4)
    expect(segments.map(s => s.style.flexGrow)).toEqual(['7', '3', '14', '7'])
    expect(segments[0]).toHaveClass('bg-capAvailable')
    expect(segments[1]).toHaveClass('bg-capLimited')
    expect(segments[2]).toHaveClass('bg-capNear')
    expect(segments[3]).toHaveClass('bg-capAtCapacity')
  })

  it('lists a 2x2 legend with the day counts, greying a zero-count level and dropping its segment', () => {
    render(<CapacityBar buckets={[{ level: 0, days: 30 }, { level: 1, days: 0 }, { level: 2, days: 1 }, { level: 3, days: 0 }]} />)
    expect(screen.getByText('30 days · 0 of 3 used')).toBeInTheDocument()
    expect(screen.getByText('0 days · 1 of 3').closest('li')).toHaveClass('text-ink-muted/60')
    expect(screen.getByText('1 day · 2 of 3').closest('li')).not.toHaveClass('text-ink-muted/60')
    expect(screen.getByText('0 days · full').closest('li')).toHaveClass('text-ink-muted/60')
    expect(screen.getByRole('img').children).toHaveLength(2)
    expect(screen.getByRole('list')).toHaveClass('grid-cols-2')
  })

  it('takes a heading and aside caption row, and custom labels for the last level', () => {
    render(<CapacityBar buckets={REFERENCE} heading="Leave slots · 31 days" aside="7 days full" labels={['0 of 3', '1 of 3', '2 of 3', 'at guideline']} />)
    expect(screen.getByText('Leave slots · 31 days')).toBeInTheDocument()
    expect(screen.getByText('7 days full')).toBeInTheDocument()
    expect(screen.getByText('7 days · at guideline')).toBeInTheDocument()
  })
})

describe('SlotPips', () => {
  it('fills as many pips as slots used, in the day\'s state colour, and outlines the rest', () => {
    render(<SlotPips used={2} />)
    const group = screen.getByRole('img', { name: '2 of 3 slots used' })
    const pips = [...group.children]
    expect(pips).toHaveLength(3)
    expect(pips[0]).toHaveClass('bg-capNear')
    expect(pips[1]).toHaveClass('bg-capNear')
    expect(pips[2]).toHaveClass('ring-ink-muted/50')
  })

  it('a free day is three green-outlined pips', () => {
    render(<SlotPips used={0} />)
    const pips = [...screen.getByRole('img', { name: '0 of 3 slots used' }).children]
    expect(pips.every(p => p.className.includes('ring-capAvailable'))).toBe(true)
  })

  it('a full day is three red pips; past the max it appends +N and says so in words', () => {
    const { rerender } = render(<SlotPips used={3} />)
    expect([...screen.getByRole('img', { name: '3 of 3 slots used' }).children].every(p => p.className.includes('bg-capAtCapacity'))).toBe(true)
    rerender(<SlotPips used={5} />)
    const group = screen.getByRole('img', { name: '5 on leave, 3 slots' })
    expect(within(group).getByText('+2')).toBeInTheDocument()
  })

  it('takes a custom label where the count is not a slot (Special\'s guideline)', () => {
    render(<SlotPips used={1} label="1 of 3 on special leave" />)
    expect(screen.getByRole('img', { name: '1 of 3 on special leave' })).toBeInTheDocument()
  })
})
