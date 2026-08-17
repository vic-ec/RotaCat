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

  // The buttons stay mounted so they can animate (and so Legend/More keep
  // their sheets), which means "collapsed" has to be enforced by attribute,
  // not by absence: out of the a11y tree and out of the tab order, or a
  // closed stack would still be reachable by screen reader and keyboard.
  it('keeps collapsed buttons mounted but inert', () => {
    renderMenu({ moreMenu: { items: [{ key: 'a', label: 'Copy month', onClick: () => {} }] } })

    const collapsed = [...document.querySelectorAll('[aria-label="Search"], [aria-label="More actions"]')]
    expect(collapsed).toHaveLength(2)
    collapsed.forEach(el => {
      expect(el).toHaveAttribute('aria-hidden', 'true')
      expect(el).toHaveAttribute('tabindex', '-1')
    })
  })

  // Each button waits for the previous one to finish, so the step equals the
  // duration and the stack opens one icon at a time (the reference widget's
  // playSequentially, expressed as CSS delays).
  it('reveals one button at a time, outward from the trigger', async () => {
    const user = userEvent.setup()
    renderMenu({
      sort: { facets: [{ key: 's', label: 'Sort', value: 'a', onChange: () => {}, options: [] }] },
      moreMenu: { items: [{ key: 'a', label: 'A', onClick: () => {} }] },
    })
    const opacityStep = l => document.querySelector(`[aria-label="${l}"]`).style.transition
      .split(', ').find(part => part.startsWith('opacity'))

    // Bottom-to-top: Search (nearest the ⊕) leads, and each 75ms turn
    // starts as the one before it ends.
    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    expect(['Search', 'Sort', 'More actions'].map(opacityStep)).toEqual([
      'opacity 75ms ease-out 0ms',
      'opacity 75ms ease-out 75ms',
      'opacity 75ms ease-out 150ms',
    ])
  })

  // Dismissing is a correction — the stack goes the frame the ⊕ is tapped,
  // with no cascade to sit through and nothing left mid-transition.
  it('collapses with no animation at all', async () => {
    const user = userEvent.setup()
    renderMenu({
      sort: { facets: [{ key: 's', label: 'Sort', value: 'a', onChange: () => {}, options: [] }] },
      moreMenu: { items: [{ key: 'a', label: 'A', onClick: () => {} }] },
    })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'Close quick actions' }))

    const transitions = ['Search', 'Sort', 'More actions']
      .map(l => document.querySelector(`[aria-label="${l}"]`).style.transition)
    expect(transitions).toEqual(['none', 'none', 'none'])
  })

  // A page that skips a slot must not leave a pause where that slot's turn
  // would have been — the stagger counts rendered buttons, not slots.
  it('closes the timing gap for slots a page does not use', async () => {
    const user = userEvent.setup()
    renderMenu({ moreMenu: { items: [{ key: 'a', label: 'A', onClick: () => {} }] } })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    expect(document.querySelector('[aria-label="More actions"]').style.transition)
      .toContain('opacity 75ms ease-out 75ms')
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

  // The stack sits above the ⊕ and is `flex-col-reverse`, so the first DOM
  // child renders at the BOTTOM, nearest the trigger — DOM order and
  // bottom-to-top reading order are the same list. Fixed order: a page
  // omitting one closes the gap rather than shuffling the rest.
  it('stacks the actions bottom-to-top in the documented order', async () => {
    const Icon = props => <svg {...props} />
    const user = userEvent.setup()
    renderMenu({
      primaryAction: { icon: Icon, label: 'Add doctor', onClick: () => {} },
      sort: { facets: [{ key: 's', label: 'Sort', value: 'a', onChange: () => {}, options: [] }] },
      filter: { facets: [{ key: 'f', label: 'Filter', value: 'a', onChange: () => {}, options: [] }], sheetTitle: 'Filters' },
      legend: { title: 'Legend', children: null },
      moreMenu: { items: [{ key: 'a', label: 'A', onClick: () => {} }] },
      cycleView: { value: 'list', onChange: () => {}, options: [{ value: 'list', label: 'List', icon: Icon }, { value: 'grid', label: 'Grid', icon: Icon }] },
    })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    const labels = [...document.querySelectorAll('[aria-label]')]
      .map(el => el.getAttribute('aria-label'))
      .filter(l => l !== 'Close quick actions')
    expect(labels).toEqual(['Add doctor', 'Search', 'Sort', 'Filters', 'Legend', 'More actions', 'Switch to Grid'])
  })

  // Two triggers, two sheets, never both — and Sort's has no "Clear all",
  // which would reset search and filters from a sheet showing neither.
  it('opens Sort and Filter as separate sheets', async () => {
    const onSort = vi.fn()
    const user = userEvent.setup()
    renderMenu({
      sort: {
        facets: [{ key: 's', label: 'Sort', value: 'desc', onChange: onSort, options: [{ value: 'asc', label: 'Oldest first' }] }],
      },
      filter: {
        facets: [{ key: 'f', label: 'Filter', value: 'all', onChange: () => {}, options: [{ value: 'x', label: 'Annual' }] }],
        active: true, onClearAll: () => {}, sheetTitle: 'Filters',
      },
    })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'Sort' }))
    const sortSheet = screen.getByRole('dialog', { name: 'Sort' })
    expect(within(sortSheet).queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
    await user.click(within(sortSheet).getByRole('button', { name: 'Sort' }))
    // The row's own dropdown portals straight onto <body> (same as
    // SelectMenu), so it's not a DOM descendant of the sheet — query it
    // globally rather than via `within(sortSheet)`.
    await user.click(screen.getByRole('button', { name: 'Oldest first' }))
    expect(onSort).toHaveBeenCalledWith('asc')

    // Picking a facet leaves the sheet up (same as the inline Toolbar's),
    // so it has to be dismissed before the FAB is reachable again.
    await user.click(within(sortSheet).getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const filterSheet = screen.getByRole('dialog', { name: 'Filters' })
    await user.click(within(filterSheet).getByRole('button', { name: 'Filter' }))
    expect(screen.getByRole('button', { name: 'Annual' })).toBeInTheDocument()
    expect(within(filterSheet).getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Sort' })).not.toBeInTheDocument()
  })

  it('fires the primary action and closes the stack', async () => {
    const onClick = vi.fn()
    const Icon = props => <svg {...props} />
    const user = userEvent.setup()
    renderMenu({ primaryAction: { icon: Icon, label: 'Add doctor', onClick } })

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'Add doctor' }))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Add doctor' })).not.toBeInTheDocument()
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

  // The stack gives up pointer events so its collapsed layout box can't
  // swallow taps meant for the page. pointer-events inherits, so a sheet
  // opened from inside it has to take them back explicitly — otherwise its
  // backdrop never gets the dismiss click and every tap lands on the page
  // behind, leaving the sheet stuck open over a live page.
  it('opens sheets that can still receive their own dismiss click', async () => {
    const user = userEvent.setup()
    renderMenu({
      legend: { title: 'Legend', children: <p>Key</p> },
      moreMenu: { title: 'More actions', items: [{ key: 'a', label: 'A', onClick: () => {} }] },
    })
    expect(document.querySelector('[aria-label="Search"]').parentElement)
      .toHaveClass('pointer-events-none')

    await user.click(screen.getByRole('button', { name: 'Quick actions' }))
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('dialog', { name: 'More actions' }).parentElement)
      .toHaveClass('pointer-events-auto')
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
    // Each row's dropdown portals straight onto <body>, so it's not a DOM
    // descendant of the sheet — query the options globally.
    await user.click(within(sheet).getByRole('button', { name: 'Sort' }))
    await user.click(screen.getByRole('button', { name: 'Oldest first' }))
    expect(onFacet).toHaveBeenCalledWith('asc')

    await user.click(within(sheet).getByRole('button', { name: 'Year' }))
    await user.click(screen.getByRole('checkbox', { name: '2026' }))
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

  // For any page element sharing this bottom-right corner — the two must
  // never be on screen together, not even for the frame the FAB's own
  // collapse animation would otherwise run for.
  it('renders nothing at all while hidden', () => {
    const { container } = renderMenu({ hidden: true, moreMenu: { items: [{ key: 'a', label: 'A', onClick: () => {} }] } })
    expect(container).toBeEmptyDOMElement()
  })
})
