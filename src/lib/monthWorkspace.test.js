import { describe, it, expect } from 'vitest'
import {
  dayEntriesByColumn, dayCapacitySummary, checkApprovalCapacityImpact, daysWithRoomForCategory, categoryPressureState,
  myCategoryDaySlots, myCategoryCapacityStateForDate, myCategoryLegendStates, slotsForColumnOnDate, bannerStateForSlots,
} from './monthWorkspace'

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
    const maxByColumnKey = { MO: 2, Registrar: 1, EC_Intern: 1, OT_Intern: 1 }

    const summary = dayCapacitySummary('2026-08-12', counts, maxByColumnKey)
    const mo = summary.find(s => s.key === 'MO')
    const registrar = summary.find(s => s.key === 'Registrar')
    expect(mo).toEqual({ key: 'MO', label: 'MO', count: 1, max: 2, atCap: false })
    expect(registrar).toEqual({ key: 'Registrar', label: 'Registrar', count: 1, max: 1, atCap: true })
  })

  it('reports zero counts for a date with nothing on record', () => {
    const summary = dayCapacitySummary('2026-08-01', new Map(), { MO: 2, Registrar: 1, EC_Intern: 1, OT_Intern: 1 })
    expect(summary.every(s => s.count === 0 && !s.atCap)).toBe(true)
  })
})

describe('checkApprovalCapacityImpact', () => {
  const maxByColumnKey = { MO: 2, Registrar: 1, EC_Intern: 1, OT_Intern: 1 }

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
    const request = { date_from: '2026-08-12', date_to: '2026-08-12', profiles: { category: 'OT_Intern' } }
    const result = checkApprovalCapacityImpact(request, [], maxByColumnKey, 0) // maxTotal 0: any addition would breach if OT_Intern were included
    expect(result.applicable).toBe(true) // its own column cap still applies
    expect(result.fullTimeBreach).toBe(false)
  })
})

describe('daysWithRoomForCategory', () => {
  const maxByColumnKey = { MO: 2, Registrar: 1, EC_Intern: 2, OT_Intern: 1 }
  const maxFullTime = 2

  it('counts days in the month where the shared full-time pool is still under its combined cap', () => {
    // August 2026 has 31 days; MO alone hits the combined full-time cap (2) on the 10th and 11th only.
    const countByColumnPerDate = new Map([
      ['2026-08-10', new Map([['MO', 2]])],
      ['2026-08-11', new Map([['MO', 2]])],
    ])
    const result = daysWithRoomForCategory(2026, 8, 'MO', maxByColumnKey, maxFullTime, countByColumnPerDate)
    expect(result).toEqual({ withRoom: 29, total: 31 })
  })

  it('a different category filling the shared pool still counts as no room for this one — the bug this replaced', () => {
    // 1 MO + 1 Registrar already exhausts the combined full-time pool (2), even
    // though MO's own historical column count (1) is under MO's own old max (2).
    const countByColumnPerDate = new Map([
      ['2026-08-10', new Map([['MO', 1], ['Registrar', 1]])],
    ])
    const result = daysWithRoomForCategory(2026, 8, 'MO', maxByColumnKey, maxFullTime, countByColumnPerDate)
    expect(result).toEqual({ withRoom: 30, total: 31 })
  })

  it('OT COSMO/Intern is unaffected by the full-time pool filling up — it has its own independent cap', () => {
    const countByColumnPerDate = new Map([
      ['2026-08-10', new Map([['MO', 1], ['Registrar', 1]])], // full-time pool full, OT untouched
    ])
    const result = daysWithRoomForCategory(2026, 8, 'OT_Intern', maxByColumnKey, maxFullTime, countByColumnPerDate)
    expect(result).toEqual({ withRoom: 31, total: 31 })
  })

  it('returns null for a category with no capacity column', () => {
    expect(daysWithRoomForCategory(2026, 8, 'Other', maxByColumnKey, maxFullTime, new Map())).toBeNull()
  })
})

