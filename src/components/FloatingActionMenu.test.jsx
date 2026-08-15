import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FloatingActionMenu from './FloatingActionMenu'

const SEARCH = { value: '', onChange: () => {}, placeholder: 'Search name…' }

function renderMenu(props = {}) {
  return render(<FloatingActionMenu search={SEARCH} {...props} />)
}

describe('FloatingActionMenu', () => {
  it('starts collapsed — only the trigger, no action buttons', () => {
    renderMenu({ moreMenu: { items: [{ key: 'a', label: 'Copy month', onClick: () => {} }] } })

    expect(screen.getByRole('button', { name: 'Quick actions' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
  })

  it('reveals only the actions it was given props for', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Legend' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
  })

  it('swaps the stack for an inline search field', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderMenu({ search: { ...SEARCH, onChange } })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'Search' }))

    const field = screen.getByPlaceholderText('Search name…')
    expect(field).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Quick actions' })).not.toBeInTheDocument()

    await user.type(field, 'a')
    expect(onChange).toHaveBeenCalledWith('a')

    await user.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.getByRole('button', { name: 'Quick actions' })).toBeInTheDocument()
  })

  // The stack collapses the moment an action is picked, so the sheet each of
  // these opens has to outlive that collapse — LegendSheet/PageActionsMenu
  // own their open state internally, so unmounting them with the stack would
  // close the sheet in the same tap that opened it.
  it('keeps the More sheet open after the stack collapses', async () => {
    const onCopy = vi.fn()
    const user = userEvent.setup()
    renderMenu({ moreMenu: { title: 'More actions', items: [{ key: 'copy', label: 'Copy month', onClick: onCopy }] } })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'More actions' }))

    const sheet = screen.getByRole('dialog', { name: 'More actions' })
    await user.click(within(sheet).getByRole('button', { name: 'Copy month' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('keeps the Legend sheet open after the stack collapses', async () => {
    const user = userEvent.setup()
    renderMenu({ legend: { title: 'Coverage', children: <p>Planned vs open</p> } })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'Legend' }))

    expect(within(screen.getByRole('dialog', { name: 'Coverage' })).getByText('Planned vs open')).toBeInTheDocument()
  })

  it('opens the shared filters sheet with both facets and multi-select groups', async () => {
    const onFacet = vi.fn()
    const onGroup = vi.fn()
    const user = userEvent.setup()
    renderMenu({
      filter: {
        facets: [{
          key: 'sort', label: 'Sort', value: 'desc', onChange: onFacet,
          options: [{ value: 'desc', label: 'Newest first' }, { value: 'asc', label: 'Oldest first' }],
        }],
        groups: [{
          key: 'year', label: 'Year', selected: new Set(), onChange: onGroup,
          options: [{ value: '2026', label: '2026' }],
        }],
        active: false,
        sheetTitle: 'Filters',
      },
    })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'Filters' }))

    const sheet = screen.getByRole('dialog', { name: 'Filters' })
    await user.click(within(sheet).getByRole('button', { name: 'Oldest first' }))
    expect(onFacet).toHaveBeenCalledWith('asc')

    await user.click(within(sheet).getByRole('button', { name: '2026' }))
    expect(onGroup).toHaveBeenCalledWith(new Set(['2026']))
  })

  it('cycles the view option and labels the button with what comes next', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const Icon = props => <svg {...props} />
    renderMenu({
      cycleView: {
        value: 'list', onChange,
        options: [{ value: 'list', label: 'List', icon: Icon }, { value: 'grid', label: 'Grid', icon: Icon }],
      },
    })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'Switch to Grid' }))
    expect(onChange).toHaveBeenCalledWith('grid')
  })

  // Staff's BulkActionBar takes the same bottom-right corner — the two must
  // never be on screen together, not even for the frame the FAB's own
  // collapse animation would otherwise run for.
  it('renders nothing at all while hidden', () => {
    const { container } = renderMenu({ hidden: true, moreMenu: { items: [{ key: 'a', label: 'A', onClick: () => {} }] } })
    expect(container).toBeEmptyDOMElement()
  })
})
