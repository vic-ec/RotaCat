import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { buildAttentionItems, countUnderMinimum, nextMonthOf, shiftsOnLeave } = await import('./adminAttention')

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
      signups: '/staff?tab=requests&sub=new-users',
      'account-requests': '/staff?tab=requests&sub=user-requests',
      'rotations-ending': '/leave?tab=planners&sub=interns',
      'never-signed-in': '/staff?tab=accounts',
      'under-minimum': '/roster?view=summary&hours=under',
    })
    expect(items.find(i => i.key === 'signups').label).toBe('sign-up awaiting approval')
    expect(items.find(i => i.key === 'account-requests').label).toBe('account change requests to review')
  })
})

describe('countUnderMinimum', () => {
  it('counts doctors below their month minimum, ignoring anyone with none', () => {
    const profiles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const minimums = new Map([['a', { minimum: 210 }], ['b', { minimum: 210 }], ['c', { minimum: 0 }]])
    const hoursByProfile = new Map([['a', 204], ['b', 210], ['c', 0], ['d', 0]])
    expect(countUnderMinimum({ profiles, hoursByProfile, minimums })).toBe(1)
  })
})

describe('buildAttentionItems (cont.)', () => {
  it('counts rostered locums without an account, linking to Account Requests', () => {
    const one = buildAttentionItems({ ...quiet, locumContacts: 1 })
    expect(one.find(i => i.key === 'locum-contacts')).toMatchObject({ count: 1, to: '/staff?tab=requests&sub=new-users', label: 'rostered locum needing an account' })
    const three = buildAttentionItems({ ...quiet, locumContacts: 3 })
    expect(three.find(i => i.key === 'locum-contacts').label).toBe('rostered locums needing accounts')
  })
})

describe('shiftsOnLeave', () => {
  it('finds shifts from today on that fall inside the doctor\'s approved leave, earliest first', () => {
    const entries = [
      { id: 'e1', date: '2026-11-26', roster_month_id: 'rm', profile_id: 'a' },
      { id: 'e2', date: '2026-11-24', roster_month_id: 'rm', profile_id: 'a' },
      { id: 'e3', date: '2026-11-23', roster_month_id: 'rm', profile_id: 'a' }, // past
      { id: 'e4', date: '2026-11-24', roster_month_id: 'rm', profile_id: 'b' }, // not on leave
    ]
    const leave = [{ profile_id: 'a', date_from: '2026-11-20', date_to: '2026-11-30' }]
    expect(shiftsOnLeave(entries, leave, '2026-11-24').map(e => e.id)).toEqual(['e2', 'e1'])
  })

  it('becomes a Needs attention row linking to the earliest shift with its cover form open', () => {
    const items = buildAttentionItems({ ...quiet, shiftsOnLeave: [
      { id: 'e2', date: '2026-11-24', roster_month_id: 'rm', profile_id: 'a' },
      { id: 'e1', date: '2026-11-26', roster_month_id: 'rm', profile_id: 'a' },
    ] })
    expect(items[0]).toMatchObject({
      key: 'shifts-on-leave', count: 2,
      to: '/roster/rm?date=2026-11-24&doctor=a&mode=edit&cover=1',
      label: 'rostered shifts need cover — the doctor is on leave',
    })
  })
})
