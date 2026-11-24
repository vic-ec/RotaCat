import { describe, it, expect } from 'vitest'
import { buildOnShiftBoard, boardPerson, initialsOf, startsInLabel } from './onShiftBoard'

const ST = {
  d08: { code: 'WD_08', start_time: '08:00:00', end_time: '18:00:00', is_night_shift: false },
  d12: { code: 'WD_12', start_time: '12:00:00', end_time: '22:00:00', is_night_shift: false },
  d15: { code: 'WD_15', start_time: '15:00:00', end_time: '01:00:00', is_night_shift: false },
  n22: { code: 'WD_22', start_time: '22:00:00', end_time: '08:00:00', is_night_shift: true },
}
let n = 0
const doc = (date, st, name, surname, extra = {}) => ({
  id: `e${++n}`, date, shift_type: ST[st], profile_id: `p-${surname}`, is_locum: false,
  profile: { name, surname, category: 'MO' }, ...extra,
})
const ROWS = [
  doc('2026-11-23', 'n22', 'Ada', 'Zephyr'),
  doc('2026-11-24', 'd08', 'Maurice', 'Mokoena'),
  doc('2026-11-24', 'd08', 'Zara', 'Khan', { profile: { name: 'Zara', surname: 'Khan', category: 'Registrar' } }),
  { id: 'loc', date: '2026-11-24', shift_type: ST.d08, profile_id: null, is_locum: true, locum_name: '[Dr Smith]', vacated: { name: 'Naledi', surname: 'Dlamini' } },
  doc('2026-11-24', 'd12', 'Liam', 'Botha'),
  { id: 'open', date: '2026-11-24', shift_type: ST.d12, profile_id: null, is_locum: true, locum_name: '[ ]' },
  { id: 'nocover', date: '2026-11-24', shift_type: ST.d12, profile_id: null, is_locum: false, vacated_profile_id: 'x' },
  doc('2026-11-24', 'd15', 'Tom', 'Petersen'),
  doc('2026-11-24', 'd15', 'Sipho', 'Ndlovu', { profile: { name: 'Sipho', surname: 'Ndlovu', category: 'EC_Intern' } }),
  doc('2026-11-24', 'n22', 'Bo', 'Adams'),
  { id: 'cons', date: '2026-11-24', shift_type: ST.d08, profile_id: null, is_locum: false, consultant_profile_id: 'c1', consultant: { name: 'Kate', surname: 'Meyer' } },
]

describe('buildOnShiftBoard', () => {
  it('groups who is on now by shift, each with its end, and finds the next start', () => {
    const at = new Date(2026, 10, 24, 14, 30)
    const board = buildOnShiftBoard(ROWS, at, { lateEntryIds: new Set([ROWS[2].id]) })
    expect(board.now.map(g => [g.startTime, g.endTime, g.people.map(p => p.initials)])).toEqual([
      ['08:00:00', '18:00:00', ['ZK', 'MM', 'DS']],
      ['12:00:00', '22:00:00', ['LB', '[ ]']],
    ])
    expect(board.next.map(g => [g.startTime, g.people.map(p => p.initials)])).toEqual([['15:00:00', ['SN', 'TP']]])
    expect(board.consultant).toBe('Kate Meyer')
    // The late arrival logged for Khan's shift.
    expect(board.now[0].people.find(p => p.initials === 'ZK').late).toBe(true)
    expect(board.now[0].people.find(p => p.initials === 'MM').late).toBe(false)
  })

  it('carries a night shift across midnight and looks to tomorrow for the next start', () => {
    const at = new Date(2026, 10, 24, 23, 40)
    const board = buildOnShiftBoard(ROWS, at)
    expect(board.now.map(g => [g.startTime, g.night])).toEqual([['15:00:00', false], ['22:00:00', true]])
    // Nothing on the 25th is loaded here, so nothing is next.
    expect(board.next).toEqual([])
    const early = buildOnShiftBoard(ROWS, new Date(2026, 10, 24, 6, 0))
    expect(early.now.map(g => g.people.map(p => p.initials))).toEqual([['AZ']])
    expect(early.next[0].startTime).toBe('08:00:00')
  })

  it('leaves out a struck-through row with nobody on it, and the consultant row', () => {
    const board = buildOnShiftBoard(ROWS, new Date(2026, 10, 24, 14, 30))
    const keys = board.now.flatMap(g => g.people.map(p => p.key))
    expect(keys).not.toContain('nocover')
    expect(keys).not.toContain('cons')
  })
})

describe('boardPerson', () => {
  it('labels doctors, locums covering someone, and open slots', () => {
    expect(boardPerson(ROWS[2]).label).toBe('Zara Khan · Registrar')
    expect(boardPerson(ROWS[3], { vacatedName: 'Naledi Dlamini' })).toMatchObject({ kind: 'locum', initials: 'DS', label: 'Dr Smith · Locum · covering Naledi Dlamini' })
    expect(boardPerson(ROWS[5])).toMatchObject({ kind: 'open', initials: '[ ]', name: 'Open locum slot', meta: 'Not covered' })
    expect(boardPerson(ROWS[2])).toMatchObject({ name: 'Zara Khan', meta: 'Registrar' })
    expect(boardPerson(ROWS[3], { vacatedName: 'Naledi Dlamini' })).toMatchObject({ name: 'Dr Smith', meta: 'Locum · covering Naledi Dlamini' })
    expect(boardPerson(ROWS[6])).toBeNull()
  })
})

describe('initialsOf and startsInLabel', () => {
  it('takes first and last initials', () => {
    expect(initialsOf('Maurice Mokoena')).toBe('MM')
    expect(initialsOf('Anna de la Rey')).toBe('AR')
    expect(initialsOf('Cher')).toBe('CH')
    expect(initialsOf('')).toBe('?')
  })
  it('says how soon', () => {
    const now = new Date(2026, 10, 24, 14, 30)
    expect(startsInLabel(new Date(2026, 10, 24, 15, 0), now)).toBe('in 30 min')
    expect(startsInLabel(new Date(2026, 10, 24, 22, 0), now)).toBe('in 8 h')
    expect(startsInLabel(new Date(2026, 10, 25, 8, 0), now)).toBe('tomorrow')
  })
})
