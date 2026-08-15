import { describe, it, expect } from 'vitest'
import {
  groupForCategory, saturdaysInRange, groupEntriesByWeekend, computeWeekendPlannerDrift,
  saturdaysInMonth, nextWeekendSaturday, weekendCoverageSummary, isProfileAssignedToWeekend,
  isEvenWeekend, weekendExceptionRequestsBySaturday, weekendHealthState, planWeekendPaste,
  planWeekendPasteAcrossMonths, planBatchRestore, resolveEffectiveCategory, resolveWeekendCategoryForDoctor,
} from './weekendPlanner'

describe('groupForCategory', () => {
  it('maps finer categories down to the 4 rotation groups', () => {
    expect(groupForCategory('MO')).toBe('MO')
    expect(groupForCategory('Registrar')).toBe('Registrar')
    expect(groupForCategory('COSMO')).toBe('COSMO')
    expect(groupForCategory('EC_Intern')).toBe('COSMO')
    expect(groupForCategory('EC_COSMO_Intern')).toBe('COSMO')
    expect(groupForCategory('Intern')).toBe('COSMO')
    expect(groupForCategory('COSMOPsych')).toBe('COSMOPsych')
    expect(groupForCategory('OT_Intern')).toBe('COSMOPsych')
    expect(groupForCategory('OT_COSMO_Intern')).toBe('COSMOPsych')
  })

  it('returns null for categories that never rotate weekends', () => {
    expect(groupForCategory('Consultant')).toBeNull()
    expect(groupForCategory('Locum')).toBeNull()
    expect(groupForCategory(null)).toBeNull()
    expect(groupForCategory(undefined)).toBeNull()
  })
})

describe('saturdaysInRange', () => {
  it('lists every Saturday in range starting from a Saturday', () => {
    expect(saturdaysInRange('2026-08-01', '2026-08-22')).toEqual([
      '2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22',
    ])
  })

  it('advances to the first Saturday on or after a non-Saturday start', () => {
    // 2026-08-03 is a Monday
    expect(saturdaysInRange('2026-08-03', '2026-08-16')).toEqual([
      '2026-08-08', '2026-08-15',
    ])
  })

  it('returns an empty list when no Saturday falls in range', () => {
    expect(saturdaysInRange('2026-08-03', '2026-08-04')).toEqual([])
  })
})

describe('groupEntriesByWeekend', () => {
  it('groups entries by weekend then by category group', () => {
    const entries = [
      { id: '1', weekend_saturday: '2026-08-01', profile_id: 'p1', category: 'MO' },
      { id: '2', weekend_saturday: '2026-08-01', profile_id: 'p2', category: 'EC_COSMO_Intern' },
      { id: '3', weekend_saturday: '2026-08-08', profile_id: 'p3', category: 'Registrar' },
    ]
    const grouped = groupEntriesByWeekend(entries)
    expect(grouped.get('2026-08-01').MO).toEqual([entries[0]])
    expect(grouped.get('2026-08-01').COSMO).toEqual([entries[1]])
    expect(grouped.get('2026-08-08').Registrar).toEqual([entries[2]])
  })

  it('drops entries in a category with no rotation group', () => {
    const entries = [{ id: '1', weekend_saturday: '2026-08-01', profile_id: 'p1', category: 'Consultant' }]
    const grouped = groupEntriesByWeekend(entries)
    expect(grouped.size).toBe(0)
  })
})

