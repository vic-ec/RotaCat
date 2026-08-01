import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusBadge, StatusPicker } from './ProfileAvatar'

describe('StatusBadge', () => {
  it('labels active as Active', () => {
    render(<StatusBadge active />)
    expect(screen.getByRole('img', { name: 'Active' })).toBeInTheDocument()
  })

  it('labels inactive as Inactive regardless of leave', () => {
    render(<StatusBadge active={false} onLeave />)
    expect(screen.getByRole('img', { name: 'Inactive' })).toBeInTheDocument()
  })

  it('labels active + on leave as On leave', () => {
    render(<StatusBadge active onLeave />)
    expect(screen.getByRole('img', { name: 'On leave' })).toBeInTheDocument()
  })
})

describe('StatusPicker', () => {
  it('shows Active/Inactive options plus an "On leave" info line when currently on approved leave', async () => {
    const user = userEvent.setup()
    render(<StatusPicker active onLeave interactive onSetActive={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Change your status' }))
    expect(screen.getByRole('menuitem', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Inactive' })).toBeInTheDocument()
    expect(screen.getByText('On leave')).toBeInTheDocument()
  })

  it('does not show the On leave line when not currently on leave', async () => {
    const user = userEvent.setup()
    render(<StatusPicker active onLeave={false} interactive onSetActive={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Change your status' }))
    expect(screen.queryByText('On leave')).not.toBeInTheDocument()
  })

  it('does not show the On leave line when inactive, even if onLeave is true', async () => {
    const user = userEvent.setup()
    render(<StatusPicker active={false} onLeave interactive onSetActive={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Change your status' }))
    expect(screen.queryByText('On leave')).not.toBeInTheDocument()
  })
})
