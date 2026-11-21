import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewLocumModal from './NewLocumModal'

const createStaffAccount = vi.fn()
const createLocumContact = vi.fn()
vi.mock('../lib/staffCredentials', () => ({ createStaffAccount: (...a) => createStaffAccount(...a) }))
vi.mock('../lib/locumCover', () => ({ createLocumContact: (...a) => createLocumContact(...a) }))

async function fillBasics(user) {
  await user.type(screen.getByLabelText('First name'), 'Jo')
  await user.type(screen.getByLabelText('Surname'), 'Marsh')
  await user.type(screen.getByLabelText('Mobile number'), '0821234567')
}

describe('NewLocumModal', () => {
  beforeEach(() => { createStaffAccount.mockReset(); createLocumContact.mockReset() })

  it('name and mobile alone put the locum on the shift as a contact, with no account created', async () => {
    createLocumContact.mockResolvedValue({ id: 'ph-1' })
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<NewLocumModal adminId="admin-1" onDone={onDone} onClose={vi.fn()} />)
    await fillBasics(user)
    await user.click(screen.getByRole('button', { name: 'Add to the shift' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ kind: 'contact', id: 'ph-1', name: 'Jo Marsh', surname: 'Marsh' }))
    expect(createLocumContact).toHaveBeenCalledWith({ name: 'Jo', surname: 'Marsh', phone: '0821234567', createdBy: 'admin-1' })
    expect(createStaffAccount).not.toHaveBeenCalled()
  })

  it('with an email it creates a locum account, and shows an undelivered password before handing the cover back', async () => {
    createStaffAccount.mockResolvedValue({ ok: true, profileId: 'loc-1', emailSent: false, emailError: 'bounced', password: 'Temp-Pass-123' })
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<NewLocumModal adminId="admin-1" onDone={onDone} onClose={vi.fn()} />)
    await fillBasics(user)
    await user.type(screen.getByLabelText('Email (optional)'), 'zc@example.com')
    await user.click(screen.getByRole('button', { name: 'Create account & add' }))

    expect(await screen.findByText(/could not be sent/)).toBeInTheDocument()
    expect(screen.getByText('Temp-Pass-123')).toBeInTheDocument()
    expect(createStaffAccount).toHaveBeenCalledWith(expect.objectContaining({ role: 'locum', email: 'zc@example.com', phone: '0821234567' }))
    expect(onDone).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Add to the shift' }))
    expect(onDone).toHaveBeenCalledWith({ kind: 'locum', id: 'loc-1', name: 'Jo Marsh', surname: 'Marsh' })
  })

  it('a refused account (e.g. the email is already in use) is shown and nothing is handed back', async () => {
    createStaffAccount.mockResolvedValue({ ok: false, error: 'An account with that email address already exists.' })
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<NewLocumModal adminId="admin-1" onDone={onDone} onClose={vi.fn()} />)
    await fillBasics(user)
    await user.type(screen.getByLabelText('Email (optional)'), 'zc@example.com')
    await user.click(screen.getByRole('button', { name: 'Create account & add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('a short mobile number is refused before anything is saved', async () => {
    const user = userEvent.setup()
    render(<NewLocumModal adminId="admin-1" onDone={vi.fn()} onClose={vi.fn()} />)
    await user.type(screen.getByLabelText('First name'), 'Jo')
    await user.type(screen.getByLabelText('Surname'), 'Marsh')
    await user.type(screen.getByLabelText('Mobile number'), '08212')
    await user.click(screen.getByRole('button', { name: 'Add to the shift' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('10-digit')
    expect(createLocumContact).not.toHaveBeenCalled()
  })
})
