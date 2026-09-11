import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The rotation editor is the one place on this page with state worth losing:
// which doctor is open, whether Edit rotations is on, and any half-typed date.
// All of it lives inside InternRotationsMatrix, so anything that unmounts the
// matrix throws it away — which is what a `{!loading && <Matrix/>}` gate did
// after every save, since every mutation calls load() again.

// Ongoing (no end date) so the doctor shows in the matrix's "right now"
// panel, which is how a doctor gets selected without a deep link.
const rotations = [
  { id: 'r1', doctor_id: 'intern-1', rotation_type: 'EC', subtype: null, start_date: '2020-01-01', end_date: null },
]
const profiles = [
  { id: 'intern-1', name: 'Ada', surname: 'Adeyemi', color_code: '#0F766E', category: 'Intern', is_active: true, scheduled_inactive_date: null, scheduled_active_date: null },
]

const createInternRotation = vi.fn().mockResolvedValue(undefined)
const deleteInternRotation = vi.fn().mockResolvedValue(undefined)

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: profiles, error: null }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}))
vi.mock('../lib/internRotations', async importOriginal => ({
  ...(await importOriginal()),
  fetchAllInternRotations: () => Promise.resolve(rotations),
  createInternRotation: (...a) => createInternRotation(...a),
  updateInternRotation: vi.fn().mockResolvedValue(undefined),
  deleteInternRotation: (...a) => deleteInternRotation(...a),
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'admin-1' } }) }))
vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()] }))

const { default: InternRotationsPlanner } = await import('./InternRotationsPlanner')

async function openEditor(user) {
  render(<InternRotationsPlanner />)
  // Two buttons carry the doctor's name — their matrix row and the chip in
  // the "right now" panel. The panel chip is the one that opens the side panel.
  const panel = (await screen.findByText(/right now/)).closest('div')
  await user.click(within(panel).getByRole('button', { name: 'Ada Adeyemi' }))
  await user.click(await screen.findByRole('button', { name: 'Edit rotations' }))
  expect(screen.getByRole('button', { name: 'Done editing' })).toBeInTheDocument()
}

describe('InternRotationsPlanner', () => {
  beforeEach(() => { createInternRotation.mockClear(); deleteInternRotation.mockClear() })

  it('keeps the rotation editor open across the refetch that follows Add block', async () => {
    const user = userEvent.setup()
    await openEditor(user)

    await user.click(screen.getByRole('button', { name: /Add block/ }))
    expect(createInternRotation).toHaveBeenCalled()

    // The save triggers load() again. The editor must survive it — reopening
    // after every block added is the bug this guards.
    expect(await screen.findByRole('button', { name: 'Done editing' })).toBeInTheDocument()
  })

  it('asks before deleting a block, and only deletes once confirmed', async () => {
    const user = userEvent.setup()
    await openEditor(user)

    await user.click(screen.getByRole('button', { name: 'Remove block' }))
    expect(deleteInternRotation).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'No' }))
    expect(deleteInternRotation).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove block' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yes, delete' }))
    expect(deleteInternRotation).toHaveBeenCalledWith('r1', 'intern-1')

    // Same again: deleting a block must not close the editor either.
    expect(await screen.findByRole('button', { name: 'Done editing' })).toBeInTheDocument()
  })
})
