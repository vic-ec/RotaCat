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
// Tick a choice and press Continue.
async function choose(user, name) {
  await user.click(option(name))
  await user.click(within(dialog()).getByRole('button', { name: 'Continue' }))
}

beforeEach(() => { window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })

describe('ShiftMenu — which menu opens (the spec table)', () => {
  it('a doctor on a published roster: take them off (the vacancy form) or change their times', async () => {
    const user = userEvent.setup()
    const h = open(row)
    expect(within(dialog()).getByRole('button', { name: 'Continue' })).toBeDisabled()
    option(/Change times/)
    await choose(user, /Take Alice Anderson off this shift/)
    expect(h.onVacancy).toHaveBeenCalledWith(row)
    expect(h.onClose).toHaveBeenCalled()
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

  it('a doctor on a draft roster: Replace with… / Remove {name} from this shift (confirm)', async () => {
    const user = userEvent.setup()
    const h = open(row, { rosterStatus: 'draft' })
    expect(dialog()).toHaveAccessibleName(/Alice Anderson · Mon 10 Aug · WD 08h-18h/)
    option(/Replace with…/)
    option(/Change times/)
    await choose(user, /Remove Alice Anderson from this shift/)
    expect(h.onRemoveEntry).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Remove Alice Anderson' }))
    expect(h.onRemoveEntry).toHaveBeenCalledWith(row)
  })

  it('an open [ ] slot with a vacated doctor: the slot menu, with Put back in its own section', async () => {
    const user = userEvent.setup()
    const h = open(slotVacated)
    expect(dialog()).toHaveAccessibleName(/Open locum slot · Mon 10 Aug · WD 08h-18h · covering Alice Anderson \(leave\)/)
    expect(within(dialog()).getByText('The locum slot')).toBeInTheDocument()
    expect(within(dialog()).getByText('The absent doctor')).toBeInTheDocument()
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

  it('a named locum covering a vacated doctor: Change cover / Remove {locum}, reopening the slot', async () => {
    const user = userEvent.setup()
    const h = open(locumVacated)
    expect(dialog()).toHaveAccessibleName(/Marsh \(locum\) · Mon 10 Aug · WD 08h-18h · covering Alice Anderson \(no-show\)/)
    option(/Change cover/)
    option(/Change times/)
    await choose(user, /Remove Marsh/)
    expect(screen.getByText(/slot opens again as \[ \] and Alice Anderson stays struck through/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Marsh' }))
    expect(h.onRemoveLocum).toHaveBeenCalledWith(locumVacated)
    expect(h.onRemoveEntry).not.toHaveBeenCalled()
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
    const h = open(noCover, { leaveByProfile: { 'doc-a': [['2026-08-10', '2026-08-11', 'sick', 'leave-1']] } })
    expect(option(/Put Alice Anderson back on this shift/).closest('label')).toHaveTextContent(/sick leave runs Mon 10 Aug – Tue 11 Aug; you choose/)
    await choose(user, /Put Alice Anderson back on this shift/)
    expect(screen.getByText("Alice Anderson's sick leave runs Mon 10 Aug – Tue 11 Aug. Cancel all of it, or keep the other days?")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep the other days' }))
    expect(h.onReinstate).toHaveBeenCalledWith(noCover, { cancelLeave: false })
  })

  it('a one-day leave is cancelled with the put-back, without asking', async () => {
    const user = userEvent.setup()
    const h = open(noCover, { leaveByProfile: { 'doc-a': [['2026-08-10', '2026-08-10', 'sick', 'leave-1']] } })
    expect(option(/Put Alice Anderson back on this shift/).closest('label')).toHaveTextContent(/sick leave for that day is cancelled too/)
    await choose(user, /Put Alice Anderson back on this shift/)
    expect(h.onReinstate).toHaveBeenCalledWith(noCover, { cancelLeave: true })
    expect(h.onClose).toHaveBeenCalled()
  })

  it('a linked leave the viewer cannot see the dates of is treated as this day\'s and cancelled', async () => {
    const user = userEvent.setup()
    const h = open(noCover)
    await choose(user, /Put Alice Anderson back on this shift/)
    expect(h.onReinstate).toHaveBeenCalledWith(noCover, { cancelLeave: true })
  })

  it('with no linked leave it puts the doctor back at once', async () => {
    const user = userEvent.setup()
    const entry = { ...slotVacated, vacated_leave_request_id: null }
    const h = open(entry)
    await choose(user, /Put Alice Anderson back on this shift/)
    expect(h.onReinstate).toHaveBeenCalledWith(entry, { cancelLeave: false })
  })

  it('is disabled, with the reason, when the doctor has another shift that day or the slot was filled', () => {
    open(slotVacated, { entries: [slotVacated, { id: 'e2', date: '2026-08-10', profile_id: 'doc-a' }] })
    const put = option(/Put Alice Anderson back on this shift/)
    expect(put).toBeDisabled()
    expect(put.closest('label')).toHaveTextContent(/now has another shift on Mon 10 Aug/)
    cleanup()
    open(locumVacated)
    expect(option(/Put Alice Anderson back on this shift/).closest('label')).toHaveTextContent(/since been filled by Marsh \(locum\)/)
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
