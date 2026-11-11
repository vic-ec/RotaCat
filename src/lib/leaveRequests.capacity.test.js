import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normaliseAnnualCapacity, capacityReadingFor, checkAnnualLeaveCapacity, fetchAnnualCapacityPreview, submitLeaveRequest,
} from './leaveRequests'

// The annual_leave_capacity RPC is the one place capacity is counted — it
// runs server-side so the leave_select RLS policy (which hides other
// doctors' PENDING requests from a non-admin) can't hide pending leave from
// the check. These tests drive the JS off the RPC's jsonb shape.
const { mockRpc, mockResponses, inserts } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockResponses: {}, inserts: [] }))
vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from(table) {
      let method = null
      let payload = null
      const builder = {
        select() { if (!method) method = 'select'; return builder },
        insert(row) { method = 'insert'; payload = row; return builder },
        eq() { return builder },
        neq() { return builder },
        in() { return builder },
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

// What the RPC returns for a Registrar (MO 2 / Registrar 2 / EC Intern 2 /
// OT Intern 1 / pool 2) asking for 10–12 Aug while two other MOs are out on
// the 11th: the pool is full that day, so a 3rd full-time doctor breaches
// 'fulltime' (the Registrar column itself still has room).
const LIMITS = { MO: 2, Registrar: 2, EC_Intern: 2, OT_Intern: 1, fulltime: 2 }
function rpcResult({ breach = 'none', breachDates = [], worst = null, dayCounts, columnKey = 'Registrar' } = {}) {
  return {
    column_key: columnKey, column_max: LIMITS[columnKey], fulltime_max: 2, pooled: ['MO', 'Registrar', 'EC_Intern'].includes(columnKey),
    worst, breach, breach_dates: breachDates, limits: LIMITS, day_counts: dayCounts,
  }
}
const POOL_FULL_ON_11TH = rpcResult({
  breach: 'fulltime', breachDates: ['2026-08-11'],
  worst: { date: '2026-08-11', column_taken: 0, fulltime_taken: 2 },
  dayCounts: [
    { date: '2026-08-10', MO: 1, Registrar: 0, EC_Intern: 0, OT_Intern: 0 },
    { date: '2026-08-11', MO: 2, Registrar: 0, EC_Intern: 0, OT_Intern: 0 },
    { date: '2026-08-12', MO: 0, Registrar: 0, EC_Intern: 0, OT_Intern: 1 },
  ],
})
const ROOM_EVERY_DAY = rpcResult({
  worst: { date: '2026-08-10', column_taken: 0, fulltime_taken: 1 },
  dayCounts: [
    { date: '2026-08-10', MO: 1, Registrar: 0, EC_Intern: 0, OT_Intern: 0 },
    { date: '2026-08-11', MO: 0, Registrar: 0, EC_Intern: 0, OT_Intern: 0 },
    { date: '2026-08-12', MO: 0, Registrar: 0, EC_Intern: 0, OT_Intern: 0 },
  ],
})

const SUBMIT = {
  profileId: 'doctor-b', isAdmin: false, leaveType: 'annual', dateFrom: '2026-08-10', dateTo: '2026-08-12',
  annualLeaveDays: 3, notes: '', isActive: true, scheduledActiveDate: null,
}

beforeEach(() => {
  mockRpc.mockReset()
  inserts.length = 0
  for (const key of Object.keys(mockResponses)) delete mockResponses[key]
})

describe('normaliseAnnualCapacity', () => {
  it('reshapes day_counts into countByColumnPerDate\'s Map shape and limits into maxByColumnKey/maxFullTime', () => {
    const capacity = normaliseAnnualCapacity(POOL_FULL_ON_11TH)
    expect(capacity.columnKey).toBe('Registrar')
    expect(capacity.maxByColumnKey).toEqual({ MO: 2, Registrar: 2, EC_Intern: 2, OT_Intern: 1 })
    expect(capacity.maxFullTime).toBe(2)
    expect(capacity.dayCounts.get('2026-08-11').get('MO')).toBe(2)
    expect(capacity.dayCounts.get('2026-08-12').get('OT_Intern')).toBe(1)
    expect(capacity.breach).toBe('fulltime')
    expect(capacity.breachDates).toEqual(['2026-08-11'])
  })

  it('falls back to the column defaults when the RPC carries no limits', () => {
    const capacity = normaliseAnnualCapacity({ column_key: 'MO', breach: 'none', day_counts: [] })
    expect(capacity.maxByColumnKey).toEqual({ MO: 2, Registrar: 2, EC_Intern: 2, OT_Intern: 1 })
  })
})

describe('capacityReadingFor', () => {
  it('reads the doctor\'s own column off the worst day, with the server\'s breach verdict', () => {
    const reading = capacityReadingFor(normaliseAnnualCapacity(POOL_FULL_ON_11TH), { dateFrom: '2026-08-10', dateTo: '2026-08-12' })
    expect(reading).toMatchObject({
      date: '2026-08-11', taken: 2, max: 2, pooled: true, atCapacity: true, columnKey: 'Registrar', columnLabel: 'Registrar',
      breach: 'fulltime', breachDate: '2026-08-11', overCapacity: true, limitLabel: 'shared pool (MO, Registrar, EC Intern)', limitMax: 2,
    })
  })

  it('previews another column from the same day counts — the OT Intern slot on the 12th is taken, and is its own pool', () => {
    const reading = capacityReadingFor(normaliseAnnualCapacity(POOL_FULL_ON_11TH), { dateFrom: '2026-08-10', dateTo: '2026-08-12', columnKeyOverride: 'OT_Intern' })
    expect(reading).toMatchObject({ date: '2026-08-12', taken: 1, max: 1, pooled: false, atCapacity: true, columnKey: 'OT_Intern', breach: 'column', overCapacity: true })
  })

  it('is null for a doctor with no capacity column', () => {
    expect(capacityReadingFor(normaliseAnnualCapacity(rpcResult({ columnKey: null, dayCounts: [] })), { dateFrom: '2026-08-10', dateTo: '2026-08-12' })).toBeNull()
  })

  it('2 Registrars overlapping is allowed; the pool is then full for an MO or EC Intern', () => {
    const twoRegistrars = rpcResult({
      columnKey: 'MO',
      worst: { date: '2026-08-10', column_taken: 0, fulltime_taken: 2 },
      breach: 'fulltime', breachDates: ['2026-08-10'],
      dayCounts: [{ date: '2026-08-10', MO: 0, Registrar: 2, EC_Intern: 0, OT_Intern: 0 }],
    })
    const capacity = normaliseAnnualCapacity(twoRegistrars)
    // A second Registrar beside the first fits the Registrar cap of 2 (the
    // RPC's day counts show one other Registrar in that case).
    const oneRegistrar = normaliseAnnualCapacity(rpcResult({
      columnKey: 'Registrar', worst: { date: '2026-08-10', column_taken: 1, fulltime_taken: 1 },
      dayCounts: [{ date: '2026-08-10', MO: 0, Registrar: 1, EC_Intern: 0, OT_Intern: 0 }],
    }))
    expect(capacityReadingFor(oneRegistrar, { dateFrom: '2026-08-10', dateTo: '2026-08-10' })).toMatchObject({ taken: 1, max: 2, overCapacity: false })
    // …but with both Registrars out, an MO (or EC Intern) has no room.
    expect(capacityReadingFor(capacity, { dateFrom: '2026-08-10', dateTo: '2026-08-10' })).toMatchObject({ taken: 2, max: 2, pooled: true, overCapacity: true, breach: 'fulltime' })
    expect(capacityReadingFor(capacity, { dateFrom: '2026-08-10', dateTo: '2026-08-10', columnKeyOverride: 'EC_Intern' })).toMatchObject({ taken: 2, max: 2, pooled: true, overCapacity: true })
    // The OT Intern slot is still free, and still only for an OT Intern.
    expect(capacityReadingFor(capacity, { dateFrom: '2026-08-10', dateTo: '2026-08-10', columnKeyOverride: 'OT_Intern' })).toMatchObject({ taken: 0, max: 1, overCapacity: false })
  })
})

describe('checkAnnualLeaveCapacity', () => {
  it('calls the RPC for the submitting doctor and the range, with no request excluded', async () => {
    mockRpc.mockResolvedValue({ data: ROOM_EVERY_DAY, error: null })
    const result = await checkAnnualLeaveCapacity({ profileId: 'doctor-b', dateFrom: '2026-08-10', dateTo: '2026-08-12' })
    expect(mockRpc).toHaveBeenCalledWith('annual_leave_capacity', {
      p_profile_id: 'doctor-b', p_date_from: '2026-08-10', p_date_to: '2026-08-12', p_exclude_request_id: null,
    })
    expect(result).toMatchObject({ overCapacity: false, capacityBreach: null })
  })

  it('throws (rather than recording a request as within capacity) when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function annual_leave_capacity does not exist' } })
    await expect(checkAnnualLeaveCapacity({ profileId: 'doctor-b', dateFrom: '2026-08-10', dateTo: '2026-08-12' }))
      .rejects.toThrow('Could not check leave capacity: function annual_leave_capacity does not exist')
  })
})