describe('categoryPressureState', () => {
  const maxByColumnKey = { MO: 2, Registrar: 1, EC_Intern: 2, OT_Intern: 1 }
  const maxFullTime = 2

  it('is "Available" when the shared pool never hits its combined cap all month', () => {
    const state = categoryPressureState(2026, 8, 'MO', maxByColumnKey, maxFullTime, new Map())
    expect(state.label).toBe('Available')
  })

  it('is "At capacity" when the shared full-time pool is at its combined cap every day of the month', () => {
    const countByColumnPerDate = new Map(
      Array.from({ length: 31 }, (_, i) => [`2026-08-${String(i + 1).padStart(2, '0')}`, new Map([['Registrar', 1], ['EC_Intern', 1]])])
    )
    const state = categoryPressureState(2026, 8, 'Registrar', maxByColumnKey, maxFullTime, countByColumnPerDate)
    expect(state.label).toBe('At capacity')
  })

  it('returns null for a category with no capacity column', () => {
    expect(categoryPressureState(2026, 8, 'Other', maxByColumnKey, maxFullTime, new Map())).toBeNull()
  })
})

describe('myCategoryDaySlots', () => {
  const maxFullTime = 2

  it('sums the shared full-time pool across MO/Registrar/EC COSMO, not just the viewer\'s own column', () => {
    const capacity = [
      { key: 'MO', count: 1, max: 2 },
      { key: 'Registrar', count: 1, max: 1 },
      { key: 'EC_Intern', count: 0, max: 2 },
      { key: 'OT_Intern', count: 0, max: 1 },
    ]
    expect(myCategoryDaySlots('MO', capacity, maxFullTime)).toEqual({ taken: 2, max: 2 })
    expect(myCategoryDaySlots('Registrar', capacity, maxFullTime)).toEqual({ taken: 2, max: 2 })
    expect(myCategoryDaySlots('EC_Intern', capacity, maxFullTime)).toEqual({ taken: 2, max: 2 })
  })

  it('OT COSMO/Intern reads its own independent column, unaffected by the full-time pool', () => {
    const capacity = [
      { key: 'MO', count: 2, max: 2 },
      { key: 'Registrar', count: 0, max: 1 },
      { key: 'EC_Intern', count: 0, max: 2 },
      { key: 'OT_Intern', count: 0, max: 1 },
    ]
    expect(myCategoryDaySlots('OT_Intern', capacity, maxFullTime)).toEqual({ taken: 0, max: 1 })
  })

  it('returns null for a category with no capacity column (Other/Consultant)', () => {
    const capacity = [{ key: 'MO', count: 0, max: 2 }]
    expect(myCategoryDaySlots('Other', capacity, maxFullTime)).toBeNull()
  })
})

describe('myCategoryCapacityStateForDate', () => {
  const maxByColumnKey = { MO: 2, Registrar: 1, EC_Intern: 2, OT_Intern: 1 }
  const maxFullTime = 2

  it('a full-time viewer (MO/Registrar/EC COSMO): 0 taken in the shared pool is "Available"', () => {
    const state = myCategoryCapacityStateForDate('2026-08-10', 'MO', maxByColumnKey, maxFullTime, new Map())
    expect(state.label).toBe('Available')
  })

  it('a full-time viewer: 1 taken (by any full-time category) is "Limited", not "Near capacity"', () => {
    const countByColumnPerDate = new Map([['2026-08-10', new Map([['Registrar', 1]])]])
    const state = myCategoryCapacityStateForDate('2026-08-10', 'MO', maxByColumnKey, maxFullTime, countByColumnPerDate)
    expect(state.label).toBe('Limited')
  })

  it('a full-time viewer: 2 taken (the shared pool full) is "At capacity"', () => {
    const countByColumnPerDate = new Map([['2026-08-10', new Map([['MO', 1], ['EC_Intern', 1]])]])
    const state = myCategoryCapacityStateForDate('2026-08-10', 'MO', maxByColumnKey, maxFullTime, countByColumnPerDate)
    expect(state.label).toBe('At capacity')
  })

  it('an OT COSMO/Intern viewer jumps straight from "Available" to "At capacity" — no middle state', () => {
    const empty = myCategoryCapacityStateForDate('2026-08-10', 'OT_Intern', maxByColumnKey, maxFullTime, new Map())
    expect(empty.label).toBe('Available')

    const countByColumnPerDate = new Map([['2026-08-10', new Map([['OT_Intern', 1]])]])
    const full = myCategoryCapacityStateForDate('2026-08-10', 'OT_Intern', maxByColumnKey, maxFullTime, countByColumnPerDate)
    expect(full.label).toBe('At capacity')
  })
})

