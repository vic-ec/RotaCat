import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RegeneratePasswordModal from './RegeneratePasswordModal'

const { regenerateStaffPassword } = vi.hoisted(() => ({ regenerateStaffPassword: vi.fn() }))
vi.mock('../lib/staffCredentials', () => ({ regenerateStaffPassword }))

const PERSON = { id: 'doc-1', name: 'Ada', surname: 'Nkosi' }

describe('RegeneratePasswordModal', () => {
  beforeEach(() => {
    regenerateStaffPassword.mockReset()
    regenerateStaffPassword.mockResolvedValue({ ok: true, emailSent: true, profileId: 'doc-1' })
  })

  // The person's current password stops working the moment this succeeds,
  // so it is never a one-click action from the row menu.
  it('confirms before invalidating anything', async () => {
    const user = userEvent.setup()
    render(<RegeneratePasswordModal person={PERSON} onClose={vi.fn()} />)

    expect(screen.getByText(/issues Ada a brand-new password/)).toBeInTheDocument()
    expect(regenerateStaffPassword).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Regenerate and email' }))
    expect(regenerateStaffPassword).toHaveBeenCalledWith('doc-1')
  })

  it('cancels without calling the server', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<RegeneratePasswordModal person={PERSON} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(regenerateStaffPassword).not.toHaveBeenCalled()
  })

  it('surfaces the password only when the email could not be sent', async () => {
    regenerateStaffPassword.mockResolvedValue({
      ok: true, emailSent: false, emailError: 'Connection refused', password: 'Qw8$rtzPmn53',
    })
    const user = userEvent.setup()
    render(<RegeneratePasswordModal person={PERSON} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate and email' }))

    expect(await screen.findByText('New password set — email not sent')).toBeInTheDocument()
    expect(screen.getByText('Qw8$rtzPmn53')).toBeInTheDocument()
    expect(screen.getByText(/Connection refused/)).toBeInTheDocument()
  })

  it('confirms delivery without ever showing the password', async () => {
    const user = userEvent.setup()
    render(<RegeneratePasswordModal person={PERSON} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate and email' }))

    expect(await screen.findByText('New password sent')).toBeInTheDocument()
    expect(screen.queryByText('Generated password')).not.toBeInTheDocument()
  })

  it('stays on the confirmation with the server’s message when it fails', async () => {
    regenerateStaffPassword.mockResolvedValue({ ok: false, error: 'No account found for that person.' })
    const user = userEvent.setup()
    render(<RegeneratePasswordModal person={PERSON} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate and email' }))

    expect(await screen.findByText('No account found for that person.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate and email' })).toBeInTheDocument()
  })
})
