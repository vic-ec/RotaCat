import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectAllRow } from './ListRow'

const ACTIONS = [
  { label: 'Approve selected', onClick: vi.fn() },
  { label: 'Reject selected', onClick: vi.fn(), tone: 'danger' },
]

function renderRow(props = {}) {
  return render(
    <SelectAllRow
      checked={false}
      onToggleCheck={vi.fn()}
      selectLabel="Select all pending accounts"
      active={false}
      {...props}
    />
  )
}

describe('SelectAllRow', () => {
  it('shows only the select-all checkbox while nothing is selected', () => {
    renderRow({ count: 0, actions: ACTIONS, onCancel: vi.fn() })
    expect(screen.getByLabelText('Select all pending accounts')).toBeInTheDocument()
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve selected' })).not.toBeInTheDocument()
  })

  // The bulk actions live here rather than in a bar fixed to the bottom of
  // the viewport, so the count and the actions sit with the checkbox that
  // armed them. Both viewport variants render at once (one is hidden by a
  // `md:` class, which jsdom can't evaluate) — hence two buttons per label.
  it('renders the count and both viewport variants of each action once rows are selected', async () => {
    const onCancel = vi.fn()
    renderRow({ active: true, count: 2, actions: ACTIONS, onCancel })

    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Approve selected' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Reject selected' })).toHaveLength(2)

    // Cancel is deliberately the one action that doesn't split by viewport
    // — it stays a text button throughout, since its only sensible glyph
    // (✕) is the reject glyph.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('fires the matching action from either variant', async () => {
    const onClick = vi.fn()
    renderRow({ active: true, count: 1, actions: [{ label: 'Approve selected', onClick }], onCancel: vi.fn() })

    for (const button of screen.getAllByRole('button', { name: 'Approve selected' })) {
      await userEvent.click(button)
    }
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  // `disabled` guards against a second bulk mutation while one is in
  // flight; Cancel deliberately stays live so a stuck action can be
  // dismissed.
  it('disables every action but not Cancel while a bulk action is in flight', () => {
    renderRow({ active: true, count: 3, actions: ACTIONS, onCancel: vi.fn(), disabled: true })

    for (const button of [
      ...screen.getAllByRole('button', { name: 'Approve selected' }),
      ...screen.getAllByRole('button', { name: 'Reject selected' }),
    ]) {
      expect(button).toBeDisabled()
    }
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})
