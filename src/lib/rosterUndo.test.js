import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mock } from '../test/mockSupabase'

vi.mock('./supabase', () => ({ supabase: mock.supabase }))
vi.mock('./leaveCancellation', () => ({ cancelLeaveRequest: vi.fn().mockResolvedValue({}) }))

import { rowMatchesSnapshot, checkBatch, undoRosterBatch, fetchRosterBatches, summarizeRosterBatch } from './rosterUndo'
import { cancelLeaveRequest } from './leaveCancellation'
import { CHANGED_SINCE_MESSAGE, emptySideEffects } from './rosterEdits'

const row = { id: 'e1', roster_month_id: 'rm1', date: '2026-08-10', shift_type_id: 'st1', profile_id: 'doc-a', is_locum: false, locum_name: null, vacated_profile_id: null, vacated_at: null, created_at: '2026-08-01T00:00:00+00:00' }
const vacated = { ...row, profile_id: null, is_locum: true, locum_name: '[ ]', vacated_profile_id: 'doc-a', vacated_reason: 'leave', vacated_at: '2026-08-09T10:00:00.000Z' }

function change(over = {}) {
  return {
    id: 'c1', batch_id: 'b1', roster_month_id: 'rm1', roster_entry_id: 'e1', entry_date: '2026-08-10', shift_code: 'WD_08',
    action: 'unassign', profile_id_before: 'doc-a', profile_id_after: null, changed_by: 'admin-1', changed_at: '2026-08-09T10:00:00Z',
    entry_before: row, entry_after: vacated, side_effects: emptySideEffects(), ...over,
  }
}

const liveEntries = (...rows) => mock.respond('roster_entries', call => (call.method === 'select' ? rows.filter(r => call.filters.some(f => f[0] === 'eq' && f[1] === 'id' && f[2] === r.id)) : null))
const batch = (...changes) => mock.respond('roster_entry_changes', call => (call.method === 'select' ? changes : null))
const undoLogs = () => mock.find('roster_entry_changes', 'insert').map(c => c.payload)

beforeEach(() => { mock.reset(); cancelLeaveRequest.mockClear() })

describe('rowMatchesSnapshot — the guard', () => {
  it('compares by meaning: Postgres timestamps and sliced dates match their JS spelling', () => {
    expect(rowMatchesSnapshot({ ...vacated, vacated_at: '2026-08-09T10:00:00+00:00', date: '2026-08-10T00:00:00' }, vacated)).toBe(true)
  })
  it('ignores columns the snapshot does not know, and fails on any it does', () => {
    expect(rowMatchesSnapshot({ ...vacated, new_column: 1 }, vacated)).toBe(true)
    expect(rowMatchesSnapshot({ ...vacated, profile_id: 'doc-b' }, vacated)).toBe(false)
  })
  it('a null snapshot means the row must be gone', () => {
    expect(rowMatchesSnapshot(null, null)).toBe(true)
    expect(rowMatchesSnapshot(row, null)).toBe(false)
    expect(rowMatchesSnapshot(null, row)).toBe(false)
  })
  it('checkBatch names the rows that block', () => {
    const c = change()
    expect(checkBatch([c], new Map([['e1', vacated]])).ok).toBe(true)
    expect(checkBatch([c], new Map([['e1', { ...vacated, profile_id: 'doc-b' }]])).blocked).toHaveLength(1)
  })
})

