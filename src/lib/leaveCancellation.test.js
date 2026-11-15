import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }))

import { cancelEligibility, isValidCancelReason, rosterMonthsForRange, rosterWarningText, cancelLeaveRequest } from './leaveCancellation'
import { supabase } from './supabase'

const TODAY = '2026-11-15'
const future = { id: 'r1', profile_id: 'doc-1', status: 'approved', date_from: '2026-12-01', date_to: '2026-12-05' }

describe('cancelEligibility', () => {
  it('lets a doctor cancel their own future pending or approved leave', () => {
    expect(cancelEligibility(future, { viewerId: 'doc-1', todayStr: TODAY }).allowed).toBe(true)
    expect(cancelEligibility({ ...future, status: 'pending' }, { viewerId: 'doc-1', todayStr: TODAY }).allowed).toBe(true)
  })

  it('stops a doctor cancelling leave that has started, someone else’s leave, or a decided request', () => {
    expect(cancelEligibility({ ...future, date_from: TODAY }, { viewerId: 'doc-1', todayStr: TODAY })).toEqual({
      allowed: false, reason: 'Leave that has already started can only be cancelled by an admin.',
    })
    expect(cancelEligibility(future, { viewerId: 'doc-2', todayStr: TODAY }).reason).toMatch(/your own leave/)
    expect(cancelEligibility({ ...future, status: 'rejected' }, { viewerId: 'doc-1', todayStr: TODAY }).reason).toMatch(/Only pending or approved/)
    expect(cancelEligibility({ ...future, status: 'cancelled' }, { viewerId: 'doc-1', todayStr: TODAY }).reason).toMatch(/already been cancelled/)
  })

  it('lets an admin cancel anyone’s leave, including leave already under way', () => {
    expect(cancelEligibility({ ...future, date_from: '2026-11-01' }, { isAdmin: true, viewerId: 'admin', todayStr: TODAY }).allowed).toBe(true)
    expect(cancelEligibility({ ...future, status: 'rejected' }, { isAdmin: true, todayStr: TODAY }).allowed).toBe(false)
  })
})

describe('isValidCancelReason', () => {
  it('requires a few real characters', () => {
    expect(isValidCancelReason('')).toBe(false)
    expect(isValidCancelReason('  ok ')).toBe(false)
    expect(isValidCancelReason('Plans changed')).toBe(true)
  })
})

describe('rosterMonthsForRange / rosterWarningText', () => {
  it('lists every month a range touches, across a year end', () => {
    expect(rosterMonthsForRange('2026-12-29', '2027-01-02')).toEqual([{ year: 2026, month: 12 }, { year: 2027, month: 1 }])
    expect(rosterMonthsForRange('2026-03-02', '2026-03-02')).toEqual([{ year: 2026, month: 3 }])
  })

  it('words the warning by roster state and says nothing when there is no roster', () => {
    expect(rosterWarningText([])).toBe('')
    const text = rosterWarningText([{ year: 2026, month: 12, status: 'published' }, { year: 2027, month: 1, status: 'draft' }])
    expect(text).toMatch(/December 2026 has already been published/)
    expect(text).toMatch(/draft roster already exists for January 2027/)
    expect(text).toMatch(/does not change any shifts/)
  })
})

describe('cancelLeaveRequest', () => {
  it('calls the database function with a trimmed reason and returns the row', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { id: 'r1', status: 'cancelled' }, error: null })
    const row = await cancelLeaveRequest('r1', '  Plans changed  ')
    expect(supabase.rpc).toHaveBeenCalledWith('cancel_leave_request', { p_request_id: 'r1', p_reason: 'Plans changed' })
    expect(row.status).toBe('cancelled')
  })

  it('surfaces the database’s own sentence as the error', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Leave that has already started can only be cancelled by an admin.' } })
    await expect(cancelLeaveRequest('r1', 'reason')).rejects.toThrow(/already started/)
  })

  it('translates a permission failure into plain words', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied for function cancel_leave_request' } })
    await expect(cancelLeaveRequest('r1', 'reason')).rejects.toThrow("You don't have permission to cancel this leave.")
  })
})
