import { describe, it, expect } from 'vitest'
import { leaveDestination } from './myYearLinks'

const req = (over = {}) => ({ id: 'r1', profile_id: 'p1', leave_type: 'annual', status: 'approved', date_from: '2026-12-07', date_to: '2026-12-11', ...over })

describe('leaveDestination', () => {
  it('annual and special leave open their planner month', () => {
    expect(leaveDestination(req(), { own: true })).toMatchObject({ label: 'Annual planner', kind: 'planner', to: expect.stringContaining('sub=annual&month=2026-12&highlight=2026-12-07') })
    expect(leaveDestination(req({ leave_type: 'study' }), { own: true })).toMatchObject({ label: 'Special planner', kind: 'planner', to: expect.stringContaining('smonth=12&sday=2026-12-07') })
  })

  it('sick leave opens the request itself, never a planner', () => {
    const sick = req({ leave_type: 'sick', date_from: '2026-11-18', date_to: '2026-11-18' })
    expect(leaveDestination(sick, { own: true })).toEqual({ to: '/leave?tab=requests&request=r1', label: 'My Requests', kind: 'request' })
    expect(leaveDestination(sick, { isAdmin: true, wide: true, profileId: 'p1' })).toMatchObject({ label: 'All Leave', to: expect.stringContaining('sub=all&lyear=2026&lrequest=r1') })
    expect(leaveDestination(sick, { isAdmin: true, wide: false, profileId: 'p1' })).toEqual({ to: '/my-year/p1?tab=leave&year=2026&request=r1', label: 'Leave record', kind: 'request' })
    // Already on the Leave tab: nowhere else to send an admin on a phone.
    expect(leaveDestination(sick, { isAdmin: true, wide: false, profileId: 'p1', inLeaveTab: true })).toBeNull()
  })

  it('rejected and cancelled leave link nowhere; pending opens the request', () => {
    expect(leaveDestination(req({ status: 'rejected' }), { own: true })).toBeNull()
    expect(leaveDestination(req({ status: 'cancelled' }), { own: true })).toBeNull()
    expect(leaveDestination(req({ status: 'pending' }), { own: true })).toMatchObject({ label: 'My Requests', to: '/leave?tab=requests&request=r1' })
  })

  it('the Overview sends an admin on a wide screen to Team Leave for every type', () => {
    expect(leaveDestination(req(), { isAdmin: true, wide: true, teamLeave: true })).toMatchObject({ label: 'All Leave' })
    expect(leaveDestination(req(), { isAdmin: true, wide: true })).toMatchObject({ label: 'Annual planner' })
  })
})