describe('submitLeaveRequest — capacity is flagged, not blocked', () => {
  // Bug 1 regression: doctor A's overlapping request is PENDING, which
  // doctor B's browser can never SELECT. The RPC counts it anyway, and B's
  // request goes in flagged — it is never silently accepted as within
  // capacity, and never blocked either.
  it('doctor B submitting over A\'s pending leave is inserted with over_capacity = true and the breach recorded', async () => {
    mockRpc.mockResolvedValue({ data: POOL_FULL_ON_11TH, error: null })
    const result = await submitLeaveRequest({ ...SUBMIT, notes: 'Family emergency' })
    expect(result).toEqual({ overCapacity: true })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      table: 'leave_requests',
      row: { profile_id: 'doctor-b', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-12', over_capacity: true, capacity_breach: 'fulltime', notes: 'Family emergency' },
    })
  })

  it('a 3rd full-time doctor is flagged \'fulltime\', not blocked', async () => {
    mockRpc.mockResolvedValue({ data: POOL_FULL_ON_11TH, error: null })
    await expect(submitLeaveRequest({ ...SUBMIT, notes: 'Court date' })).resolves.toEqual({ overCapacity: true })
    expect(inserts[0].row.capacity_breach).toBe('fulltime')
  })

  it('an over-capacity request needs a motivation', async () => {
    mockRpc.mockResolvedValue({ data: POOL_FULL_ON_11TH, error: null })
    await expect(submitLeaveRequest(SUBMIT)).rejects.toThrow('No slot is free on 11 Aug. Add a motivation to submit this as an emergency for admin approval.')
    expect(inserts).toHaveLength(0)
  })

  it('a request within capacity is inserted unflagged, with no motivation needed', async () => {
    mockRpc.mockResolvedValue({ data: ROOM_EVERY_DAY, error: null })
    await expect(submitLeaveRequest(SUBMIT)).resolves.toEqual({ overCapacity: false })
    expect(inserts[0].row).toMatchObject({ over_capacity: false, capacity_breach: null })
  })

  it('non-annual leave never calls the RPC and is inserted unflagged', async () => {
    await submitLeaveRequest({ ...SUBMIT, leaveType: 'study', annualLeaveDays: null })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(inserts[0].row).toMatchObject({ leave_type: 'study', over_capacity: false, capacity_breach: null })
  })
})