describe('myCategoryLegendStates', () => {
  it('lists 3 states for a full-time category — Available, Limited, At capacity', () => {
    expect(myCategoryLegendStates('MO').map(s => s.label)).toEqual(['Available', 'Limited', 'At capacity'])
    expect(myCategoryLegendStates('Registrar').map(s => s.label)).toEqual(['Available', 'Limited', 'At capacity'])
    expect(myCategoryLegendStates('EC_Intern').map(s => s.label)).toEqual(['Available', 'Limited', 'At capacity'])
  })

  it('lists 2 states for OT COSMO/Intern — no middle "Limited" state, since it only has 1 slot', () => {
    expect(myCategoryLegendStates('OT_Intern').map(s => s.label)).toEqual(['Available', 'At capacity'])
  })
})

describe('slotsForColumnOnDate', () => {
  const maxByColumnKey = { OT_Intern: 1 }
  const maxFullTime = 2

  it('sums the shared full-time pool across MO/Registrar/EC COSMO for a full-time-group column', () => {
    const countByColumnPerDateMap = new Map([['2026-08-10', new Map([['MO', 1], ['Registrar', 1]])]])
    expect(slotsForColumnOnDate('2026-08-10', 'MO', maxByColumnKey, maxFullTime, countByColumnPerDateMap)).toEqual({ taken: 2, max: 2 })
  })

  it('reads OT COSMO/Intern from its own column, unaffected by the full-time pool', () => {
    const countByColumnPerDateMap = new Map([['2026-08-10', new Map([['MO', 2]])]])
    expect(slotsForColumnOnDate('2026-08-10', 'OT_Intern', maxByColumnKey, maxFullTime, countByColumnPerDateMap)).toEqual({ taken: 0, max: 1 })
  })

  it('treats a date with no entries as zero taken', () => {
    expect(slotsForColumnOnDate('2026-08-10', 'MO', maxByColumnKey, maxFullTime, new Map())).toEqual({ taken: 0, max: 2 })
  })
})

describe('bannerStateForSlots', () => {
  it('is "Available" when nothing is taken', () => {
    expect(bannerStateForSlots({ taken: 0, max: 2 }).label).toBe('Available')
  })

  it('is "Near capacity" (not "Limited") once at least one slot is taken but room remains', () => {
    // The banner reads as "should I even try" — 1 of 2 taken already reads
    // as tightening up, unlike the day-cell fill's more lenient "Limited".
    expect(bannerStateForSlots({ taken: 1, max: 2 }).label).toBe('Near capacity')
  })

  it('is "At capacity" once taken reaches max', () => {
    expect(bannerStateForSlots({ taken: 2, max: 2 }).label).toBe('At capacity')
  })

  it('is "At capacity" for a 1-slot pool with no middle state, same as OT COSMO/Intern elsewhere', () => {
    expect(bannerStateForSlots({ taken: 0, max: 1 }).label).toBe('Available')
    expect(bannerStateForSlots({ taken: 1, max: 1 }).label).toBe('At capacity')
  })
})
