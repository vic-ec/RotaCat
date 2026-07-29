import { describe, it, expect } from 'vitest'
import { isShiftActiveAt, shiftStartsWithinHours, splitByShiftStatus } from './shiftStatus'

const WD_08 = { start_time: '08:00:00', end_time: '18:00:00' } // same-day shift
const WD_22 = { start_time: '22:00:00', end_time: '10:00:00' } // crosses midnight

describe('isShiftActiveAt', () => {
  it('is active mid-shift for a same-day window', () => {
    expect(isShiftActiveAt('2026-08-07', WD_08, new Date('2026-08-07T12:00:00'))).toBe(true)
  })

  it('is not active before the shift starts or after it ends (same-day)', () => {
    expect(isShiftActiveAt('2026-08-07', WD_08, new Date('2026-08-07T07:59:00'))).toBe(false)
    expect(isShiftActiveAt('2026-08-07', WD_08, new Date('2026-08-07T18:00:00'))).toBe(false)
  })

  it('is active after midnight for a shift that crosses into the next day', () => {
    // WD_22 on 7 Aug runs 22:00 (7 Aug) -> 10:00 (8 Aug)
    expect(isShiftActiveAt('2026-08-07', WD_22, new Date('2026-08-08T03:00:00'))).toBe(true)
  })

  it('is not active before that overnight shift starts or after it ends', () => {
    expect(isShiftActiveAt('2026-08-07', WD_22, new Date('2026-08-07T21:59:00'))).toBe(false)
    expect(isShiftActiveAt('2026-08-07', WD_22, new Date('2026-08-08T10:00:00'))).toBe(false)
  })
})

describe('shiftStartsWithinHours', () => {
  it('flags a shift starting within the window', () => {
    expect(shiftStartsWithinHours('2026-08-08', WD_08, new Date('2026-08-07T12:00:00'), 24)).toBe(true)
  })

  it('does not flag a shift starting beyond the window', () => {
    expect(shiftStartsWithinHours('2026-08-09', WD_08, new Date('2026-08-07T12:00:00'), 24)).toBe(false)
  })

  it('does not flag a shift that already started (in the past)', () => {
    expect(shiftStartsWithinHours('2026-08-07', WD_08, new Date('2026-08-07T12:00:00'), 24)).toBe(false)
  })
})

describe('splitByShiftStatus', () => {
  it('separates currently-active entries from upcoming ones with no overlap', () => {
    const now = new Date('2026-08-07T12:00:00')
    const entries = [
      { id: 'a', date: '2026-08-07', shift_type: WD_08 },                 // active now
      { id: 'b', date: '2026-08-07', shift_type: { start_time: '15:00:00', end_time: '01:00:00' } }, // starts later today
      { id: 'c', date: '2026-08-06', shift_type: WD_08 },                 // already fully in the past
    ]
    const { active, upcoming } = splitByShiftStatus(entries, now, 24)
    expect(active.map(e => e.id)).toEqual(['a'])
    expect(upcoming.map(e => e.id)).toEqual(['b'])
  })

  it('sorts upcoming entries by shift start time', () => {
    const now = new Date('2026-08-07T06:00:00')
    const entries = [
      { id: 'later', date: '2026-08-07', shift_type: { start_time: '15:00:00', end_time: '01:00:00' } },
      { id: 'sooner', date: '2026-08-07', shift_type: WD_08 },
    ]
    const { upcoming } = splitByShiftStatus(entries, now, 24)
    expect(upcoming.map(e => e.id)).toEqual(['sooner', 'later'])
  })

  it('ignores entries with no joined shift_type', () => {
    const now = new Date('2026-08-07T12:00:00')
    const { active, upcoming } = splitByShiftStatus([{ id: 'x', date: '2026-08-07', shift_type: null }], now, 24)
    expect(active).toHaveLength(0)
    expect(upcoming).toHaveLength(0)
  })
})