describe('undoRosterBatch', () => {
  it('refuses when the shift has changed since, and writes nothing', async () => {
    batch(change())
    liveEntries({ ...vacated, profile_id: 'doc-b', is_locum: false })
    const result = await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-2' })
    expect(result.error).toBe(CHANGED_SINCE_MESSAGE)
    expect(mock.find('roster_entries', 'update')).toHaveLength(0)
    expect(undoLogs()).toHaveLength(0)
  })

  it('an update is put back to entry_before, side effects reversed, and the undo logged as a new batch that points at the old', async () => {
    batch(change({ side_effects: { ...emptySideEffects(), leave_request_captured: 'leave-1', advert_created: 'ad-1' } }))
    liveEntries(vacated)
    const result = await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-2' })
    expect(result.error).toBeNull()
    const update = mock.find('roster_entries', 'update')[0]
    expect(update.payload).toMatchObject({ profile_id: 'doc-a', is_locum: false, vacated_profile_id: null })
    expect(update.payload.id).toBeUndefined()
    expect(update.filters).toContainEqual(['eq', 'id', 'e1'])
    expect(cancelLeaveRequest).toHaveBeenCalledWith('leave-1', expect.any(String))
    expect(mock.find('shift_advertisements', 'update')[0]).toMatchObject({ payload: { status: 'cancelled' }, filters: [['in', 'id', ['ad-1']]] })
    const [log] = undoLogs()
    expect(log).toMatchObject({ action: 'undo', changed_by: 'admin-2', profile_id_after: 'doc-a', entry_before: vacated, entry_after: row })
    expect(log.batch_id).not.toBe('b1')
    expect(log.batch_id).toBe(result.batchId)
    expect(log.side_effects).toMatchObject({ reverses_batch_id: 'b1', leave_request_cancelled: 'leave-1', adverts_cancelled: ['ad-1'] })
  })

  it('a deleted row is re-inserted with its original id; cancelled adverts are reopened', async () => {
    batch(change({ action: 'remove', roster_entry_id: null, entry_before: row, entry_after: null, side_effects: { ...emptySideEffects(), adverts_cancelled: ['ad-7'] } }))
    liveEntries() // gone
    const result = await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-1' })
    expect(result.error).toBeNull()
    expect(mock.find('roster_entries', 'insert')[0].payload).toMatchObject({ id: 'e1', profile_id: 'doc-a' })
    expect(mock.find('shift_advertisements', 'update')[0]).toMatchObject({ payload: { status: 'open' }, filters: [['in', 'id', ['ad-7']]] })
    expect(undoLogs()[0].side_effects.adverts_reopened).toEqual(['ad-7'])
  })

  it('refuses to re-insert if something now sits at that id', async () => {
    batch(change({ action: 'remove', roster_entry_id: null, entry_before: row, entry_after: null }))
    liveEntries(row)
    expect((await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-1' })).error).toBe(CHANGED_SINCE_MESSAGE)
  })

  it('an inserted row is deleted again', async () => {
    batch(change({ action: 'assign', entry_before: null, entry_after: row, profile_id_before: null, profile_id_after: 'doc-a' }))
    liveEntries(row)
    const result = await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-1' })
    expect(result.error).toBeNull()
    expect(mock.find('roster_entries', 'delete')[0].filters).toContainEqual(['eq', 'id', 'e1'])
    expect(undoLogs()[0]).toMatchObject({ action: 'undo', roster_entry_id: null, entry_after: null })
  })

  it('undoing a Put back that cancelled leave re-approves the leave', async () => {
    batch(change({ action: 'reinstate', entry_before: vacated, entry_after: row, side_effects: { ...emptySideEffects(), leave_request_cancelled: 'leave-1' } }))
    liveEntries(row)
    await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-1' })
    expect(mock.find('leave_requests', 'update')[0]).toMatchObject({ payload: { status: 'approved' }, filters: [['eq', 'id', 'leave-1']] })
    expect(undoLogs()[0].side_effects.leave_request_reapproved).toBe('leave-1')
  })

  it('undoing an undo cancels the re-approved leave again (the pairs are symmetric)', async () => {
    batch(change({ action: 'undo', entry_before: row, entry_after: vacated, side_effects: { ...emptySideEffects(), leave_request_reapproved: 'leave-1', adverts_reopened: ['ad-1'], reverses_batch_id: 'b0' } }))
    liveEntries(vacated)
    await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-1' })
    expect(cancelLeaveRequest).toHaveBeenCalledWith('leave-1', expect.any(String))
    expect(mock.find('shift_advertisements', 'update')[0].payload).toEqual({ status: 'cancelled' })
  })

  it('a chain (two rows, one batch) is guarded as a whole and unwound newest first', async () => {
    const second = change({ id: 'c2', roster_entry_id: 'e2', changed_at: '2026-08-09T10:00:01Z', entry_before: { ...row, id: 'e2', profile_id: 'doc-b' }, entry_after: { ...vacated, id: 'e2', vacated_profile_id: 'doc-b' } })
    batch(change(), second)
    liveEntries(vacated, { ...vacated, id: 'e2', vacated_profile_id: 'doc-b' })
    const result = await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-1' })
    expect(result.error).toBeNull()
    expect(mock.find('roster_entries', 'update').map(c => c.filters[0][2])).toEqual(['e2', 'e1'])
    expect(undoLogs()).toHaveLength(2)
    expect(new Set(undoLogs().map(l => l.batch_id)).size).toBe(1)

    mock.reset()
    batch(change(), second)
    liveEntries(vacated, { ...vacated, id: 'e2', profile_id: 'doc-c' })
    expect((await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-1' })).error).toBe(CHANGED_SINCE_MESSAGE)
    expect(mock.find('roster_entries', 'update')).toHaveLength(0)
  })

  it('rows logged before snapshots existed cannot be undone', async () => {
    batch({ ...change(), entry_before: null, entry_after: null })
    expect((await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-1' })).error).toMatch(/before undo existed/)
    batch()
    expect((await undoRosterBatch({ batchId: 'b1', changedBy: 'admin-1' })).error).toMatch(/no longer exists/)
  })
})

describe('History batches', () => {
  it('groups rows by batch, newest first, and marks the old ones not undoable', async () => {
    mock.respond('roster_entry_changes', () => [
      { ...change({ id: 'x', batch_id: 'b2', changed_at: '2026-08-10T00:00:00Z' }) },
      { ...change({ id: 'y', batch_id: 'b1', changed_at: '2026-08-09T00:00:00Z' }), entry_before: null, entry_after: null },
      { ...change({ id: 'z', batch_id: 'b2', changed_at: '2026-08-10T00:00:01Z' }) },
    ])
    const { batches } = await fetchRosterBatches({ rosterMonthId: 'rm1' })
    expect(batches.map(b => b.batchId)).toEqual(['b2', 'b1'])
    expect(batches[0].changes).toHaveLength(2)
    expect(batches[0].undoable).toBe(true)
    expect(batches[1].undoable).toBe(false)
  })

  it('summarises a batch in one line, naming the doctor affected', () => {
    const names = new Map([['doc-a', 'Alice Anderson']])
    expect(summarizeRosterBatch({ changes: [change()] }, names)).toBe('Vacated · Mon 10 Aug · WD 08h-18h · Alice Anderson')
    expect(summarizeRosterBatch({ changes: [change({ action: 'slot_remove' }), change({ id: 'c2', changed_at: '2026-08-09T10:00:01Z' })] }, names)).toBe('Locum slot removed · Mon 10 Aug · WD 08h-18h · Alice Anderson · +1 more')
  })
})
