import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getApprovalWarnings, capacityWarningFor } from './leaveApprovals'

// Bug 2 regression: approval checked supervision, balance and the
// five-eighths ceiling, but never capacity. The 4th check is a LIVE
// re-run of the annual_leave_capacity RPC with the request under review
// excluded — independent of the over_capacity flag stored at submission.
const { mockRpc, mockResponses } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockResponses: {} }))
vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from(table) {
      let method = null
      const builder = {
        select() { if (!method) method = 'select'; return builder },
        eq() { return builder },
        neq() { return builder },
        in() { return builder },
        gte() { return builder },
        lte() { return builder },
        not() { return builder },
        single() { return builder },
        maybeSingle() { return builder },
        then(resolve, reject) {
          const result = mockResponses[`${table}:${method}`] || { data: [], error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))
vi.mock('./notifications', () => ({ createNotification: vi.fn().mockResolvedValue({ error: null }) }))

const REQUEST = {
  id: 'req-7', profile_id: 'doctor-a', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-12', annual_leave_days: 3,
}
const LIMITS = { MO: 2, Registrar: 2, EC_Intern: 2, OT_Intern: 1, fulltime: 2 }

beforeEach(() => {
  mockRpc.mockReset()
  for (const key of Object.keys(mockResponses)) delete mockResponses[key]
  mockResponses['profiles:select'] = { data: { category: 'MO', contract_type: 'full', max_hours: null }, error: null }
  mockResponses['constraints:select'] = { data: { value: '1' }, error: null }
  mockResponses['annual_leave_balances:select'] = { data: null, error: null }
})

describe('capacityWarningFor', () => {
  it('is null while there is still room', () => {
    expect(capacityWarningFor({ overCapacity: false })).toBeNull()
    expect(capacityWarningFor(null)).toBeNull()
  })

  it('names the limit hit and the first breach date', () => {
    expect(capacityWarningFor({
      overCapacity: true, breach: 'column', columnLabel: 'MO', limitLabel: 'MO limit', limitMax: 2, breachDate: '2026-08-11', date: '2026-08-11',
    })).toEqual({ breach: 'column', columnLabel: 'MO', limitLabel: 'MO limit', limitMax: 2, firstBreachDate: '2026-08-11' })
  })
})

describe('getApprovalWarnings — annual leave capacity (live re-check)', () => {
  it('re-checks capacity with the request under review excluded, and warns when approving would now breach', async () => {
    // Two OTHER MOs on the 11th: with this MO the pool (2) would be over.
    mockRpc.mockResolvedValue({
      data: {
        column_key: 'MO', column_max: 2, fulltime_max: 2, pooled: true,
        worst: { date: '2026-08-11', column_taken: 2, fulltime_taken: 2 },
        breach: 'column', breach_dates: ['2026-08-11'], limits: LIMITS,
        day_counts: [
          { date: '2026-08-10', MO: 0, Registrar: 0, EC_Intern: 0, OT_Intern: 0 },
          { date: '2026-08-11', MO: 2, Registrar: 0, EC_Intern: 0, OT_Intern: 0 },
          { date: '2026-08-12', MO: 1, Registrar: 0, EC_Intern: 0, OT_Intern: 0 },
        ],
      },
      error: null,
    })

    const warnings = await getApprovalWarnings(REQUEST)

    expect(mockRpc).toHaveBeenCalledWith('annual_leave_capacity', {
      p_profile_id: 'doctor-a', p_date_from: '2026-08-10', p_date_to: '2026-08-12', p_exclude_request_id: 'req-7',
    })
    expect(warnings.capacityWarning).toEqual({
      breach: 'column', columnLabel: 'MO', limitLabel: 'MO limit', limitMax: 2, firstBreachDate: '2026-08-11',
    })
    expect(warnings.capacity).toMatchObject({ date: '2026-08-11', taken: 2, max: 2, pooled: true, overCapacity: true })
    expect(warnings.capacityError).toBeNull()
  })

  it('gives no warning when the pool has room, still returning the reading for the gauge', async () => {
    mockRpc.mockResolvedValue({
      data: {
        column_key: 'MO', column_max: 2, fulltime_max: 2, pooled: true,
        worst: { date: '2026-08-10', column_taken: 1, fulltime_taken: 1 },
        breach: 'none', breach_dates: [], limits: LIMITS,
        day_counts: [{ date: '2026-08-10', MO: 1, Registrar: 0, EC_Intern: 0, OT_Intern: 0 }],
      },
      error: null,
    })
    const warnings = await getApprovalWarnings({ ...REQUEST, date_to: '2026-08-10' })
    expect(warnings.capacityWarning).toBeNull()
    expect(warnings.capacity).toMatchObject({ taken: 1, max: 2, overCapacity: false })
  })

  it('reports a failed check as capacityError rather than silently passing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    const warnings = await getApprovalWarnings(REQUEST)
    expect(warnings.capacityWarning).toBeNull()
    expect(warnings.capacity).toBeNull()
    expect(warnings.capacityError).toBe('Could not check leave capacity: permission denied')
  })

  it('skips the capacity check for non-annual leave', async () => {
    const warnings = await getApprovalWarnings({ ...REQUEST, leave_type: 'study' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(warnings.capacityWarning).toBeNull()
    expect(warnings.capacity).toBeNull()
  })
})
