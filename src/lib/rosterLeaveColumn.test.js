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
    // Leave type first (annual before sick), then surname.
    expect(out['2026-11-03'].leave.map(p => `${p.name} ${p.code}`)).toEqual(['Rivers AL', 'Duma SK'])
    expect(out['2026-11-03'].course.map(p => `${p.name} ${p.code}`)).toEqual(['Naidoo CW'])
    expect(out['2026-11-06']).toEqual({ leave: [], course: [] })
  })

  it('counts leave of a type this viewer cannot see as Leave, lists a person once, and skips anyone not on the roster', () => {
    const map = {
      a: [['2026-11-02', '2026-11-03', null, null], ['2026-11-03', '2026-11-03', 'annual', 'r1']],
      zz: [['2026-11-03', '2026-11-03', 'annual', 'r9']],
    }
    const out = leaveByDate(map, ['2026-11-03'], nameOf)
    expect(out['2026-11-03'].leave).toEqual([{ profileId: 'a', name: 'Rivers', type: null, code: '' }])
  })
})

describe('awaySummary', () => {
  it('reads as one line', () => {
    expect(awaySummary({ leave: [{ name: 'Rivers', code: 'AL' }, { name: 'Duma', code: '' }], course: [{ name: 'Naidoo', code: 'CW' }] }))
      .toBe('Leave: Rivers (AL), Duma · Course: Naidoo (CW)')
    expect(awaySummary({ leave: [], course: [] })).toBe('')
  })

  it('sorts by leave type, then surname, ignoring the initial added to tell two of a surname apart', () => {
    const roster = { v: 'A. Van Zyl', z: 'Azizollahoff', j: 'Jantjies', n: 'P. Naidoo', t: 'Tout', zi: 'Zietsman' }
    const day = '2026-11-03'
    const map = {
      v: [[day, day, 'annual', 'r1']],
      z: [[day, day, 'sick', 'r2']],
      j: [[day, day, 'sick', 'r3']],
      n: [[day, day, 'sick', 'r4']],
      t: [[day, day, 'annual', 'r5']],
      zi: [[day, day, 'family_responsibility', 'r6']],
    }
    const out = leaveByDate(map, [day], id => roster[id])
    expect(out[day].leave.map(p => p.name)).toEqual(['Tout', 'A. Van Zyl', 'Azizollahoff', 'Jantjies', 'P. Naidoo', 'Zietsman'])
  })
})

