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
        select() { if (!method) method = 'select'; return builder },
        update(p) { method = 'update'; payload = p; return builder },
        insert(p) { method = 'insert'; payload = p; calls.push({ table, method, payload }); return builder },
        eq(col, val) {
          if (method === 'update') calls.push({ table, method, payload, eq: [col, val] })
          return builder
        },
        gte() { return builder },
        lte() { return builder },
        single() { return builder },
        then(resolve) {
          // A captured leave row reads its own id back.
          const data = method === 'insert' && table === 'leave_requests' ? { id: 'leave-1' } : []
          return Promise.resolve({ data, error: null }).then(resolve)
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

async function pick(user, label, optionText) {
  await user.click(screen.getByLabelText(label))
  await user.click(await screen.findByText(optionText))
}
const save = user => user.click(screen.getByRole('button', { name: 'Save' }))

describe('RosterVacancyManager — replace or open a published shift', () => {
  beforeEach(() => { calls.length = 0 })

  it('nothing can be saved until a reason and an outcome for the shift are both chosen', async () => {
    const user = userEvent.setup()
    render(<RosterVacancyManager vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={vi.fn()} />)

    expect(await screen.findByText(/Alice Anderson — WD 08h-18h on 2026-08-10/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await pick(user, 'Reason', 'No-show')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: /Open, don't advertise/ }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('walks the recursive-swap case end to end: the replacement already holds a shift that day, so the dialog re-opens for it', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(
      <RosterVacancyManager vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={onDone} />
    )
    await screen.findByText(/Alice Anderson — WD 08h-18h on 2026-08-10/)
    await pick(user, 'Reason', 'Swap')

    // Choosing "Replace" opens the doctor list, with Alice herself left out.
    await user.click(screen.getByRole('radio', { name: /Replace with a doctor/ }))
    expect(screen.queryByText('Anderson')).not.toBeInTheDocument()
    await user.click(await screen.findByText('Brown'))
    expect(await screen.findByRole('button', { name: /Bob Brown · change/ })).toBeInTheDocument()
    await save(user)

    // Bob already has WD_15 that day: that shift now needs its own decision,
    // and the reason is carried over as a swap.
    expect(onDone).not.toHaveBeenCalled()
    expect(await screen.findByText(/Bob Brown — WD 15h-01h on 2026-08-10/)).toBeInTheDocument()
    expect(screen.getByLabelText('Reason')).toHaveTextContent('Swap')
    await user.click(screen.getByRole('radio', { name: /Open, don't advertise/ }))
    await save(user)

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const e1Update = calls.find(c => c.table === 'roster_entries' && c.eq?.[1] === 'e1')
    const e2Update = calls.find(c => c.table === 'roster_entries' && c.eq?.[1] === 'e2')
    expect(e1Update.payload).toMatchObject({ profile_id: 'doc-b', vacated_profile_id: 'doc-a', vacated_reason: 'swap', vacated_by: 'admin-1' })
    expect(e2Update.payload).toMatchObject({ profile_id: null, vacated_profile_id: 'doc-b', vacated_reason: 'swap' })
    expect(calls.some(c => c.table === 'shift_advertisements')).toBe(false)
    expect(calls.some(c => c.table === 'leave_requests')).toBe(false)
  })

  it('a replacement with no other shift that day finishes in one step', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    const entries = [{ id: 'e1', date: '2026-08-10', profile_id: 'doc-a', shift_type_id: 'st-wd08' }]
    render(<RosterVacancyManager vacancy={VACANCY} entries={entries} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={onDone} />)

    await screen.findByText(/Alice Anderson —/)
    await pick(user, 'Reason', 'Swap')
    await user.click(screen.getByRole('radio', { name: /Replace with a doctor/ }))
    await user.click(await screen.findByText('Brown'))
    await save(user)

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith({ leaveChanged: false })
  })

  it('a doctor on approved leave that day is not offered as the replacement', async () => {
    const user = userEvent.setup()
    render(
      <RosterVacancyManager
        vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={vi.fn()}
        leaveByProfile={{ 'doc-b': [['2026-08-10', '2026-08-10', null, null]] }}
      />
    )
    await screen.findByText(/Alice Anderson —/)
    await user.click(screen.getByRole('radio', { name: /Replace with a doctor/ }))
    expect(await screen.findByText('Clarke')).toBeInTheDocument()
    expect(screen.queryByText('Brown')).not.toBeInTheDocument()
  })

  it('a locum with an account can take the shift: written as a locum row that does not count towards contract hours', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(
      <RosterVacancyManager
        vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={onDone}
        locums={[{ id: 'loc-1', name: 'Zinhle', surname: 'Cebani', is_active: true }]}
        placeholders={[{ id: 'ph-1', name: 'Tom', surname: 'Temp', phone: '0821234567' }]}
      />
    )
    await screen.findByText(/Alice Anderson —/)
    await pick(user, 'Reason', 'Sick leave')
    await user.click(screen.getByRole('radio', { name: /Replace with a doctor or locum/ }))
    expect(await screen.findByText('Tom Temp')).toBeInTheDocument()
    expect(screen.getByText('Locum · no account yet')).toBeInTheDocument()
    await user.click(screen.getByText('Zinhle Cebani'))
    expect(await screen.findByRole('button', { name: /Zinhle Cebani \(locum\) · change/ })).toBeInTheDocument()
    await save(user)

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(calls.find(c => c.table === 'roster_entries').payload).toMatchObject({
      profile_id: 'loc-1', is_locum: true, locum_name: 'Zinhle Cebani', counts_toward_contract_hours: false,
      vacated_profile_id: 'doc-a', vacated_reason: 'leave',
    })
    expect(calls.find(c => c.table === 'roster_entry_changes').payload).toMatchObject({ profile_id_after: 'loc-1' })
  })

  it('a locum with no account yet is assigned by name, and the log names them', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(
      <RosterVacancyManager
        vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={onDone}
        placeholders={[{ id: 'ph-1', name: 'Tom', surname: 'Temp', phone: '0821234567' }]}
      />
    )
    await screen.findByText(/Alice Anderson —/)
    await pick(user, 'Reason', 'No-show')
    await user.click(screen.getByRole('radio', { name: /Replace with a doctor or locum/ }))
    await user.click(await screen.findByText('Tom Temp'))
    await save(user)

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(calls.find(c => c.table === 'roster_entries').payload).toMatchObject({
      profile_id: null, is_locum: true, locum_name: 'Tom Temp', locum_placeholder_id: 'ph-1', counts_toward_contract_hours: false,
    })
    expect(calls.find(c => c.table === 'roster_entry_changes').payload)
      .toMatchObject({ profile_id_after: null, note: 'covered by locum Tom Temp (no account yet)' })
  })

  it('"Open & advertise" for a no-show vacates the entry, advertises it, and logs the reason', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<RosterVacancyManager vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} rosterMonthId="rm-1" onDone={onDone} />)

    await screen.findByText(/Alice Anderson —/)
    await pick(user, 'Reason', 'No-show')
    await user.type(screen.getByLabelText('Note'), 'Did not answer')
    await user.click(screen.getByRole('radio', { name: /Open & advertise/ }))
    await save(user)

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(calls.find(c => c.table === 'shift_advertisements').payload)
      .toMatchObject({ roster_entry_id: 'e1', advertised_by: 'admin-1', status: 'open' })
    expect(calls.find(c => c.table === 'roster_entries').payload)
      .toMatchObject({ profile_id: null, vacated_profile_id: 'doc-a', vacated_reason: 'no_show', vacated_note: 'Did not answer' })
    expect(calls.find(c => c.table === 'roster_entry_changes').payload)
      .toMatchObject({ action: 'unassign', advertised: true, reason: 'no_show', note: 'Did not answer', profile_id_before: 'doc-a' })
  })

  it('sick leave: captures approved leave for the doctor, links the shift to it, and keeps the note off the roster row', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<RosterVacancyManager vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} rosterMonthId="rm-1" onDone={onDone} />)

    await screen.findByText(/Alice Anderson —/)
    await pick(user, 'Reason', 'Sick leave')
    expect(screen.getByLabelText('Leave from')).toHaveValue('2026-08-10')
    expect(screen.getByLabelText('Leave to')).toHaveValue('2026-08-10')
    await user.type(screen.getByLabelText('Note'), 'Phoned in at 18:00')
    await user.click(screen.getByRole('radio', { name: /Open, don't advertise/ }))
    await save(user)

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ leaveChanged: true }))
    expect(calls.find(c => c.table === 'leave_requests').payload).toMatchObject({
      profile_id: 'doc-a', leave_type: 'sick', date_from: '2026-08-10', date_to: '2026-08-10',
      status: 'approved', reviewed_by: 'admin-1', submitted_by: 'admin-1', notes: 'Phoned in at 18:00',
    })
    expect(calls.find(c => c.table === 'roster_entries').payload).toMatchObject({
      profile_id: null, vacated_profile_id: 'doc-a', vacated_reason: 'leave', vacated_leave_request_id: 'leave-1', vacated_note: null,
    })
    expect(calls.find(c => c.table === 'roster_entry_changes').payload)
      .toMatchObject({ reason: 'leave', note: 'Sick leave', leave_request_id: 'leave-1' })
    expect(calls.some(c => c.table === 'shift_advertisements')).toBe(false)
  })

  it('leave already on record for that date is linked, not captured a second time', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(
      <RosterVacancyManager
        vacancy={VACANCY} entries={freshEntries()} shiftTypes={SHIFT_TYPES} profiles={PROFILES} onDone={onDone}
        leaveByProfile={{ 'doc-a': [['2026-08-09', '2026-08-11', 'sick', 'leave-9']] }}
      />
    )
    await screen.findByText(/Alice Anderson —/)
    await pick(user, 'Reason', 'Sick leave')
    expect(screen.getByTestId('existing-leave-note')).toHaveTextContent('Alice Anderson already has approved sick leave for 9–11 Aug')
    expect(screen.queryByLabelText('Leave from')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Open, don't advertise/ }))
    await save(user)

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(calls.some(c => c.table === 'leave_requests')).toBe(false)
    expect(calls.find(c => c.table === 'roster_entries').payload).toMatchObject({ vacated_reason: 'leave', vacated_leave_request_id: 'leave-9' })
  })
})
