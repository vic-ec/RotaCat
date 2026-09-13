import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PageActionsMenu from './PageActionsMenu'

function renderMenu(items, overrides = {}) {
  return render(
    <PageActionsMenu
      items={items}
      trigger={onClick => <button type="button" onClick={onClick}>More</button>}
      {...overrides}
    />
  )
}

describe('PageActionsMenu', () => {
  it('renders nothing at all when items is empty', () => {
    const { container } = renderMenu([])
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing at all when items is not passed', () => {
    const { container } = render(<PageActionsMenu trigger={onClick => <button onClick={onClick}>More</button>} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens a sheet listing every item, and calls its onClick then closes on tap', async () => {
    const onCopy = vi.fn()
    const user = userEvent.setup()
    renderMenu([{ key: 'copy', label: 'Copy month', onClick: onCopy }])

    await user.click(screen.getByRole('button', { name: 'More' }))
    const menu = screen.getByRole('dialog', { name: 'More actions' })
    await user.click(within(menu).getByRole('button', { name: 'Copy month' }))

    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a submenu item in place, ticks the current value, and picks from it', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderMenu([
      { key: 'size', label: 'Font size', value: 'md', onSelect,
        options: [{ key: 'sm', label: 'Small' }, { key: 'md', label: 'Medium' }, { key: 'lg', label: 'Large' }] },
      { key: 'log', label: 'Review log', onClick: vi.fn() },
    ])

    await user.click(screen.getByRole('button', { name: 'More' }))
    // The parent list spends one row on it, showing where the setting stands.
    const menu = screen.getByRole('dialog', { name: 'More actions' })
    expect(within(menu).getByRole('button', { name: /Font size/ })).toHaveTextContent('Medium')
    expect(within(menu).queryByRole('button', { name: 'Small' })).toBeNull()

    // Opening it swaps this sheet's body rather than stacking a second one.
    await user.click(within(menu).getByRole('button', { name: /Font size/ }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const sub = screen.getByRole('dialog', { name: 'Font size' })
    expect(within(sub).queryByRole('button', { name: 'Review log' })).toBeNull()

    // Back returns to the parent list without choosing anything…
    await user.click(within(sub).getByRole('button', { name: 'Back' }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'More actions' })).toBeInTheDocument()

    // …and picking a size reports it and closes.
    await user.click(screen.getByRole('button', { name: /Font size/ }))
    await user.click(within(screen.getByRole('dialog', { name: 'Font size' })).getByRole('button', { name: 'Large' }))
    expect(onSelect).toHaveBeenCalledWith('lg')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Reopening lands on the parent list, not where it was left.
    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('dialog', { name: 'More actions' })).toBeInTheDocument()
  })

  it('uses a custom title when given', async () => {
    const user = userEvent.setup()
    renderMenu([{ key: 'x', label: 'Do X', onClick: vi.fn() }], { title: 'Custom actions' })
    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('dialog', { name: 'Custom actions' })).toBeInTheDocument()
  })

  it('disables an item per its own disabled flag, without disabling the rest', async () => {
    const user = userEvent.setup()
    renderMenu([
      { key: 'a', label: 'Item A', disabled: true, onClick: vi.fn() },
      { key: 'b', label: 'Item B', onClick: vi.fn() },
    ])
    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('button', { name: 'Item A' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Item B' })).not.toBeDisabled()
  })

  it('splits items into separate groups at a \'divider\' entry, rather than one flat list', async () => {
    const user = userEvent.setup()
    renderMenu([
      { key: 'a', label: 'Item A', onClick: vi.fn() },
      { key: 'b', label: 'Item B', onClick: vi.fn() },
      'divider',
      { key: 'c', label: 'Item C', onClick: vi.fn() },
    ])
    await user.click(screen.getByRole('button', { name: 'More' }))
    const menu = screen.getByRole('dialog')
    // ActionSheet's own outer content div carries the first "divide-y" —
    // its direct children are the two group wrappers (each also
    // "divide-y", for the dividers between items within one group).
    const groups = menu.querySelector('.divide-y').children
    expect(groups).toHaveLength(2)
    expect(within(groups[0]).getByRole('button', { name: 'Item A' })).toBeInTheDocument()
    expect(within(groups[0]).getByRole('button', { name: 'Item B' })).toBeInTheDocument()
    expect(within(groups[1]).getByRole('button', { name: 'Item C' })).toBeInTheDocument()
  })
})
