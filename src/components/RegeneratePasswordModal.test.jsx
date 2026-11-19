import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RegeneratePasswordModal from './RegeneratePasswordModal'
import { TEMP_PASSWORD_VALIDITY_DAYS } from '../lib/tempPassword'

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

    expect(screen.getByText(/issues Ada a new temporary password/)).toBeInTheDocument()
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

  // The modal is opened from the Staff list and from the Account page;
  // where the address is known it names the destination.
  it('shows the destination address when given one', async () => {
    const user = userEvent.setup()
    render(<RegeneratePasswordModal person={PERSON} email="ada@example.com" onClose={vi.fn()} />)

    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('emails it to ada@example.com. Their current password stops working immediately.')

    await user.click(screen.getByRole('button', { name: 'Regenerate and email' }))
    expect(await screen.findByText(/emailed to Ada Nkosi at ada@example.com\./)).toBeInTheDocument()
  })

  it('leaves the address out, rather than blank, when it is not known', async () => {
    const user = userEvent.setup()
    render(<RegeneratePasswordModal person={PERSON} onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('emails it to them. Their current password stops working immediately.')
    expect(dialog).not.toHaveTextContent(/undefined|to \./)

    await user.click(screen.getByRole('button', { name: 'Regenerate and email' }))
    expect(await screen.findByText(/emailed to Ada Nkosi\. It is valid/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).not.toHaveTextContent(' at ')
  })

  // The window is defined once, in tempPassword.js; the wording must follow it.
  it('states the validity from TEMP_PASSWORD_VALIDITY_DAYS and no longer claims no expiry', async () => {
    const user = userEvent.setup()
    render(<RegeneratePasswordModal person={PERSON} email="ada@example.com" onClose={vi.fn()} />)

    const valid = new RegExp(`valid for ${TEMP_PASSWORD_VALIDITY_DAYS} days`, 'i')
    expect(screen.getByRole('dialog')).toHaveTextContent(valid)
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/no expiry/i)

    await user.click(screen.getByRole('button', { name: 'Regenerate and email' }))
    await screen.findByText('New password sent')
    expect(screen.getByRole('dialog')).toHaveTextContent(valid)
  })

  it('states the validity when the email could not be sent', async () => {
    regenerateStaffPassword.mockResolvedValue({ ok: true, emailSent: false, password: 'Qw8$rtzPmn53' })
    const user = userEvent.setup()
    render(<RegeneratePasswordModal person={PERSON} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate and email' }))
    await screen.findByText('New password set — email not sent')
    expect(screen.getByRole('dialog')).toHaveTextContent(`Valid for ${TEMP_PASSWORD_VALIDITY_DAYS} days.`)
  })
})
