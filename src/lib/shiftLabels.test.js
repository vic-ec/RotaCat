import { describe, it, expect } from 'vitest'
import { SHIFT_LABEL, labelForShiftCode, shiftTimeRange, shiftColumns } from './shiftLabels'

describe('shiftLabels', () => {
  it('names every shift code the roster issues', () => {
    // A code missing from here renders as its raw database identifier —
    // legible but not what anyone asked for. This is the guard against a
    // new shift_types row slipping through unnamed.
    expect(Object.keys(SHIFT_LABEL).sort()).toEqual([
      'PHW_08', 'PHW_12', 'PHW_15', 'PHW_22',
      'PH_08', 'PH_13', 'PH_20',
      'WD_08', 'WD_12', 'WD_15', 'WD_22',
      'WE_08', 'WE_13', 'WE_20',
    ].sort())
  })

  it('gives the weekday set its four-shift clock', () => {
    expect(labelForShiftCode('WD_08')).toBe('WD 08h-18h')
    expect(labelForShiftCode('WD_12')).toBe('WD 12h-22h')
    expect(labelForShiftCode('WD_15')).toBe('WD 15h-01h')
    expect(labelForShiftCode('WD_22')).toBe('WD 22h-10h')
  })

  it('gives the weekend set its three-shift clock', () => {
    expect(labelForShiftCode('WE_08')).toBe('WE 08h-20h')
    expect(labelForShiftCode('WE_13')).toBe('WE 13h-23h')
    expect(labelForShiftCode('WE_20')).toBe('WE 20h-10h')
  })

  it('keeps the stored PHW_ prefix for a weekday public holiday', () => {
    // PHW_* is the database's "public holiday, weekday" — the four-shift
    // clock. Prefix and times agree: 08h-18h is only ever a weekday.
    expect(labelForShiftCode('PHW_08')).toBe('PHW 08h-18h')
    expect(labelForShiftCode('PHW_22')).toBe('PHW 22h-10h')
  })

  it('keeps the stored PH_ prefix for a weekend public holiday', () => {
    expect(labelForShiftCode('PH_08')).toBe('PH 08h-20h')
    expect(labelForShiftCode('PH_13')).toBe('PH 13h-23h')
    expect(labelForShiftCode('PH_20')).toBe('PH 20h-10h')
  })

  it('never lets a PH label collide with the PHW one at the same hour', () => {
    // The two sets share the 08h start; only the prefix and the end time
    // tell a weekday holiday from a weekend one.
    expect(labelForShiftCode('PHW_08')).not.toBe(labelForShiftCode('PH_08'))
  })

  it('never labels two codes the same thing', () => {
    const labels = Object.values(SHIFT_LABEL)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('falls back to the raw code rather than losing which shift it was', () => {
    expect(labelForShiftCode('WD_99')).toBe('WD_99')
    expect(shiftTimeRange('WD_99')).toBe('WD_99')
    expect(labelForShiftCode(null)).toBe('')
    expect(labelForShiftCode(undefined)).toBe('')
  })

  it('drops the prefix for a table that already groups its columns', () => {
    expect(shiftTimeRange('WD_08')).toBe('08h-18h')
    expect(shiftTimeRange('PH_20')).toBe('20h-10h')
  })

  it('builds column headers in the order it is given', () => {
    expect(shiftColumns(['WE_08', 'WE_13'])).toEqual([
      { code: 'WE_08', label: 'WE 08h-20h' },
      { code: 'WE_13', label: 'WE 13h-23h' },
    ])
    expect(shiftColumns(['WE_08'], shiftTimeRange)).toEqual([{ code: 'WE_08', label: '08h-20h' }])
  })
})
