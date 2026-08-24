import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddStaffModal from './AddStaffModal'

const { createStaffAccount } = vi.hoisted(() => ({ createStaffAccount: vi.fn() }))
vi.mock('../lib/staffCredentials', () => ({ createStaffAccount }))

function setDate(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

async function pickFromSelect(user, triggerName, optionName) {
  await user.click(screen.getByRole('button', { name: triggerName }))
  await user.click(screen.getByRole('option', { name: optionName }))
}

async function fillIdentity(user) {
  await user.type(screen.getByLabelText('First name'), 'Ada')
  await user.type(screen.getByLabelText('Surname'), 'Nkosi')
  await user.type(screen.getByLabelText('Mobile number'), '0821234567')
  await user.type(screen.getByLabelText('Email'), 'ada@example.com')
}

describe('AddStaffModal', () => {
  beforeEach(() => {
    createStaffAccount.mockReset()
    createStaffAccount.mockResolvedValue({ ok: true, emailSent: true, profileId: 'new-1' })
  })

  it('submits the admin’s values, with the start date as scheduled_active_date', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Select…/, 'Medical Officer')
    setDate('Active from', '2026-09-01')
    setDate('Active until', '2027-02-28')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(createStaffAccount).toHaveBeenCalledTimes(1))
    expect(createStaffAccount).toHaveBeenCalledWith({
      name: 'Ada',
      surname: 'Nkosi',
      phone: '0821234567',
      email: 'ada@example.com',
      role: 'doctor',
      category: 'MO',
      contractType: 'full',
      subtype: null,
      activeFrom: '2026-09-01',
      activeUntil: '2027-02-28',
      rotation: null,
    })
  })

  // The rotation block's EC/OT type is derived from the Hours choice, not
  // asked for separately — two independent controls could disagree, and a
  // doctor whose contract says OT while their rotation block says EC is
  // exactly the inconsistency the planner cannot resolve.
  it('derives an OT rotation block from the OT hours choice', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Select…/, 'Intern')
    await pickFromSelect(user, /EC — full hours/, /OT — Junior Doctor Overtime/)
    await pickFromSelect(user, /Not yet assigned…/, 'LRCHC')
    setDate('Active from', '2026-09-01')
    setDate('Rotation from', '2026-09-01')
    setDate('Rotation to', '2026-10-31')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(createStaffAccount).toHaveBeenCalledTimes(1))
    const payload = createStaffAccount.mock.calls[0][0]
    expect(payload.category).toBe('Intern')
    expect(payload.contractType).toBe('Junior_Doctor_Overtime')
    expect(payload.subtype).toBe('LRCHC')
    expect(payload.rotation).toEqual({
      rotationType: 'OT',
      subtype: 'LRCHC',
      startDate: '2026-09-01',
      endDate: '2026-10-31',
    })
  })

  it('offers a rotation only for the categories the planner tracks', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await pickFromSelect(user, /Select…/, 'Medical Officer')
    expect(screen.queryByText('First rotation')).not.toBeInTheDocument()

    await pickFromSelect(user, /Medical Officer/, 'Registrar')
    expect(screen.getByText('First rotation')).toBeInTheDocument()
    // Registrar rotations are EC-only, so no Hours picker appears to
    // derive an OT block from.
    expect(screen.queryByText('Hours')).not.toBeInTheDocument()
  })

  it('drops a category that does not apply to the newly picked role', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await pickFromSelect(user, /Select…/, 'Consultant')
    expect(screen.getByRole('button', { name: /Consultant/ })).toBeInTheDocument()

    // Consultant isn't a locum category — it clears rather than being
    // submitted and silently normalised away server-side.
    await pickFromSelect(user, /Doctor/, 'Locum')
    expect(screen.queryByRole('button', { name: /Consultant/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /None/ })).toBeInTheDocument()

    // A clerk has no category at all.
    await pickFromSelect(user, /Locum/, 'Clerk')
    expect(screen.queryByText('Category')).not.toBeInTheDocument()
  })

  it('rejects an incomplete mobile number before calling the server', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await user.type(screen.getByLabelText('First name'), 'Ada')
    await user.type(screen.getByLabelText('Surname'), 'Nkosi')
    await user.type(screen.getByLabelText('Mobile number'), '0821')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await pickFromSelect(user, /Select…/, 'Medical Officer')
    setDate('Active from', '2026-09-01')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Enter a 10-digit mobile number.')).toBeInTheDocument()
    expect(createStaffAccount).not.toHaveBeenCalled()
  })

  // Creating the account and delivering the password fail independently —
  // an admin told only "created" would never know the person never got
  // their login.
  it('reports a delivery failure separately and surfaces the password once', async () => {
    createStaffAccount.mockResolvedValue({
      ok: true, profileId: 'new-1', emailSent: false, emailError: 'SMTP is not configured', password: 'Xk7#tuvWmz42',
    })
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Select…/, 'Medical Officer')
    setDate('Active from', '2026-09-01')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Account created — email not sent')).toBeInTheDocument()
    expect(screen.getByText('Xk7#tuvWmz42')).toBeInTheDocument()
    expect(screen.getByText(/SMTP is not configured/)).toBeInTheDocument()
  })

  it('never shows the password when the email went out', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Select…/, 'Medical Officer')
    setDate('Active from', '2026-09-01')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Account created')).toBeInTheDocument()
    expect(screen.queryByText('Generated password')).not.toBeInTheDocument()
  })

  it('keeps the form open with the server’s message when creation fails', async () => {
    createStaffAccount.mockResolvedValue({ ok: false, error: 'An account with that email address already exists.' })
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<AddStaffModal onClose={vi.fn()} onCreated={onCreated} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Select…/, 'Medical Officer')
    setDate('Active from', '2026-09-01')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('An account with that email address already exists.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
