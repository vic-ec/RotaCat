import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
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
    onAdvertise: vi.fn(), onUnadvertise: vi.fn(), onReinstate: vi.fn(), onClose: vi.fn(),
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
const item = name => within(dialog()).getByRole('button', { name })

beforeEach(() => { window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })

describe('ShiftMenu — which menu opens (the spec table)', () => {
  it('a doctor on a published roster goes straight to the vacancy form', () => {
    const h = open(row)
    expect(h.onVacancy).toHaveBeenCalledWith(row)
    expect(h.onClose).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a doctor on a draft roster: Replace with… / Remove {name} from this shift (confirm)', async () => {
    const user = userEvent.setup()
    const h = open(row, { rosterStatus: 'draft' })
    expect(dialog()).toHaveAccessibleName(/Alice Anderson · Mon 10 Aug · WD 08h-18h/)
    item(/Replace with…/)
    await user.click(item(/Remove Alice Anderson from this shift/))
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
    item(/Fill with a doctor or locum/)
    await user.click(item(/Advertise to locums/))
    expect(h.onAdvertise).toHaveBeenCalledWith(slotVacated)
  })

  it('an advertised slot offers Stop advertising instead', async () => {
    const user = userEvent.setup()
    const h = open(slotVacated, { hasOpenAdvert: true })
    await user.click(item(/Stop advertising/))
    expect(h.onUnadvertise).toHaveBeenCalledWith(slotVacated)
  })

  it('"Remove the locum slot" keeps the vacated doctor: it calls onRemoveSlot, never a row delete, after a confirm that says so', async () => {
    const user = userEvent.setup()
    const h = open(slotVacated)
    await user.click(item(/Remove the locum slot/))
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
    await user.click(item(/Remove this slot/))
    await user.click(screen.getByRole('button', { name: 'Remove slot' }))
    expect(h.onRemoveEntry).toHaveBeenCalledWith(slot)
  })

  it('a named locum covering a vacated doctor: Change cover / Remove {locum}, reopening the slot', async () => {
    const user = userEvent.setup()
    const h = open(locumVacated)
    expect(dialog()).toHaveAccessibleName(/Marsh \(locum\) · Mon 10 Aug · WD 08h-18h · covering Alice Anderson \(no-show\)/)
    item(/Change cover/)
    await user.click(item(/Remove Marsh/))
    expect(screen.getByText(/slot opens again as \[ \] and Alice Anderson stays struck through/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Marsh' }))
    expect(h.onRemoveLocum).toHaveBeenCalledWith(locumVacated)
    expect(h.onRemoveEntry).not.toHaveBeenCalled()
  })

  it('a named locum covering nobody: Remove {locum} deletes the row', async () => {
    const user = userEvent.setup()
    const h = open(locum)
    await user.click(item(/Remove Marsh/))
    await user.click(screen.getByRole('button', { name: 'Remove Marsh' }))
    expect(h.onRemoveLocum).toHaveBeenCalledWith(locum)
  })

  it('a struck-through name with no cover: Add cover (three ways) and Put back', async () => {
    const user = userEvent.setup()
    const h = open(noCover)
    expect(dialog()).toHaveAccessibleName(/Alice Anderson — no cover · Mon 10 Aug · WD 08h-18h/)
    expect(within(dialog()).getByText('Add cover')).toBeInTheDocument()
    await user.click(item(/Open slot, don't advertise/))
    expect(h.onAddCover).toHaveBeenCalledWith(noCover, 'open')
  })

  it('"Replace now" on a no-cover row opens the picker with no remove and hands the pick to onAddCover', async () => {
    const user = userEvent.setup()
    const h = open(noCover)
    await user.click(item(/Replace now/))
    const picker = screen.getByRole('dialog', { name: /Assign doctor/ })
    expect(within(picker).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    await user.click(within(picker).getByText('Brown'))
    expect(h.onAddCover).toHaveBeenCalledWith(noCover, 'replace', { kind: 'doctor', id: 'doc-b' })
  })

  it('every version ends with "Close — no change"', async () => {
    const user = userEvent.setup()
    for (const entry of [null, slotVacated, slot, locum, noCover]) {
      const h = open(entry, { rosterStatus: 'draft' })
      await user.click(item('Close — no change'))
      expect(h.onClose).toHaveBeenCalled()
      expect(h.onAssign).not.toHaveBeenCalled()
      cleanup()
    }
  })
})

describe('ShiftMenu — Put back', () => {
  it('asks about the linked leave, with Cancel the leave / Keep the leave', async () => {
    const user = userEvent.setup()
    const h = open(noCover, { leaveByProfile: { 'doc-a': [['2026-08-10', '2026-08-11', 'sick', 'leave-1']] } })
    await user.click(item(/Put Alice Anderson back on this shift/))
    expect(screen.getByText("Also cancel Alice Anderson's sick leave for Mon 10 Aug – Tue 11 Aug?")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep the leave' }))
    expect(h.onReinstate).toHaveBeenCalledWith(noCover, { cancelLeave: false })
  })

  it('cancels the leave when asked', async () => {
    const user = userEvent.setup()
    const h = open(noCover)
    await user.click(item(/Put Alice Anderson back on this shift/))
    await user.click(screen.getByRole('button', { name: 'Cancel the leave' }))
    expect(h.onReinstate).toHaveBeenCalledWith(noCover, { cancelLeave: true })
  })

  it('with no linked leave it puts the doctor back at once', async () => {
    const user = userEvent.setup()
    const entry = { ...slotVacated, vacated_leave_request_id: null }
    const h = open(entry)
    await user.click(item(/Put Alice Anderson back on this shift/))
    expect(h.onReinstate).toHaveBeenCalledWith(entry, { cancelLeave: false })
  })

  it('is disabled, with the reason, when the doctor has another shift that day or the slot was filled', () => {
    open(slotVacated, { entries: [slotVacated, { id: 'e2', date: '2026-08-10', profile_id: 'doc-a' }] })
    const put = item(/Put Alice Anderson back on this shift/)
    expect(put).toBeDisabled()
    expect(put).toHaveTextContent(/now has another shift on Mon 10 Aug/)
    cleanup()
    open(locumVacated)
    expect(item(/Put Alice Anderson back on this shift/)).toHaveTextContent(/since been filled by Marsh \(locum\)/)
  })
})

describe('ShiftMenu — phone', () => {
  it('is a bottom sheet below md', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    open(slot)
    expect(dialog().className).toMatch(/rounded-b-none/)
  })
})
