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
])

const CLEAR_BATCH = {
  batchId: 'batch-1',
  changedBy: 'admin-1',
  changedAt: '2026-08-06T17:28:00Z',
  changes: [
    { id: 'c1', weekend_saturday: '2026-01-03', category: 'MO', profile_id: 'p1', action: 'remove', changed_by: 'admin-1', changed_at: '2026-08-06T17:28:00Z' },
  ],
}

function renderModal(overrides = {}) {
  return render(<WeekendPlannerChangeLogModal onClose={vi.fn()} {...overrides} />)
}

describe('WeekendPlannerChangeLogModal — Recent actions (restore)', () => {
  beforeEach(() => {
    mockAuth = { profile: { id: 'admin-1' } }
    fetchWeekendPlannerBatches.mockReset().mockResolvedValue({ batches: [CLEAR_BATCH], error: null })
    restoreWeekendPlannerBatch.mockReset().mockResolvedValue({ error: null, inserted: 1, deleted: 0, skipped: 0 })
    queryWeekendPlannerChanges.mockReset().mockResolvedValue({ data: [], error: null })
    fetchProfilesById.mockReset().mockResolvedValue(PROFILES_BY_ID)
    fetchAdminOptions.mockReset().mockResolvedValue([])
    fetchDoctorOptions.mockReset().mockResolvedValue([])
  })

  it('shows each recent batch as a one-line summary with who/when, and a Restore action', async () => {
    renderModal()

    const item = await screen.findByText(/Cleared 3 Jan 2026/)
    expect(item.textContent).toContain('Anderson')
    expect(screen.getByRole('button', { name: 'Restore this' })).toBeInTheDocument()
  })

  it('shows "No recent actions to restore" when there are none', async () => {
    fetchWeekendPlannerBatches.mockResolvedValue({ batches: [], error: null })
    renderModal()

    expect(await screen.findByText('No recent actions to restore.')).toBeInTheDocument()
  })

  it('clicking Restore calls restoreWeekendPlannerBatch with the batch id and the signed-in admin, then shows a result message', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByText(/Cleared 3 Jan 2026/)

    await user.click(screen.getByRole('button', { name: 'Restore this' }))

    expect(restoreWeekendPlannerBatch).toHaveBeenCalledWith({ batchId: 'batch-1', changedBy: 'admin-1' })
    expect(await screen.findByText('1 restored')).toBeInTheDocument()
  })

  it('a restore failure shows the error inline instead of a success message', async () => {
    restoreWeekendPlannerBatch.mockResolvedValue({ error: 'Nothing to restore — this batch no longer exists.' })
    const user = userEvent.setup()
    renderModal()
    await screen.findByText(/Cleared 3 Jan 2026/)

    await user.click(screen.getByRole('button', { name: 'Restore this' }))

    expect(await screen.findByText('Nothing to restore — this batch no longer exists.')).toBeInTheDocument()
  })

  it('calls the onDataChanged callback after a successful restore, so the caller can refresh its own view', async () => {
    const onDataChanged = vi.fn()
    const user = userEvent.setup()
    renderModal({ onDataChanged })
    await screen.findByText(/Cleared 3 Jan 2026/)

    await user.click(screen.getByRole('button', { name: 'Restore this' }))

    await waitFor(() => expect(onDataChanged).toHaveBeenCalled())
  })

  it('re-fetches the batch list after a restore (so the restore\'s own new batch can appear)', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByText(/Cleared 3 Jan 2026/)
    expect(fetchWeekendPlannerBatches).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Restore this' }))

    await waitFor(() => expect(fetchWeekendPlannerBatches).toHaveBeenCalledTimes(2))
  })

  it('the Restore button is disabled on every batch while any one restore is in flight', async () => {
    let resolveRestore
    restoreWeekendPlannerBatch.mockReturnValue(new Promise(resolve => { resolveRestore = resolve }))
    const twoBatches = [
      CLEAR_BATCH,
      { ...CLEAR_BATCH, batchId: 'batch-2', changes: [{ ...CLEAR_BATCH.changes[0], id: 'c2' }] },
    ]
    fetchWeekendPlannerBatches.mockResolvedValue({ batches: twoBatches, error: null })
    const user = userEvent.setup()
    renderModal()
    await screen.findAllByText(/Cleared 3 Jan 2026/)

    const restoreButtons = screen.getAllByRole('button', { name: /Restore this|Restoring…/ })
    await user.click(restoreButtons[0])

    expect(screen.getByRole('button', { name: 'Restoring…' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /Restoring…|Restore this/ }).every(b => b.disabled)).toBe(true)

    resolveRestore({ error: null, inserted: 1, deleted: 0, skipped: 0 })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Restoring…' })).not.toBeInTheDocument())
  })
})
