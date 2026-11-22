import { describe, it, expect } from 'vitest'
import { entryDurationHours, effectiveTimes, hoursBetween, adjustedTimesLabel, applyTimeOverrides, validateTimes, hasTimeOverride } from './shiftTimes'

const st = { start_time: '12:00:00', end_time: '22:00:00', duration_hours: '10.0' }

describe('shiftTimes', () => {
  it('a row with no override works the shift type', () => {
    expect(effectiveTimes({}, st)).toEqual({ start: '12:00:00', end: '22:00:00', adjusted: false })
    expect(entryDurationHours({}, st)).toBe(10)
    expect(adjustedTimesLabel({})).toBe('')
    expect(hasTimeOverride({ start_time_override: '10:00:00' })).toBe(false)
  })

  it('a row with adjusted times works those, counted by their own length', () => {
    const row = { start_time_override: '10:00:00', end_time_override: '20:00:00' }
    expect(effectiveTimes(row, st)).toEqual({ start: '10:00:00', end: '20:00:00', adjusted: true })
    expect(entryDurationHours(row, st)).toBe(10)
    expect(adjustedTimesLabel(row)).toBe('10h–20h')
    expect(adjustedTimesLabel({ start_time_override: '10:30:00', end_time_override: '15:00:00' })).toBe('10h30–15h')
  })

  it('rolls past midnight when the end is not after the start', () => {
    expect(hoursBetween('22:00:00', '10:00:00')).toBe(12)
    expect(hoursBetween('23:30', '01:00')).toBe(1.5)
  })

  it('applyTimeOverrides rewrites the joined shift_type times for adjusted rows only', () => {
    const rows = [{ shift_type: st }, { shift_type: st, start_time_override: '10:00:00', end_time_override: '20:00:00' }]
    const out = applyTimeOverrides(rows)
    expect(out[0].shift_type.start_time).toBe('12:00:00')
    expect(out[1].shift_type).toMatchObject({ start_time: '10:00:00', end_time: '20:00:00', duration_hours: '10.0' })
  })

  it('validates the form: both or neither, and not equal', () => {
    expect(validateTimes('', '')).toBeNull()
    expect(validateTimes('10:00', '')).toMatch(/both/)
    expect(validateTimes('10:00', '10:00')).toMatch(/same/)
    expect(validateTimes('10:00', '20:00')).toBeNull()
  })
})
