import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectAllRow } from './ListRow'

// The bulk actions live in this header rather than a bottom-fixed bar, so
// the count and the approve/reject/cancel controls are asserted here — both
// the mobile (icon) and desktop (text) renderings, which both exist in the
// DOM at once and are chosen between with `md:` visibility classes jsdom
// doesn't apply. Hence the getAllByRole pairs below.
function renderRow(props = {}) {
  return render(
    <SelectAllRow
      checked={false}
      onToggleCheck={() => {}}
      selectLabel="Select all pending accounts"
      active={false}
      {...props}
    />
  )
}

const bulkProps = (onApprove = () => {}, onReject = () => {}) => ({
  actions: [
    { label: 'Approve', onClick: onApprove, tone: 'success' },
    { label: 'Reject', onClick: onReject, tone: 'danger' },
  ],
})

describe('SelectAllRow', () => {
  it('is just the checkbox + label until something is checked', () => {
    renderRow({ count: 0, ...bulkProps(), onCancel: () => {} })

    expect(screen.getByRole('checkbox', { name: 'Select all pending accounts' })).toBeInTheDocument()
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('shows the live count and both renderings of every action once rows are checked', async () => {
    const onApprove = vi.fn()
    const onCancel = vi.fn()
    renderRow({ active: true, count: 3, ...bulkProps(onApprove), onCancel })

    expect(screen.getByText('3 selected')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Cancel selection' })).toBeInTheDocument() // mobile icon
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument() // desktop text

    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0])
    expect(onApprove).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  // Same guarantee the old bottom bar made: one in-flight bulk action locks
  // the actions, but never the way out of a stuck selection.
  it('disables the actions while a bulk action is in flight, but leaves Cancel usable', () => {
    renderRow({ active: true, count: 2, ...bulkProps(), onCancel: () => {}, disabled: true })

    screen.getAllByRole('button', { name: 'Approve' }).forEach(b => expect(b).toBeDisabled())
    screen.getAllByRole('button', { name: 'Reject' }).forEach(b => expect(b).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel selection' })).toBeEnabled()
  })
})
