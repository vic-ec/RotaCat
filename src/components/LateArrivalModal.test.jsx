import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LateArrivalModal from './LateArrivalModal'

const api = vi.hoisted(() => ({
  fetchShiftOptionsForDate: vi.fn(), fetchShiftOptionsForProfile: vi.fn(), fetchLateArrivalForEntry: vi.fn(),
  saveLateArrival: vi.fn(), deleteLateArrival: vi.fn(),
}))
vi.mock('../lib/lateArrivals', async () => ({ ...(await vi.importActual('../lib/lateArrivals')), ...api }))

const opt = (entryId, label, shiftStart, extra = {}) => ({
  entryId, date: '2026-11-24', profileId: `p-${entryId}`, locumContactId: null, locumName: null, name: label.split(' · ')[0],
  shiftCode: 'WD_08', shiftStart, label, ...extra,
})
const ZEPHYR = opt('e1', 'Zephyr · MO · 08h00', '08:00')
const LOCUM = opt('e2', '[ Dr Smith ] · Locum · 12h00', '12:00', { profileId: null, locumName: 'Dr Smith' })
const NIGHT = opt('e3', 'Adams · Registrar · 22h00', '22:00')

describe('LateArrivalModal', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 24, 15, 0))
    Object.values(api).forEach(fn => fn.mockReset())
    api.fetchShiftOptionsForDate.mockResolvedValue([ZEPHYR, LOCUM, NIGHT])
    api.fetchShiftOptionsForProfile.mockResolvedValue([ZEPHYR])
    api.fetchLateArrivalForEntry.mockResolvedValue(null)
    api.saveLateArrival.mockResolvedValue(undefined)
    api.deleteLateArrival.mockResolvedValue(undefined)
  })
  afterEach(() => { vi.useRealTimers() })

  it('from the roster: person, date and shift start are filled in; Late by is worked out live', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<LateArrivalModal option={ZEPHYR} onClose={onClose} onSaved={onSaved} />)

    expect(screen.getByRole('dialog', { name: 'Log late arrival' })).toBeInTheDocument()
    expect(screen.getByText('Tue, 24 Nov 2026')).toBeInTheDocument()
    expect(screen.getByText('Zephyr · MO · 08h00')).toBeInTheDocument()
    expect(screen.getByTestId('late-shift-start')).toHaveTextContent('08h00')
    expect(screen.getByTestId('late-by')).toHaveTextContent('—')
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()
    expect(screen.getByText(/The person can see this record, including the reason. Your name is recorded but not shown to them./)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Their own reason, in their words')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Arrived at'), '08:25')
    expect(screen.getByTestId('late-by')).toHaveTextContent('25 min')
    await user.type(screen.getByLabelText(/Reason given/), 'Car trouble')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.saveLateArrival).toHaveBeenCalledWith({ id: null, option: ZEPHYR, arrivedAt: '08:25', reason: 'Car trouble' }))
    expect(onSaved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('refuses an arrival before the shift start or more than 12 hours late', async () => {
    const user = userEvent.setup()
    render(<LateArrivalModal option={ZEPHYR} onClose={() => {}} />)
    await user.type(screen.getByLabelText('Arrived at'), '07:30')
    expect(screen.getByTestId('late-by')).toHaveTextContent('Check the time')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/after the shift start/)
    expect(api.saveLateArrival).not.toHaveBeenCalled()
  })

  it('counts an arrival after midnight as the next day for an evening shift', async () => {
    vi.setSystemTime(new Date(2026, 10, 25, 9, 0))
    const user = userEvent.setup()
    render(<LateArrivalModal option={NIGHT} onClose={() => {}} />)
    await user.type(screen.getByLabelText('Arrived at'), '00:30')
    expect(screen.getByTestId('late-by')).toHaveTextContent('2 h 30 min')
  })

  it('from the Dashboard: today\'s date, and only people rostered that date whose shift has started', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<LateArrivalModal onClose={onClose} />)
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-24')
    await waitFor(() => expect(api.fetchShiftOptionsForDate).toHaveBeenCalledWith('2026-11-24'))

    await waitFor(() => expect(screen.getByLabelText('Who')).toBeEnabled())
    await user.click(screen.getByLabelText('Who'))
    const options = screen.getAllByRole('option').map(o => o.textContent)
    // Doctors and locums; the 22h00 shift has not started at 15h00.
    expect(options).toEqual(['Zephyr · MO · 08h00', '[ Dr Smith ] · Locum · 12h00'])
    await user.click(screen.getByRole('option', { name: '[ Dr Smith ] · Locum · 12h00' }))
    expect(screen.getByTestId('late-shift-start')).toHaveTextContent('12h00')
    // Choosing from the list does not dismiss the form.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says so when nobody is rostered on the chosen date', async () => {
    api.fetchShiftOptionsForDate.mockResolvedValue([])
    render(<LateArrivalModal onClose={() => {}} />)
    expect(await screen.findByText(/Nobody is rostered on a published roster for this date/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('from Attendance: the person is fixed and the date is one of their rostered shifts', async () => {
    const user = userEvent.setup()
    render(<LateArrivalModal profileId="p-e1" personName="Ada Zephyr" year={2026} onClose={() => {}} />)
    expect(screen.getByText('Ada Zephyr')).toBeInTheDocument()
    await waitFor(() => expect(api.fetchShiftOptionsForProfile).toHaveBeenCalledWith('p-e1', 2026))
    await waitFor(() => expect(screen.getByLabelText('Date')).toBeEnabled())
    await user.click(screen.getByLabelText('Date'))
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Tue, 24 Nov 2026 · 08h00'])
  })

  it('opens the existing record for a shift that already has one, and can delete it after a confirm step', async () => {
    api.fetchLateArrivalForEntry.mockResolvedValue({ id: 'late-1', roster_entry_id: 'e1', arrived_at: '08:40:00', reason_given: 'Overslept' })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<LateArrivalModal option={ZEPHYR} onClose={() => {}} onSaved={onSaved} />)

    expect(await screen.findByRole('dialog', { name: 'Late arrival' })).toBeInTheDocument()
    expect(screen.getByLabelText('Arrived at')).toHaveValue('08:40')
    expect(screen.getByLabelText(/Reason given/)).toHaveValue('Overslept')
    expect(screen.getByTestId('late-by')).toHaveTextContent('40 min')

    await user.click(screen.getByRole('button', { name: 'Delete record' }))
    expect(api.deleteLateArrival).not.toHaveBeenCalled()
    expect(screen.getByText(/Delete this late arrival record\?/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete record' }))
    await waitFor(() => expect(api.deleteLateArrival).toHaveBeenCalledWith('late-1'))
  })

  it('saves a correction onto the existing record rather than adding a second one', async () => {
    api.fetchLateArrivalForEntry.mockResolvedValue({ id: 'late-1', roster_entry_id: 'e1', arrived_at: '08:40:00', reason_given: null })
    const user = userEvent.setup()
    render(<LateArrivalModal option={ZEPHYR} onClose={() => {}} />)
    await screen.findByRole('dialog', { name: 'Late arrival' })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.saveLateArrival).toHaveBeenCalledWith(expect.objectContaining({ id: 'late-1', arrivedAt: '08:40' })))
  })

  it('has no Delete on a new record', () => {
    render(<LateArrivalModal option={ZEPHYR} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Delete record' })).not.toBeInTheDocument()
  })
})
