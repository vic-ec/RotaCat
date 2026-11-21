import { describe, it, expect } from 'vitest'
import {
  adminInitialsMap, groupByDay, logDayLabel, rosterLogParts, shortDate, weekendBatchParts, weekendLogEntries,
} from './reviewLog'

const at = '2026-11-20T10:00:00'

describe('shortDate', () => {
  it('omits the year when it matches the context year, adds it otherwise', () => {
    expect(shortDate('2026-11-01', 2026)).toBe('Sun 1 Nov')
    expect(shortDate('2027-01-02', 2026)).toBe('Sat 2 Jan 2027')
  })
})

describe('groupByDay', () => {
  it('keeps order and starts a new header each local day', () => {
    const items = [{ at: '2026-11-20T20:55:00' }, { at: '2026-11-20T09:00:00' }, { at: '2026-11-17T12:26:00' }]
    const groups = groupByDay(items, i => i.at)
    expect(groups.map(g => [g.label, g.items.length])).toEqual([['Fri 20 Nov 2026', 2], ['Tue 17 Nov 2026', 1]])
    expect(logDayLabel('2026-11-17')).toBe('Tue 17 Nov 2026')
  })
})

describe('adminInitialsMap', () => {
  const profiles = new Map([
    ['a', { id: 'a', name: 'Paul', surname: 'Xafis' }],
    ['b', { id: 'b', name: 'Karen', surname: 'Bottomley' }],
    ['c', { id: 'c', name: 'Kim', surname: 'Brown' }],
  ])
  it('uses initials, falling back to "First S." when two admins share them', () => {
    const map = adminInitialsMap(profiles, ['a', 'b', 'c', 'a'])
    expect(map.get('a')).toBe('PX')
    expect(map.get('b')).toBe('Karen B.')
    expect(map.get('c')).toBe('Kim B.')
  })
})

describe('rosterLogParts', () => {
  const base = { entry_date: '2026-11-01', shift_code: 'WE_08', changed_at: at }
  it('an assign over another doctor is a replacement: before is taken off, after is put on', () => {
    expect(rosterLogParts({ ...base, action: 'assign', profile_id_before: 'jenna', profile_id_after: 'musa' }))
      .toEqual({ type: 'replaced', shift: 'Sun 1 Nov · WE 08h-20h', before: 'jenna', after: 'musa' })
  })
  it('an assign into an empty slot is Assigned', () => {
    expect(rosterLogParts({ ...base, action: 'assign', profile_id_after: 'musa' }).type).toBe('assigned')
  })
  it('unassign is Vacated, carrying the locum-cover flag', () => {
    expect(rosterLogParts({ ...base, action: 'unassign', profile_id_before: 'musa', advertised: true }))
      .toMatchObject({ type: 'vacated', person: 'musa', advertised: true })
  })
  it('move names both shifts', () => {
    expect(rosterLogParts({ ...base, action: 'move', profile_id_after: 'a', date_before: '2026-11-07', shift_code_before: 'WE_20' }))
      .toMatchObject({ type: 'moved', moveFrom: 'Sat 7 Nov · WE 20h-10h', shift: 'Sun 1 Nov · WE 08h-20h' })
  })
})

describe('weekend log', () => {
  const row = (id, batch, extra = {}) => ({ id, batch_id: batch, weekend_saturday: '2026-12-05', category: 'MO', action: 'add', profile_id: 'p', changed_by: 'a', changed_at: at, ...extra })

  it('collapses rows sharing a batch into one entry; a batch of one stays an ordinary row', () => {
    const entries = weekendLogEntries([row('1', 'x'), row('2', 'x'), row('3', 'y'), row('4', null)])
    expect(entries.map(e => [e.kind, e.batchId ?? null])).toEqual([['batch', 'x'], ['single', 'y'], ['single', null]])
  })

  it('summarises a batch with every category listed and the counts', () => {
    const parts = weekendBatchParts([
      row('1', 'x'),
      row('2', 'x', { weekend_saturday: '2026-12-26', category: 'Registrar', action: 'remove' }),
    ])
    expect(parts).toEqual({
      type: 'overwrote', weekends: '2 weekends · Sat 5 Dec – Sat 26 Dec', categories: ['MO', 'Registrar'], counts: '1 added · 1 removed',
    })
  })
})
