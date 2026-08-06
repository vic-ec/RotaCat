import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PageTabs from './PageTabs'

describe('PageTabs', () => {
  it('renders a badge pill only when badge is greater than 0', () => {
    render(<PageTabs tabs={[{ key: 'a', label: 'A', badge: 0 }, { key: 'b', label: 'B', badge: 2 }]} active="a" onChange={vi.fn()} ariaLabel="Test" />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('defaults an unset badgeColor to the brand accent', () => {
    render(<PageTabs tabs={[{ key: 'a', label: 'A', badge: 3 }]} active="a" onChange={vi.fn()} ariaLabel="Test" />)
    expect(screen.getByText('3')).toHaveClass('bg-accent')
  })

  it('renders a red badge for badgeColor: "red" — the "needs review" variant matching the bottom-nav badge', () => {
    render(<PageTabs tabs={[{ key: 'a', label: 'A', badge: 5, badgeColor: 'red' }]} active="a" onChange={vi.fn()} ariaLabel="Test" />)
    expect(screen.getByText('5')).toHaveClass('bg-flagRed')
    expect(screen.getByText('5')).not.toHaveClass('bg-accent')
  })
})
