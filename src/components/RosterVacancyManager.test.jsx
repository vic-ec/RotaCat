import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RosterVacancyManager from './RosterVacancyManager'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1' } }),
}))

const { calls } = vi.hoisted(() => ({ calls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      let method = null
      let payload = null
      const builder = {
        update(p) { method = 'update'; payload = p; return builder },
        insert(p) { method = 'insert'; payload = p; calls.push({ table, method, payload }); return builder },
        eq(col, val) {
          if (method === 'update') calls.push({ table, method, payload, eq: [col, val] })
          return builder
        },
        then(resolve) {
          return Promise.resolve({ error: null }).then(resolve)
        },
      }
      return builder
    },
  },
}))

const PROFILES = [
  { id: 'doc-a', name: 'Alice', surname: 'Anderson', category: 'MO', color_code: '#111' },
  { id: 'doc-b', name: 'Bob', surname: 'Brown', category: 'MO', color_code: '#222' },
  { id: 'doc-c', name: 'Cara', surname: 'Clarke', category: 'MO', color_code: '#333' },
]
const SHIFT_TYPES = { 'st-wd08': 'WD_08', 'st-wd15': 'WD_15' }

function freshEntries() {
  return [
    { id: 'e1', date: '2026-08-10', profile_id: 'doc-a', shift_type_id: 'st-wd08' }, // Alice's WD_08 — the vacancy
    { id: 'e2', date: '2026-08-10', profile_id: 'doc-b', shift_type_id: 'st-wd15' }, // Bob's own shift, same day
  ]
}
const VACANCY = { entryId: 'e1', date: '2026-08-10', shiftCode: 'WD_08', currentProfileId: 'doc-a' }

describe('RosterVacancyManager — recursive swap workflow', () => {
  beforeEach(() => { calls.length = 0 })

  it('walks the recursive-swap case end to end: swap creates a same-day conflict, re-opens the modal for it, resolving that finishes', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(
      <RosterVacancyManager vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={onDone} />
    )

    // Step 1: choose screen for Alice's WD_08 vacancy
    expect(await screen.findByText(/Alice Anderson is on a published shift — WD_08 on 2026-08-10/)).toBeInTheDocument()

    // Step 2: pick "Swap with another doctor" -> DoctorDropdown opens, Alice excluded from the list
    await user.click(screen.getByRole('button', { name: /swap with another doctor/i }))
    expect(screen.queryByText('Anderson')).not.toBeInTheDocument()
    expect(await screen.findByText('Brown')).toBeInTheDocument()

    // Step 3: pick Bob — he already has WD_15 that same day, so this must
    // re-trigger the modal for THAT shift instead of finishing.
    await user.click(screen.getByText('Brown'))

    expect(onDone).not.toHaveBeenCalled()
    expect(await screen.findByText(/Bob Brown is on a published shift — WD_15 on 2026-08-10/)).toBeInTheDocument()

    // Step 4: resolve the cascaded vacancy — the chain should now finish.
    await user.click(screen.getByRole('button', { name: /open, don't advertise/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))

    // Verify the actual writes: e1 swapped to Bob, e2 vacated, no advertisement inserted.
    const e1Update = calls.find(c => c.table === 'roster_entries' && c.eq[1] === 'e1')
    const e2Update = calls.find(c => c.table === 'roster_entries' && c.eq[1] === 'e2')
    expect(e1Update.payload).toMatchObject({ profile_id: 'doc-b' })
    expect(e2Update.payload).toMatchObject({ profile_id: null })
    expect(calls.some(c => c.table === 'shift_advertisements')).toBe(false)
  })

  it('swap with no same-day conflict resolves immediately (no cascade)', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    const entries = [{ id: 'e1', date: '2026-08-10', profile_id: 'doc-a', shift_type_id: 'st-wd08' }] // no Bob entry at all
    render(<RosterVacancyManager vacancy={VACANCY} entries={entries} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={onDone} />)

    await user.click(await screen.findByRole('button', { name: /swap with another doctor/i }))
    await user.click(await screen.findByText('Brown'))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/is on a published shift/)).not.toBeInTheDocument()
  })

  it('"Open & advertise" vacates the entry and inserts a shift_advertisements row', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<RosterVacancyManager vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={onDone} />)

    await user.click(await screen.findByRole('button', { name: /^open & advertise$/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const adInsert = calls.find(c => c.table === 'shift_advertisements')
    expect(adInsert.payload).toMatchObject({ roster_entry_id: 'e1', advertised_by: 'admin-1', status: 'open' })
    const entryUpdate = calls.find(c => c.table === 'roster_entries')
    expect(entryUpdate.payload).toMatchObject({ profile_id: null })
  })

  it('"Open, don\'t advertise" vacates the entry without inserting an advertisement', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<RosterVacancyManager vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={onDone} />)

    await user.click(await screen.findByRole('button', { name: /open, don't advertise/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(calls.some(c => c.table === 'shift_advertisements')).toBe(false)
  })
})
