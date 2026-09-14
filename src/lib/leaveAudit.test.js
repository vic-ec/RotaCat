import { describe, it, expect } from 'vitest'
import { buildAuditRows, AUDIT_LEAVE_COLUMNS } from './leaveAudit'

const profiles = [
  { id: 'p1', name: 'Ada', surname: 'Zephyr', category: 'MO' },
  { id: 'p2', name: 'Bo', surname: 'Adams', category: 'Registrar' },
]

describe('AUDIT_LEAVE_COLUMNS', () => {
  it('gives every leave type its own column, in picklist order', () => {
    expect(AUDIT_LEAVE_COLUMNS.map(c => c.key)).toEqual([
      'annual', 'sick', 'family_responsibility', 'study', 'special_leave', 'prenatal',
      'maternity_paternity', 'workshop', 'course', 'conference',
      'time_off_in_lieu', 'statutory_public', 'injury_on_duty', 'single_day',
    ])
  })

  it('merges maternity and paternity into one column, and drops weekend_exception', () => {
    const merged = AUDIT_LEAVE_COLUMNS.find(c => c.key === 'maternity_paternity')
    expect(merged.types).toEqual(['maternity', 'paternity'])
    // A weekend exception swaps which weekend you work rather than reducing
    // required hours, so it is not leave taken and has no column.
    expect(AUDIT_LEAVE_COLUMNS.flatMap(c => c.types)).not.toContain('weekend_exception')
  })

  it('keeps single day out of the annual column', () => {
    expect(AUDIT_LEAVE_COLUMNS.find(c => c.key === 'annual').types).toEqual(['annual'])
    expect(AUDIT_LEAVE_COLUMNS.find(c => c.key === 'single_day').types).toEqual(['single_day'])
  })
})

describe('buildAuditRows', () => {
  it('includes every profile even with zero leave in range, sorted by surname', () => {
    const rows = buildAuditRows(profiles, [], '2026-01-01', '2026-12-31')
    expect(rows.map(r => r.surname)).toEqual(['Adams', 'Zephyr'])
    for (const column of AUDIT_LEAVE_COLUMNS) {
      expect(rows[0].byColumn[column.key]).toEqual({ approved: 0, pending: 0 })
    }
    expect(rows[0].totalApprovedDays).toBe(0)
  })

  it('buckets each leave type into its own column per profile', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'annual', date_from: '2026-03-10', date_to: '2026-03-14', annual_leave_days: 5, status: 'approved' },
      { profile_id: 'p1', leave_type: 'course', date_from: '2026-04-01', date_to: '2026-04-02', status: 'approved' },
      { profile_id: 'p1', leave_type: 'sick', date_from: '2026-05-01', date_to: '2026-05-01', status: 'approved' },
      { profile_id: 'p2', leave_type: 'annual', date_from: '2026-06-01', date_to: '2026-06-01', status: 'pending' },
    ]
    const rows = buildAuditRows(profiles, requests, '2026-01-01', '2026-12-31')
    const p1 = rows.find(r => r.profileId === 'p1')
    const p2 = rows.find(r => r.profileId === 'p2')

    // Annual counts annual_leave_days (the column the balance is deducted
    // from); everything else counts calendar days in range.
    expect(p1.byColumn.annual).toEqual({ approved: 5, pending: 0 })
    expect(p1.byColumn.course).toEqual({ approved: 2, pending: 0 })
    expect(p1.byColumn.sick).toEqual({ approved: 1, pending: 0 })
    expect(p1.byColumn.study).toEqual({ approved: 0, pending: 0 })
    expect(p1.totalApprovedDays).toBe(8)

    expect(p2.byColumn.annual).toEqual({ approved: 0, pending: 1 })
    expect(p2.totalApprovedDays).toBe(0)
  })

  it('counts a single day on its own, never against annual', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'single_day', date_from: '2026-03-10', date_to: '2026-03-10', status: 'approved' },
    ]
    const p1 = buildAuditRows(profiles, requests, '2026-01-01', '2026-12-31').find(r => r.profileId === 'p1')
    expect(p1.byColumn.single_day.approved).toBe(1)
    expect(p1.byColumn.annual.approved).toBe(0)
    expect(p1.totalApprovedDays).toBe(1)
  })

  it('counts maternity and paternity together in one column', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'maternity', date_from: '2026-03-01', date_to: '2026-03-03', status: 'approved' },
      { profile_id: 'p1', leave_type: 'paternity', date_from: '2026-06-01', date_to: '2026-06-02', status: 'approved' },
    ]
    const p1 = buildAuditRows(profiles, requests, '2026-01-01', '2026-12-31').find(r => r.profileId === 'p1')
    expect(p1.byColumn.maternity_paternity.approved).toBe(5)
  })

  it('counts the three new types the leave spreadsheet tracks', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'time_off_in_lieu', date_from: '2026-03-01', date_to: '2026-03-02', status: 'approved' },
      { profile_id: 'p1', leave_type: 'statutory_public', date_from: '2026-04-01', date_to: '2026-04-01', status: 'approved' },
      { profile_id: 'p1', leave_type: 'injury_on_duty', date_from: '2026-05-01', date_to: '2026-05-04', status: 'approved' },
    ]
    const p1 = buildAuditRows(profiles, requests, '2026-01-01', '2026-12-31').find(r => r.profileId === 'p1')
    expect(p1.byColumn.time_off_in_lieu.approved).toBe(2)
    expect(p1.byColumn.statutory_public.approved).toBe(1)
    expect(p1.byColumn.injury_on_duty.approved).toBe(4)
    expect(p1.totalApprovedDays).toBe(7)
  })

  it('leaves a weekend exception out of the totals entirely', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'weekend_exception', date_from: '2026-03-07', date_to: '2026-03-08', status: 'approved' },
    ]
    const p1 = buildAuditRows(profiles, requests, '2026-01-01', '2026-12-31').find(r => r.profileId === 'p1')
    expect(p1.totalApprovedDays).toBe(0)
  })

  it('scopes each profile to only its own requests', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'sick', date_from: '2026-05-01', date_to: '2026-05-05', status: 'approved' },
    ]
    const rows = buildAuditRows(profiles, requests, '2026-01-01', '2026-12-31')
    expect(rows.find(r => r.profileId === 'p2').byColumn.sick.approved).toBe(0)
  })

  it('respects an arbitrary (non-calendar-year) date range', () => {
    const requests = [
      { profile_id: 'p1', leave_type: 'course', date_from: '2026-04-10', date_to: '2026-04-12', status: 'approved' },
    ]
    const inRange = buildAuditRows(profiles, requests, '2026-04-01', '2026-06-30')
    const outOfRange = buildAuditRows(profiles, requests, '2026-07-01', '2026-09-30')
    expect(inRange.find(r => r.profileId === 'p1').byColumn.course.approved).toBe(3)
    expect(outOfRange.find(r => r.profileId === 'p1').byColumn.course.approved).toBe(0)
  })
})