describe('saturdaysInMonth', () => {
  it('lists every Saturday landing in the given calendar month', () => {
    // 2026-08-01 is a Saturday
    expect(saturdaysInMonth(2026, 8)).toEqual(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'])
  })

  it('advances to the first Saturday on/after the 1st for a month that doesn\'t start on one', () => {
    // 2026-09-01 is a Tuesday
    expect(saturdaysInMonth(2026, 9)).toEqual(['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'])
  })
})

describe('nextWeekendSaturday', () => {
  it('returns the same date when it is already a Saturday', () => {
    expect(nextWeekendSaturday('2026-08-01')).toBe('2026-08-01')
  })

  it('advances to the next Saturday from a Sunday (not back to the day before)', () => {
    expect(nextWeekendSaturday('2026-08-02')).toBe('2026-08-08')
  })

  it('advances to the first Saturday on/after a midweek date', () => {
    expect(nextWeekendSaturday('2026-08-03')).toBe('2026-08-08') // Monday
  })
})

describe('weekendCoverageSummary', () => {
  it('reports open groups for a partially covered weekend', () => {
    const summary = weekendCoverageSummary({
      MO: [{ profile_id: 'p1' }],
      COSMO: [{ profile_id: 'p2' }],
    })
    expect(summary).toEqual({ filledGroups: 2, totalGroups: 4, openGroups: ['Registrar', 'COSMOPsych'] })
  })

  it('reports every group open for an empty weekend', () => {
    expect(weekendCoverageSummary({})).toEqual({
      filledGroups: 0, totalGroups: 4, openGroups: ['MO', 'Registrar', 'COSMO', 'COSMOPsych'],
    })
  })

  it('handles undefined (no entries fetched for this weekend at all)', () => {
    expect(weekendCoverageSummary(undefined).filledGroups).toBe(0)
  })
})

describe('weekendHealthState', () => {
  it('is red when no group is filled', () => {
    expect(weekendHealthState({})).toBe('red')
    expect(weekendHealthState(undefined)).toBe('red')
  })

  it('is amber when some but not all groups are filled', () => {
    expect(weekendHealthState({ MO: [{ profile_id: 'p1' }] })).toBe('amber')
  })

  it('is green when every group is filled', () => {
    expect(weekendHealthState({
      MO: [{ profile_id: 'p1' }], Registrar: [{ profile_id: 'p2' }],
      COSMO: [{ profile_id: 'p3' }], COSMOPsych: [{ profile_id: 'p4' }],
    })).toBe('green')
  })
})

describe('isProfileAssignedToWeekend', () => {
  it('finds a profile assigned to any group', () => {
    const bySaturday = { MO: [{ profile_id: 'p1' }], Registrar: [{ profile_id: 'p2' }] }
    expect(isProfileAssignedToWeekend(bySaturday, 'p2')).toBe(true)
  })

  it('returns false when the profile is not assigned that weekend', () => {
    const bySaturday = { MO: [{ profile_id: 'p1' }] }
    expect(isProfileAssignedToWeekend(bySaturday, 'p2')).toBe(false)
  })

  it('returns false for an undefined weekend (nothing planned yet)', () => {
    expect(isProfileAssignedToWeekend(undefined, 'p2')).toBe(false)
  })
})

describe('isEvenWeekend', () => {
  it('alternates strictly between consecutive Saturdays', () => {
    // 2026-08-01 is a Saturday
    const results = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].map(isEvenWeekend)
    expect(results[0]).not.toBe(results[1])
    expect(results[1]).not.toBe(results[2])
    expect(results[2]).not.toBe(results[3])
  })

  it('is stable/deterministic for the same date', () => {
    expect(isEvenWeekend('2026-08-01')).toBe(isEvenWeekend('2026-08-01'))
  })
})

describe('weekendExceptionRequestsBySaturday', () => {
  it('maps each request to its weekend by date_from', () => {
    const requests = [
      { id: 'r1', date_from: '2026-08-01', status: 'pending' },
      { id: 'r2', date_from: '2026-08-08', status: 'approved' },
    ]
    const map = weekendExceptionRequestsBySaturday(requests)
    expect(map.get('2026-08-01')).toEqual(requests[0])
    expect(map.get('2026-08-08')).toEqual(requests[1])
    expect(map.has('2026-08-15')).toBe(false)
  })

  it('returns an empty map for no requests', () => {
    expect(weekendExceptionRequestsBySaturday([]).size).toBe(0)
  })
})

describe('computeWeekendPlannerDrift', () => {
  const shiftTypeCodes = { 'st-we08': 'WE_08', 'st-we20': 'WE_20', 'st-wd08': 'WD_08' }

  it('finds no drift when the draft matches the planner exactly', () => {
    const rosterEntries = [
      { profile_id: 'p1', date: '2026-08-01', shift_type_id: 'st-we08' },
      { profile_id: 'p2', date: '2026-08-02', shift_type_id: 'st-we20' },
    ]
    const plannerEntries = [
      { weekend_saturday: '2026-08-01', profile_id: 'p1' },
      { weekend_saturday: '2026-08-01', profile_id: 'p2' },
    ]
    expect(computeWeekendPlannerDrift(rosterEntries, plannerEntries, shiftTypeCodes)).toEqual([])
  })

  it('flags a doctor added to the planner after the draft was generated', () => {
    const rosterEntries = [
      { profile_id: 'p1', date: '2026-08-01', shift_type_id: 'st-we08' },
    ]
    const plannerEntries = [
      { weekend_saturday: '2026-08-01', profile_id: 'p1' },
      { weekend_saturday: '2026-08-01', profile_id: 'p2' },
    ]
    expect(computeWeekendPlannerDrift(rosterEntries, plannerEntries, shiftTypeCodes)).toEqual([
      { saturday: '2026-08-01', added: ['p2'], removed: [] },
    ])
  })

  it('flags a doctor removed from the planner after the draft was generated', () => {
    const rosterEntries = [
      { profile_id: 'p1', date: '2026-08-01', shift_type_id: 'st-we08' },
      { profile_id: 'p2', date: '2026-08-02', shift_type_id: 'st-we20' },
    ]
    const plannerEntries = [
      { weekend_saturday: '2026-08-01', profile_id: 'p1' },
    ]
    expect(computeWeekendPlannerDrift(rosterEntries, plannerEntries, shiftTypeCodes)).toEqual([
      { saturday: '2026-08-01', added: [], removed: ['p2'] },
    ])
  })

  it('ignores non-weekend shift codes and locum placeholders (null profile_id)', () => {
    const rosterEntries = [
      { profile_id: null, date: '2026-08-01', shift_type_id: 'st-we08' },
      { profile_id: 'p1', date: '2026-08-03', shift_type_id: 'st-wd08' },
    ]
    const plannerEntries = []
    expect(computeWeekendPlannerDrift(rosterEntries, plannerEntries, shiftTypeCodes)).toEqual([])
  })
})