describe('preview and submission agree', () => {
  it('fetchAnnualCapacityPreview and checkAnnualLeaveCapacity give the same reading for the same inputs', async () => {
    mockRpc.mockResolvedValue({ data: POOL_FULL_ON_11TH, error: null })
    const preview = await fetchAnnualCapacityPreview({ profileId: 'doctor-b', dateFrom: '2026-08-10', dateTo: '2026-08-12' })
    const check = await checkAnnualLeaveCapacity({ profileId: 'doctor-b', dateFrom: '2026-08-10', dateTo: '2026-08-12' })
    expect(preview).toEqual(check.reading)
    expect(preview.overCapacity).toBe(check.overCapacity)
    expect(preview.breach).toBe(check.capacityBreach)
    // Both calls hit the RPC with identical arguments.
    expect(mockRpc.mock.calls[0]).toEqual(mockRpc.mock.calls[1])
  })

  it('the preview never throws — an RPC failure shows no banner rather than breaking the form', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(fetchAnnualCapacityPreview({ profileId: 'doctor-b', dateFrom: '2026-08-10', dateTo: '2026-08-12' })).resolves.toBeNull()
  })

  it('passes excludeRequestId through for the approval-time re-check', async () => {
    mockRpc.mockResolvedValue({ data: ROOM_EVERY_DAY, error: null })
    await fetchAnnualCapacityPreview({ profileId: 'doctor-b', dateFrom: '2026-08-10', dateTo: '2026-08-12', excludeRequestId: 'req-9' })
    expect(mockRpc).toHaveBeenCalledWith('annual_leave_capacity', expect.objectContaining({ p_exclude_request_id: 'req-9' }))
  })
})
