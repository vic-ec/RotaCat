import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifyBadgesChanged, onBadgesChanged } from './navBadges'

const { updateResult } = vi.hoisted(() => ({ updateResult: { current: null } }))
vi.mock('./supabase', () => ({
  supabase: {
    from() {
      const builder = { update: () => builder, eq: () => builder, select: () => Promise.resolve(updateResult.current) }
      return builder
    },
  },
}))
vi.mock('./notifications', () => ({ createNotification: vi.fn().mockResolvedValue() }))
const { approveLeaveRequest, rejectLeaveRequest } = await import('./leaveApprovals')

const REQUEST = { id: 'lr-1', profile_id: 'p-1', leave_type: 'annual', date_from: '2026-12-01', date_to: '2026-12-03' }

describe('navBadges', () => {
  it('tells every listener, until it unsubscribes', () => {
    const listener = vi.fn()
    const off = onBadgesChanged(listener)
    notifyBadgesChanged()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    notifyBadgesChanged()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('leave decisions refresh the badges', () => {
  let listener
  beforeEach(() => {
    listener = vi.fn()
    return onBadgesChanged(listener)
  })

  it('after an approve or a reject', async () => {
    updateResult.current = { data: [{ id: 'lr-1' }], error: null }
    await approveLeaveRequest(REQUEST, 'admin-1')
    await rejectLeaveRequest(REQUEST, 'admin-1', 'no')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('not when the request was already decided', async () => {
    updateResult.current = { data: [], error: null }
    await expect(approveLeaveRequest(REQUEST, 'admin-1')).rejects.toThrow(/already been decided/)
    expect(listener).not.toHaveBeenCalled()
  })
})
