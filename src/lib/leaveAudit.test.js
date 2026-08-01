import { describe, it, expect } from 'vitest'
import { buildAuditRows } from './leaveAudit'

const profiles = [
  { id: 'p1', name: 'Ada', surname: 'Zephyr', category: 'MO' },
  { id: 'p2', name: 'Bo', surname: 'Adams', category: 'Registrar' },
]

describe('buildAuditRows', () => {
  it('includes every profile even with zero leave in range, sorted by surname', () => {
    const rows = buildAuditRows(profiles, [], '2026-01-01', '2026-12-31')
    expect(rows.map(r => r.surname)).toEqual(['Adams', 'Zephyr'])
    expect(rows[0]).toMatchObject({
      annual: { approved: 0, pending: 0 },
      special: { approved: 0, pending: 0 },
      sick: { approved: 0, pending: 0 },
      totalApprovedDays: 0,
    })
  })

  it('buckets annual, special (everything but annual/sick), and sick separately per profile', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'annual', date_from: '2026-03-10', date_to: '2026-03-14', annual_leave_days: 5, status: 'approved' },
      { profile_id: 'p1', leave_type: 'course', date_from: '2026-04-01', date_to: '2026-04-02', status: 'approved' },
      { profile_id: 'p1', leave_type: 'sick', date_from: '2026-05-01', date_to: '2026-05-01', status: 'approved' },
      { profile_id: 'p2', leave_type: 'annual', date_from: '2026-06-01', date_to: '2026-06-01', status: 'pending' },
    ]
    const rows = buildAuditRows(profiles, requests, '2026-01-01', '2026-12-31')
    const p1 = rows.find(r => r.profileId === 'p1')
    const p2 = rows.find(r => r.profileId === 'p2')

    expect(p1.annual).toEqual({ approved: 5, pending: 0 })
    expect(p1.special).toEqual({ approved: 2, pending: 0 })
    expect(p1.sick).toEqual({ approved: 1, pending: 0 })
    expect(p1.totalApprovedDays).toBe(8)

    expect(p2.annual).toEqual({ approved: 0, pending: 1 })
    expect(p2.totalApprovedDays).toBe(0)
  })

  it('scopes each profile to only its own requests', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'sick', date_from: '2026-05-01', date_to: '2026-05-05', status: 'approved' },
    ]
    const rows = buildAuditRows(profiles, requests, '2026-01-01', '2026-12-31')
    expect(rows.find(r => r.profileId === 'p2').sick.approved).toBe(0)
  })

  it('respects an arbitrary (non-calendar-year) date range', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'course', date_from: '2026-04-10', date_to: '2026-04-12', status: 'approved' },
    ]
    const inRange = buildAuditRows(profiles, requests, '2026-04-01', '2026-06-30')
    const outOfRange = buildAuditRows(profiles, requests, '2026-07-01', '2026-09-30')
    expect(inRange.find(r => r.profileId === 'p1').special.approved).toBe(3)
    expect(outOfRange.find(r => r.profileId === 'p1').special.approved).toBe(0)
  })
})