// A date exactly `weeks` weeks from `dateStr` — an EVEN weeks shift always
// preserves isEvenWeekend parity (each week shifts the underlying
// days-since-epoch/7 count by exactly 1), which several tests below use to
// build a single source weekend guaranteed to share its target's parity
// without hand-computing/hardcoding which real dates are odd vs even.
function shiftWeeks(dateStr, weeks) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

describe('planWeekendPaste', () => {
  const targetSaturdays = ['2026-05-02', '2026-05-09', '2026-05-16', '2026-05-23']
  // Same parity as targetSaturdays[0] (2 weeks earlier) — the single-source
  // tests below all use this so a source weekend lands on targetSaturdays[0]
  // exactly like before parity-based matching existed.
  const sourceSaturday = shiftWeeks(targetSaturdays[0], -2)

  it('fill-empty mode: inserts every copied entry into an empty target weekend', () => {
    const sourceWeekends = [
      { saturday: sourceSaturday, entries: [{ groupKey: 'MO', profileId: 'p1', category: 'MO' }, { groupKey: 'Registrar', profileId: 'p2', category: 'Registrar' }] },
    ]
    const plan = planWeekendPaste({
      sourceWeekends, targetSaturdays, existingByWeekend: new Map(),
      activeDoctorIds: new Set(['p1', 'p2']), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual([
      { weekendSaturday: '2026-05-02', groupKey: 'MO', profileId: 'p1', category: 'MO' },
      { weekendSaturday: '2026-05-02', groupKey: 'Registrar', profileId: 'p2', category: 'Registrar' },
    ])
    expect(plan.toDelete).toEqual([])
    expect(plan.skipped).toEqual([])
    expect(plan.unmatchedSourceCount).toBe(0)
  })

  it('fill-empty mode: skips a group that already has someone assigned in the target, leaving other groups untouched', () => {
    const sourceWeekends = [
      { saturday: sourceSaturday, entries: [{ groupKey: 'MO', profileId: 'p1', category: 'MO' }, { groupKey: 'Registrar', profileId: 'p2', category: 'Registrar' }] },
    ]
    const existingByWeekend = new Map([
      ['2026-05-02', { MO: [{ id: 'e9', profile_id: 'p9', category: 'MO' }] }],
    ])
    const plan = planWeekendPaste({
      sourceWeekends, targetSaturdays, existingByWeekend,
      activeDoctorIds: new Set(['p1', 'p2']), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual([
      { weekendSaturday: '2026-05-02', groupKey: 'Registrar', profileId: 'p2', category: 'Registrar' },
    ])
    expect(plan.toDelete).toEqual([])
    expect(plan.skipped).toEqual([]) // a filled-group skip isn't a "skipped" anomaly, so it doesn't appear here
  })

  it('overwrite mode: deletes every existing entry on the target weekend and inserts the full copied set', () => {
    const sourceWeekends = [
      { saturday: sourceSaturday, entries: [{ groupKey: 'MO', profileId: 'p1', category: 'MO' }] },
    ]
    const existing = { id: 'e9', weekend_saturday: '2026-05-02', profile_id: 'p9', category: 'Registrar' }
    const existingByWeekend = new Map([['2026-05-02', { Registrar: [existing] }]])
    const plan = planWeekendPaste({
      sourceWeekends, targetSaturdays, existingByWeekend,
      activeDoctorIds: new Set(['p1']), mode: 'overwrite',
    })
    expect(plan.toDelete).toEqual([existing])
    expect(plan.toInsert).toEqual([{ weekendSaturday: '2026-05-02', groupKey: 'MO', profileId: 'p1', category: 'MO' }])
  })

  it('overwrite mode: a copied profile can land even where they were previously assigned to a different group (that entry is being deleted anyway)', () => {
    const sourceWeekends = [{ saturday: sourceSaturday, entries: [{ groupKey: 'Registrar', profileId: 'p1', category: 'Registrar' }] }]
    const existingByWeekend = new Map([
      ['2026-05-02', { MO: [{ id: 'e1', weekend_saturday: '2026-05-02', profile_id: 'p1', category: 'MO' }] }],
    ])
    const plan = planWeekendPaste({
      sourceWeekends, targetSaturdays, existingByWeekend,
      activeDoctorIds: new Set(['p1']), mode: 'overwrite',
    })
    expect(plan.toInsert).toEqual([{ weekendSaturday: '2026-05-02', groupKey: 'Registrar', profileId: 'p1', category: 'Registrar' }])
    expect(plan.skipped).toEqual([])
  })

  it('skips a copied doctor who is no longer active', () => {
    const sourceWeekends = [{ saturday: sourceSaturday, entries: [{ groupKey: 'MO', profileId: 'p1', category: 'MO' }] }]
    const plan = planWeekendPaste({
      sourceWeekends, targetSaturdays, existingByWeekend: new Map(),
      activeDoctorIds: new Set(), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual([])
    expect(plan.skipped).toEqual([{ reason: 'inactive', weekendIndex: 0, groupKey: 'MO', profileId: 'p1' }])
  })

  it('skips a copied doctor already assigned to a different group on the target weekend', () => {
    const sourceWeekends = [{ saturday: sourceSaturday, entries: [{ groupKey: 'Registrar', profileId: 'p1', category: 'Registrar' }] }]
    const existingByWeekend = new Map([
      ['2026-05-02', { MO: [{ id: 'e1', profile_id: 'p1', category: 'MO' }] }],
    ])
    const plan = planWeekendPaste({
      sourceWeekends, targetSaturdays, existingByWeekend,
      activeDoctorIds: new Set(['p1']), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual([])
    expect(plan.skipped).toEqual([{ reason: 'already-assigned', weekendIndex: 0, groupKey: 'Registrar', profileId: 'p1' }])
  })

  it('matches by real calendar parity, not raw position — a 5-Saturday source month copied onto a 4-Saturday target keeps each group on the correct doctors', () => {
    // Mirrors the actual reported bug: August 2026 has 5 Saturdays (1, 8,
    // 15, 22, 29), September 2026 has 4 (5, 12, 19, 26) — the extra
    // Saturday shifts which index is odd/even between the two months, so
    // naive position-mapping (source[i] -> target[i]) put the wrong group
    // on every single September weekend.
    const augSaturdays = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29']
    const sepSaturdays = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']
    const augFirstIsEven = isEvenWeekend(augSaturdays[0])

    // Group A works every Saturday of augSaturdays[0]'s own parity (3 of
    // the 5); Group B works the other parity (the remaining 2) — whichever
    // those actually are, isEvenWeekend decides, not this test.
    const sourceWeekends = augSaturdays.map(saturday => {
      const isGroupA = isEvenWeekend(saturday) === augFirstIsEven
      return { saturday, entries: [{ groupKey: isGroupA ? 'MO' : 'Registrar', profileId: isGroupA ? 'groupA' : 'groupB', category: isGroupA ? 'MO' : 'Registrar' }] }
    })

    const plan = planWeekendPaste({
      sourceWeekends, targetSaturdays: sepSaturdays, existingByWeekend: new Map(),
      activeDoctorIds: new Set(['groupA', 'groupB']), mode: 'fill-empty',
    })

    // Every inserted entry lands on a September Saturday of the SAME
    // parity as the doctor's own group actually worked in August.
    expect(plan.toInsert.length).toBeGreaterThan(0)
    for (const insert of plan.toInsert) {
      const shouldBeEven = insert.profileId === 'groupA' ? augFirstIsEven : !augFirstIsEven
      expect(isEvenWeekend(insert.weekendSaturday)).toBe(shouldBeEven)
    }
    // 5 source weekends, 4 targets — one parity's extra weekend has nowhere
    // to land.
    expect(plan.unmatchedSourceCount).toBe(1)
  })

  it('a single copied weekend (weekend granularity) pastes onto the specific chosen target regardless of parity', () => {
    // Adjacent Saturdays are always opposite parity — copying one specific
    // weekend and pasting it one week over is an extremely common case,
    // and must still work: there's no ambiguity to resolve for a single
    // source weekend, so parity bucketing doesn't apply to it at all.
    const source = '2026-08-01'
    const target = '2026-08-08' // guaranteed opposite parity from source
    expect(isEvenWeekend(source)).not.toBe(isEvenWeekend(target))

    const plan = planWeekendPaste({
      sourceWeekends: [{ saturday: source, entries: [{ groupKey: 'MO', profileId: 'p1', category: 'MO' }] }],
      targetSaturdays: [target], existingByWeekend: new Map(), activeDoctorIds: new Set(['p1']), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual([{ weekendSaturday: target, groupKey: 'MO', profileId: 'p1', category: 'MO' }])
    expect(plan.unmatchedSourceCount).toBe(0)
  })

  it("drops source weekends beyond the target's same-parity length, without erroring", () => {
    const sourceWeekends = [0, 1, 2, 3, 4].map(i => ({
      saturday: shiftWeeks(sourceSaturday, i),
      entries: i === 4 ? [{ groupKey: 'MO', profileId: 'p1', category: 'MO' }] : [], // 5th weekend, no matching same-parity target
    }))
    const plan = planWeekendPaste({
      sourceWeekends, targetSaturdays, existingByWeekend: new Map(),
      activeDoctorIds: new Set(['p1']), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual([])
    expect(plan.unmatchedSourceCount).toBe(1)
  })

  it('within one target weekend, a profile copied into two groups only lands in the first (defensive dedupe)', () => {
    const sourceWeekends = [{
      saturday: sourceSaturday,
      entries: [
        { groupKey: 'MO', profileId: 'p1', category: 'MO' },
        { groupKey: 'Registrar', profileId: 'p1', category: 'Registrar' },
      ],
    }]
    const plan = planWeekendPaste({
      sourceWeekends, targetSaturdays, existingByWeekend: new Map(),
      activeDoctorIds: new Set(['p1']), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual([{ weekendSaturday: '2026-05-02', groupKey: 'MO', profileId: 'p1', category: 'MO' }])
    expect(plan.skipped).toEqual([{ reason: 'already-assigned', weekendIndex: 0, groupKey: 'Registrar', profileId: 'p1' }])
  })
})

describe('planWeekendPasteAcrossMonths', () => {
  it('weekend granularity: a single source weekend maps onto a single target weekend', () => {
    const targetSaturday = '2026-05-02'
    const sourceMonths = [[{ saturday: shiftWeeks(targetSaturday, -2), entries: [{ groupKey: 'MO', profileId: 'p1', category: 'MO' }] }]]
    const targetMonths = [[targetSaturday]]
    const plan = planWeekendPasteAcrossMonths({
      sourceMonths, targetMonths, existingByWeekend: new Map(), activeDoctorIds: new Set(['p1']), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual([{ weekendSaturday: '2026-05-02', groupKey: 'MO', profileId: 'p1', category: 'MO' }])
    expect(plan.unmatchedSourceCount).toBe(0)
  })

  it('month granularity: behaves exactly like a single call to planWeekendPaste', () => {
    const targetSaturdays = ['2026-05-02', '2026-05-09']
    const sourceMonths = [[
      { saturday: shiftWeeks(targetSaturdays[0], -2), entries: [{ groupKey: 'MO', profileId: 'p1', category: 'MO' }] },
      { saturday: shiftWeeks(targetSaturdays[1], -2), entries: [{ groupKey: 'MO', profileId: 'p2', category: 'MO' }] },
    ]]
    const targetMonths = [targetSaturdays]
    const plan = planWeekendPasteAcrossMonths({
      sourceMonths, targetMonths, existingByWeekend: new Map(), activeDoctorIds: new Set(['p1', 'p2']), mode: 'fill-empty',
    })
    expect(plan.toInsert.map(e => e.weekendSaturday).sort()).toEqual([...targetSaturdays].sort())
  })

  it('quarter granularity: each month is matched against the SAME-INDEX target month only, never flattened across the quarter', () => {
    // Month 1 (Jan) has 2 weekends, month 2 (Feb) has 1 — a flattened
    // cross-month index would slide Feb's paste into March's target slot;
    // per-month mapping keeps Feb -> Feb regardless.
    const targetMonths = [
      ['2026-04-04', '2026-04-11'], // April (month 1 of target quarter)
      ['2026-05-02'], // May (month 2)
      ['2026-06-06'], // June (month 3)
    ]
    const sourceMonths = [
      [
        { saturday: shiftWeeks(targetMonths[0][0], -2), entries: [{ groupKey: 'MO', profileId: 'jan1', category: 'MO' }] },
        { saturday: shiftWeeks(targetMonths[0][1], -2), entries: [{ groupKey: 'MO', profileId: 'jan2', category: 'MO' }] },
      ],
      [
        { saturday: shiftWeeks(targetMonths[1][0], -2), entries: [{ groupKey: 'MO', profileId: 'feb1', category: 'MO' }] },
      ],
      [
        { saturday: shiftWeeks(targetMonths[2][0], -2), entries: [{ groupKey: 'MO', profileId: 'mar1', category: 'MO' }] },
      ],
    ]
    const plan = planWeekendPasteAcrossMonths({
      sourceMonths, targetMonths, existingByWeekend: new Map(),
      activeDoctorIds: new Set(['jan1', 'jan2', 'feb1', 'mar1']), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual(expect.arrayContaining([
      { weekendSaturday: '2026-04-04', groupKey: 'MO', profileId: 'jan1', category: 'MO' },
      { weekendSaturday: '2026-04-11', groupKey: 'MO', profileId: 'jan2', category: 'MO' },
      { weekendSaturday: '2026-05-02', groupKey: 'MO', profileId: 'feb1', category: 'MO' },
      { weekendSaturday: '2026-06-06', groupKey: 'MO', profileId: 'mar1', category: 'MO' },
    ]))
    expect(plan.toInsert).toHaveLength(4)
  })

  it('counts a whole dropped source month (quarter longer than the target) toward unmatchedSourceCount', () => {
    const targetMonths = [['2026-04-04']] // only one target month available
    const sourceMonths = [
      [{ saturday: shiftWeeks(targetMonths[0][0], -2), entries: [{ groupKey: 'MO', profileId: 'p1', category: 'MO' }] }],
      [
        { saturday: '2026-01-03', entries: [{ groupKey: 'MO', profileId: 'p2', category: 'MO' }] },
        { saturday: '2026-01-10', entries: [{ groupKey: 'MO', profileId: 'p3', category: 'MO' }] },
      ],
    ]
    const plan = planWeekendPasteAcrossMonths({
      sourceMonths, targetMonths, existingByWeekend: new Map(),
      activeDoctorIds: new Set(['p1', 'p2', 'p3']), mode: 'fill-empty',
    })
    expect(plan.toInsert).toEqual([{ weekendSaturday: '2026-04-04', groupKey: 'MO', profileId: 'p1', category: 'MO' }])
    expect(plan.unmatchedSourceCount).toBe(2) // the entire 2nd source month's weekends dropped wholesale
  })
})

describe('planBatchRestore', () => {
  it('restores a pure-remove batch (a Clear) by re-inserting every row', () => {
    const batchChanges = [
      { weekend_saturday: '2026-05-02', category: 'MO', profile_id: 'p1', action: 'remove' },
      { weekend_saturday: '2026-05-02', category: 'Registrar', profile_id: 'p2', action: 'remove' },
    ]
    const plan = planBatchRestore({ batchChanges, existingByWeekend: new Map(), activeDoctorIds: new Set(['p1', 'p2']) })
    expect(plan.toInsert).toEqual([
      { weekendSaturday: '2026-05-02', groupKey: 'MO', profileId: 'p1', category: 'MO' },
      { weekendSaturday: '2026-05-02', groupKey: 'Registrar', profileId: 'p2', category: 'Registrar' },
    ])
    expect(plan.toDelete).toEqual([])
  })

  it('restores a pure-add batch (a paste) by removing every row that\'s still there', () => {
    const stillThere = { id: 'e1', profile_id: 'p1', category: 'MO' }
    const batchChanges = [{ weekend_saturday: '2026-05-02', category: 'MO', profile_id: 'p1', action: 'add' }]
    const existingByWeekend = new Map([['2026-05-02', { MO: [stillThere] }]])
    const plan = planBatchRestore({ batchChanges, existingByWeekend, activeDoctorIds: new Set(['p1']) })
    expect(plan.toDelete).toEqual([stillThere])
    expect(plan.toInsert).toEqual([])
  })

  it('a no-longer-there add row is a silent no-op, not an error', () => {
    const batchChanges = [{ weekend_saturday: '2026-05-02', category: 'MO', profile_id: 'p1', action: 'add' }]
    const plan = planBatchRestore({ batchChanges, existingByWeekend: new Map(), activeDoctorIds: new Set(['p1']) })
    expect(plan.toDelete).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('restores a MIXED batch (an overwrite paste) correctly: re-inserts the removed rows AND removes the added rows', () => {
    const stillThere = { id: 'e9', profile_id: 'p3', category: 'Registrar' }
    const batchChanges = [
      { weekend_saturday: '2026-05-02', category: 'MO', profile_id: 'p1', action: 'remove' }, // was overwritten away
      { weekend_saturday: '2026-05-02', category: 'Registrar', profile_id: 'p3', action: 'add' }, // the overwrite's own insert
    ]
    const existingByWeekend = new Map([['2026-05-02', { Registrar: [stillThere] }]])
    const plan = planBatchRestore({ batchChanges, existingByWeekend, activeDoctorIds: new Set(['p1', 'p3']) })
    expect(plan.toInsert).toEqual([{ weekendSaturday: '2026-05-02', groupKey: 'MO', profileId: 'p1', category: 'MO' }])
    expect(plan.toDelete).toEqual([stillThere])
  })

  it('skips restoring a doctor no longer active', () => {
    const batchChanges = [{ weekend_saturday: '2026-05-02', category: 'MO', profile_id: 'p1', action: 'remove' }]
    const plan = planBatchRestore({ batchChanges, existingByWeekend: new Map(), activeDoctorIds: new Set() })
    expect(plan.toInsert).toEqual([])
    expect(plan.skipped).toEqual([{ reason: 'inactive', saturday: '2026-05-02', groupKey: 'MO', profileId: 'p1' }])
  })

  it('skips restoring a doctor already assigned to a different group on that weekend now', () => {
    const batchChanges = [{ weekend_saturday: '2026-05-02', category: 'Registrar', profile_id: 'p1', action: 'remove' }]
    const existingByWeekend = new Map([['2026-05-02', { MO: [{ id: 'e1', profile_id: 'p1', category: 'MO' }] }]])
    const plan = planBatchRestore({ batchChanges, existingByWeekend, activeDoctorIds: new Set(['p1']) })
    expect(plan.toInsert).toEqual([])
    expect(plan.skipped).toEqual([{ reason: 'already-assigned', saturday: '2026-05-02', groupKey: 'Registrar', profileId: 'p1' }])
  })

  it('silently (uncounted) skips restoring into a group someone else has since filled', () => {
    const batchChanges = [{ weekend_saturday: '2026-05-02', category: 'MO', profile_id: 'p1', action: 'remove' }]
    const existingByWeekend = new Map([['2026-05-02', { MO: [{ id: 'e2', profile_id: 'p9', category: 'MO' }] }]])
    const plan = planBatchRestore({ batchChanges, existingByWeekend, activeDoctorIds: new Set(['p1']) })
    expect(plan.toInsert).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('re-inserts multiple removed doctors in the same group on the same weekend (all absent from the live snapshot)', () => {
    const batchChanges = [
      { weekend_saturday: '2026-05-02', category: 'MO', profile_id: 'p1', action: 'remove' },
      { weekend_saturday: '2026-05-02', category: 'MO', profile_id: 'p2', action: 'remove' },
    ]
    const plan = planBatchRestore({ batchChanges, existingByWeekend: new Map(), activeDoctorIds: new Set(['p1', 'p2']) })
    expect(plan.toInsert).toEqual([
      { weekendSaturday: '2026-05-02', groupKey: 'MO', profileId: 'p1', category: 'MO' },
      { weekendSaturday: '2026-05-02', groupKey: 'MO', profileId: 'p2', category: 'MO' },
    ])
  })
})

describe('resolveEffectiveCategory', () => {
  it('passes through every non-ambiguous category unchanged and resolved', () => {
    for (const category of ['MO', 'Registrar', 'Consultant', 'Locum', 'COSMOPsych', 'EC_Intern', null, undefined]) {
      expect(resolveEffectiveCategory({ category, profileId: 'p1', targetDate: '2026-08-15', rotationsByDoctorId: new Map() }))
        .toEqual({ category: category ?? null, resolved: true })
    }
  })

  // Real boundary case (doctor 598ccb0a-2958-44ce-92d0-72d593746cf0,
  // "CodeSpace"): two OT rotations overlap for Aug 5-31 (2026-07-01 to
  // 2026-08-31, and 2026-08-05 onward with no end). The most-recently-
  // STARTED row must win, not array order.
  it('resolves the most recently started rotation when two rows overlap for the same date', () => {
    const rotationsByDoctorId = new Map([
      ['codespace', [
        { start_date: '2026-07-01', end_date: '2026-08-31', rotation_type: 'OT' },
        { start_date: '2026-08-05', end_date: null, rotation_type: 'OT' },
      ]],
    ])
    const result = resolveEffectiveCategory({
      category: 'Intern', profileId: 'codespace', targetDate: '2026-08-15', rotationsByDoctorId,
    })
    expect(result).toEqual({ category: 'OT_Intern', resolved: true })
  })

  it('picks the most-recently-started row even when it is listed first in the array', () => {
    const rotationsByDoctorId = new Map([
      ['p1', [
        { start_date: '2026-08-05', end_date: null, rotation_type: 'EC' }, // most recent, listed first
        { start_date: '2026-07-01', end_date: '2026-08-31', rotation_type: 'OT' },
      ]],
    ])
    expect(resolveEffectiveCategory({ category: 'Intern', profileId: 'p1', targetDate: '2026-08-15', rotationsByDoctorId }))
      .toEqual({ category: 'EC_Intern', resolved: true })
  })

  it('resolves an Intern with an EC rotation to EC_Intern', () => {
    const rotationsByDoctorId = new Map([['p1', [{ start_date: '2026-01-01', end_date: null, rotation_type: 'EC' }]]])
    expect(resolveEffectiveCategory({ category: 'Intern', profileId: 'p1', targetDate: '2026-08-15', rotationsByDoctorId }))
      .toEqual({ category: 'EC_Intern', resolved: true })
  })

  it('resolves a COSMO doctor with an EC rotation to EC_COSMO_Intern', () => {
    const rotationsByDoctorId = new Map([['p1', [{ start_date: '2026-01-01', end_date: null, rotation_type: 'EC' }]]])
    expect(resolveEffectiveCategory({ category: 'COSMO', profileId: 'p1', targetDate: '2026-08-15', rotationsByDoctorId }))
      .toEqual({ category: 'EC_COSMO_Intern', resolved: true })
  })

  it('resolves a COSMO doctor with an OT rotation to OT_COSMO_Intern', () => {
    const rotationsByDoctorId = new Map([['p1', [{ start_date: '2026-01-01', end_date: null, rotation_type: 'OT' }]]])
    expect(resolveEffectiveCategory({ category: 'COSMO', profileId: 'p1', targetDate: '2026-08-15', rotationsByDoctorId }))
      .toEqual({ category: 'OT_COSMO_Intern', resolved: true })
  })

  // Real case: an Intern with no intern_rotations row
  // at all — falls back to the plain base category, flagged unresolved
  // rather than guessed.
  it('falls back to the base category, unresolved, when no rotation covers the target date', () => {
    expect(resolveEffectiveCategory({ category: 'Intern', profileId: 'p1', targetDate: '2026-08-15', rotationsByDoctorId: new Map() }))
      .toEqual({ category: 'Intern', resolved: false })
  })

  // Real case: 8 of 11 active COSMOs have no intern_rotations row at all —
  // the common case, must stay a plain, unaffected COSMO.
  it('falls back to plain COSMO, unresolved, for a COSMO doctor with no rotation row', () => {
    expect(resolveEffectiveCategory({ category: 'COSMO', profileId: 'p1', targetDate: '2026-08-15', rotationsByDoctorId: new Map() }))
      .toEqual({ category: 'COSMO', resolved: false })
  })

  it('falls back when a rotation row exists but does not cover the target date (starts later)', () => {
    const rotationsByDoctorId = new Map([['p1', [{ start_date: '2026-09-01', end_date: null, rotation_type: 'OT' }]]])
    expect(resolveEffectiveCategory({ category: 'Intern', profileId: 'p1', targetDate: '2026-08-15', rotationsByDoctorId }))
      .toEqual({ category: 'Intern', resolved: false })
  })

  it('accepts a plain object keyed by profileId, not just a Map', () => {
    const rotationsByDoctorId = { p1: [{ start_date: '2026-01-01', end_date: null, rotation_type: 'OT' }] }
    expect(resolveEffectiveCategory({ category: 'Intern', profileId: 'p1', targetDate: '2026-08-15', rotationsByDoctorId }))
      .toEqual({ category: 'OT_Intern', resolved: true })
  })
})

describe('resolveWeekendCategoryForDoctor', () => {
  it('resolves both the effective category and its group key together', () => {
    const rotationsByDoctorId = new Map([['p1', [{ start_date: '2026-01-01', end_date: null, rotation_type: 'OT' }]]])
    const doctor = { id: 'p1', category: 'Intern' }
    expect(resolveWeekendCategoryForDoctor({ doctor, targetDate: '2026-08-15', rotationsByDoctorId }))
      .toEqual({ category: 'OT_Intern', groupKey: 'COSMOPsych', resolved: true })
  })

  it('still resolves a group key for an unresolved fallback (existing groupForCategory mapping, unchanged)', () => {
    const doctor = { id: 'p1', category: 'COSMO' }
    expect(resolveWeekendCategoryForDoctor({ doctor, targetDate: '2026-08-15', rotationsByDoctorId: new Map() }))
      .toEqual({ category: 'COSMO', groupKey: 'COSMO', resolved: false })
  })

  it('returns a null group key for a category outside weekend rotation', () => {
    const doctor = { id: 'p1', category: 'Consultant' }
    expect(resolveWeekendCategoryForDoctor({ doctor, targetDate: '2026-08-15', rotationsByDoctorId: new Map() }))
      .toEqual({ category: 'Consultant', groupKey: null, resolved: true })
  })
})

