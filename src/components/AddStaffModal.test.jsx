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
      rotations: [],
    })
  })

  // A new block's EC/OT type is seeded from the Hours choice rather than
  // asked for twice — a doctor whose contract says OT while their opening
  // rotation says EC is exactly the inconsistency the planner can't
  // resolve. It stays editable per block after that, since a real year
  // does change type partway through.
  it('seeds an OT rotation block from the OT hours choice', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Select…/, 'Intern')
    await pickFromSelect(user, /EC — full hours/, /OT — Junior Doctor Overtime/)
    await pickFromSelect(user, /Not yet assigned…/, 'LRCHC')
    setDate('Active from', '2026-09-01')

    await user.click(screen.getByRole('button', { name: 'Add rotation' }))
    setDate('From', '2026-09-01')
    setDate('To', '2026-10-31')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(createStaffAccount).toHaveBeenCalledTimes(1))
    const payload = createStaffAccount.mock.calls[0][0]
    expect(payload.category).toBe('Intern')
    expect(payload.contractType).toBe('Junior_Doctor_Overtime')
    expect(payload.subtype).toBe('LRCHC')
    expect(payload.rotations).toEqual([{
      rotationType: 'OT',
      subtype: 'LRCHC',
      startDate: '2026-09-01',
      endDate: '2026-10-31',
    }])
  })

  // The whole point of "Add rotation": an admin can lay out the intern's
  // full year at creation rather than opening the planner straight after.
  it('sends every dated block, so a full year can be planned at creation', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Select…/, 'Intern')
    setDate('Active from', '2026-09-01')

    await user.click(screen.getByRole('button', { name: 'Add rotation' }))
    await user.click(screen.getByRole('button', { name: 'Add rotation' }))

    const from = screen.getAllByLabelText('From')
    const to = screen.getAllByLabelText('To')
    fireEvent.change(from[0], { target: { value: '2026-09-01' } })
    fireEvent.change(to[0], { target: { value: '2026-10-31' } })
    fireEvent.change(from[1], { target: { value: '2026-11-01' } })
    fireEvent.change(to[1], { target: { value: '2026-12-31' } })

    // Second block switched to OT — a run of blocks genuinely does change
    // type partway through a year. Both blocks read "EC" at this point, so
    // the second one's dropdown is picked by position.
    await user.click(screen.getAllByRole('button', { name: /^EC$/ })[1])
    await user.click(screen.getByRole('option', { name: 'OT · Psych' }))

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(createStaffAccount).toHaveBeenCalledTimes(1))
    expect(createStaffAccount.mock.calls[0][0].rotations).toEqual([
      { rotationType: 'EC', subtype: null, startDate: '2026-09-01', endDate: '2026-10-31' },
      { rotationType: 'OT', subtype: 'PSYCH', startDate: '2026-11-01', endDate: '2026-12-31' },
    ])
  })

  // Nothing downstream resolves two blocks covering one day —
  // rotationForDate takes the first match — so it's caught here.
  it('refuses overlapping rotation blocks', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Select…/, 'Intern')
    setDate('Active from', '2026-09-01')

    await user.click(screen.getByRole('button', { name: 'Add rotation' }))
    await user.click(screen.getByRole('button', { name: 'Add rotation' }))
    const from = screen.getAllByLabelText('From')
    const to = screen.getAllByLabelText('To')
    fireEvent.change(from[0], { target: { value: '2026-09-01' } })
    fireEvent.change(to[0], { target: { value: '2026-11-30' } })
    fireEvent.change(from[1], { target: { value: '2026-11-01' } })

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText(/Rotations overlap/)).toBeInTheDocument()
    expect(createStaffAccount).not.toHaveBeenCalled()
  })

  it('offers rotations only for the categories the planner tracks', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await pickFromSelect(user, /Select…/, 'Medical Officer')
    expect(screen.queryByRole('button', { name: 'Add rotation' })).not.toBeInTheDocument()

    await pickFromSelect(user, /Medical Officer/, 'Registrar')
    expect(screen.getByRole('button', { name: 'Add rotation' })).toBeInTheDocument()
    // Registrar rotations are EC-only, so no Hours picker appears to seed
    // an OT block from.
    expect(screen.queryByText('Hours')).not.toBeInTheDocument()
  })

  // Every locum profile in the live data carries a null category, and
  // nothing in the app reads one for a locum — so the form doesn't ask,
  // the same way it doesn't for a clerk.
  it('hides Category for locums and clerks', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await pickFromSelect(user, /Select…/, 'Consultant')
    expect(screen.getByRole('button', { name: /Consultant/ })).toBeInTheDocument()

    await pickFromSelect(user, /Doctor/, 'Locum')
    expect(screen.queryByText('Category')).not.toBeInTheDocument()

    await pickFromSelect(user, /Locum/, 'Clerk')
    expect(screen.queryByText('Category')).not.toBeInTheDocument()
  })

  it('submits a locum with no category at all', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Doctor/, 'Locum')
    setDate('Active from', '2026-09-01')

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(createStaffAccount).toHaveBeenCalledTimes(1))
    const payload = createStaffAccount.mock.calls[0][0]
    expect(payload.role).toBe('locum')
    expect(payload.category).toBeNull()
  })

  it('empties every field when Clear form is used', async () => {
    const user = userEvent.setup()
    render(<AddStaffModal onClose={vi.fn()} onCreated={vi.fn()} />)

    await fillIdentity(user)
    await pickFromSelect(user, /Select…/, 'Intern')
    setDate('Active from', '2026-09-01')
    await user.click(screen.getByRole('button', { name: 'Add rotation' }))

    await user.click(screen.getByRole('button', { name: 'Clear form' }))

    expect(screen.getByLabelText('First name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Active from')).toHaveValue('')
    // Category cleared back to its placeholder, and the rotation section
    // it revealed is gone with it.
    expect(screen.getByRole('button', { name: /Select…/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add rotation' })).not.toBeInTheDocument()
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
