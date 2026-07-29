import { describe, it, expect } from 'vitest'
import { formatRosterChangeLine, formatWeekendPlannerChangeLine } from './changeLog'

const nameById = new Map([
  ['actor-1', 'Claude Codespace'],
  ['exford-1', 'Exford'],
  ['venter-1', 'Venter'],
])

describe('formatRosterChangeLine', () => {
  it('formats a reassign (before + after both set) matching the expected review-log shape', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      entry_date: '2026-08-07',
      shift_code: 'WD_12',
      action: 'assign',
      profile_id_before: 'exford-1',
      profile_id_after: 'venter-1',
    }
    const line = formatRosterChangeLine(change, nameById, 'August 2026')
    expect(line).toContain('Claude Codespace edited August 2026 roster: 7 Aug 2026 WD_12 Exford → Venter')
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
      profile_id_after: 'venter-1',
    }
    expect(formatRosterChangeLine(change, nameById, 'August 2026')).toContain('assigned Venter to 7 Aug 2026 WD_12')
  })

  it('formats a remove', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      entry_date: '2026-08-07',
      shift_code: 'WD_12',
      action: 'remove',
      profile_id_before: 'exford-1',
      profile_id_after: null,
    }
    expect(formatRosterChangeLine(change, nameById, 'August 2026')).toContain('removed Exford from 7 Aug 2026 WD_12')
  })

  it('formats a move using the before date/shift, not the after ones', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      entry_date: '2026-08-08',
      shift_code: 'WD_15',
      action: 'move',
      profile_id_before: 'exford-1',
      profile_id_after: 'exford-1',
      date_before: '2026-08-07',
      shift_code_before: 'WD_12',
    }
    expect(formatRosterChangeLine(change, nameById, 'August 2026'))
      .toContain('moved Exford from 7 Aug 2026 WD_12 to 8 Aug 2026 WD_15')
  })

  it('formats an unassign, flagging when it was also advertised', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      entry_date: '2026-08-07',
      shift_code: 'WD_12',
      action: 'unassign',
      profile_id_before: 'exford-1',
      profile_id_after: null,
      advertised: true,
    }
    expect(formatRosterChangeLine(change, nameById, 'August 2026'))
      .toContain('vacated 7 Aug 2026 WD_12 (was Exford) and opened it for locum cover')
  })

  it('falls back to "Unknown" for an actor id with no resolved name', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'ghost-id',
      entry_date: '2026-08-07',
      shift_code: 'WD_12',
      action: 'remove',
      profile_id_before: 'exford-1',
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
      profile_id: 'venter-1',
      weekend_saturday: '2026-08-08',
      category: 'MO',
      action: 'add',
    }
    expect(formatWeekendPlannerChangeLine(change, nameById))
      .toContain('Claude Codespace added Venter to MO for the 8 Aug 2026 weekend')
  })

  it('formats a remove', () => {
    const change = {
      changed_at: '2026-07-29T19:45:03Z',
      changed_by: 'actor-1',
      profile_id: 'venter-1',
      weekend_saturday: '2026-08-08',
      category: 'MO',
      action: 'remove',
    }
    expect(formatWeekendPlannerChangeLine(change, nameById))
      .toContain('Claude Codespace removed Venter from MO for the 8 Aug 2026 weekend')
  })
})
