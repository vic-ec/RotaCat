import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShiftMenu from './ShiftMenu'

vi.mock('../lib/supabase', () => ({ supabase: {} }))

const nameOf = id => ({ 'doc-a': 'Alice Anderson', 'doc-b': 'Bob Brown', 'loc-1': 'Jo Marsh' })[id] || null
const PROFILES = [{ id: 'doc-b', name: 'Bob', surname: 'Brown', category: 'MO', color_code: '#222' }]
const row = { id: 'e1', date: '2026-08-10', shift_type_id: 'st1', profile_id: 'doc-a', is_locum: false, locum_name: null }
const noCover = { ...row, profile_id: null, vacated_profile_id: 'doc-a', vacated_reason: 'leave', vacated_leave_request_id: 'leave-1' }
const slotVacated = { ...noCover, is_locum: true, locum_name: '[ ]' }
const slot = { ...row, profile_id: null, is_locum: true, locum_name: '[ ]' }
const locum = { ...row, profile_id: 'loc-1', is_locum: true, locum_name: '[Marsh]' }
const locumVacated = { ...locum, vacated_profile_id: 'doc-a', vacated_reason: 'no_show' }

function handlers() {
  return {
    onVacancy: vi.fn(), onAssign: vi.fn(), onRemoveEntry: vi.fn(), onRemoveLocum: vi.fn(), onAddCover: vi.fn(), onRemoveSlot: vi.fn(),
    onAdvertise: vi.fn(), onUnadvertise: vi.fn(), onReinstate: vi.fn(), onChangeTimes: vi.fn(), onClose: vi.fn(),
    onMove: vi.fn(), onRemoveFromShift: vi.fn(),
  }
}
function open(entry, over = {}) {
  const h = handlers()
  render(
    <ShiftMenu
      entry={entry} date="2026-08-10" shiftCode="WD_08" rosterStatus="published"
      entries={[entry].filter(Boolean)} profiles={PROFILES} displayNames={new Map()} nameOf={nameOf} adminId="admin-1"
      {...h} {...over}
    />
  )
  return h
}
const dialog = () => screen.getByRole('dialog')
const option = name => within(dialog()).getByRole('radio', { name })
// A choice's explainer, behind its (i): opened, and its text read.
const hintOf = name => {
  const row = option(name).closest('label').parentElement
  fireEvent.click(within(row).getByRole('button', { name: /^About / }))
  const pop = screen.getAllByRole('dialog').at(-1)
  const text = pop.textContent
  fireEvent.click(within(pop).getByRole('button', { name: 'Close' }))
  return text
}
// Tick a choice and press Continue.
async function choose(user, name) {
  await user.click(option(name))
  await user.click(within(dialog()).getByRole('button', { name: 'Continue' }))
}

beforeEach(() => { window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })

