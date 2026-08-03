import { describe, it, expect } from 'vitest'
import { dayEntriesByColumn, dayCapacitySummary, checkApprovalCapacityImpact } from './monthWorkspace'

describe('dayEntriesByColumn', () => {
  const approvedByDate = new Map([
    ['2026-08-12', [{ profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved' }]],
  ])
  const pendingByDate = new Map([
    ['2026-08-12', [{ profileId: 'p2', surname: 'Botha', category: 'Registrar', status: 'pending' }]],
  ])

  it('groups approved and pending entries together by capacity column', () => {
    const byColumn = dayEntriesByColumn('2026-08-12', { approvedByDate, pendingByDate })
    expect(byColumn.get('MO')).toEqual([{ profileId: 'p1', surname: 'Anderson', category: 'MO', status: 'approved' }])
    expect(byColumn.get('Registrar')).toEqual([{ profileId: 'p2', surname: 'Botha', category: 'Registrar', status: 'pending' }])
  })

  it('returns an empty map for a date with nothing on it', () => {
    expect(dayEntriesByColumn('2026-08-13', { approvedByDate, pendingByDate }).size).toBe(0)
  })

  it('groups Consultant leave under the uncapped "Other" column rather than dropping it', () => {
    const withConsultant = new Map([
      ['2026-08-12', [{ profileId: 'p3', surname: 'Smith', category: 'Consultant', status: 'approved' }]],
    ])
    const byColumn = dayEntriesByColumn('2026-08-12', { approvedByDate: withConsultant, pendingByDate: new Map() })
    expect(byColumn.get('Other')).toEqual([{ profileId: 'p3', surname: 'Smith', category: 'Consultant', status: 'approved' }])
  })

  it('drops entries whose category is unrecognised (e.g. Locum, which never submits leave)', () => {
    const withLocum = new Map([
      ['2026-08-12', [{ profileId: 'p4', surname: 'Jones', category: 'Locum', status: 'approved' }]],
    ])
    expect(dayEntriesByColumn('2026-08-12', { approvedByDate: withLocum, pendingByDate: new Map() }).size).toBe(0)
  })
})

describe('dayCapacitySummary', () => {
  it('reports count, max, and at-cap per column for a date', () => {
    const counts = new Map([['2026-08-12', new Map([['MO', 1], ['Registrar', 1]])]])
    const maxByColumnKey = { MO: 2, Registrar: 1, EC_COSMO: 1, OT_COSMO: 1 }

    const summary = dayCapacitySummary('2026-08-12', counts, maxByColumnKey)
    const mo = summary.find(s => s.key === 'MO')
    const registrar = summary.find(s => s.key === 'Registrar')
    expect(mo).toEqual({ key: 'MO', label: 'MO', count: 1, max: 2, atCap: false })
    expect(registrar).toEqual({ key: 'Registrar', label: 'Registrar', count: 1, max: 1, atCap: true })
  })

  it('reports zero counts for a date with nothing on record', () => {
    const summary = dayCapacitySummary('2026-08-01', new Map(), { MO: 2, Registrar: 1, EC_COSMO: 1, OT_COSMO: 1 })
    expect(summary.every(s => s.count === 0 && !s.atCap)).toBe(true)
  })
})

describe('checkApprovalCapacityImpact', () => {
  const maxByColumnKey = { MO: 2, Registrar: 1, EC_COSMO: 1, OT_COSMO: 1 }

  it('is not applicable for a category with no capacity column (e.g. Consultant)', () => {
    const request = { date_from: '2026-08-12', date_to: '2026-08-12', profiles: { category: 'Consultant' } }
    expect(checkApprovalCapacityImpact(request, [], maxByColumnKey, 3)).toEqual({ applicable: false })
  })

  it('flags a column breach when another Registrar already occupies the only slot', () => {
    const request = { date_from: '2026-08-12', date_to: '2026-08-13', profiles: { category: 'Registrar' } }
    const otherRows = [
      { profile_id: 'other', date_from: '2026-08-12', date_to: '2026-08-13', profiles: { category: 'Registrar' } },
    ]
    const result = checkApprovalCapacityImpact(request, otherRows, maxByColumnKey, 3)
    expect(result.applicable).toBe(true)
    expect(result.columnBreach).toBe(true)
    expect(result.columnBreachDates).toEqual(['2026-08-12', '2026-08-13'])
  })

  it('does not flag a breach when the column still has room', () => {
    const request = { date_from: '2026-08-12', date_to: '2026-08-12', profiles: { category: 'MO' } }
    const otherRows = [
      { profile_id: 'other', date_from: '2026-08-12', date_to: '2026-08-12', profiles: { category: 'MO' } },
    ]
    // MO cap is 2, one other MO already on it — this one still fits.
    const result = checkApprovalCapacityImpact(request, otherRows, maxByColumnKey, 3)
    expect(result.columnBreach).toBe(false)
  })

  it('flags the full-time aggregate breach for a full-time-group column even when its own column cap is fine', () => {
    const request = { date_from: '2026-08-12', date_to: '2026-08-12', profiles: { category: 'MO' } }
    // MO cap 2 (fine: 1 other + this one = 2), but full-time aggregate cap is 1
    // and one EC COSMO/Intern is already on it — approving this MO would make 2.
    const otherRows = [
      { profile_id: 'other-mo', date_from: '2026-08-12', date_to: '2026-08-12', profiles: { category: 'MO' } },
      { profile_id: 'other-cosmo', date_from: '2026-08-12', date_to: '2026-08-12', profiles: { category: 'COSMO' } },
    ]
    const result = checkApprovalCapacityImpact(request, otherRows, maxByColumnKey, 1)
    expect(result.columnBreach).toBe(false)
    expect(result.fullTimeBreach).toBe(true)
  })

  it('does not check the full-time aggregate for OT COSMO/Intern — it is a separate pool', () => {
    const request = { date_from: '2026-08-12', date_to: '2026-08-12', profiles: { category: 'OT_COSMO' } }
    const result = checkApprovalCapacityImpact(request, [], maxByColumnKey, 0) // maxTotal 0: any addition would breach if OT_COSMO were included
    expect(result.fullTimeBreach).toBe(false)
  })
})
