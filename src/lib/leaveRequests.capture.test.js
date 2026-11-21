import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitLeaveRequest, leaveYearStart } from './leaveRequests'

// An admin capturing leave on a doctor's behalf (submitLeaveRequest's
// capturedBy): approved on the spot, attributed to the admin, not gated by
// the checks that only fit a doctor asking in advance.
const { mockResponses, inserts } = vi.hoisted(() => ({ mockResponses: {}, inserts: [] }))
vi.mock('./supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from(table) {
      let method = null
      let payload = null
      const builder = {
        select() { if (!method) method = 'select'; return builder },
        insert(row) { method = 'insert'; payload = row; return builder },
        eq() { return builder },
        gte() { return builder },
        lte() { return builder },
        single() { return builder },
        then(resolve, reject) {
          if (method === 'insert') inserts.push({ table, row: payload })
          const result = mockResponses[`${table}:${method}`] || { data: [], error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

const SICK = {
  profileId: 'doctor-1', isAdmin: true, leaveType: 'sick', dateFrom: '2026-01-05', dateTo: '2026-01-06',
  annualLeaveDays: null, notes: 'Phoned in', isActive: true, scheduledActiveDate: null,
}

describe('submitLeaveRequest — admin capture', () => {
  beforeEach(() => {
    inserts.length = 0
    for (const k of Object.keys(mockResponses)) delete mockResponses[k]
  })

  it('inserts the row approved, with the admin as reviewer and submitter, and notifies the doctor', async () => {
    const result = await submitLeaveRequest({ ...SICK, capturedBy: 'admin-1' })

    const leave = inserts.find(i => i.table === 'leave_requests').row
    expect(leave).toMatchObject({
      profile_id: 'doctor-1', leave_type: 'sick', status: 'approved', reviewed_by: 'admin-1', submitted_by: 'admin-1',
    })
    expect(leave.reviewed_at).toBeTruthy()
    const note = inserts.find(i => i.table === 'notifications').row
    expect(note).toMatchObject({ profile_id: 'doctor-1', type: 'leave_approved', title: 'Leave captured on your behalf' })
    expect(result).toMatchObject({ captured: true, rosterOverlapDates: [] })
  })

  it('a shift already on the roster does not block a capture, and is reported back', async () => {
    mockResponses['roster_entries:select'] = { data: [{ date: '2026-01-05' }], error: null }
    const result = await submitLeaveRequest({ ...SICK, capturedBy: 'admin-1' })
    expect(result.rosterOverlapDates).toEqual(['2026-01-05'])
    expect(inserts.some(i => i.table === 'leave_requests')).toBe(true)
  })

  it('the same roster shift still blocks a doctor filing for themself', async () => {
    mockResponses['roster_entries:select'] = { data: [{ date: '2026-01-05' }], error: null }
    await expect(submitLeaveRequest({ ...SICK })).rejects.toThrow(/a shift already on the roster/)
    expect(inserts).toHaveLength(0)
  })

  it('the doctor\'s own existing leave still blocks a capture', async () => {
    mockResponses['leave_requests:select'] = { data: [{ date_from: '2026-01-06', date_to: '2026-01-08', status: 'approved' }], error: null }
    await expect(submitLeaveRequest({ ...SICK, capturedBy: 'admin-1' })).rejects.toThrow(/an existing leave request/)
    expect(inserts).toHaveLength(0)
  })

  it('an inactive doctor can have leave captured, but cannot file it themself', async () => {
    const inactive = { ...SICK, isActive: false }
    await expect(submitLeaveRequest(inactive)).rejects.toThrow(/marked inactive/)
    await submitLeaveRequest({ ...inactive, capturedBy: 'admin-1' })
    expect(inserts.some(i => i.table === 'leave_requests')).toBe(true)
  })

  it('a doctor\'s own request carries none of the capture fields', async () => {
    await submitLeaveRequest({ ...SICK, isAdmin: true })
    const leave = inserts.find(i => i.table === 'leave_requests').row
    expect(leave).not.toHaveProperty('status')
    expect(leave).not.toHaveProperty('submitted_by')
    expect(inserts.some(i => i.table === 'notifications')).toBe(false)
  })
})

describe('leaveYearStart', () => {
  it('is 1 January of the year today falls in', () => {
    expect(leaveYearStart('2026-11-21')).toBe('2026-01-01')
  })
})
