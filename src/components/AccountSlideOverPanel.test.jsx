import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AccountSlideOverPanel from './AccountSlideOverPanel'

vi.mock('../pages/AccountSettingsPage', () => ({ default: () => <div>AccountStub</div> }))

function renderPanel(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/staff" element={<div>StaffPageStub</div>} />
        <Route path="/account/:id" element={<AccountSlideOverPanel />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AccountSlideOverPanel', () => {
  it('renders the account page content in a dialog with a Cancel button', () => {
    renderPanel([{ pathname: '/account/p1', state: { backgroundLocation: { pathname: '/staff', search: '' } } }])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('AccountStub')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('Cancel navigates back to the background location behind it', async () => {
    const user = userEvent.setup()
    renderPanel([{ pathname: '/account/p1', state: { backgroundLocation: { pathname: '/staff', search: '' } } }])

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('StaffPageStub')).toBeInTheDocument()
    expect(screen.queryByText('AccountStub')).not.toBeInTheDocument()
  })

  it('clicking outside the panel closes it the same way Cancel does', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[{ pathname: '/account/p1', state: { backgroundLocation: { pathname: '/staff', search: '' } } }]}>
        <div>
          <button type="button">Outside</button>
          <Routes>
            <Route path="/staff" element={<div>StaffPageStub</div>} />
            <Route path="/account/:id" element={<AccountSlideOverPanel />} />
          </Routes>
        </div>
      </MemoryRouter>
    )

    await user.click(screen.getByText('Outside'))

    expect(screen.getByText('StaffPageStub')).toBeInTheDocument()
    expect(screen.queryByText('AccountStub')).not.toBeInTheDocument()
  })

  it('falls back to /staff when there is no background location (e.g. a direct visit)', async () => {
    const user = userEvent.setup()
    renderPanel(['/account/p1'])

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('StaffPageStub')).toBeInTheDocument()
  })
})
