import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { buildAttentionItems, countUnderMinimum, nextMonthOf } = await import('./adminAttention')

// December 2026 has four Saturdays: 5, 12, 19, 26.
const DEC_SATURDAYS = ['2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26']
const quiet = {
  year: 2026, month: 11,
  rosters: [
    { id: 'nov', year: 2026, month: 11, status: 'published' },
    { id: 'dec', year: 2026, month: 12, status: 'published' },
  ],
  locumCountByRosterId: {},
  plannedSaturdays: new Set(DEC_SATURDAYS),
  pendingSignups: 0, accountRequests: 0, neverSignedIn: 0, rotationsEnding: 0, underMinimum: 0,
}
const keys = items => items.map(i => i.key)

describe('buildAttentionItems', () => {
  it('is empty when nothing is outstanding', () => {
    expect(buildAttentionItems(quiet)).toEqual([])
  })

  it('counts unfilled locum placeholders per published roster, this month onward only', () => {
    const items = buildAttentionItems({
      ...quiet,
      rosters: [
        { id: 'oct', year: 2026, month: 10, status: 'published' },
        { id: 'nov', year: 2026, month: 11, status: 'published' },
        { id: 'dec', year: 2026, month: 12, status: 'published' },
      ],
      locumCountByRosterId: { oct: 9, nov: 6, dec: 0 },
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ key: 'locums-nov', count: 6, to: '/roster/nov' })
    expect(items[0].label).toBe("locum placeholders unfilled in November's published roster")
  })

  it("flags next month's roster while it is a draft, and when it does not exist", () => {
    const nov = { id: 'nov', year: 2026, month: 11, status: 'published' }
    const draft = buildAttentionItems({ ...quiet, rosters: [nov, { id: 'dec', year: 2026, month: 12, status: 'draft' }] })
    expect(draft.find(i => i.key === 'next-roster-draft')).toMatchObject({ to: '/roster/dec', label: "December's roster is still a draft" })
    const missing = buildAttentionItems({ ...quiet, rosters: [nov] })
    expect(missing.find(i => i.key === 'next-roster-missing')).toMatchObject({ to: '/roster', label: 'December has no roster yet' })
  })

  it("flags this month's roster too while it is still a draft", () => {
    const items = buildAttentionItems({ ...quiet, rosters: [{ id: 'nov', year: 2026, month: 11, status: 'draft' }, { id: 'dec', year: 2026, month: 12, status: 'published' }] })
    expect(items.find(i => i.key === 'this-roster-draft')).toMatchObject({ to: '/roster/nov', label: "November's roster is still a draft" })
  })

  it('counts next month weekends with nobody in the Weekend Planner', () => {
    const items = buildAttentionItems({ ...quiet, plannedSaturdays: new Set(['2026-12-05', '2026-12-12']) })
    expect(items.find(i => i.key === 'weekend-gaps')).toMatchObject({ count: 2, label: 'weekends in December have nobody planned' })
  })

  it('rolls next month over the year end', () => {
    expect(nextMonthOf(2026, 12)).toEqual({ year: 2027, month: 1 })
  })

  it('adds a row per outstanding count, each linking to where it is handled', () => {
    const items = buildAttentionItems({ ...quiet, pendingSignups: 1, accountRequests: 2, rotationsEnding: 3, neverSignedIn: 1, underMinimum: 1 })
    expect(keys(items)).toEqual(['signups', 'account-requests', 'rotations-ending', 'never-signed-in', 'under-minimum'])
    expect(Object.fromEntries(items.map(i => [i.key, i.to]))).toEqual({
      signups: '/staff?tab=pending',
      'account-requests': '/staff?tab=requests',
      'rotations-ending': '/leave?tab=planners&sub=interns',
      'never-signed-in': '/staff?tab=accounts',
      'under-minimum': '/roster?view=summary&hours=under',
    })
    expect(items.find(i => i.key === 'signups').label).toBe('sign-up awaiting approval')
    expect(items.find(i => i.key === 'account-requests').label).toBe('account change requests to review')
  })
})

describe('countUnderMinimum', () => {
  const profiles = [
    { id: 'a', min_hours: 220 }, // under
    { id: 'b', min_hours: 220 }, // exactly at minimum — fine
    { id: 'c', min_hours: 220 }, // under, but on leave this month — can't be judged
    { id: 'd', min_hours: null }, // no minimum on record
  ]
  it('counts doctors below their minimum, skipping anyone on leave or with no minimum', () => {
    const hoursByProfile = new Map([['a', 200], ['b', 220], ['c', 100], ['d', 0]])
    expect(countUnderMinimum({ profiles, hoursByProfile, onLeaveIds: new Set(['c']) })).toBe(1)
  })
})
