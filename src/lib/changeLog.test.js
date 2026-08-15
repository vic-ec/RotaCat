import { describe, it, expect } from 'vitest'
import { formatRosterChangeLine, formatWeekendPlannerChangeLine, summarizeWeekendPlannerBatch, formatRelativeTime } from './changeLog'

const nameById = new Map([
  ['actor-1', 'Claude Codespace'],
  ['ellis-1', 'Ellis'],
  ['vaughn-1', 'Vaughn'],
])

describe('formatRosterChangeLine', () => {
  it('formats a reassign (before + after both set) matching the expected review-log shape', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      entry_date: '2026-08-07',
      shift_code: 'WD_12',
      action: 'assign',
      profile_id_before: 'ellis-1',
      profile_id_after: 'vaughn-1',
    }
    const line = formatRosterChangeLine(change, nameById, 'August 2026')
    expect(line).toContain('Claude Codespace edited August 2026 roster: 7 Aug 2026 WD_12 Ellis → Vaughn')
    expect(line).toMatch(/^\[\d{2} \w{3} \d{4}, \d{2}:\d{2}:\d{2}\]/)
  })

  it('formats an assign into an empty slot without a before name', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      entry_date: '2026-08-07',
      shift_code: 'WD_12',
      action: 'assign',
      profile_id_before: null,
      profile_id_after: 'vaughn-1',
    }
    expect(formatRosterChangeLine(change, nameById, 'August 2026')).toContain('assigned Vaughn to 7 Aug 2026 WD_12')
  })

  it('formats a remove', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      entry_date: '2026-08-07',
      shift_code: 'WD_12',
      action: 'remove',
      profile_id_before: 'ellis-1',
      profile_id_after: null,
    }
    expect(formatRosterChangeLine(change, nameById, 'August 2026')).toContain('removed Ellis from 7 Aug 2026 WD_12')
  })

  it('formats a move using the before date/shift, not the after ones', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      entry_date: '2026-08-08',
      shift_code: 'WD_15',
      action: 'move',
      profile_id_before: 'ellis-1',
      profile_id_after: 'ellis-1',
      date_before: '2026-08-07',
      shift_code_before: 'WD_12',
    }
    expect(formatRosterChangeLine(change, nameById, 'August 2026'))
      .toContain('moved Ellis from 7 Aug 2026 WD_12 to 8 Aug 2026 WD_15')
  })

  it('formats an unassign, flagging when it was also advertised', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      entry_date: '2026-08-07',
      shift_code: 'WD_12',
      action: 'unassign',
      profile_id_before: 'ellis-1',
      profile_id_after: null,
      advertised: true,
    }
    expect(formatRosterChangeLine(change, nameById, 'August 2026'))
      .toContain('vacated 7 Aug 2026 WD_12 (was Ellis) and opened it for locum cover')
  })

  it('falls back to "Unknown" for an actor id with no resolved name', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'ghost-id',
      entry_date: '2026-08-07',
      shift_code: 'WD_12',
      action: 'remove',
      profile_id_before: 'ellis-1',
      profile_id_after: null,
    }
    expect(formatRosterChangeLine(change, nameById, 'August 2026')).toContain('Unknown edited')
  })
})

describe('formatWeekendPlannerChangeLine', () => {
  it('formats an add', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      profile_id: 'vaughn-1',
      weekend_saturday: '2026-08-08',
      category: 'MO',
      action: 'add',
    }
    expect(formatWeekendPlannerChangeLine(change, nameById))
      .toContain('Claude Codespace added Vaughn to MO for the 8 Aug 2026 weekend')
  })

  it('formats a remove', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      profile_id: 'vaughn-1',
      weekend_saturday: '2026-08-08',
      category: 'MO',
      action: 'remove',
    }
    expect(formatWeekendPlannerChangeLine(change, nameById))
      .toContain('Claude Codespace removed Vaughn from MO for the 8 Aug 2026 weekend')
  })
})

describe('summarizeWeekendPlannerBatch', () => {
  it('summarizes a pure-remove batch (a Clear) as "Cleared"', () => {
    const changes = [
      { weekend_saturday: '2026-01-03', action: 'remove' },
      { weekend_saturday: '2026-01-03', action: 'remove' },
    ]
    expect(summarizeWeekendPlannerBatch({ changes })).toBe('Cleared 3 Jan 2026 (2 removed)')
  })

  it('summarizes a pure-add batch (a paste) as "Added to"', () => {
    const changes = [{ weekend_saturday: '2026-01-03', action: 'add' }]
    expect(summarizeWeekendPlannerBatch({ changes })).toBe('Added to 3 Jan 2026 (1 added)')
  })

  it('summarizes a mixed batch (an overwrite paste) as "Overwrote", with both counts', () => {
    const changes = [
      { weekend_saturday: '2026-01-03', action: 'remove' },
      { weekend_saturday: '2026-01-03', action: 'add' },
      { weekend_saturday: '2026-01-03', action: 'add' },
    ]
    expect(summarizeWeekendPlannerBatch({ changes })).toBe('Overwrote 3 Jan 2026 (2 added, 1 removed)')
  })

  it('collapses multiple weekends to a count rather than listing every date', () => {
    const changes = [
      { weekend_saturday: '2026-01-03', action: 'remove' },
      { weekend_saturday: '2026-01-10', action: 'remove' },
      { weekend_saturday: '2026-01-17', action: 'remove' },
    ]
    expect(summarizeWeekendPlannerBatch({ changes })).toBe('Cleared 3 weekends (3 removed)')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-06T17:30:00Z')

  it('reads "just now" for anything under a minute old', () => {
    expect(formatRelativeTime('2026-08-06T17:29:45Z', now)).toBe('just now')
  })

  it('reads in minutes under an hour old', () => {
    expect(formatRelativeTime('2026-08-06T17:28:00Z', now)).toBe('2 min ago')
  })

  it('reads in hours under a day old', () => {
    expect(formatRelativeTime('2026-08-06T15:30:00Z', now)).toBe('2 hrs ago')
  })

  it('reads in singular "1 hr ago"', () => {
    expect(formatRelativeTime('2026-08-06T16:30:00Z', now)).toBe('1 hr ago')
  })

  it('reads in days once a day or older', () => {
    expect(formatRelativeTime('2026-08-04T17:30:00Z', now)).toBe('2 days ago')
  })
})
