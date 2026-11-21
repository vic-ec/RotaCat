import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeekendPlannerChangeLogModal from './WeekendPlannerChangeLogModal'

let mockAuth = { profile: { id: 'admin-1' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const fetchWeekendPlannerBatches = vi.fn()
const restoreWeekendPlannerBatch = vi.fn()
const queryWeekendPlannerChanges = vi.fn()
const fetchProfilesById = vi.fn()
const fetchAdminOptions = vi.fn()
const fetchDoctorOptions = vi.fn()
vi.mock('../lib/changeLog', async () => {
  const actual = await vi.importActual('../lib/changeLog')
  return {
    ...actual,
    fetchWeekendPlannerBatches: (...args) => fetchWeekendPlannerBatches(...args),
    restoreWeekendPlannerBatch: (...args) => restoreWeekendPlannerBatch(...args),
    queryWeekendPlannerChanges: (...args) => queryWeekendPlannerChanges(...args),
    fetchProfilesById: (...args) => fetchProfilesById(...args),
    fetchAdminOptions: (...args) => fetchAdminOptions(...args),
    fetchDoctorOptions: (...args) => fetchDoctorOptions(...args),
  }
})

const PROFILES_BY_ID = new Map([
  ['admin-1', { id: 'admin-1', name: 'Alice', surname: 'Anderson', role: 'doctor' }],
  ['p1', { id: 'p1', name: 'Bo', surname: 'Carter', role: 'doctor' }],
  ['p2', { id: 'p2', name: 'Di', surname: 'Evans', role: 'doctor' }],
])

const CLEAR_ROW = { id: 'c1', weekend_saturday: '2026-01-03', category: 'MO', profile_id: 'p1', action: 'remove', changed_by: 'admin-1', changed_at: '2026-08-06T17:28:00Z', batch_id: 'batch-1' }
const CLEAR_BATCH = {
  batchId: 'batch-1',
  changedBy: 'admin-1',
  changedAt: '2026-08-06T17:28:00Z',
  changes: [CLEAR_ROW],
}

// A paste touching two weekends and two categories.
const PASTE_ROWS = [
  { id: 'p-a', weekend_saturday: '2026-12-05', category: 'MO', profile_id: 'p1', action: 'add', changed_by: 'admin-1', changed_at: '2026-11-20T18:02:00Z', batch_id: 'batch-2' },
  { id: 'p-b', weekend_saturday: '2026-12-12', category: 'Registrar', profile_id: 'p2', action: 'add', changed_by: 'admin-1', changed_at: '2026-11-20T18:02:00Z', batch_id: 'batch-2' },
  { id: 'p-c', weekend_saturday: '2026-12-12', category: 'MO', profile_id: 'p2', action: 'remove', changed_by: 'admin-1', changed_at: '2026-11-20T18:02:00Z', batch_id: 'batch-2' },
]
const PASTE_BATCH = { batchId: 'batch-2', changedBy: 'admin-1', changedAt: '2026-11-20T18:02:00Z', changes: PASTE_ROWS }

function renderModal(overrides = {}) {
  return render(<WeekendPlannerChangeLogModal onClose={vi.fn()} {...overrides} />)
}

// "Restore this" opens a confirm dialog ("Are you sure...? This action is
// permanent.") before actually restoring — clicks through both steps.
async function confirmRestore(user, restoreButton) {
  await user.click(restoreButton)
  await user.click(await screen.findByRole('button', { name: 'Restore' }))
}

describe('WeekendPlannerChangeLogModal', () => {
  beforeEach(() => {
    mockAuth = { profile: { id: 'admin-1' } }
    fetchWeekendPlannerBatches.mockReset().mockResolvedValue({ batches: [CLEAR_BATCH], error: null })
    restoreWeekendPlannerBatch.mockReset().mockResolvedValue({ error: null, inserted: 1, deleted: 0, skipped: 0 })
    queryWeekendPlannerChanges.mockReset().mockResolvedValue({ data: [CLEAR_ROW], error: null })
    fetchProfilesById.mockReset().mockResolvedValue(PROFILES_BY_ID)
    fetchAdminOptions.mockReset().mockResolvedValue([])
    fetchDoctorOptions.mockReset().mockResolvedValue([])
  })

  it('shows a single edit as one row: weekend and category, the doctor struck through when removed, initials for the admin', async () => {
    renderModal()
    expect(await screen.findByText('Sat 3 Jan weekend · MO')).toBeInTheDocument()
    expect(screen.getByText('Bo Carter').tagName).toBe('S')
    expect(screen.getByText('Removed')).toBeInTheDocument()
    const badge = screen.getByRole('button', { name: 'Alice Anderson' })
    expect(badge).toHaveTextContent('AA')
    expect(screen.getByRole('button', { name: 'Restore this' })).toBeInTheDocument()
  })

  it('groups rows under a date header instead of a date column', async () => {
    renderModal()
    expect(await screen.findByRole('region', { name: 'Thu 6 Aug 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Weekend' })).not.toBeInTheDocument()
  })

  it('shows a multi-row batch as one summary row listing every category, with its changes folded underneath', async () => {
    queryWeekendPlannerChanges.mockResolvedValue({ data: PASTE_ROWS, error: null })
    fetchWeekendPlannerBatches.mockResolvedValue({ batches: [PASTE_BATCH], error: null })
    const user = userEvent.setup()
    renderModal()

    expect(await screen.findByText('2 weekends · Sat 5 Dec – Sat 12 Dec · MO, Registrar')).toBeInTheDocument()
    expect(screen.getByText('Overwrote')).toBeInTheDocument()
    expect(screen.getByText('2 added · 1 removed')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Restore this' })).toHaveLength(1)
    expect(screen.queryByText('Di Evans')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Show 3 changes/ }))
    expect(screen.getAllByText('Di Evans')).toHaveLength(2)
  })

  it('a batch summary uses the whole batch even when a filter shows only part of it', async () => {
    queryWeekendPlannerChanges.mockResolvedValue({ data: [PASTE_ROWS[0]], error: null })
    fetchWeekendPlannerBatches.mockResolvedValue({ batches: [PASTE_BATCH], error: null })
    renderModal()
    expect(await screen.findByText('2 added · 1 removed')).toBeInTheDocument()
  })

  it('clicking Restore this opens a confirmation, which calls restoreWeekendPlannerBatch with the batch id and the signed-in admin, then shows a result message', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByText('Sat 3 Jan weekend · MO')

    await confirmRestore(user, screen.getByRole('button', { name: 'Restore this' }))

    expect(restoreWeekendPlannerBatch).toHaveBeenCalledWith({ batchId: 'batch-1', changedBy: 'admin-1' })
    expect(await screen.findByText('1 restored')).toBeInTheDocument()
  })

  it('the confirmation names the action and warns it is permanent, and Cancel backs out without restoring', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByText('Sat 3 Jan weekend · MO')

    await user.click(screen.getByRole('button', { name: 'Restore this' }))
    expect(await screen.findByText(/Are you sure you want to restore/)).toHaveTextContent('This action is permanent.')
    expect(screen.getByText(/Are you sure you want to restore/)).toHaveTextContent('Cleared 3 Jan 2026')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText(/Are you sure you want to restore/)).not.toBeInTheDocument()
    expect(restoreWeekendPlannerBatch).not.toHaveBeenCalled()
  })

  it('a restore failure shows the error inline instead of a success message', async () => {
    restoreWeekendPlannerBatch.mockResolvedValue({ error: 'Nothing to restore — this batch no longer exists.' })
    const user = userEvent.setup()
    renderModal()
    await screen.findByText('Sat 3 Jan weekend · MO')

    await confirmRestore(user, screen.getByRole('button', { name: 'Restore this' }))

    expect(await screen.findByText('Nothing to restore — this batch no longer exists.')).toBeInTheDocument()
  })

  it('calls the onDataChanged callback after a successful restore, so the caller can refresh its own view', async () => {
    const onDataChanged = vi.fn()
    const user = userEvent.setup()
    renderModal({ onDataChanged })
    await screen.findByText('Sat 3 Jan weekend · MO')

    await confirmRestore(user, screen.getByRole('button', { name: 'Restore this' }))

    await waitFor(() => expect(onDataChanged).toHaveBeenCalled())
  })

  it('re-fetches the log and the batches after a restore (so the restore\'s own new batch appears)', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByText('Sat 3 Jan weekend · MO')
    expect(fetchWeekendPlannerBatches).toHaveBeenCalledTimes(1)
    const logLoads = queryWeekendPlannerChanges.mock.calls.length

    await confirmRestore(user, screen.getByRole('button', { name: 'Restore this' }))

    await waitFor(() => expect(fetchWeekendPlannerBatches).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(queryWeekendPlannerChanges.mock.calls.length).toBeGreaterThan(logLoads))
  })

  it('every Restore button is disabled while any one restore is in flight', async () => {
    let resolveRestore
    restoreWeekendPlannerBatch.mockReturnValue(new Promise(resolve => { resolveRestore = resolve }))
    const second = { ...CLEAR_ROW, id: 'c2', batch_id: 'batch-3' }
    queryWeekendPlannerChanges.mockResolvedValue({ data: [CLEAR_ROW, second], error: null })
    const user = userEvent.setup()
    renderModal()
    await screen.findAllByText('Sat 3 Jan weekend · MO')

    const restoreButtons = screen.getAllByRole('button', { name: /Restore this|Restoring…/ })
    expect(restoreButtons).toHaveLength(2)
    await confirmRestore(user, restoreButtons[0])

    expect(screen.getByRole('button', { name: 'Restoring…' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /Restoring…|Restore this/ }).every(b => b.disabled)).toBe(true)

    resolveRestore({ error: null, inserted: 1, deleted: 0, skipped: 0 })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Restoring…' })).not.toBeInTheDocument())
  })

  it('rows logged before batches existed show without a Restore button', async () => {
    queryWeekendPlannerChanges.mockResolvedValue({ data: [{ ...CLEAR_ROW, batch_id: null }], error: null })
    renderModal()
    await screen.findByText('Sat 3 Jan weekend · MO')
    expect(screen.queryByRole('button', { name: 'Restore this' })).not.toBeInTheDocument()
  })
})
