import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from './Toolbar'

function baseProps(overrides = {}) {
  return {
    searchValue: '', onSearchChange: vi.fn(),
    searchPlaceholder: 'Search…',
    ...overrides,
  }
}

function desktopRow(container) {
  return container.querySelector('.md\\:flex')
}
function mobileRow(container) {
  return container.querySelector('.md\\:hidden')
}

describe('Toolbar', () => {
  it('collapses sortFacets/filterFacets into a "Filters" mobile sheet by default', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Toolbar {...baseProps({
        sortFacets: [{ key: 'sort', icon: null, label: 'Sort', value: 'a', onChange: vi.fn(), options: [{ value: 'a', label: 'A' }] }],
      })} />
    )
    // Desktop row renders the real facet button
    expect(within(desktopRow(container)).getByRole('button', { name: 'Sort' })).toBeInTheDocument()
    // Mobile row renders only the "Filters" sheet trigger, not the facet itself
    expect(within(mobileRow(container)).getByRole('button', { name: 'Filters' })).toBeInTheDocument()
    expect(within(mobileRow(container)).queryByRole('button', { name: 'Sort' })).not.toBeInTheDocument()

    await user.click(within(mobileRow(container)).getByRole('button', { name: 'Filters' }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
  })

  it('mobileMode="inline" renders every facet as its own always-visible button, no sheet trigger', () => {
    const { container } = render(
      <Toolbar {...baseProps({
        mobileMode: 'inline',
        sortFacets: [{ key: 'sort', icon: null, label: 'Sort', value: 'a', onChange: vi.fn(), options: [{ value: 'a', label: 'A' }] }],
        filterFacets: [{ key: 'filter', icon: null, label: 'Filter', value: 'x', onChange: vi.fn(), options: [{ value: 'x', label: 'X' }] }],
      })} />
    )
    expect(within(mobileRow(container)).getByRole('button', { name: 'Sort' })).toBeInTheDocument()
    expect(within(mobileRow(container)).getByRole('button', { name: 'Filter' })).toBeInTheDocument()
    expect(within(mobileRow(container)).queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument()
  })

  it('renders a single FilterPanel trigger for filterGroups, inline on both breakpoints regardless of mobileMode', () => {
    const group = { key: 'role', label: 'Role', options: [{ value: 'admin', label: 'Admin' }], selected: new Set(), onChange: vi.fn() }
    const { container } = render(<Toolbar {...baseProps({ filterGroups: [group] })} />)
    expect(within(desktopRow(container)).getByRole('button', { name: 'Filter' })).toBeInTheDocument()
    expect(within(mobileRow(container)).getByRole('button', { name: 'Filter' })).toBeInTheDocument()
  })

  it('renders trailing on both breakpoints, after the Clear button', () => {
    const { container } = render(
      <Toolbar {...baseProps({ active: true, onClearAll: vi.fn(), trailing: <button type="button">View toggle</button> })} />
    )
    for (const row of [desktopRow(container), mobileRow(container)]) {
      const scoped = within(row)
      const clear = scoped.getByRole('button', { name: 'Clear all filters' })
      const trailing = scoped.getByRole('button', { name: 'View toggle' })
      expect(clear.compareDocumentPosition(trailing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('renders desktopTrailing only on the desktop row, before the Clear button', () => {
    const { container } = render(
      <Toolbar {...baseProps({ active: true, onClearAll: vi.fn(), desktopTrailing: <button type="button">Year nav</button> })} />
    )
    const clear = within(desktopRow(container)).getByRole('button', { name: 'Clear all filters' })
    const yearNav = within(desktopRow(container)).getByRole('button', { name: 'Year nav' })
    expect(yearNav.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(mobileRow(container)).queryByRole('button', { name: 'Year nav' })).not.toBeInTheDocument()
  })
})