describe('ShiftMenu — which menu opens (the spec table)', () => {
  it('a doctor on a published roster: Rearrange (Move, Replace, Remove), Absence (Mark absent → the vacancy form), Times', async () => {
    const user = userEvent.setup()
    const h = open(row)
    expect(within(dialog()).getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(within(dialog()).getByText('Rearrange')).toBeInTheDocument()
    expect(within(dialog()).getByText('Absence')).toBeInTheDocument()
    option(/Move to another shift/)
    option(/Replace with someone else/)
    option(/Remove from this shift/)
    option(/Change times/)
    await choose(user, /Mark absent/)
    expect(h.onVacancy).toHaveBeenCalledWith(row)
    expect(h.onClose).toHaveBeenCalled()
  })

  it('Move to another shift: a day, a shift (with who is on it), and the slot left behind', async () => {
    const user = userEvent.setup()
    const h = open(row, {
      monthStart: '2026-08-01', monthEnd: '2026-08-31',
      shiftsForDate: () => [{ code: 'WD_08', label: 'WD 08h-18h' }, { code: 'WD_12', label: 'WD 12h-22h' }],
      occupants: (d, c) => (c === 'WD_12' ? 'Brown' : ''),
      moveWarnings: () => ['On approved leave that day.'],
    })
    await choose(user, /Move to another shift/)
    const form = screen.getByTestId('move-form')
    // The current shift isn't offered on its own day.
    expect(within(form).queryByRole('radio', { name: /WD 08h-18h/ })).not.toBeInTheDocument()
    await user.click(within(form).getByRole('radio', { name: 'Wed 12 Aug' }))
    expect(within(form).getByText('Brown')).toBeInTheDocument
    await user.click(within(form).getAllByRole('radio').find(r => r.closest('label')?.textContent.includes('WD 12h-22h')))
    expect(within(form).getByText('On approved leave that day.')).toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Move' }))
    expect(h.onMove).toHaveBeenCalledWith(row, { date: '2026-08-12', code: 'WD_12', leave: 'close' })
  })

  it('Move → Fill it with someone: picks who takes the slot left behind', async () => {
    const user = userEvent.setup()
    const h = open(row, {
      monthStart: '2026-08-01', monthEnd: '2026-08-31',
      shiftsForDate: () => [{ code: 'WD_08', label: 'WD 08h-18h' }, { code: 'WD_12', label: 'WD 12h-22h' }],
    })
    await choose(user, /Move to another shift/)
    const form = screen.getByTestId('move-form')
    await user.click(within(form).getAllByRole('radio').find(r => r.closest('label')?.textContent.includes('WD 12h-22h')))
    await user.click(within(form).getByRole('radio', { name: /Fill it with someone/ }))
    await user.click(within(form).getByRole('button', { name: 'Next' }))
    await user.click(screen.getByText(/Brown/))
    expect(h.onMove).toHaveBeenCalledWith(row, { date: '2026-08-10', code: 'WD_12', leave: 'fill', cover: { kind: 'doctor', id: 'doc-b' } })
  })

  it('Remove from this shift (a reshuffle): open the slot to a locum, or close it', async () => {
    const user = userEvent.setup()
    const h = open(row)
    await choose(user, /Remove from this shift/)
    await choose(user, /Open the slot to a locum/)
    expect(h.onRemoveFromShift).toHaveBeenCalledWith(row, 'open')
  })

  it('Change times saves a start and end through onChangeTimes, and validates both are given', async () => {
    const user = userEvent.setup()
    const h = open(row, { shiftType: { start_time: '12:00:00', end_time: '22:00:00' } })
    await choose(user, /Change times/)
    expect(screen.getByText(/Standard times are 12h–22h/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '10:00' } })
    await user.click(screen.getByRole('button', { name: 'Save times' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/both/)
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '20:00' } })
    await user.click(screen.getByRole('button', { name: 'Save times' }))
    expect(h.onChangeTimes).toHaveBeenCalledWith(row, { start: '10:00', end: '20:00' })
    expect(h.onClose).toHaveBeenCalled()
  })

  it('a doctor on a draft roster: the same Rearrange menu, no absence', async () => {
    const user = userEvent.setup()
    const h = open(row, { rosterStatus: 'draft' })
    expect(dialog()).toHaveAccessibleName(/Alice Anderson · Mon 10 Aug · WD 08h-18h/)
    option(/Replace with someone else/)
    option(/Change times/)
    expect(within(dialog()).queryByRole('radio', { name: /Mark absent/ })).not.toBeInTheDocument()
    await choose(user, /Remove from this shift/)
    await choose(user, /Close the slot/)
    expect(h.onRemoveFromShift).toHaveBeenCalledWith(row, 'close')
  })

  it('an open [ ] slot with a vacated doctor: the slot menu, with Put back in its own section', async () => {
    const user = userEvent.setup()
    const h = open(slotVacated)
    expect(dialog()).toHaveAccessibleName(/Open locum slot · Mon 10 Aug · WD 08h-18h · covering Alice Anderson \(leave\)/)
    expect(within(dialog()).getByText('The locum slot')).toBeInTheDocument()
    expect(within(dialog()).getByText('The absent doctor (Alice Anderson)')).toBeInTheDocument()
    option(/Fill with a doctor or locum/)
    await choose(user, /Advertise to locums/)
    expect(h.onAdvertise).toHaveBeenCalledWith(slotVacated)
  })

  it('an advertised slot offers Stop advertising instead', async () => {
    const user = userEvent.setup()
    const h = open(slotVacated, { hasOpenAdvert: true })
    await choose(user, /Stop advertising/)
    expect(h.onUnadvertise).toHaveBeenCalledWith(slotVacated)
  })

  it('"Remove the locum slot" keeps the vacated doctor: it calls onRemoveSlot, never a row delete, after a confirm that says so', async () => {
    const user = userEvent.setup()
    const h = open(slotVacated)
    await choose(user, /Remove the locum slot/)
    expect(screen.getByText(/Alice Anderson stays struck through/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove the locum slot' }))
    expect(h.onRemoveSlot).toHaveBeenCalledWith(slotVacated)
    expect(h.onRemoveEntry).not.toHaveBeenCalled()
    expect(h.onRemoveLocum).not.toHaveBeenCalled()
  })

  it('an open slot with nobody vacated: Fill / Advertise / Remove this slot (confirm)', async () => {
    const user = userEvent.setup()
    const h = open(slot)
    expect(within(dialog()).queryByText('The absent doctor')).not.toBeInTheDocument()
    await choose(user, /Remove this slot/)
    await user.click(screen.getByRole('button', { name: 'Remove slot' }))
    expect(h.onRemoveEntry).toHaveBeenCalledWith(slot)
  })

  it('a named locum covering a vacated doctor: The cover (Replace / Remove / Move / times) and The absent doctor', async () => {
    const user = userEvent.setup()
    const onRemoveCover = vi.fn()
    open(locumVacated, { onRemoveCover, onMoveCover: vi.fn(), onChangeReason: vi.fn() })
    expect(dialog()).toHaveAccessibleName(/Marsh \(locum\) · Mon 10 Aug · WD 08h-18h · covering Alice Anderson \(no-show\)/)
    expect(within(dialog()).getByText('The cover (Marsh (locum))')).toBeInTheDocument()
    expect(within(dialog()).getByText('The absent doctor (Alice Anderson)')).toBeInTheDocument()
    option(/Replace Marsh \(locum\)/)
    option(/Move Marsh \(locum\) to another shift/)
    option(/Change why Alice Anderson is off/)
    // No separate Put back: Replace → Put Alice Anderson back covers it.
    expect(within(dialog()).queryByRole('radio', { name: /Put Alice Anderson back on this shift/ })).not.toBeInTheDocument()
    await choose(user, /Remove Marsh \(locum\)/)
    await user.click(screen.getByRole('radio', { name: /Close the shift/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onRemoveCover).toHaveBeenCalledWith(locumVacated, 'close')
  })

  it('Replace → Put <doctor> back takes the cover off', async () => {
    const user = userEvent.setup()
    const h = open(locumVacated, { onRemoveCover: vi.fn() })
    await choose(user, /Replace Marsh \(locum\)/)
    await user.click(screen.getByRole('radio', { name: /Put Alice Anderson back/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(h.onReinstate).toHaveBeenCalledWith(locumVacated, { cancelLeave: false, overCover: true })
  })

  it('Change why … is off saves the new reason, and can cancel an active leave with it', async () => {
    const user = userEvent.setup()
    const onChangeReason = vi.fn()
    const leaveRow = { ...locumVacated, vacated_reason: 'leave', vacated_leave_request_id: 'leave-1' }
    const request = { id: 'leave-1', leave_type: 'sick', profiles: { name: 'Alice Anderson' } }
    open(leaveRow, { onChangeReason, cancelLeaveRequest: request, onCancelLeave: vi.fn() })
    await choose(user, /Change why Alice Anderson is off/)
    expect(screen.getByRole('radio', { name: /Sick leave/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Swap/ }))
    await user.click(screen.getByRole('checkbox', { name: /Also cancel Alice Anderson's sick leave/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onChangeReason).toHaveBeenCalledWith(leaveRow, expect.objectContaining({ reason: 'swap', cancelLeave: true }))
  })

  it('a named locum covering nobody: Remove {locum} deletes the row', async () => {
    const user = userEvent.setup()
    const h = open(locum)
    await choose(user, /Remove Marsh/)
    await user.click(screen.getByRole('button', { name: 'Remove Marsh' }))
    expect(h.onRemoveLocum).toHaveBeenCalledWith(locum)
  })

  it('a struck-through name with no cover: Add cover (three ways) and Put back', async () => {
    const user = userEvent.setup()
    const h = open(noCover)
    expect(dialog()).toHaveAccessibleName(/Alice Anderson — no cover · Mon 10 Aug · WD 08h-18h/)
    expect(within(dialog()).getByText('Add cover')).toBeInTheDocument()
    await choose(user, /Open slot, don't advertise/)
    expect(h.onAddCover).toHaveBeenCalledWith(noCover, 'open')
  })

  it('Back in the picker returns to the menu without closing it', async () => {
    const user = userEvent.setup()
    const h = open(noCover)
    await choose(user, /Replace now/)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(h.onClose).not.toHaveBeenCalled()
    expect(option(/Replace now/)).toBeInTheDocument()
  })

  it('"Replace now" on a no-cover row opens the picker with no remove and hands the pick to onAddCover', async () => {
    const user = userEvent.setup()
    const h = open(noCover)
    await choose(user, /Replace now/)
    const picker = screen.getByRole('dialog', { name: /Assign doctor/ })
    expect(within(picker).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    expect(within(picker).getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(within(picker).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    await user.click(within(picker).getByText('Bob Brown'))
    expect(h.onAddCover).toHaveBeenCalledWith(noCover, 'replace', { kind: 'doctor', id: 'doc-b' })
  })

  it('every version ends with Cancel, and Continue stays off until a choice is ticked', async () => {
    const user = userEvent.setup()
    for (const entry of [null, row, slotVacated, slot, locum, noCover]) {
      const h = open(entry, { rosterStatus: 'draft' })
      expect(within(dialog()).getByRole('button', { name: 'Continue' })).toBeDisabled()
      await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
      expect(h.onClose).toHaveBeenCalled()
      expect(h.onAssign).not.toHaveBeenCalled()
      cleanup()
    }
  })
})

describe('ShiftMenu — Put back', () => {
  it('a leave over several days asks: cancel all of it, or keep the other days', async () => {
    const user = userEvent.setup()
    const h = open(noCover, { leaveByProfile: { 'doc-a': [['2026-08-10', '2026-08-11', 'sick', 'leave-1']] }, cancelLeaveRequest: { id: 'leave-1', leave_type: 'sick', profiles: { name: 'Alice Anderson' } } })
    expect(hintOf(/Put Alice Anderson back on this shift/)).toMatch(/sick leave runs Mon 10 Aug – Tue 11 Aug; you choose/)
    await choose(user, /Put Alice Anderson back on this shift/)
    expect(screen.getByText("Alice Anderson's sick leave runs Mon 10 Aug – Tue 11 Aug. Cancel all of it, or keep the other days?")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep the other days' }))
    expect(h.onReinstate).toHaveBeenCalledWith(noCover, { cancelLeave: false, overCover: false })
  })

  it('a one-day leave is cancelled with the put-back, without asking', async () => {
    const user = userEvent.setup()
    const h = open(noCover, { leaveByProfile: { 'doc-a': [['2026-08-10', '2026-08-10', 'sick', 'leave-1']] }, cancelLeaveRequest: { id: 'leave-1', leave_type: 'sick', profiles: { name: 'Alice Anderson' } } })
    expect(hintOf(/Put Alice Anderson back on this shift/)).toMatch(/sick leave for that day is cancelled too/)
    await choose(user, /Put Alice Anderson back on this shift/)
    expect(h.onReinstate).toHaveBeenCalledWith(noCover, { cancelLeave: true })
    expect(h.onClose).toHaveBeenCalled()
  })

  it('a linked leave that is no longer active (cancelled elsewhere) is left alone', async () => {
    const user = userEvent.setup()
    const h = open(noCover)
    await choose(user, /Put Alice Anderson back on this shift/)
    expect(h.onReinstate).toHaveBeenCalledWith(noCover, { cancelLeave: false })
  })

  it('with no linked leave it puts the doctor back at once', async () => {
    const user = userEvent.setup()
    const entry = { ...slotVacated, vacated_leave_request_id: null }
    const h = open(entry)
    await choose(user, /Put Alice Anderson back on this shift/)
    expect(h.onReinstate).toHaveBeenCalledWith(entry, { cancelLeave: false })
  })

  it('is disabled, with the reason, when the doctor has another shift that day', () => {
    open(slotVacated, { entries: [slotVacated, { id: 'e2', date: '2026-08-10', profile_id: 'doc-a' }] })
    const put = option(/Put Alice Anderson back on this shift/)
    expect(put).toBeDisabled()
    expect(hintOf(/Put Alice Anderson back on this shift/)).toMatch(/now has another shift on Mon 10 Aug/)
  })
})

describe('ShiftMenu — phone', () => {
  it('is a bottom sheet below md', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    open(slot)
    expect(dialog().className).toMatch(/rounded-b-none/)
  })
})

describe('ShiftMenu — late arrival', () => {
  it('offers "Log late arrival" while editing, for a shift someone is on', async () => {
    const onLateArrival = vi.fn()
    const user = userEvent.setup()
    const h = open(row, { lateArrival: { exists: false }, onLateArrival })
    await choose(user, /Log late arrival/)
    expect(onLateArrival).toHaveBeenCalledWith(row)
    expect(h.onClose).toHaveBeenCalled()
    // It is not a roster edit: none of the edit handlers fire.
    expect(h.onVacancy).not.toHaveBeenCalled()
    expect(h.onChangeTimes).not.toHaveBeenCalled()
  })

  it('reads "Edit late arrival" when the shift already has a record, and for a locum too', () => {
    open(locum, { lateArrival: { exists: true }, onLateArrival: vi.fn() })
    expect(option(/Edit late arrival/)).toBeInTheDocument()
  })

  it('is not offered when no late arrival can be logged (an open slot, or a shift not started)', () => {
    open(row)
    expect(within(dialog()).queryByRole('radio', { name: /late arrival/i })).not.toBeInTheDocument()
    cleanup()
    open(slot, { lateArrival: { exists: false }, onLateArrival: vi.fn() })
    expect(within(dialog()).queryByRole('radio', { name: /late arrival/i })).not.toBeInTheDocument()
  })
})

describe('ShiftMenu — cancel leave and swap', () => {
  const request = { id: 'leave-1', profile_id: 'doc-a', leave_type: 'sick', date_from: '2026-08-10', date_to: '2026-08-10', status: 'approved', profiles: { name: 'Alice Anderson', surname: '' } }

  it('offers "Cancel Alice Anderson\'s sick leave" on a shift she came off, keeping the cover', async () => {
    const user = userEvent.setup()
    const onCancelLeave = vi.fn()
    const h = open(locumVacated, { cancelLeaveRequest: request, onCancelLeave })
    await choose(user, /Cancel Alice Anderson's sick leave/)
    expect(onCancelLeave).toHaveBeenCalledWith(request)
    expect(h.onRemoveLocum).not.toHaveBeenCalled()
    expect(h.onReinstate).not.toHaveBeenCalled()
  })

  it('does not offer it without leave behind the shift', () => {
    open(locumVacated, { cancelLeaveRequest: null, onCancelLeave: vi.fn() })
    expect(within(dialog()).queryByRole('radio', { name: /Cancel .* leave/ })).not.toBeInTheDocument()
  })

  it('swaps a doctor with another doctor on the same day', async () => {
    const user = userEvent.setup()
    const onSwap = vi.fn()
    const other = { ...row, id: 'e2', shift_type_id: 'st4', profile_id: 'doc-b' }
    open(row, {
      entries: [row, other], onSwap, shiftCodeOf: e => (e.shift_type_id === 'st4' ? 'WD_22' : 'WD_08'),
      monthStart: '2026-08-01', monthEnd: '2026-08-31', isOnLeave: () => false,
    })
    await choose(user, /Swap with another doctor/)
    await user.click(screen.getByRole('radio', { name: /Bob Brown/ }))
    expect(screen.getByTestId('swap-summary')).toHaveTextContent('Bob Brown works Mon 10 Aug WD 08h-18h; Alice Anderson works Mon 10 Aug WD 22h-10h.')
    await user.click(screen.getByRole('button', { name: 'Swap shifts' }))
    expect(onSwap).toHaveBeenCalledWith(row, other, 'WD_22')
  })
})

describe('ShiftMenu — header', () => {
  it('names who on the top row, in the roster cell style, with the date and shift under it', () => {
    open(row)
    const header = screen.getByTestId('shift-menu-header')
    expect(within(header).getByTestId('shift-menu-who')).toHaveTextContent('Alice Anderson')
    expect(within(header).getByTestId('shift-menu-who').className).toMatch(/border-l-\[3px\]/)
    expect(header).toHaveTextContent(/Mon 10 Aug · /)
    expect(within(header).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('an open locum slot reads as one, dashed', () => {
    open(slotVacated)
    const who = screen.getByTestId('shift-menu-who')
    expect(who).toHaveTextContent('Open locum slot')
    expect(who.className).toMatch(/border-dashed/)
  })
})

