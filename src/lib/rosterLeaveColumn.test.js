import { describe, it, expect } from 'vitest'
import { leaveByDate, awaySummary } from './rosterLeaveColumn'

const names = { a: 'Rivers', b: 'Duma', c: 'Naidoo', d: 'Okafor' }
const nameOf = id => names[id]

describe('leaveByDate', () => {
  it('puts study-family leave under Course, everything else under Leave, and leaves out Weekend off', () => {
    const map = {
      a: [['2026-11-02', '2026-11-04', 'annual', 'r1']],
      b: [['2026-11-03', '2026-11-03', 'sick', 'r2']],
      c: [['2026-11-03', '2026-11-05', 'conference', 'r3']],
      d: [['2026-11-03', '2026-11-03', 'weekend_exception', 'r4']],
    }
    const out = leaveByDate(map, ['2026-11-02', '2026-11-03', '2026-11-06'], nameOf)
    expect(out['2026-11-02'].leave.map(p => p.name)).toEqual(['Rivers'])
    expect(out['2026-11-03'].leave.map(p => `${p.name} ${p.code}`)).toEqual(['Duma SK', 'Rivers AL'])
    expect(out['2026-11-03'].course.map(p => `${p.name} ${p.code}`)).toEqual(['Naidoo CW'])
    expect(out['2026-11-06']).toEqual({ leave: [], course: [] })
  })

  it('counts leave of a type this viewer cannot see as Leave, lists a person once, and skips anyone not on the roster', () => {
    const map = {
      a: [['2026-11-02', '2026-11-03', null, null], ['2026-11-03', '2026-11-03', 'annual', 'r1']],
      zz: [['2026-11-03', '2026-11-03', 'annual', 'r9']],
    }
    const out = leaveByDate(map, ['2026-11-03'], nameOf)
    expect(out['2026-11-03'].leave).toEqual([{ profileId: 'a', name: 'Rivers', code: '' }])
  })
})

describe('awaySummary', () => {
  it('reads as one line', () => {
    expect(awaySummary({ leave: [{ name: 'Rivers', code: 'AL' }, { name: 'Duma', code: '' }], course: [{ name: 'Naidoo', code: 'CW' }] }))
      .toBe('Leave: Rivers (AL), Duma · Course: Naidoo (CW)')
    expect(awaySummary({ leave: [], course: [] })).toBe('')
  })
})
